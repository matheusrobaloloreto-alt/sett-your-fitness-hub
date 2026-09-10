begin;

set local lock_timeout = '8s';
set local statement_timeout = '180s';

select pg_advisory_xact_lock(hashtextextended('sett:bn-legacy-enrollment-terms:20260909', 0));

create table if not exists public.enrollment_legacy_term_repair_audit (
  id uuid primary key default gen_random_uuid(),
  repair_key text not null,
  company_id uuid not null,
  student_id uuid not null,
  enrollment_id uuid not null,
  action text not null check (action in ('normalize_term', 'replace_term')),
  before_enrollment jsonb not null,
  before_student jsonb not null,
  before_sha256 text not null,
  after_enrollment jsonb,
  after_student jsonb,
  after_sha256 text,
  state text not null default 'applied' check (state in ('applied', 'rolled_back')),
  applied_at timestamptz not null default now(),
  rolled_back_at timestamptz,
  unique (repair_key, enrollment_id)
);

alter table public.enrollment_legacy_term_repair_audit enable row level security;
revoke all on table public.enrollment_legacy_term_repair_audit from public, anon, authenticated;
grant select, insert, update on table public.enrollment_legacy_term_repair_audit to service_role;

lock table public.students in share row exclusive mode;
lock table public.enrollments in share row exclusive mode;
lock table public.training_cycles in share mode;
lock table public.workouts in share mode;
lock table public.workout_logs in share mode;
lock table public.workout_sessions in share mode;

create temporary table pg_temp.bn_term_targets on commit drop as
select * from (values
  ('b7004e616eca','normalize_term','BN PRO Semestral',date '2026-03-16',date '2027-02-15',date '2026-03-16',date '2026-08-30',date '2026-03-16','awaiting_renewal'),
  ('df14c3d504f6','normalize_term','BN PRO Anual',date '2026-03-07',date '2028-01-08',date '2026-03-07',date '2027-02-05',date '2026-03-06','active'),
  ('f79808183ac6','replace_term','BN PRO Semestral',date '2026-06-02',date '2027-02-08',date '2026-08-04',date '2027-01-18',date '2026-08-04','active'),
  ('2d93f08d4f16','normalize_term','BN PRO Anual',date '2026-03-09',date '2028-01-10',date '2026-03-09',date '2027-02-07',date '2026-03-08','active'),
  ('078e2d2b9409','normalize_term','BN PRO Anual',date '2026-01-12',date '2026-12-14',date '2026-01-12',date '2026-12-13',date '2026-01-12','active'),
  ('2370076329b4','replace_term','BN PRO Semestral',date '2026-03-03',date '2027-08-17',date '2026-09-02',date '2027-02-16',date '2026-09-02','active'),
  ('0f13e58e755f','normalize_term','BN PRO Semestral',date '2026-06-15',date '2027-05-16',date '2026-06-15',date '2026-11-29',date '2026-06-15','active'),
  ('5d281f90c927','normalize_term','BN PRO Semestral',date '2026-04-21',date '2027-03-22',date '2026-04-21',date '2026-10-05',date '2026-04-21','active'),
  ('5ae9920ce3fa','normalize_term','BN PRO Semestral',date '2026-03-30',date '2027-03-01',date '2026-03-30',date '2026-09-13',date '2026-03-30','active'),
  ('241dfb3b3c96','normalize_term','BN PRO Semestral',date '2026-03-20',date '2027-02-19',date '2026-03-20',date '2026-09-03',date '2026-03-20','awaiting_renewal'),
  ('c6c818177b56','normalize_term','BN PRO Anual',date '2025-12-09',date '2026-11-10',date '2025-12-09',date '2026-11-09',date '2025-12-09','active'),
  ('14b9857eb992','normalize_term','BN PRO Anual',date '2025-07-11',date '2026-06-12',date '2025-07-11',date '2026-06-11',date '2025-07-11','awaiting_renewal')
) as target(
  enrollment_ref, action, expected_plan_name, expected_start_date, expected_end_date,
  new_start_date, new_end_date, new_payment_date, new_status
);

create temporary table pg_temp.bn_term_candidates on commit drop as
select
  target.*,
  enrollment.id enrollment_id,
  enrollment.company_id,
  enrollment.student_id,
  enrollment.status old_status,
  student.status old_student_status,
  to_jsonb(enrollment) before_enrollment,
  to_jsonb(student) before_student,
  encode(extensions.digest((to_jsonb(enrollment) || jsonb_build_object('student',to_jsonb(student)))::text,'sha256'),'hex') before_sha256
from pg_temp.bn_term_targets target
join public.enrollments enrollment on substr(md5(enrollment.id::text),1,12)=target.enrollment_ref
join public.companies company on company.id=enrollment.company_id and company.slug='bn-performance-training'
join public.students student on student.id=enrollment.student_id and student.company_id=enrollment.company_id
join public.plans plan on plan.id=enrollment.plan_id and plan.name=target.expected_plan_name
where enrollment.start_date=target.expected_start_date
  and enrollment.end_date=target.expected_end_date
  and enrollment.status in ('active','awaiting_training','awaiting_renewal')
  and coalesce(plan.duration_days,plan.duration_weeks*7)=target.new_end_date-target.new_start_date+1;

do $preflight$
declare v_count integer;
begin
  select count(*) into v_count from pg_temp.bn_term_candidates;
  if v_count <> 12 then
    raise exception 'bn_legacy_term_target_count_mismatch expected=12 actual=%',v_count;
  end if;
  if exists (select 1 from pg_temp.bn_term_candidates group by enrollment_ref having count(*)<>1) then
    raise exception 'bn_legacy_term_target_not_unique';
  end if;
  if exists (select 1 from public.enrollment_legacy_term_repair_audit where repair_key='bn_legacy_terms_20260909') then
    raise exception 'bn_legacy_term_repair_already_applied';
  end if;
end
$preflight$;

create temporary table pg_temp.bn_term_dependency_baseline on commit drop as
with target_enrollments as (select enrollment_id from pg_temp.bn_term_candidates),
cycles as (select cycle.* from public.training_cycles cycle join target_enrollments target on target.enrollment_id=cycle.enrollment_id),
workout_rows as (select workout.* from public.workouts workout join cycles cycle on cycle.id=workout.cycle_id),
log_rows as (select log.* from public.workout_logs log join workout_rows workout on workout.id=log.workout_id),
session_rows as (select session.* from public.workout_sessions session join workout_rows workout on workout.id=session.workout_id)
select
  (select count(*) from cycles) cycles_count,
  (select md5(string_agg(to_jsonb(cycles)::text,'|' order by id)) from cycles) cycles_md5,
  (select count(*) from workout_rows) workouts_count,
  (select md5(string_agg(to_jsonb(workout_rows)::text,'|' order by id)) from workout_rows) workouts_md5,
  (select count(*) from log_rows) logs_count,
  (select md5(string_agg(to_jsonb(log_rows)::text,'|' order by id)) from log_rows) logs_md5,
  (select count(*) from session_rows) sessions_count,
  (select md5(string_agg(to_jsonb(session_rows)::text,'|' order by id)) from session_rows) sessions_md5;

insert into public.enrollment_legacy_term_repair_audit(
  repair_key,company_id,student_id,enrollment_id,action,before_enrollment,before_student,before_sha256
)
select 'bn_legacy_terms_20260909',company_id,student_id,enrollment_id,action,before_enrollment,before_student,before_sha256
from pg_temp.bn_term_candidates;

update public.enrollments enrollment
set start_date=candidate.new_start_date,
    end_date=candidate.new_end_date,
    payment_date=candidate.new_payment_date,
    status=candidate.new_status,
    updated_at=now()
from pg_temp.bn_term_candidates candidate
where enrollment.id=candidate.enrollment_id
  and enrollment.start_date=candidate.expected_start_date
  and enrollment.end_date=candidate.expected_end_date;

update public.students student
set status=candidate.new_status,
    updated_at=now()
from pg_temp.bn_term_candidates candidate
where student.id=candidate.student_id
  and candidate.new_status='awaiting_renewal';

update public.enrollment_legacy_term_repair_audit audit
set after_enrollment=to_jsonb(enrollment),
    after_student=to_jsonb(student),
    after_sha256=encode(extensions.digest((to_jsonb(enrollment)||jsonb_build_object('student',to_jsonb(student)))::text,'sha256'),'hex')
from public.enrollments enrollment
join public.students student on student.id=enrollment.student_id
where audit.repair_key='bn_legacy_terms_20260909'
  and audit.enrollment_id=enrollment.id;

do $postflight$
declare
  v_changed integer;
  v_baseline record;
  v_after record;
begin
  select count(*) into v_changed from public.enrollment_legacy_term_repair_audit
  where repair_key='bn_legacy_terms_20260909' and after_sha256 is distinct from before_sha256;
  if v_changed<>12 then raise exception 'bn_legacy_term_changed_count_mismatch expected=12 actual=%',v_changed; end if;

  if exists (
    select 1 from pg_temp.bn_term_candidates candidate
    join public.enrollments enrollment on enrollment.id=candidate.enrollment_id
    where enrollment.start_date is distinct from candidate.new_start_date
       or enrollment.end_date is distinct from candidate.new_end_date
       or enrollment.payment_date is distinct from candidate.new_payment_date
       or enrollment.status is distinct from candidate.new_status
  ) then raise exception 'bn_legacy_term_after_state_mismatch'; end if;

  if exists (
    select 1 from pg_temp.bn_term_candidates candidate
    join public.students student on student.id=candidate.student_id
    where student.status is distinct from candidate.new_status
  ) then raise exception 'bn_legacy_term_student_status_mismatch'; end if;

  select * into v_baseline from pg_temp.bn_term_dependency_baseline;
  with target_enrollments as (select enrollment_id from pg_temp.bn_term_candidates),
  cycles as (select cycle.* from public.training_cycles cycle join target_enrollments target on target.enrollment_id=cycle.enrollment_id),
  workout_rows as (select workout.* from public.workouts workout join cycles cycle on cycle.id=workout.cycle_id),
  log_rows as (select log.* from public.workout_logs log join workout_rows workout on workout.id=log.workout_id),
  session_rows as (select session.* from public.workout_sessions session join workout_rows workout on workout.id=session.workout_id)
  select
    (select count(*) from cycles) cycles_count,
    (select md5(string_agg(to_jsonb(cycles)::text,'|' order by id)) from cycles) cycles_md5,
    (select count(*) from workout_rows) workouts_count,
    (select md5(string_agg(to_jsonb(workout_rows)::text,'|' order by id)) from workout_rows) workouts_md5,
    (select count(*) from log_rows) logs_count,
    (select md5(string_agg(to_jsonb(log_rows)::text,'|' order by id)) from log_rows) logs_md5,
    (select count(*) from session_rows) sessions_count,
    (select md5(string_agg(to_jsonb(session_rows)::text,'|' order by id)) from session_rows) sessions_md5
  into v_after;
  if to_jsonb(v_after) is distinct from to_jsonb(v_baseline) then
    raise exception 'bn_legacy_term_dependencies_changed';
  end if;
end
$postflight$;

commit;
