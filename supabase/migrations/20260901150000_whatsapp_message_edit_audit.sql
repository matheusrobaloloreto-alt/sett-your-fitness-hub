-- Audit and atomically persist provider-confirmed WhatsApp text edits.
-- Apply the schema before deploying the matching whatsapp-manager version.
-- Rollback before the function deploy may drop the function, index, constraint
-- and both columns. After live edits, export edited_at/edited_by before dropping
-- them; reverting the provider-side text itself is a separate manual operation.

alter table public.whatsapp_messages
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by uuid references auth.users(id) on delete set null;

comment on column public.whatsapp_messages.edited_at is
  'Server timestamp set only after the WhatsApp provider confirms a text edit.';
comment on column public.whatsapp_messages.edited_by is
  'Authenticated staff actor who requested the provider-confirmed text edit.';

create index if not exists idx_whatsapp_messages_edited_by
  on public.whatsapp_messages (edited_by)
  where edited_by is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'whatsapp_messages_edit_audit_complete'
      and conrelid = 'public.whatsapp_messages'::regclass
  ) then
    alter table public.whatsapp_messages
      add constraint whatsapp_messages_edit_audit_complete
      check (
        (edited_at is null and edited_by is null)
        or (edited_at is not null and edited_by is not null)
      );
  end if;
end
$$;

create or replace function public.commit_whatsapp_message_edit(
  _company_id uuid,
  _chat_id uuid,
  _message_external_id text,
  _content text,
  _edited_by uuid
)
returns public.whatsapp_messages
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_external_id text := nullif(btrim(coalesce(_message_external_id, '')), '');
  v_content text := nullif(btrim(coalesce(_content, '')), '');
  v_now timestamptz := statement_timestamp();
  v_message public.whatsapp_messages%rowtype;
  v_updated public.whatsapp_messages%rowtype;
begin
  if _company_id is null or _chat_id is null or _edited_by is null
    or v_external_id is null or v_content is null
    or char_length(v_content) > 4096 then
    raise exception using errcode = '22023', message = 'Invalid WhatsApp edit parameters.';
  end if;

  if not exists (select 1 from auth.users where id = _edited_by) then
    raise exception using errcode = '23503', message = 'WhatsApp edit actor not found.';
  end if;

  select wm.*
    into v_message
  from public.whatsapp_messages wm
  join public.whatsapp_chats wc
    on wc.id = wm.chat_id
   and wc.company_id = _company_id
  where wm.company_id = _company_id
    and wm.chat_id = _chat_id
    and wm.message_id_external = v_external_id
  for update of wm;

  if not found then
    raise exception using errcode = 'P0002', message = 'WhatsApp message not found in tenant chat.';
  end if;
  if v_message.source is distinct from 'outgoing'
    or v_message.type is distinct from 'text'
    or v_message.is_from_me is false then
    raise exception using errcode = '23514', message = 'WhatsApp message is not an outgoing text.';
  end if;
  if coalesce(v_message.timestamp, v_message.created_at) > v_now
    or v_now - coalesce(v_message.timestamp, v_message.created_at) > interval '15 minutes' then
    raise exception using errcode = '23514', message = 'WhatsApp edit window expired.';
  end if;

  update public.whatsapp_messages
  set content = v_content,
      edited_at = v_now,
      edited_by = _edited_by
  where id = v_message.id
  returning * into v_updated;

  if not exists (
    select 1
    from public.whatsapp_messages newer
    where newer.chat_id = v_message.chat_id
      and newer.id <> v_message.id
      and (
        coalesce(newer.timestamp, newer.created_at),
        newer.created_at,
        newer.id
      ) > (
        coalesce(v_message.timestamp, v_message.created_at),
        v_message.created_at,
        v_message.id
      )
  ) then
    update public.whatsapp_chats
    set last_message = v_content
    where id = v_message.chat_id
      and company_id = _company_id;
  end if;

  return v_updated;
end;
$$;

revoke all on function public.commit_whatsapp_message_edit(uuid, uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.commit_whatsapp_message_edit(uuid, uuid, text, text, uuid)
  to service_role;

comment on function public.commit_whatsapp_message_edit(uuid, uuid, text, text, uuid) is
  'Service-role-only local commit invoked after Evolution confirms a tenant-bound text edit.';
