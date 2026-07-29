-- Claims proactive automation sessions atomically so parallel cron calls cannot
-- dispatch the same first message twice.

CREATE OR REPLACE FUNCTION public.claim_automation_sessions(_limit integer DEFAULT 25)
RETURNS SETOF public.flow_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT session.id
      FROM public.flow_sessions AS session
     WHERE session.status = 'active'
       AND session.current_node_id IS NOT NULL
       AND (
         NOT (COALESCE(session.context, '{}'::jsonb) ? 'next_dispatch_at')
         OR CASE
           WHEN session.context->>'next_dispatch_at' ~ '^\d{4}-\d{2}-\d{2}T'
             THEN (session.context->>'next_dispatch_at')::timestamptz <= now()
           ELSE true
         END
       )
     ORDER BY session.created_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT greatest(1, least(COALESCE(_limit, 25), 100))
  ), claimed AS (
    UPDATE public.flow_sessions AS session
       SET status = 'processing',
           last_activity_at = now(),
           updated_at = now()
      FROM candidates
     WHERE session.id = candidates.id
    RETURNING session.*
  )
  SELECT * FROM claimed;
END;
$function$;
REVOKE ALL ON FUNCTION public.claim_automation_sessions(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_automation_sessions(integer) TO service_role;
-- These global maintenance functions are service jobs, not user-facing RPCs.
REVOKE EXECUTE ON FUNCTION public.process_automation_triggers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_automation_triggers() TO service_role;
REVOKE EXECUTE ON FUNCTION public.process_enrollment_lifecycle() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_enrollment_lifecycle() TO service_role;
