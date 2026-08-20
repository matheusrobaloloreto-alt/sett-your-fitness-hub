-- Isolated dispatcher gate for a single weekly-contact test session.
-- It never scans or claims unrelated sessions and is service-role only.

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
       and coalesce((coalesce(session.context, '{}'::jsonb)->>'controlled_test')::boolean, false) = true
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
