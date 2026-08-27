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
    array_agg(distinct left(workout.marker_hash, 12)) as marker_refs
  from public.training_cycles as cycle
  join marker_workouts as workout on workout.cycle_id = cycle.id
  group by cycle.id
),
original_candidates as (
  select
    imported.id as imported_cycle_id,
    original.id as original_cycle_id,
    imported.company_id,
    imported.student_id,
    imported.enrollment_id,
    imported.cycle_number as imported_cycle_number,
    original.cycle_number as original_cycle_number,
    imported.start_date as source_start,
    imported.end_date as source_end,
    original.start_date as target_start,
    original.end_date as target_end,
    imported.start_date - original.start_date as start_delta_days,
    imported.end_date - original.end_date as end_delta_days,
    imported.imported_workouts,
    imported.imported_mfit_workouts,
    imported.imported_non_mfit_workouts,
    imported.marker_count,
    imported.imported_workout_ids,
    imported.marker_refs
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
    (select count(*) from public.workouts as workout
      where workout.cycle_id = candidate.original_cycle_id
        and split_part(coalesce(workout.notes, ''), E'\n', 1) not like 'mfit-import:v1:%') as original_non_mfit_workouts,
    (select count(*) from public.workout_exercises as exercise
      where exercise.workout_id = any(candidate.imported_workout_ids)) as imported_workout_exercise_rows,
    (select count(*) from public.workout_logs as workout_log
      where workout_log.workout_id = any(candidate.imported_workout_ids)) as imported_workout_logs,
    (select count(*) from public.workout_sessions as workout_session
      where workout_session.workout_id = any(candidate.imported_workout_ids)) as imported_workout_sessions,
    (select count(*) from public.cycle_feedback as feedback
      where feedback.cycle_id = candidate.imported_cycle_id) as imported_cycle_feedback
  from original_candidates as candidate
),
ranked as (
  select
    dependencies.*,
    count(*) over (partition by imported_cycle_id) as candidates_for_imported_cycle
  from dependencies
)
select
  imported_cycle_id,
  original_cycle_id,
  company_id,
  student_id,
  enrollment_id,
  left(md5(student_id::text), 12) as student_ref,
  left(md5(enrollment_id::text), 12) as enrollment_ref,
  left(md5(imported_cycle_id::text), 12) as imported_cycle_ref,
  left(md5(original_cycle_id::text), 12) as original_cycle_ref,
  imported_cycle_number,
  original_cycle_number,
  source_start,
  source_end,
  target_start,
  target_end,
  start_delta_days,
  end_delta_days,
  marker_refs,
  imported_workout_ids,
  imported_workouts,
  imported_workout_exercise_rows,
  original_workouts,
  original_non_mfit_workouts,
  imported_workout_logs,
  imported_workout_sessions,
  imported_cycle_feedback,
  case
    when candidates_for_imported_cycle = 1
      and imported_non_mfit_workouts = 0
      and marker_count = 1
      and imported_workout_logs = 0
      and imported_workout_sessions = 0
      and imported_cycle_feedback = 0
      and original_workouts = 0
      then 'auto_lossless_move'
    when candidates_for_imported_cycle = 1
      and imported_non_mfit_workouts = 0
      and marker_count = 1
      and imported_workout_logs = 0
      and imported_workout_sessions = 0
      and imported_cycle_feedback = 0
      and original_workouts > 0
      then 'manual_semantic_review'
    else 'blocked'
  end as repair_class
from ranked
order by repair_class, student_ref, source_start;
