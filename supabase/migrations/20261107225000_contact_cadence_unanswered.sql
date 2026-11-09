create function public.operational_contact_cadence(_company_id uuid, _student_ids uuid[] default null)
returns table (
  chat_id uuid,
  contact_name text,
  student_id uuid,
  student_name text,
  student_status text,
  first_unanswered_at timestamptz,
  last_unanswered_at timestamptz,
  last_team_message_at timestamptz,
  chat_created_at timestamptz
)
language sql stable security invoker
set search_path = ''
as $$
  select c.id, c.contact_name, c.student_id, s.full_name, s.status,
    incoming.first_unanswered_at, incoming.last_unanswered_at,
    outgoing.last_team_message_at, c.created_at
  from public.whatsapp_chats c
  left join public.students s on s.id = c.student_id and s.company_id = c.company_id
  cross join lateral (
    select max(m.timestamp) as last_team_message_at
    from public.whatsapp_messages m
    where m.chat_id = c.id and m.company_id = c.company_id
      and m.is_from_me is true and m.failed_at is null
      and m.status in ('accepted', 'sent', 'delivered', 'read')
      and m.type is distinct from 'reaction'
      and (
        m.origin in ('panel_manual', 'provider_live', 'provider_history_sync')
        or (m.origin = 'unknown' and m.sender_id is not null)
      )
  ) outgoing
  cross join lateral (
    select min(m.timestamp) as first_unanswered_at, max(m.timestamp) as last_unanswered_at
    from public.whatsapp_messages m
    where m.chat_id = c.id and m.company_id = c.company_id
      and m.is_from_me is false and m.type is distinct from 'reaction'
      and (outgoing.last_team_message_at is null or m.timestamp > outgoing.last_team_message_at)
  ) incoming
  where c.company_id = _company_id
    and (_student_ids is null or c.student_id = any(_student_ids))
    and (public.has_role(auth.uid(), 'master'::public.app_role) or exists (
      select 1 from public.company_members member
      where member.user_id = auth.uid() and member.company_id = _company_id
    ))
    and c.cadence_muted is not true and c.is_archived is not true
    and c.remote_jid not like '%@g.us'
    and (c.student_id is null or s.status in ('active', 'pending', 'awaiting_renewal', 'awaiting_training'));
$$;

revoke all on function public.operational_contact_cadence(uuid, uuid[]) from public, anon;
grant execute on function public.operational_contact_cadence(uuid, uuid[]) to authenticated;

-- Keep the existing Carteira and Dashboard call sites on the same source.
create or replace function public.contact_cadence(_company_id uuid)
returns table (
  chat_id uuid,
  contact_name text,
  student_id uuid,
  student_name text,
  student_status text,
  kind text,
  last_inbound_at timestamptz,
  hours_since numeric
)
language sql stable security invoker
set search_path = ''
as $$
  select c.chat_id, c.contact_name, c.student_id, c.student_name, c.student_status,
    case when c.student_id is null then 'lead' else 'aluno' end,
    c.last_unanswered_at,
    extract(epoch from (now() - c.first_unanswered_at)) / 3600.0
  from public.operational_contact_cadence(_company_id) c
  where c.first_unanswered_at is not null
  order by c.first_unanswered_at, c.chat_id;
$$;

-- Keep the read-only trainer projection aligned without changing its access
-- checks or granting direct access to the underlying conversations.
do $migration$
declare
  definition text;
  cadence_start integer;
  next_field integer;
begin
  select pg_get_functiondef('commercial_private.get_company_dashboard_snapshot(uuid)'::regprocedure)
    into definition;
  cadence_start := strpos(definition, '''contactCadence'',');
  next_field := strpos(definition, '''atRiskStudents'',');
  if cadence_start = 0 or next_field <= cadence_start
    or strpos(substring(definition from cadence_start for next_field - cadence_start), 'm.last_inbound_at') = 0
  then
    raise exception 'Dashboard snapshot cadence definition changed';
  end if;

  execute overlay(definition placing $cadence$
    'contactCadence', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.hours_since desc, c.chat_id)
      from public.contact_cadence(_company_id) c
      where c.student_id is null or exists (
        select 1 from students_scope s where s.id = c.student_id
      )
    ), '[]'::jsonb),
    $cadence$ from cadence_start for next_field - cadence_start);
end
$migration$;
