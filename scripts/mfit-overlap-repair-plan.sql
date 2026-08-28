-- Read-only repair planner for legacy MFIT cycle overlaps.
-- This query deliberately emits only hashed references and aggregate flags.
-- It never mutates production data.

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
    count(workout.id) as imported_workouts,
    count(*) filter (where workout.marker_hash is not null) as imported_mfit_workouts,
    count(*) filter (where workout.marker_hash is null) as imported_non_mfit_workouts,
    count(distinct workout.marker_hash) as marker_count,
    array_agg(workout.id order by workout.sort_order, workout.id) as imported_workout_ids,
    encode(extensions.digest(to_jsonb(cycle)::text, 'sha256'), 'hex') as imported_cycle_snapshot_sha256,
    encode(extensions.digest(
      string_agg((to_jsonb(workout) - 'marker_hash')::text, E'\n' order by workout.id),
      'sha256'
    ), 'hex') as imported_workouts_snapshot_sha256
  from public.training_cycles as cycle
  join marker_workouts as workout on workout.cycle_id = cycle.id
  group by cycle.id
),
original_candidates as (
  select
    imported.*,
    original.id as original_cycle_id,
    original.cycle_number as original_cycle_number,
    original.start_date as original_start_date,
    original.end_date as original_end_date,
    original.status as original_status,
    original.name as original_name,
    original.objective as original_objective,
    original.duration_weeks as original_duration_weeks,
    original.workouts as original_workouts_json,
    original.notes as original_notes,
    original.anamnese_id as original_anamnese_id,
    original.bundle_id as original_bundle_id,
    original.delivery_status as original_delivery_status,
    original.prescribed_offline_at as original_prescribed_offline_at,
    original.prescribed_offline_by as original_prescribed_offline_by,
    original.prescribed_offline_note as original_prescribed_offline_note,
    encode(extensions.digest(to_jsonb(original)::text, 'sha256'), 'hex') as original_cycle_snapshot_sha256,
    count(*) over (partition by imported.id) as candidates_for_imported_cycle,
    count(*) over (partition by original.id) as imported_cycles_for_original_cycle
  from imported_cycles as imported
  join public.training_cycles as original
    on original.company_id = imported.company_id
   and original.student_id = imported.student_id
   and original.enrollment_id = imported.enrollment_id
   and original.id <> imported.id
   and not exists (
     select 1 from marker_workouts as marker where marker.cycle_id = original.id
   )
   and imported.start_date = original.start_date
   and abs(imported.end_date - original.end_date) <= 1
),
dependencies as (
  select
    candidate.*,
    (select count(*) from public.workouts as workout
      where workout.cycle_id = candidate.original_cycle_id) as original_workouts,
    (select count(*) from public.workout_exercises as exercise
      where exercise.workout_id = any(candidate.imported_workout_ids)) as imported_workout_exercise_rows,
    (select count(*) from public.workout_logs as workout_log
      where workout_log.workout_id = any(candidate.imported_workout_ids)) as imported_workout_logs,
    (select count(*) from public.workout_sessions as workout_session
      where workout_session.workout_id = any(candidate.imported_workout_ids)) as imported_workout_sessions,
    (select count(*) from public.cycle_feedback as feedback
      where feedback.cycle_id = candidate.id) as imported_cycle_feedback,
    (select count(*) from public.cycle_feedback as feedback
      where feedback.cycle_id = candidate.original_cycle_id) as original_cycle_feedback,
    (select count(*) from public.ai_plan_versions as version
      where version.cycle_id = candidate.id) as imported_plan_versions,
    (select count(*) from public.ai_plan_versions as version
      where version.cycle_id = candidate.original_cycle_id) as original_plan_versions,
    (select count(*) from public.ai_strength_plans as plan
      where plan.training_cycle_id = candidate.id) as imported_strength_plans,
    (select count(*) from public.ai_strength_plans as plan
      where plan.training_cycle_id = candidate.original_cycle_id) as original_strength_plans,
    (select count(*) from public.running_plans as plan
      where plan.training_cycle_id = candidate.id) as imported_running_plans,
    (select count(*) from public.running_plans as plan
      where plan.training_cycle_id = candidate.original_cycle_id) as original_running_plans,
    (select count(*) from public.nutrition_plans as plan
      where plan.training_cycle_id = candidate.id) as imported_nutrition_plans,
    (select count(*) from public.nutrition_plans as plan
      where plan.training_cycle_id = candidate.original_cycle_id) as original_nutrition_plans,
    (select count(*) from public.prescription_bundles as bundle
      where bundle.training_cycle_id = candidate.id) as imported_prescription_bundles,
    (select count(*) from public.prescription_bundles as bundle
      where bundle.training_cycle_id = candidate.original_cycle_id) as original_prescription_bundles
  from original_candidates as candidate
),
classified as (
  select
    dependencies.*,
    (
      original_workouts = 0
      and original_cycle_feedback = 0
      and original_plan_versions = 0
      and original_strength_plans = 0
      and original_running_plans = 0
      and original_nutrition_plans = 0
      and original_prescription_bundles = 0
    ) as original_cycle_is_unreferenced,
    (
      imported_non_mfit_workouts = 0
      and marker_count = 1
      and imported_workout_logs = 0
      and imported_workout_sessions = 0
      and imported_cycle_feedback = 0
      and imported_plan_versions = 0
      and imported_strength_plans = 0
      and imported_running_plans = 0
      and imported_nutrition_plans = 0
      and imported_prescription_bundles = 0
    ) as imported_cycle_has_no_history,
    (
      (original_name is not null and name is not null and original_name is distinct from name)
      or (original_objective is not null and objective is not null and original_objective is distinct from objective)
      or (original_duration_weeks is not null and duration_weeks is not null and original_duration_weeks is distinct from duration_weeks)
      or (original_workouts_json is not null and workouts is not null and original_workouts_json is distinct from workouts)
      or (original_notes is not null and notes is not null and original_notes is distinct from notes)
      or (original_anamnese_id is not null and anamnese_id is not null and original_anamnese_id is distinct from anamnese_id)
      or (original_bundle_id is not null and bundle_id is not null and original_bundle_id is distinct from bundle_id)
      or (original_delivery_status is not null and delivery_status is not null and original_delivery_status is distinct from delivery_status)
      or (original_prescribed_offline_at is not null and prescribed_offline_at is not null and original_prescribed_offline_at is distinct from prescribed_offline_at)
      or (original_prescribed_offline_by is not null and prescribed_offline_by is not null and original_prescribed_offline_by is distinct from prescribed_offline_by)
      or (original_prescribed_offline_note is not null and prescribed_offline_note is not null and original_prescribed_offline_note is distinct from prescribed_offline_note)
    ) as metadata_conflict
  from dependencies
),
repair_rows as (
  select
    classified.*,
    case
      when candidates_for_imported_cycle = 1
        and imported_cycles_for_original_cycle = 1
        and original_cycle_is_unreferenced
        and imported_cycle_has_no_history
        and not metadata_conflict
        then 'safe_replace_empty_original'
      when candidates_for_imported_cycle <> 1
        or imported_cycles_for_original_cycle <> 1
        then 'blocked_ambiguous_original'
      when not original_cycle_is_unreferenced then 'blocked_original_referenced'
      when not imported_cycle_has_no_history then 'blocked_imported_has_history'
      when metadata_conflict then 'manual_metadata_review'
      else 'blocked_unknown'
    end as repair_class
  from classified
)
select
  left(md5(student_id::text), 12) as student_ref,
  left(md5(enrollment_id::text), 12) as enrollment_ref,
  left(md5(id::text), 12) as imported_cycle_ref,
  left(md5(original_cycle_id::text), 12) as original_cycle_ref,
  cycle_number as imported_cycle_number,
  original_cycle_number,
  start_date,
  end_date,
  original_start_date,
  original_end_date,
  status as imported_status,
  original_status,
  imported_workouts,
  imported_workout_exercise_rows,
  original_workouts,
  imported_workout_logs,
  imported_workout_sessions,
  imported_cycle_feedback,
  imported_plan_versions,
  imported_strength_plans,
  imported_running_plans,
  imported_nutrition_plans,
  imported_prescription_bundles,
  original_cycle_feedback,
  original_plan_versions,
  original_strength_plans,
  original_running_plans,
  original_nutrition_plans,
  original_prescription_bundles,
  original_cycle_is_unreferenced,
  imported_cycle_has_no_history,
  metadata_conflict,
  (name is not null) as imported_has_name,
  (objective is not null) as imported_has_objective,
  (workouts is not null) as imported_has_workouts_json,
  (notes is not null) as imported_has_notes,
  (anamnese_id is not null) as imported_has_anamnese,
  (bundle_id is not null) as imported_has_bundle,
  (delivery_status is not null) as imported_has_delivery_status,
  (prescribed_offline_at is not null or prescribed_offline_by is not null or prescribed_offline_note is not null)
    as imported_has_offline_prescription,
  repair_class,
  (
    select encode(extensions.digest(string_agg(
      concat_ws('|',
        safe.company_id::text,
        safe.student_id::text,
        safe.enrollment_id::text,
        safe.id::text,
        safe.original_cycle_id::text,
        safe.imported_cycle_snapshot_sha256,
        safe.original_cycle_snapshot_sha256,
        safe.imported_workouts_snapshot_sha256,
        array_to_string(safe.imported_workout_ids, ','),
        safe.imported_workouts::text,
        safe.imported_workout_exercise_rows::text,
        safe.cycle_number::text,
        safe.original_cycle_number::text,
        safe.start_date::text,
        safe.end_date::text,
        coalesce(safe.status, ''),
        coalesce(safe.original_status, '')
      ),
      E'\n' order by safe.id
    ), 'sha256'), 'hex')
    from repair_rows as safe
    where safe.repair_class = 'safe_replace_empty_original'
  ) as safe_manifest_sha256
from repair_rows
order by repair_class, student_ref, start_date;
