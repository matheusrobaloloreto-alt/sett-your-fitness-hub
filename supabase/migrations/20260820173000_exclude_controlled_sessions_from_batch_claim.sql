-- Keep exact controlled weekly canaries out of the scheduled batch dispatcher.
-- The single-session RPC remains the only path allowed to claim controlled tests.

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
       and coalesce(session.context, '{}'::jsonb)->>'controlled_test' is distinct from 'true'
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
  'Claims scheduled automation sessions, excluding controlled test sessions that require claim_automation_session(uuid).';
