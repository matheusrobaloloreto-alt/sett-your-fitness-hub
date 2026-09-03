-- Read-only, PII-safe audit for enrollment/cycle entitlement drift.
-- Never select student names, contact data, notes, or raw UUIDs.

with payment_evidence as (
  select
    coalesce(payment.lifecycle_enrollment_id, payment.enrollment_id) as enrollment_id,
    count(*) filter (
      where upper(coalesce(payment.status, '')) in ('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH')
    )::integer as confirmed_payments,
    count(*) filter (where payment.lifecycle_applied_at is not null)::integer as lifecycle_payments
  from public.payments payment
  where coalesce(payment.lifecycle_enrollment_id, payment.enrollment_id) is not null
  group by coalesce(payment.lifecycle_enrollment_id, payment.enrollment_id)
),
cycle_evidence as (
  select
    cycle.enrollment_id,
    count(*) filter (
      where cycle.status is distinct from 'superseded'
        and cycle.superseded_by_cycle_id is null
    )::integer as visible_cycles,
    min(cycle.start_date) filter (
      where cycle.status is distinct from 'superseded'
        and cycle.superseded_by_cycle_id is null
    ) as first_cycle_start,
    max(cycle.end_date) filter (
      where cycle.status is distinct from 'superseded'
        and cycle.superseded_by_cycle_id is null
    ) as last_cycle_end,
    count(*) filter (
      where cycle.status is distinct from 'superseded'
        and cycle.superseded_by_cycle_id is null
        and exists (select 1 from public.workouts workout where workout.cycle_id = cycle.id)
    )::integer as cycles_with_workouts,
    count(*) filter (
      where cycle.status is distinct from 'superseded'
        and cycle.superseded_by_cycle_id is null
        and (
          exists (select 1 from public.prescription_bundles bundle where bundle.training_cycle_id = cycle.id)
          or exists (select 1 from public.ai_strength_plans strength where strength.training_cycle_id = cycle.id)
          or exists (select 1 from public.running_plans running where running.training_cycle_id = cycle.id)
          or exists (select 1 from public.nutrition_plans nutrition where nutrition.training_cycle_id = cycle.id)
          or exists (select 1 from public.cycle_feedback feedback where feedback.cycle_id = cycle.id)
          or exists (select 1 from public.ai_plan_versions version where version.cycle_id = cycle.id)
        )
    )::integer as cycles_with_other_history,
    count(*) filter (
      where cycle.status is distinct from 'superseded'
        and cycle.superseded_by_cycle_id is null
        and cycle.end_date > enrollment.end_date
    )::integer as cycles_after_contract,
    count(*) filter (
      where cycle.status is distinct from 'superseded'
        and cycle.superseded_by_cycle_id is null
        and enrollment.training_start_date is not null
        and cycle.start_date < enrollment.training_start_date
    )::integer as cycles_before_training_start
  from public.training_cycles cycle
  join public.enrollments enrollment on enrollment.id = cycle.enrollment_id
  group by cycle.enrollment_id
),
enrollment_evidence as (
  select
    enrollment.id,
    enrollment.student_id,
    enrollment.status,
    enrollment.start_date,
    enrollment.end_date,
    enrollment.training_start_date,
    greatest(coalesce(plan.duration_days, plan.duration_weeks * 7, 1), 1)::integer as plan_days,
    greatest(coalesce(plan.cycle_duration_days, enrollment.cycle_duration_days, 42), 1)::integer as cycle_days,
    greatest(coalesce(enrollment.end_date - enrollment.start_date + 1, 0), 0)::integer as contract_days,
    coalesce(payment.confirmed_payments, 0)::integer as confirmed_payments,
    coalesce(payment.lifecycle_payments, 0)::integer as lifecycle_payments,
    coalesce(cycle.visible_cycles, 0)::integer as visible_cycles,
    cycle.first_cycle_start,
    cycle.last_cycle_end,
    coalesce(cycle.cycles_with_workouts, 0)::integer as cycles_with_workouts,
    coalesce(cycle.cycles_with_other_history, 0)::integer as cycles_with_other_history,
    coalesce(cycle.cycles_after_contract, 0)::integer as cycles_after_contract,
    coalesce(cycle.cycles_before_training_start, 0)::integer as cycles_before_training_start
  from public.enrollments enrollment
  join public.plans plan on plan.id = enrollment.plan_id
  left join payment_evidence payment on payment.enrollment_id = enrollment.id
  left join cycle_evidence cycle on cycle.enrollment_id = enrollment.id
  where coalesce(plan.plan_kind, 'standard') = 'standard'
),
classified as (
  select
    evidence.*,
    ceil(evidence.plan_days::numeric / evidence.cycle_days)::integer as cycles_per_plan,
    ceil(evidence.contract_days::numeric / evidence.plan_days)::integer as contract_plan_units,
    greatest(1, evidence.confirmed_payments, evidence.lifecycle_payments + 1)::integer as supported_plan_units,
    case
      when evidence.cycles_after_contract > 0 then 'cycle_outside_contract'
      when evidence.cycles_before_training_start > 0 then 'cycle_before_training_start'
      when evidence.visible_cycles > ceil(evidence.contract_days::numeric / evidence.cycle_days)::integer + 1
        then 'cycle_count_exceeds_contract'
      when ceil(evidence.contract_days::numeric / evidence.plan_days)::integer
        > greatest(1, evidence.confirmed_payments, evidence.lifecycle_payments + 1)
        then 'contract_exceeds_payment_evidence'
      else null
    end as anomaly
  from enrollment_evidence evidence
  where evidence.end_date is not null
    and evidence.start_date is not null
)
select
  'summary' as result_type,
  coalesce(anomaly, 'no_detected_anomaly') as classification,
  count(*)::integer as enrollment_count,
  count(distinct student_id)::integer as student_count,
  sum(visible_cycles)::integer as visible_cycle_count,
  sum(cycles_with_workouts + cycles_with_other_history)::integer as materialized_cycle_signals
from classified
group by coalesce(anomaly, 'no_detected_anomaly')
order by classification;

with payment_evidence as (
  select
    coalesce(payment.lifecycle_enrollment_id, payment.enrollment_id) as enrollment_id,
    count(*) filter (
      where upper(coalesce(payment.status, '')) in ('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH')
    )::integer as confirmed_payments,
    count(*) filter (where payment.lifecycle_applied_at is not null)::integer as lifecycle_payments
  from public.payments payment
  where coalesce(payment.lifecycle_enrollment_id, payment.enrollment_id) is not null
  group by coalesce(payment.lifecycle_enrollment_id, payment.enrollment_id)
),
cycle_evidence as (
  select
    cycle.enrollment_id,
    count(*) filter (
      where cycle.status is distinct from 'superseded'
        and cycle.superseded_by_cycle_id is null
    )::integer as visible_cycles,
    min(cycle.start_date) filter (
      where cycle.status is distinct from 'superseded'
        and cycle.superseded_by_cycle_id is null
    ) as first_cycle_start,
    max(cycle.end_date) filter (
      where cycle.status is distinct from 'superseded'
        and cycle.superseded_by_cycle_id is null
    ) as last_cycle_end,
    count(*) filter (
      where cycle.status is distinct from 'superseded'
        and cycle.superseded_by_cycle_id is null
        and exists (select 1 from public.workouts workout where workout.cycle_id = cycle.id)
    )::integer as cycles_with_workouts,
    count(*) filter (
      where cycle.status is distinct from 'superseded'
        and cycle.superseded_by_cycle_id is null
        and (
          exists (select 1 from public.prescription_bundles bundle where bundle.training_cycle_id = cycle.id)
          or exists (select 1 from public.ai_strength_plans strength where strength.training_cycle_id = cycle.id)
          or exists (select 1 from public.running_plans running where running.training_cycle_id = cycle.id)
          or exists (select 1 from public.nutrition_plans nutrition where nutrition.training_cycle_id = cycle.id)
          or exists (select 1 from public.cycle_feedback feedback where feedback.cycle_id = cycle.id)
          or exists (select 1 from public.ai_plan_versions version where version.cycle_id = cycle.id)
        )
    )::integer as cycles_with_other_history,
    count(*) filter (
      where cycle.status is distinct from 'superseded'
        and cycle.superseded_by_cycle_id is null
        and cycle.end_date > enrollment.end_date
    )::integer as cycles_after_contract,
    count(*) filter (
      where cycle.status is distinct from 'superseded'
        and cycle.superseded_by_cycle_id is null
        and enrollment.training_start_date is not null
        and cycle.start_date < enrollment.training_start_date
    )::integer as cycles_before_training_start
  from public.training_cycles cycle
  join public.enrollments enrollment on enrollment.id = cycle.enrollment_id
  group by cycle.enrollment_id
),
classified as (
  select
    enrollment.id,
    enrollment.student_id,
    enrollment.status,
    greatest(coalesce(plan.duration_days, plan.duration_weeks * 7, 1), 1)::integer as plan_days,
    greatest(coalesce(plan.cycle_duration_days, enrollment.cycle_duration_days, 42), 1)::integer as cycle_days,
    greatest(coalesce(enrollment.end_date - enrollment.start_date + 1, 0), 0)::integer as contract_days,
    coalesce(payment.confirmed_payments, 0)::integer as confirmed_payments,
    coalesce(payment.lifecycle_payments, 0)::integer as lifecycle_payments,
    coalesce(cycle.visible_cycles, 0)::integer as visible_cycles,
    cycle.first_cycle_start,
    cycle.last_cycle_end,
    coalesce(cycle.cycles_with_workouts, 0)::integer as cycles_with_workouts,
    coalesce(cycle.cycles_with_other_history, 0)::integer as cycles_with_other_history,
    coalesce(cycle.cycles_after_contract, 0)::integer as cycles_after_contract,
    coalesce(cycle.cycles_before_training_start, 0)::integer as cycles_before_training_start,
    case
      when coalesce(cycle.cycles_after_contract, 0) > 0 then 'cycle_outside_contract'
      when coalesce(cycle.cycles_before_training_start, 0) > 0 then 'cycle_before_training_start'
      when coalesce(cycle.visible_cycles, 0)
        > ceil(greatest(coalesce(enrollment.end_date - enrollment.start_date + 1, 0), 0)::numeric
          / greatest(coalesce(plan.cycle_duration_days, enrollment.cycle_duration_days, 42), 1))::integer + 1
        then 'cycle_count_exceeds_contract'
      when ceil(greatest(coalesce(enrollment.end_date - enrollment.start_date + 1, 0), 0)::numeric
          / greatest(coalesce(plan.duration_days, plan.duration_weeks * 7, 1), 1))::integer
        > greatest(1, coalesce(payment.confirmed_payments, 0), coalesce(payment.lifecycle_payments, 0) + 1)
        then 'contract_exceeds_payment_evidence'
      else null
    end as anomaly
  from public.enrollments enrollment
  join public.plans plan on plan.id = enrollment.plan_id
  left join payment_evidence payment on payment.enrollment_id = enrollment.id
  left join cycle_evidence cycle on cycle.enrollment_id = enrollment.id
  where coalesce(plan.plan_kind, 'standard') = 'standard'
    and enrollment.end_date is not null
    and enrollment.start_date is not null
)
select
  'candidate' as result_type,
  substr(md5(id::text), 1, 12) as enrollment_ref,
  substr(md5(student_id::text), 1, 12) as student_ref,
  status,
  anomaly,
  plan_days,
  cycle_days,
  contract_days,
  ceil(contract_days::numeric / plan_days)::integer as contract_plan_units,
  confirmed_payments,
  lifecycle_payments,
  visible_cycles,
  first_cycle_start,
  last_cycle_end,
  cycles_after_contract,
  cycles_before_training_start,
  cycles_with_workouts,
  cycles_with_other_history
from classified
where anomaly is not null
order by anomaly, contract_plan_units desc, visible_cycles desc, enrollment_ref;
