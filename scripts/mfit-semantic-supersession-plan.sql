-- Read-only planner for the legacy MFIT cycles that overlap a newer integrated
-- Studio prescription. It emits only hashed references and aggregate counts.
-- Eligibility is deliberately stricter than a visual overlap: the Studio
-- cycle must own every integrated plan reference, while the MFIT cycle must
-- have no history or downstream reference.

with marker_workouts as (
  select
    workout.*,
    substring(
      split_part(coalesce(workout.notes, ''), E'\n', 1)
      from '^mfit-import:v1:([0-9a-f]+)$'
    ) as marker_hash
  from public.workouts as workout
  where split_part(coalesce(workout.notes, ''), E'\n', 1) like 'mfit-import:v1:%'
),
imported_cycles as (
  select
    cycle.*,
    count(workout.id)::integer as imported_workouts,
    count(*) filter (where workout.marker_hash is null)::integer as imported_non_mfit_workouts,
    count(distinct workout.marker_hash)::integer as marker_count,
    array_agg(workout.id order by workout.sort_order, workout.id) as imported_workout_ids,
    encode(extensions.digest((to_jsonb(cycle) - array[
      'superseded_by_cycle_id', 'superseded_at', 'superseded_by',
      'superseded_previous_status', 'superseded_reason'
    ])::text, 'sha256'), 'hex') as imported_cycle_sha256,
    encode(extensions.digest(
      string_agg((to_jsonb(workout) - 'marker_hash')::text, E'\n' order by workout.id),
      'sha256'
    ), 'hex') as imported_workouts_sha256
  from public.training_cycles as cycle
  join marker_workouts as workout on workout.cycle_id = cycle.id
  group by cycle.id
),
paired as (
  select
    imported.*,
    original.id as canonical_cycle_id,
    original.cycle_number as canonical_cycle_number,
    original.status as canonical_status,
    original.end_date as canonical_end_date,
    encode(extensions.digest((to_jsonb(original) - array[
      'superseded_by_cycle_id', 'superseded_at', 'superseded_by',
      'superseded_previous_status', 'superseded_reason'
    ])::text, 'sha256'), 'hex') as canonical_cycle_sha256,
    count(*) over (partition by imported.id) as canonical_candidates,
    count(*) over (partition by original.id) as imported_candidates
  from imported_cycles as imported
  join public.training_cycles as original
    on original.company_id = imported.company_id
   and original.student_id = imported.student_id
   and original.enrollment_id = imported.enrollment_id
   and original.id <> imported.id
   and imported.start_date = original.start_date
   and abs(imported.end_date - original.end_date) <= 1
   and not exists (
     select 1 from marker_workouts as marker where marker.cycle_id = original.id
   )
),
classified as (
  select
    pair.*,
    (select count(*) from public.workouts w where w.cycle_id = pair.canonical_cycle_id)::integer as canonical_workouts,
    (select count(*) from public.workout_exercises e where e.workout_id = any(pair.imported_workout_ids))::integer as imported_exercises,
    (select count(*) from public.workout_logs l where l.workout_id = any(pair.imported_workout_ids))::integer as imported_logs,
    (select count(*) from public.workout_sessions s where s.workout_id = any(pair.imported_workout_ids))::integer as imported_sessions,
    (select count(*) from public.cycle_feedback f where f.cycle_id = pair.id)::integer as imported_feedback,
    (select count(*) from public.ai_plan_versions p where p.cycle_id = pair.id)::integer as imported_versions,
    (select count(*) from public.ai_strength_plans p where p.training_cycle_id = pair.id)::integer as imported_strength,
    (select count(*) from public.running_plans p where p.training_cycle_id = pair.id)::integer as imported_running,
    (select count(*) from public.nutrition_plans p where p.training_cycle_id = pair.id)::integer as imported_nutrition,
    (select count(*) from public.prescription_bundles p where p.training_cycle_id = pair.id)::integer as imported_bundles,
    (select count(*) from public.ai_plan_versions p where p.cycle_id = pair.canonical_cycle_id)::integer as canonical_versions,
    (select count(*) from public.ai_strength_plans p where p.training_cycle_id = pair.canonical_cycle_id)::integer as canonical_strength,
    (select count(*) from public.running_plans p where p.training_cycle_id = pair.canonical_cycle_id)::integer as canonical_running,
    (select count(*) from public.prescription_bundles p where p.training_cycle_id = pair.canonical_cycle_id)::integer as canonical_bundles
  from paired as pair
),
eligible as (
  select *
  from classified
  where canonical_candidates = 1
    and imported_candidates = 1
    and status = 'pending'
    and canonical_status in ('active', 'pending')
    and imported_non_mfit_workouts = 0
    and marker_count = 1
    and canonical_workouts > 0
    and imported_logs = 0
    and imported_sessions = 0
    and imported_feedback = 0
    and imported_versions = 0
    and imported_strength = 0
    and imported_running = 0
    and imported_nutrition = 0
    and imported_bundles = 0
    and canonical_versions > 0
    and canonical_strength > 0
    and canonical_running > 0
    and canonical_bundles > 0
)
select
  left(md5(student_id::text), 12) as student_ref,
  left(md5(enrollment_id::text), 12) as enrollment_ref,
  left(md5(id::text), 12) as imported_cycle_ref,
  left(md5(canonical_cycle_id::text), 12) as canonical_cycle_ref,
  cycle_number as imported_cycle_number,
  canonical_cycle_number,
  start_date,
  end_date,
  canonical_end_date,
  imported_workouts,
  imported_exercises,
  canonical_workouts,
  canonical_versions,
  canonical_strength,
  canonical_running,
  canonical_bundles,
  (
    select encode(extensions.digest(string_agg(
      concat_ws('|',
        safe.company_id::text,
        safe.student_id::text,
        safe.enrollment_id::text,
        safe.id::text,
        safe.canonical_cycle_id::text,
        safe.imported_cycle_sha256,
        safe.canonical_cycle_sha256,
        safe.imported_workouts_sha256,
        array_to_string(safe.imported_workout_ids, ','),
        safe.imported_workouts::text,
        safe.imported_exercises::text,
        safe.canonical_workouts::text,
        safe.canonical_versions::text,
        safe.canonical_strength::text,
        safe.canonical_running::text,
        safe.canonical_bundles::text
      ),
      E'\n' order by safe.id
    ), 'sha256'), 'hex')
    from eligible as safe
  ) as eligible_manifest_sha256
from eligible
order by start_date;
