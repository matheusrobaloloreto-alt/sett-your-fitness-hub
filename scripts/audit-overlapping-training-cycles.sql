-- Read-only, PII-safe audit for overlapping visible cycles.

with visible_cycles as (
  select cycle.*
  from public.training_cycles cycle
  where cycle.status is distinct from 'superseded'
    and cycle.superseded_by_cycle_id is null
),
overlap_pairs as (
  select
    left_cycle.enrollment_id,
    left_cycle.id as left_cycle_id,
    right_cycle.id as right_cycle_id,
    left_cycle.cycle_number as left_cycle_number,
    right_cycle.cycle_number as right_cycle_number,
    greatest(left_cycle.start_date, right_cycle.start_date) as overlap_start,
    least(left_cycle.end_date, right_cycle.end_date) as overlap_end
  from visible_cycles left_cycle
  join visible_cycles right_cycle
    on right_cycle.enrollment_id = left_cycle.enrollment_id
   and right_cycle.id > left_cycle.id
   and daterange(left_cycle.start_date, left_cycle.end_date, '[]')
       && daterange(right_cycle.start_date, right_cycle.end_date, '[]')
),
cycle_signals as (
  select
    cycle.id,
    exists (select 1 from public.workouts workout where workout.cycle_id = cycle.id) as has_workout,
    exists (
      select 1
      from public.workouts workout
      where workout.cycle_id = cycle.id
        and split_part(coalesce(workout.notes, ''), E'\n', 1) like 'mfit-import:v1:%'
    ) as has_mfit_marker,
    (
      exists (select 1 from public.workout_logs log join public.workouts workout on workout.id = log.workout_id where workout.cycle_id = cycle.id)
      or exists (select 1 from public.workout_sessions session join public.workouts workout on workout.id = session.workout_id where workout.cycle_id = cycle.id)
      or exists (select 1 from public.cycle_feedback feedback where feedback.cycle_id = cycle.id)
      or exists (select 1 from public.ai_plan_versions version where version.cycle_id = cycle.id)
      or exists (select 1 from public.ai_strength_plans strength where strength.training_cycle_id = cycle.id)
      or exists (select 1 from public.running_plans running where running.training_cycle_id = cycle.id)
      or exists (select 1 from public.nutrition_plans nutrition where nutrition.training_cycle_id = cycle.id)
      or exists (select 1 from public.prescription_bundles bundle where bundle.training_cycle_id = cycle.id)
    ) as has_history
  from visible_cycles cycle
),
pair_summary as (
  select
    pair.enrollment_id,
    count(*)::integer as overlapping_pairs,
    min(pair.overlap_start) as first_overlap,
    max(pair.overlap_end) as last_overlap
  from overlap_pairs pair
  group by pair.enrollment_id
),
overlap_cycle_ids as (
  select enrollment_id, left_cycle_id as cycle_id from overlap_pairs
  union
  select enrollment_id, right_cycle_id as cycle_id from overlap_pairs
),
by_enrollment as (
  select
    summary.enrollment_id,
    summary.overlapping_pairs,
    count(*)::integer as overlap_cycle_signal,
    count(*) filter (where signal.has_workout)::integer as workout_cycle_occurrences,
    count(*) filter (where signal.has_mfit_marker)::integer as mfit_cycle_occurrences,
    count(*) filter (where signal.has_history)::integer as history_cycle_occurrences,
    summary.first_overlap,
    summary.last_overlap
  from pair_summary summary
  join overlap_cycle_ids overlap_cycle on overlap_cycle.enrollment_id = summary.enrollment_id
  join cycle_signals signal on signal.id = overlap_cycle.cycle_id
  group by summary.enrollment_id, summary.overlapping_pairs, summary.first_overlap, summary.last_overlap
),
student_enrollment_counts as (
  select
    enrollment.student_id,
    count(*) filter (where enrollment.status in ('active', 'awaiting_training', 'awaiting_renewal'))::integer as current_enrollments
  from public.enrollments enrollment
  group by enrollment.student_id
)
select
  'overlap_candidate' as result_type,
  substr(md5(enrollment.id::text), 1, 12) as enrollment_ref,
  substr(md5(enrollment.student_id::text), 1, 12) as student_ref,
  enrollment.status,
  coalesce(student_counts.current_enrollments, 0) as student_current_enrollments,
  overlap.overlapping_pairs,
  overlap.overlap_cycle_signal,
  overlap.workout_cycle_occurrences,
  overlap.mfit_cycle_occurrences,
  overlap.history_cycle_occurrences,
  overlap.first_overlap,
  overlap.last_overlap,
  enrollment.start_date as contract_start,
  enrollment.end_date as contract_end,
  enrollment.training_start_date,
  greatest(coalesce(plan.duration_days, plan.duration_weeks * 7, 1), 1)::integer as plan_days,
  greatest(coalesce(plan.cycle_duration_days, enrollment.cycle_duration_days, 42), 1)::integer as cycle_days
from by_enrollment overlap
join public.enrollments enrollment on enrollment.id = overlap.enrollment_id
left join public.plans plan on plan.id = enrollment.plan_id
left join student_enrollment_counts student_counts on student_counts.student_id = enrollment.student_id
order by overlap.overlapping_pairs desc, enrollment_ref;
