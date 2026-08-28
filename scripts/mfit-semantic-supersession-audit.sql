-- PII-free post-apply audit for the reversible semantic supersession batch.
-- Expected: 3 applied audit rows, 3 superseded cycles, all preserved workouts,
-- zero post-apply usage and a partial unique visible-cycle index.

with batch as (
  select *
  from public.training_cycle_supersession_audit
  where batch_sha256 = 'd3f2acfadde8b69cf647456fa958ed36ec7195100b94a029af3371b56c589247'
), usage_counts as (
  select
    (select count(*) from public.workout_logs log where log.workout_id = any(audit.workout_ids)) as logs,
    (select count(*) from public.workout_sessions session where session.workout_id = any(audit.workout_ids)) as sessions,
    (select count(*) from public.cycle_feedback feedback where feedback.cycle_id = audit.superseded_cycle_id) as feedback
  from batch audit
)
select
  (select count(*)::integer from batch where state = 'applied') as applied_audit_rows,
  (
    select count(*)::integer
    from public.training_cycles cycle
    join batch audit on audit.superseded_cycle_id = cycle.id
    where cycle.status = 'superseded'
      and cycle.superseded_by_cycle_id = audit.canonical_cycle_id
  ) as superseded_cycles,
  (select coalesce(sum(workout_count), 0)::integer from batch) as preserved_workouts,
  (select coalesce(sum(array_length(workout_ids, 1)), 0)::integer from batch) as audited_workout_ids,
  (select coalesce(sum(logs + sessions + feedback), 0)::integer from usage_counts) as post_apply_usage,
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'training_cycles_enrollment_number_uidx'
      and indexdef like '%status IS DISTINCT FROM%superseded%'
      and indexdef like '%superseded_by_cycle_id IS NULL%'
  ) as visible_cycle_partial_unique_index;
