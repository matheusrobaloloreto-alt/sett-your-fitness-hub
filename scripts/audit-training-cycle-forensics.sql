-- Read-only forensic detail for the screenshot-matching anonymous enrollment.
-- The md5 prefix is produced by audit-training-cycle-entitlements.sql and is
-- intentionally not reversible to a student or enrollment identifier.

with target as (
  select enrollment.*
  from public.enrollments enrollment
  where substr(md5(enrollment.id::text), 1, 12) = '711a247b40da'
),
cycle_rows as (
  select
    cycle.*,
    exists (select 1 from public.workouts workout where workout.cycle_id = cycle.id) as has_workout,
    (
      exists (select 1 from public.prescription_bundles bundle where bundle.training_cycle_id = cycle.id)
      or exists (select 1 from public.ai_strength_plans strength where strength.training_cycle_id = cycle.id)
      or exists (select 1 from public.running_plans running where running.training_cycle_id = cycle.id)
      or exists (select 1 from public.nutrition_plans nutrition where nutrition.training_cycle_id = cycle.id)
      or exists (select 1 from public.cycle_feedback feedback where feedback.cycle_id = cycle.id)
      or exists (select 1 from public.ai_plan_versions version where version.cycle_id = cycle.id)
    ) as has_other_history
  from public.training_cycles cycle
  join target enrollment on enrollment.id = cycle.enrollment_id
  where cycle.status is distinct from 'superseded'
    and cycle.superseded_by_cycle_id is null
)
select
  'cycle' as result_type,
  substr(md5(enrollment.id::text), 1, 12) as enrollment_ref,
  substr(md5(enrollment.student_id::text), 1, 12) as student_ref,
  cycle.cycle_number,
  cycle.start_date,
  cycle.end_date,
  (cycle.end_date - cycle.start_date + 1)::integer as cycle_days,
  cycle.status,
  cycle.has_workout,
  cycle.has_other_history,
  cycle.created_at::date as created_date,
  cycle.created_at as cycle_created_at,
  enrollment.start_date as contract_start,
  enrollment.end_date as contract_end,
  enrollment.training_start_date,
  plan.duration_days as plan_duration_days,
  plan.duration_weeks,
  plan.cycle_duration_days as plan_cycle_days,
  enrollment.created_at::date as enrollment_created_date,
  enrollment.updated_at::date as enrollment_updated_date,
  enrollment.updated_at as enrollment_updated_at
from target enrollment
join public.plans plan on plan.id = enrollment.plan_id
join cycle_rows cycle on cycle.enrollment_id = enrollment.id
order by cycle.cycle_number;
