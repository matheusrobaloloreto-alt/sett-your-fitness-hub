-- Read-only detailed audit for BN current/future cycle overlaps.
-- Output is pseudonymous by design: no student names, emails, phones or document IDs.
begin transaction read only;

with scope as (
  select
    e.*,
    substr(md5(e.student_id::text), 1, 12) as student_ref,
    substr(md5(e.id::text), 1, 12) as enrollment_ref,
    coalesce(p.duration_days, p.duration_weeks * 7) as plan_days,
    p.name as plan_name
  from public.enrollments e
  join public.companies c on c.id = e.company_id
  left join public.plans p on p.id = e.plan_id
  where c.slug = 'bn-performance-training'
    and e.status in ('active', 'awaiting_training', 'awaiting_renewal')
), visible_cycles as (
  select tc.*
  from public.training_cycles tc
  join scope s on s.id = tc.enrollment_id
  where tc.status <> 'superseded'
    and tc.superseded_by_cycle_id is null
), cycle_metrics as (
  select
    vc.*,
    coalesce(w.workout_count, 0) as workout_count,
    coalesce(w.exercise_rows, 0) as exercise_rows,
    w.workout_fingerprint,
    coalesce(usage.workout_logs, 0) as workout_logs,
    coalesce(usage.workout_sessions, 0) as workout_sessions,
    usage.first_usage_date,
    usage.last_usage_date,
    coalesce(audits.supersession_audit_count, 0) as supersession_audit_count,
    coalesce(audits.empty_supersession_audit_count, 0) as empty_supersession_audit_count
  from visible_cycles vc
  left join lateral (
    select
      count(*) as workout_count,
      sum(
        case
          when jsonb_typeof(coalesce(w.exercises, '[]'::jsonb)) = 'array'
            then jsonb_array_length(coalesce(w.exercises, '[]'::jsonb))
          else 0
        end
      )::int as exercise_rows,
      md5(jsonb_agg(
        jsonb_build_object(
          'title', coalesce(w.title, w.name),
          'day', w.day_of_week,
          'sort', w.sort_order,
          'exercises', w.exercises
        )
        order by coalesce(w.sort_order, 0), coalesce(w.day_of_week, 0), w.id
      )::text) as workout_fingerprint
    from public.workouts w
    where w.cycle_id = vc.id
      and w.superseded_at is null
  ) w on true
  left join lateral (
    select
      count(distinct wl.id) as workout_logs,
      count(distinct ws.id) as workout_sessions,
      min(coalesce(wl.session_date, ws.session_date)) as first_usage_date,
      max(coalesce(wl.session_date, ws.session_date)) as last_usage_date
    from public.workouts w
    left join public.workout_logs wl on wl.workout_id = w.id
    left join public.workout_sessions ws on ws.workout_id = w.id
    where w.cycle_id = vc.id
  ) usage on true
  left join lateral (
    select
      count(distinct tsa.id) as supersession_audit_count,
      count(distinct tesa.id) as empty_supersession_audit_count
    from public.training_cycle_supersession_audit tsa
    full join public.training_cycle_empty_supersession_audit tesa on false
    where tsa.superseded_cycle_id = vc.id
       or tsa.canonical_cycle_id = vc.id
       or tesa.redundant_cycle_id = vc.id
       or vc.id = any(tesa.covering_cycle_ids)
  ) audits on true
), current_pairs as (
  select
    a.enrollment_id,
    a.student_id,
    substr(md5(a.id::text), 1, 12) as a_cycle_ref,
    substr(md5(b.id::text), 1, 12) as b_cycle_ref,
    a.cycle_number as a_cycle_number,
    b.cycle_number as b_cycle_number,
    a.name as a_name,
    b.name as b_name,
    a.status as a_status,
    b.status as b_status,
    a.delivery_status as a_delivery_status,
    b.delivery_status as b_delivery_status,
    a.start_date as a_start_date,
    a.end_date as a_end_date,
    b.start_date as b_start_date,
    b.end_date as b_end_date,
    a.workout_count as a_workout_count,
    b.workout_count as b_workout_count,
    a.exercise_rows as a_exercise_rows,
    b.exercise_rows as b_exercise_rows,
    a.workout_logs as a_workout_logs,
    b.workout_logs as b_workout_logs,
    a.workout_sessions as a_workout_sessions,
    b.workout_sessions as b_workout_sessions,
    a.first_usage_date as a_first_usage_date,
    b.first_usage_date as b_first_usage_date,
    a.last_usage_date as a_last_usage_date,
    b.last_usage_date as b_last_usage_date,
    greatest(a.start_date, b.start_date) as overlap_start,
    least(a.end_date, b.end_date) as overlap_end,
    least(a.end_date, b.end_date) - greatest(a.start_date, b.start_date) + 1 as overlap_days,
    a.workout_fingerprint is not null and a.workout_fingerprint = b.workout_fingerprint as identical_workout_fingerprint
  from cycle_metrics a
  join cycle_metrics b
    on b.enrollment_id = a.enrollment_id
   and b.id > a.id
  where a.start_date <= b.end_date
    and b.start_date <= a.end_date
    and a.end_date >= public.current_business_date()
    and b.end_date >= public.current_business_date()
)
select jsonb_pretty(jsonb_agg(
  jsonb_build_object(
    'student_ref', s.student_ref,
    'enrollment_ref', s.enrollment_ref,
    'enrollment_status', s.status,
    'enrollment_start', s.start_date,
    'enrollment_end', s.end_date,
    'plan_name', s.plan_name,
    'plan_days', s.plan_days,
    'current_future_pairs', summary.current_future_pairs,
    'total_overlap_days', summary.total_overlap_days,
    'one_day_boundary_pairs', summary.one_day_boundary_pairs,
    'pairs_with_usage', summary.pairs_with_usage,
    'pairs', summary.pairs
  )
  order by s.student_ref
)) as audit
from scope s
join (
  select
    enrollment_id,
    count(*) as current_future_pairs,
    sum(overlap_days) as total_overlap_days,
    count(*) filter (where overlap_days = 1) as one_day_boundary_pairs,
    count(*) filter (
      where a_workout_logs + b_workout_logs + a_workout_sessions + b_workout_sessions > 0
    ) as pairs_with_usage,
    jsonb_agg(
      jsonb_build_object(
        'a_cycle_ref', a_cycle_ref,
        'a_cycle_number', a_cycle_number,
        'a_name', a_name,
        'a_status', a_status,
        'a_delivery_status', a_delivery_status,
        'a_start_date', a_start_date,
        'a_end_date', a_end_date,
        'a_workout_count', a_workout_count,
        'a_exercise_rows', a_exercise_rows,
        'a_workout_logs', a_workout_logs,
        'a_workout_sessions', a_workout_sessions,
        'a_usage_window', jsonb_build_object('first', a_first_usage_date, 'last', a_last_usage_date),
        'b_cycle_ref', b_cycle_ref,
        'b_cycle_number', b_cycle_number,
        'b_name', b_name,
        'b_status', b_status,
        'b_delivery_status', b_delivery_status,
        'b_start_date', b_start_date,
        'b_end_date', b_end_date,
        'b_workout_count', b_workout_count,
        'b_exercise_rows', b_exercise_rows,
        'b_workout_logs', b_workout_logs,
        'b_workout_sessions', b_workout_sessions,
        'b_usage_window', jsonb_build_object('first', b_first_usage_date, 'last', b_last_usage_date),
        'overlap_start', overlap_start,
        'overlap_end', overlap_end,
        'overlap_days', overlap_days,
        'one_day_boundary', overlap_days = 1,
        'identical_workout_fingerprint', identical_workout_fingerprint
      )
      order by overlap_start, a_cycle_number, b_cycle_number
    ) as pairs
  from current_pairs
  group by enrollment_id
) summary on summary.enrollment_id = s.id;

commit;
