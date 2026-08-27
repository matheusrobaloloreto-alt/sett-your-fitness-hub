-- Repair one historically duplicated WhatsApp conversation only after proving
-- the provider-backed chat, the internal-only duplicate and the student all
-- belong to the same company and connected instance. This is intentionally a
-- service-role-only maintenance RPC; ordinary app users cannot invoke it.

create table if not exists public.whatsapp_identity_repairs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  canonical_chat_id uuid not null references public.whatsapp_chats(id) on delete restrict,
  duplicate_chat_id uuid not null,
  previous_whatsapp text,
  repaired_whatsapp text not null,
  duplicate_chat_snapshot jsonb not null,
  moved_message_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_identity_repairs_student
  on public.whatsapp_identity_repairs (company_id, student_id, created_at desc);

alter table public.whatsapp_identity_repairs enable row level security;
revoke all on table public.whatsapp_identity_repairs from public, anon, authenticated;
grant select, insert on table public.whatsapp_identity_repairs to service_role;

create or replace function public.repair_whatsapp_student_chat_identity(
  _student_id uuid,
  _canonical_chat_id uuid,
  _duplicate_chat_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_canonical public.whatsapp_chats%rowtype;
  v_duplicate public.whatsapp_chats%rowtype;
  v_canonical_phone text;
  v_duplicate_phone text;
  v_provider_messages integer;
  v_duplicate_messages integer;
  v_unsafe_duplicate_messages integer;
  v_conflicting_students integer;
  v_moved_message_ids uuid[] := '{}'::uuid[];
  v_alias_chat_id uuid;
  v_repair_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;

  if _canonical_chat_id = _duplicate_chat_id then
    raise exception 'canonical and duplicate chats must differ' using errcode = '22023';
  end if;

  select * into v_student
  from public.students
  where id = _student_id
  for update;
  if not found then
    raise exception 'student not found' using errcode = 'P0002';
  end if;

  select * into v_canonical
  from public.whatsapp_chats
  where id = _canonical_chat_id
  for update;
  if not found then
    raise exception 'canonical chat not found' using errcode = 'P0002';
  end if;

  select * into v_duplicate
  from public.whatsapp_chats
  where id = _duplicate_chat_id
  for update;
  if not found then
    raise exception 'duplicate chat not found' using errcode = 'P0002';
  end if;

  if v_student.company_id <> v_canonical.company_id
     or v_student.company_id <> v_duplicate.company_id
     or v_canonical.instance_id is null
     or v_canonical.instance_id is distinct from v_duplicate.instance_id then
    raise exception 'company or WhatsApp instance mismatch' using errcode = '23514';
  end if;

  if v_canonical.remote_jid not like '%@s.whatsapp.net'
     or v_duplicate.remote_jid not like '%@s.whatsapp.net' then
    raise exception 'only direct WhatsApp chats can be repaired' using errcode = '23514';
  end if;

  if v_duplicate.student_id is distinct from _student_id then
    raise exception 'duplicate chat is not linked to the student' using errcode = '23514';
  end if;
  if v_canonical.student_id is not null
     and v_canonical.student_id is distinct from _student_id then
    raise exception 'canonical chat belongs to another student' using errcode = '23514';
  end if;

  v_canonical_phone := public.sett_phone_key(split_part(v_canonical.remote_jid, '@', 1));
  v_duplicate_phone := public.sett_phone_key(split_part(v_duplicate.remote_jid, '@', 1));
  if v_canonical_phone is null
     or (length(v_canonical_phone) = 11 and substring(v_canonical_phone from 3 for 1) <> '9')
     or v_duplicate_phone is null
     or v_canonical_phone = v_duplicate_phone then
    raise exception 'canonical recipient is invalid or not distinct' using errcode = '23514';
  end if;

  if public.sett_phone_key(v_student.whatsapp) is distinct from v_duplicate_phone then
    raise exception 'student phone does not explain the duplicate chat' using errcode = '23514';
  end if;

  select count(*) into v_conflicting_students
  from public.students
  where company_id = v_student.company_id
    and id <> _student_id
    and v_canonical_phone in (
      public.sett_phone_key(whatsapp),
      public.sett_phone_key(phone)
    );
  if v_conflicting_students <> 0 then
    raise exception 'canonical recipient belongs to another student' using errcode = '23514';
  end if;

  select count(*) into v_provider_messages
  from public.whatsapp_messages
  where chat_id = _canonical_chat_id
    and message_id_external is not null;
  if v_provider_messages = 0 then
    raise exception 'canonical chat has no provider-backed history' using errcode = '23514';
  end if;

  select
    count(*),
    count(*) filter (
      where message_id_external is not null
         or coalesce(is_from_me, false)
         or coalesce(source, '') <> 'incoming'
         or coalesce(sender_id, '') <> _student_id::text
    )
  into v_duplicate_messages, v_unsafe_duplicate_messages
  from public.whatsapp_messages
  where chat_id = _duplicate_chat_id;
  if v_duplicate_messages = 0 or v_unsafe_duplicate_messages <> 0 then
    raise exception 'duplicate chat contains provider or outbound history' using errcode = '23514';
  end if;

  select canonical_chat_id into v_alias_chat_id
  from public.whatsapp_jid_aliases
  where instance_id = v_duplicate.instance_id
    and alias_jid = v_duplicate.remote_jid
  for update;
  if v_alias_chat_id is not null and v_alias_chat_id <> _canonical_chat_id then
    raise exception 'duplicate JID is already aliased to another chat' using errcode = '23514';
  end if;

  select coalesce(array_agg(id order by timestamp, id), '{}'::uuid[])
  into v_moved_message_ids
  from public.whatsapp_messages
  where chat_id = _duplicate_chat_id;

  insert into public.whatsapp_identity_repairs (
    company_id,
    student_id,
    canonical_chat_id,
    duplicate_chat_id,
    previous_whatsapp,
    repaired_whatsapp,
    duplicate_chat_snapshot,
    moved_message_ids
  ) values (
    v_student.company_id,
    _student_id,
    _canonical_chat_id,
    _duplicate_chat_id,
    v_student.whatsapp,
    v_canonical_phone,
    to_jsonb(v_duplicate),
    v_moved_message_ids
  )
  returning id into v_repair_id;

  insert into public.whatsapp_chat_labels (chat_id, label_id)
  select _canonical_chat_id, label_id
  from public.whatsapp_chat_labels
  where chat_id = _duplicate_chat_id
  on conflict (chat_id, label_id) do nothing;

  delete from public.whatsapp_chat_labels
  where chat_id = _duplicate_chat_id;

  update public.flow_sessions
  set chat_id = _canonical_chat_id,
      updated_at = now()
  where chat_id = _duplicate_chat_id;

  update public.whatsapp_messages
  set chat_id = _canonical_chat_id
  where chat_id = _duplicate_chat_id;

  insert into public.whatsapp_jid_aliases (
    company_id,
    instance_id,
    alias_jid,
    canonical_chat_id
  ) values (
    v_student.company_id,
    v_duplicate.instance_id,
    v_duplicate.remote_jid,
    _canonical_chat_id
  )
  on conflict (instance_id, alias_jid) do update
  set canonical_chat_id = excluded.canonical_chat_id,
      company_id = excluded.company_id,
      updated_at = now();

  update public.whatsapp_chats
  set
    student_id = _student_id,
    contact_name = coalesce(v_student.full_name, v_canonical.contact_name, v_duplicate.contact_name),
    contact_photo = coalesce(v_canonical.contact_photo, v_duplicate.contact_photo),
    last_message = case
      when v_duplicate.last_message_at is not null
       and (v_canonical.last_message_at is null or v_duplicate.last_message_at > v_canonical.last_message_at)
        then v_duplicate.last_message
      else v_canonical.last_message
    end,
    last_message_at = case
      when v_duplicate.last_message_at is not null
       and (v_canonical.last_message_at is null or v_duplicate.last_message_at > v_canonical.last_message_at)
        then v_duplicate.last_message_at
      else v_canonical.last_message_at
    end,
    last_sender_id = case
      when v_duplicate.last_message_at is not null
       and (v_canonical.last_message_at is null or v_duplicate.last_message_at > v_canonical.last_message_at)
        then v_duplicate.last_sender_id
      else v_canonical.last_sender_id
    end,
    unread_count = coalesce(v_canonical.unread_count, 0) + coalesce(v_duplicate.unread_count, 0),
    history_synced_at = case
      when v_canonical.history_synced_at is null then v_duplicate.history_synced_at
      when v_duplicate.history_synced_at is null then v_canonical.history_synced_at
      else greatest(v_canonical.history_synced_at, v_duplicate.history_synced_at)
    end,
    updated_at = now()
  where id = _canonical_chat_id;

  update public.students
  set whatsapp = v_canonical_phone,
      updated_at = now()
  where id = _student_id;

  delete from public.whatsapp_chats
  where id = _duplicate_chat_id;

  return jsonb_build_object(
    'ok', true,
    'repair_id', v_repair_id,
    'canonical_chat_id', _canonical_chat_id,
    'moved_messages', cardinality(v_moved_message_ids)
  );
end;
$$;

revoke all on function public.repair_whatsapp_student_chat_identity(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.repair_whatsapp_student_chat_identity(uuid, uuid, uuid)
  to service_role;

comment on table public.whatsapp_identity_repairs is
  'Restricted audit trail for explicit, evidence-backed WhatsApp identity repairs.';
comment on function public.repair_whatsapp_student_chat_identity(uuid, uuid, uuid) is
  'Safely merges an internal-only duplicate chat into provider-backed history after strict identity checks.';
