begin;

do $prerequisites$
begin
  if to_regclass('public.company_agenda_availability') is null
    or to_regprocedure('public.operational_contact_cadence(uuid,uuid[])') is null
    or to_regprocedure('public.contact_cadence(uuid)') is null
    or to_regprocedure('public.is_automated_cadence_receipt(uuid,uuid,text)') is null
    or coalesce(strpos(pg_get_functiondef(
      to_regprocedure('commercial_private.get_company_dashboard_snapshot(uuid)')
    ), 'from public.contact_cadence(_company_id)'), 0) = 0
  then
    raise exception 'Install the agenda, original cadence, and provider receipt migrations before updating contact cadence';
  end if;
end
$prerequisites$;

-- The agenda stores civil dates. Convert each midnight separately so a
-- configured closure can span 23, 24 or 25 real hours.
create function commercial_private.contact_cadence_closures(_company_id uuid)
returns setof tstzrange
language sql stable security definer
set search_path = ''
as $$
  select distinct tstzrange(
    civil.day::timestamp at time zone civil.zone,
    (civil.day + 1)::timestamp at time zone civil.zone,
    '[)'
  )
  from public.company_agenda_availability agenda
  cross join lateral jsonb_array_elements(agenda.settings->'exceptions') closure
  cross join lateral (values (
    (closure.value->>'date')::date, coalesce(agenda.settings->>'timezone', 'America/Sao_Paulo')
  )) as civil(day, zone)
  where agenda.company_id = _company_id
    and public.is_company_staff(auth.uid(), _company_id)
    and closure.value->'windows' = '[]'::jsonb;
$$;

revoke all on function commercial_private.contact_cadence_closures(uuid)
  from public, anon, authenticated, service_role;
grant execute on function commercial_private.contact_cadence_closures(uuid) to authenticated;

-- Bind the calendar dependency at definition time. Callers retain their own
-- WhatsApp RLS and need no USAGE on commercial_private or agenda table access.
create function public.operational_contact_cadence_status(_company_id uuid, _student_ids uuid[] default null)
returns table (
  chat_id uuid,
  contact_name text,
  student_id uuid,
  student_name text,
  student_status text,
  first_unanswered_at timestamptz,
  last_unanswered_at timestamptz,
  last_team_message_at timestamptz,
  chat_created_at timestamptz,
  unanswered_hours numeric,
  unanswered boolean,
  without_team_message boolean
)
language sql stable security invoker
set search_path = ''
begin atomic
  with closures as materialized (
    select closed
    from commercial_private.contact_cadence_closures(_company_id) as closed
    where lower(closed) < now()
  )
  select c.id, c.contact_name, c.student_id, s.full_name, s.status,
    incoming.first_unanswered_at, incoming.last_unanswered_at,
    outgoing.last_team_message_at, c.created_at,
    elapsed.unanswered_seconds / 3600.0,
    coalesce(elapsed.unanswered_seconds >= 86400, false),
    c.student_id is not null and coalesce(elapsed.without_team_seconds >= 604800, false)
  from public.whatsapp_chats c
  left join public.students s on s.id = c.student_id and s.company_id = c.company_id
  cross join lateral (
    select max(m.timestamp) as last_team_message_at
    from public.whatsapp_messages m
    where m.chat_id = c.id and m.company_id = c.company_id
      and m.is_from_me is true and m.failed_at is null
      and nullif(btrim(m.message_id_external), '') is not null
      and (
        m.status in ('sent', 'delivered', 'read')
        or (m.status = 'accepted' and m.provider_status in ('SERVER_ACK', 'SENT')
          and m.provider_status_at is not null)
      )
      and m.type is distinct from 'reaction'
      and isfinite(m.timestamp) and m.timestamp <= now()
      -- Webhook echoes have no outgoing sender. Match a trusted panel origin
      -- or a staff actor in legacy/provider rows, then exclude known automation.
      and case when m.sender_id::text ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
        m.origin = 'panel_manual' or (
          m.origin in ('provider_live', 'provider_history_sync', 'unknown')
          and public.is_company_staff(m.sender_id::uuid, m.company_id)
          and not public.is_automated_cadence_receipt(m.company_id, m.chat_id, m.message_id_external)
        )
        else false
      end
  ) outgoing
  cross join lateral (
    select min(m.timestamp) as first_unanswered_at, max(m.timestamp) as last_unanswered_at
    from public.whatsapp_messages m
    where m.chat_id = c.id and m.company_id = c.company_id
      and m.is_from_me is false and m.type is distinct from 'reaction'
      and isfinite(m.timestamp) and m.timestamp <= now()
      and (outgoing.last_team_message_at is null or m.timestamp > outgoing.last_team_message_at)
  ) incoming
  cross join lateral (
    select coalesce(outgoing.last_team_message_at,
      case when isfinite(c.created_at) and c.created_at <= now() then c.created_at end,
      incoming.first_unanswered_at) as without_team_since
  ) clocks
  cross join lateral (
    select
      sum(greatest(interval '0', least(now(), upper(closed))
        - greatest(incoming.first_unanswered_at, lower(closed)))) as unanswered_pause,
      sum(greatest(interval '0', least(now(), upper(closed))
        - greatest(clocks.without_team_since, lower(closed)))) as without_team_pause
    from closures
    where upper(closed) > least(incoming.first_unanswered_at, clocks.without_team_since)
  ) pauses
  cross join lateral (
    select
      extract(epoch from (now() - incoming.first_unanswered_at - coalesce(pauses.unanswered_pause, interval '0'))) as unanswered_seconds,
      extract(epoch from (now() - clocks.without_team_since - coalesce(pauses.without_team_pause, interval '0'))) as without_team_seconds
  ) elapsed
  where c.company_id = _company_id
    and (_student_ids is null or c.student_id = any(_student_ids))
    and public.is_company_staff(auth.uid(), _company_id)
    and public.company_feature_allowed(_company_id, 'hasWhatsApp')
    and (
      public.has_role(auth.uid(), 'master'::public.app_role)
      or public.has_role(auth.uid(), 'admin'::public.app_role)
      or exists (
        select 1 from public.user_roles actor
        join public.role_permissions permission on permission.role = actor.role::text
          and permission.company_id = _company_id
        where actor.user_id = auth.uid() and actor.role in ('trainer', 'coordinator')
          and permission.module = 'whatsapp' and permission.enabled is true
      )
    )
    and c.cadence_muted is not true and c.is_archived is not true
    and c.remote_jid not like '%@g.us'
    and (c.student_id is null or s.status in ('active', 'pending', 'awaiting_renewal', 'awaiting_training'));
end;

revoke all on function public.operational_contact_cadence_status(uuid, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.operational_contact_cadence_status(uuid, uuid[]) to authenticated;

-- Retain both deployed RPC shapes for existing clients and the trainer snapshot.
create or replace function public.operational_contact_cadence(_company_id uuid, _student_ids uuid[] default null)
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
  select c.chat_id, c.contact_name, c.student_id, c.student_name, c.student_status,
    c.first_unanswered_at, c.last_unanswered_at, c.last_team_message_at, c.chat_created_at
  from public.operational_contact_cadence_status(_company_id, _student_ids) c;
$$;

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
    c.last_unanswered_at, c.unanswered_hours
  from public.operational_contact_cadence_status(_company_id) c
  where c.first_unanswered_at is not null
  order by c.first_unanswered_at, c.chat_id;
$$;

-- The dashboard projection runs as its owner. Gate just this field before it
-- can read contacts, preserving dashboard-only access and other projections.
do $dashboard$
declare
  definition text := pg_get_functiondef('commercial_private.get_company_dashboard_snapshot(uuid)'::regprocedure);
  cadence_start integer := strpos(definition, '''contactCadence'',');
  next_field integer := strpos(definition, '''atRiskStudents'',');
begin
  if cadence_start = 0 or next_field <= cadence_start then
    raise exception 'Dashboard snapshot cadence definition changed';
  end if;

  execute overlay(definition placing $cadence$
    'contactCadence', case when public.company_feature_allowed(_company_id, 'hasWhatsApp') then coalesce((
      select jsonb_agg(to_jsonb(c) order by c.hours_since desc, c.chat_id)
      from public.contact_cadence(_company_id) c
      where c.student_id is null or exists (
        select 1 from students_scope s where s.id = c.student_id
      )
    ), '[]'::jsonb) else '[]'::jsonb end,
    $cadence$ from cadence_start for next_field - cadence_start);
end
$dashboard$;

commit;
