-- Aggregate-only safety check for the September 2026 workout revision incident.
-- Never select student names, contact data, workout bodies, or audit snapshots.
with repair_candidates as (
  select workout.id, workout.cycle_id, workout.superseded_at
  from public.workout_revision_repair_audit repair
  join public.workouts workout on workout.id = repair.workout_id
  where repair.repair_key = '20260903_restore_native_after_mfit_append'
)
select
  count(*)::integer as candidate_workouts,
  count(distinct cycle_id)::integer as affected_cycles,
  count(*) filter (where superseded_at is null)::integer as candidates_still_visible,
  (select count(*)::integer
   from public.workout_revision_repair_audit
   where repair_key = '20260903_restore_native_after_mfit_append') as repair_audit_rows,
  (select count(*)::integer from public.workout_sessions session join repair_candidates candidate on candidate.id = session.workout_id) as preserved_sessions,
  (select count(*)::integer from public.workout_logs workout_log join repair_candidates candidate on candidate.id = workout_log.workout_id) as preserved_logs,
  (select count(*)::integer
   from public.workouts
   where superseded_at is null and revision_id is null) as current_rows_without_revision
from repair_candidates;
