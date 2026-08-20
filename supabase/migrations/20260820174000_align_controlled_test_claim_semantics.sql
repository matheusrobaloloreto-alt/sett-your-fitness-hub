-- Align scheduled and exact controlled-test claims on one fail-closed flag
-- interpretation. Invalid controlled_test text is treated as false, never cast.

create or replace function public.claim_automation_sessions(_limit integer default 25)
returns setof public.flow_sessions
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  with candidates as (
    select session.id
      from public.flow_sessions as session
     where session.status = 'active'
       and session.current_node_id is not null
       and lower(btrim(coalesce(coalesce(session.context, '{}'::jsonb)->>'controlled_test', 'false')))
         not in ('true', 't', '1', 'yes', 'y', 'on')
       and (
         not (coalesce(session.context, '{}'::jsonb) ? 'next_dispatch_at')
         or case
           when session.context->>'next_dispatch_at' ~ '^\d{4}-\d{2}-\d{2}T'
             then (session.context->>'next_dispatch_at')::timestamptz <= now()
           else true
         end
       )
     order by session.created_at asc
     for update skip locked
     limit greatest(1, least(coalesce(_limit, 25), 100))
  ), claimed as (
    update public.flow_sessions as session
       set status = 'processing',
           last_activity_at = now(),
           updated_at = now()
      from candidates
     where session.id = candidates.id
    returning session.*
  )
  select * from claimed;
end;
$function$;

revoke all on function public.claim_automation_sessions(integer) from public, anon, authenticated;
grant execute on function public.claim_automation_sessions(integer) to service_role;

comment on function public.claim_automation_sessions(integer) is
  'Claims scheduled automation sessions, excluding controlled-test truthy flags that require claim_automation_session(uuid).';

create or replace function public.claim_automation_session(_session_id uuid)
returns setof public.flow_sessions
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  with candidate as (
    select session.id
      from public.flow_sessions as session
     where session.id = _session_id
       and session.status = 'active'
       and session.current_node_id is not null
       and coalesce(session.context, '{}'::jsonb)->>'trigger_type' = 'weekly_contact'
       and lower(btrim(coalesce(coalesce(session.context, '{}'::jsonb)->>'controlled_test', 'false')))
         in ('true', 't', '1', 'yes', 'y', 'on')
     for update skip locked
  ), claimed as (
    update public.flow_sessions as session
       set status = 'processing',
           last_activity_at = now(),
           updated_at = now()
      from candidate
     where session.id = candidate.id
    returning session.*
  )
  select * from claimed;
end;
$function$;

revoke all on function public.claim_automation_session(uuid) from public, anon, authenticated;
grant execute on function public.claim_automation_session(uuid) to service_role;

comment on function public.claim_automation_session(uuid) is
  'Claims one exact weekly controlled-test session using the same safe truthy flag semantics as the batch dispatcher.';
