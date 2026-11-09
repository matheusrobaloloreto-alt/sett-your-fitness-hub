-- Explicit ingestion contract. Portal feedback and historical mirrors have no provider origin.
create table public.workout_feedback_whatsapp_origins (
  feedback_id uuid primary key references public.workout_feedback(id) on delete cascade,
  message_id uuid unique references public.whatsapp_messages(id) on delete set null,
  has_original boolean generated always as (message_id is not null) stored,
  company_id uuid not null,
  student_id uuid not null,
  chat_id uuid not null,
  instance_id uuid not null,
  remote_jid text not null,
  provider_message_id text not null,
  needs_adjustment boolean not null,
  reaction_attempted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  reaction_provider_id text,
  unique (instance_id, remote_jid, provider_message_id),
  check ((reviewed_at is null and reviewed_by is null and reaction_provider_id is null)
    or (reviewed_at is not null and reviewed_by is not null and reaction_provider_id is not null
      and reaction_attempted_at is not null and not needs_adjustment))
);

alter table public.workout_feedback_whatsapp_origins enable row level security;
revoke all on table public.workout_feedback_whatsapp_origins from public, anon, authenticated, service_role;
grant select on table public.workout_feedback_whatsapp_origins to service_role;
grant select (feedback_id, company_id, has_original, needs_adjustment, reaction_attempted_at, reviewed_at)
  on table public.workout_feedback_whatsapp_origins to authenticated;
grant insert on table public.workout_feedback_whatsapp_origins to service_role;
grant update (reaction_attempted_at, reviewed_at, reviewed_by, reaction_provider_id)
  on table public.workout_feedback_whatsapp_origins to service_role;

create policy "Feedback review status visible to permitted staff"
  on public.workout_feedback_whatsapp_origins for select to authenticated
  using (
    public.is_company_staff(auth.uid(), company_id)
    and public.can_read_staff_student(company_id, student_id)
  );

-- Only a trusted ingestion path that already knows BOTH ids may call this.
-- Replaying the same binding is safe. A different binding is rejected.
create function public.bind_workout_feedback_whatsapp_origin(
  _company_id uuid, _feedback_id uuid, _message_id uuid, _needs_adjustment boolean
) returns boolean
language sql security invoker set search_path = ''
as $$
  with candidate as (
    select f.id as feedback_id, m.id as message_id, f.company_id, f.student_id,
      c.id as chat_id, c.instance_id, c.remote_jid, m.message_id_external
    from public.workout_feedback f
    join public.whatsapp_messages m on m.id = _message_id and m.company_id = f.company_id
    join public.whatsapp_chats c on c.id = m.chat_id and c.company_id = f.company_id and c.student_id = f.student_id
    join public.whatsapp_instances i on i.id = c.instance_id and i.company_id = c.company_id
    where f.id = _feedback_id and f.company_id = _company_id
      and m.origin in ('provider_live', 'provider_history_sync')
      and m.source = 'incoming' and m.is_from_me is false and m.status is distinct from 'deleted'
      and nullif(btrim(m.message_id_external), '') is not null
      and c.remote_jid ~ '^[1-9][0-9]{7,14}@s[.]whatsapp[.]net$'
      and _needs_adjustment is not null
  ), inserted as (
    insert into public.workout_feedback_whatsapp_origins
      (feedback_id, message_id, company_id, student_id, chat_id, instance_id, remote_jid, provider_message_id, needs_adjustment)
    select feedback_id, message_id, company_id, student_id, chat_id, instance_id, remote_jid,
      message_id_external, _needs_adjustment from candidate
    on conflict do nothing
    returning feedback_id
  )
  select exists (select 1 from inserted)
    or exists (
      select 1 from candidate c
      join public.workout_feedback_whatsapp_origins o using (feedback_id, message_id, company_id, student_id, chat_id, instance_id, remote_jid)
      where o.provider_message_id = c.message_id_external and o.needs_adjustment = _needs_adjustment
    );
$$;
revoke all on function public.bind_workout_feedback_whatsapp_origin(uuid, uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.bind_workout_feedback_whatsapp_origin(uuid, uuid, uuid, boolean) to service_role;
