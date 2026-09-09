-- Read-only operational audit. References are pseudonymous, not anonymized.
begin transaction read only;

with scope as (
  select enrollment.*, coalesce(plan.duration_days, plan.duration_weeks * 7) plan_days
  from public.enrollments enrollment
  join public.companies company on company.id = enrollment.company_id
  left join public.plans plan on plan.id = enrollment.plan_id
  where company.slug = 'bn-performance-training'
    and enrollment.status in ('active', 'awaiting_training', 'awaiting_renewal')
), cycles as (
  select cycle.* from public.training_cycles cycle
  join scope on scope.id = cycle.enrollment_id
  where cycle.status <> 'superseded' and cycle.superseded_by_cycle_id is null
), pairs as (
  select a.enrollment_id, a.student_id,
    least(a.end_date, b.end_date) - greatest(a.start_date, b.start_date) + 1 overlap_days,
    a.end_date >= public.current_business_date()
      and b.end_date >= public.current_business_date() current_or_future
  from cycles a join cycles b on b.enrollment_id = a.enrollment_id and b.id > a.id
    and a.start_date <= b.end_date and b.start_date <= a.end_date
), affected as (
  select enrollment_id, count(*) overlap_pairs,
    count(*) filter (where current_or_future) current_future_pairs,
    count(*) filter (where overlap_days = 1) shared_boundary_pairs
  from pairs group by enrollment_id
), enrollment_summary as (
  select substr(md5(scope.id::text), 1, 12) enrollment_ref,
    scope.status, scope.start_date, scope.end_date, scope.payment_date, scope.plan_days,
    coalesce(affected.overlap_pairs, 0) overlap_pairs,
    coalesce(affected.current_future_pairs, 0) current_future_pairs,
    coalesce(affected.shared_boundary_pairs, 0) shared_boundary_pairs,
    (select count(*) from cycles where enrollment_id = scope.id) visible_cycles,
    (select max(end_date) from cycles where enrollment_id = scope.id) last_cycle_end,
    (select count(*) from public.payments payment
      where payment.company_id = scope.company_id
        and coalesce(payment.lifecycle_enrollment_id, payment.enrollment_id) = scope.id
        and payment.lifecycle_applied_at is not null) applied_payments
  from scope left join affected on affected.enrollment_id = scope.id
)
select jsonb_build_object(
  'business_date', public.current_business_date(),
  'enrollments', (select count(*) from scope),
  'students', (select count(distinct student_id) from scope),
  'visible_cycles', (select count(*) from cycles),
  'overlap_pairs', (select count(*) from pairs),
  'affected_students', (select count(distinct student_id) from pairs),
  'affected_enrollments', (select count(*) from affected),
  'historical_only_enrollments', (select count(*) from affected where current_future_pairs = 0),
  'current_future_overlap_enrollments', (select count(*) from affected where current_future_pairs > 0),
  'multiple_active_enrollments', (select count(*) from (
    select student_id from scope where status in ('active', 'awaiting_training')
    group by student_id having count(*) > 1
  ) duplicate_active),
  'affected', (select jsonb_agg(to_jsonb(summary) order by current_future_pairs desc, overlap_pairs desc, enrollment_ref)
    from enrollment_summary summary where overlap_pairs > 0),
  'financial_tail_requires_review', (select jsonb_agg(to_jsonb(summary) order by enrollment_ref)
    from enrollment_summary summary where end_date > last_cycle_end + 7)
) audit;

commit;
