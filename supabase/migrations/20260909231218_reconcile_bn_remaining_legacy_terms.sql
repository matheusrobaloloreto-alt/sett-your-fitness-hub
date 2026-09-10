begin;

set local lock_timeout='8s';
set local statement_timeout='180s';
select pg_advisory_xact_lock(hashtextextended('sett:bn-remaining-legacy-terms:20260909',0));

lock table public.students in share row exclusive mode;
lock table public.enrollments in share row exclusive mode;
lock table public.plans in share mode;
lock table public.training_cycles in share mode;
lock table public.workouts in share mode;
lock table public.workout_logs in share mode;
lock table public.workout_sessions in share mode;

create temporary table pg_temp.bn_remaining_targets on commit drop as
select * from (values
  ('711a247b40da','replace_term','BN PRO Semestral','BN PRO Anual',date '2025-05-12',date '2027-10-11',date '2026-05-25',date '2027-04-25',date '2026-05-25','active'),
  ('2dbfaac06276','normalize_term','BN PRO Semestral','BN PRO Semestral',date '2026-03-14',date '2026-08-29',date '2026-03-14',date '2026-08-28',null::date,'awaiting_renewal'),
  ('711ab66e14f5','normalize_term','BN PRO Semestral','BN PRO Semestral',date '2026-05-21',date '2027-05-05',date '2026-05-21',date '2026-11-04',date '2026-05-21','active'),
  ('8dc8a2580782','normalize_term','BN PRO Semestral','BN PRO Semestral',date '2026-07-14',date '2027-01-12',date '2026-07-14',date '2026-12-28',date '2026-07-14','active'),
  ('5f9de190f3c7','replace_term','BN PRO Semestral','BN PRO Semestral',date '2026-03-06',date '2027-07-23',date '2026-09-01',date '2027-02-15',date '2026-09-01','active'),
  ('572a44e1703c','normalize_term','BN PRO Semestral','BN PRO Semestral',date '2026-04-07',date '2027-03-21',date '2026-04-07',date '2026-09-21',date '2026-04-04','active')
) as target(enrollment_ref,action,expected_plan_name,new_plan_name,expected_start_date,expected_end_date,new_start_date,new_end_date,new_payment_date,new_status);

create temporary table pg_temp.bn_remaining_candidates on commit drop as
select target.*,enrollment.id enrollment_id,enrollment.company_id,enrollment.student_id,new_plan.id new_plan_id,
       to_jsonb(enrollment) before_enrollment,to_jsonb(student) before_student,
       encode(extensions.digest((to_jsonb(enrollment)||jsonb_build_object('student',to_jsonb(student)))::text,'sha256'),'hex') before_sha256
from pg_temp.bn_remaining_targets target
join public.enrollments enrollment on substr(md5(enrollment.id::text),1,12)=target.enrollment_ref
join public.companies company on company.id=enrollment.company_id and company.slug='bn-performance-training'
join public.students student on student.id=enrollment.student_id and student.company_id=enrollment.company_id
join public.plans old_plan on old_plan.id=enrollment.plan_id and old_plan.name=target.expected_plan_name
join public.plans new_plan on new_plan.company_id=enrollment.company_id and new_plan.name=target.new_plan_name
where enrollment.start_date=target.expected_start_date and enrollment.end_date=target.expected_end_date
  and enrollment.status in ('active','awaiting_training','awaiting_renewal')
  and coalesce(new_plan.duration_days,new_plan.duration_weeks*7)=target.new_end_date-target.new_start_date+1;

do $preflight$
declare v_count integer;
begin
 select count(*) into v_count from pg_temp.bn_remaining_candidates;
 if v_count<>6 then raise exception 'bn_remaining_term_target_count_mismatch expected=6 actual=%',v_count; end if;
 if exists(select 1 from pg_temp.bn_remaining_candidates group by enrollment_ref having count(*)<>1) then raise exception 'bn_remaining_term_target_not_unique'; end if;
 if exists(select 1 from public.enrollment_legacy_term_repair_audit where repair_key='bn_remaining_legacy_terms_20260909') then raise exception 'bn_remaining_term_already_applied'; end if;
end
$preflight$;

create temporary table pg_temp.bn_remaining_dependency_baseline on commit drop as
with target_enrollments as (select enrollment_id from pg_temp.bn_remaining_candidates),
cycles as (select c.* from public.training_cycles c join target_enrollments t on t.enrollment_id=c.enrollment_id),
workout_rows as (select w.* from public.workouts w join cycles c on c.id=w.cycle_id),
log_rows as (select l.* from public.workout_logs l join workout_rows w on w.id=l.workout_id),
session_rows as (select s.* from public.workout_sessions s join workout_rows w on w.id=s.workout_id)
select
 (select count(*) from cycles) cycles_count,(select md5(string_agg(to_jsonb(cycles)::text,'|' order by id)) from cycles) cycles_md5,
 (select count(*) from workout_rows) workouts_count,(select md5(string_agg(to_jsonb(workout_rows)::text,'|' order by id)) from workout_rows) workouts_md5,
 (select count(*) from log_rows) logs_count,(select md5(string_agg(to_jsonb(log_rows)::text,'|' order by id)) from log_rows) logs_md5,
 (select count(*) from session_rows) sessions_count,(select md5(string_agg(to_jsonb(session_rows)::text,'|' order by id)) from session_rows) sessions_md5;

insert into public.enrollment_legacy_term_repair_audit(repair_key,company_id,student_id,enrollment_id,action,before_enrollment,before_student,before_sha256)
select 'bn_remaining_legacy_terms_20260909',company_id,student_id,enrollment_id,action,before_enrollment,before_student,before_sha256
from pg_temp.bn_remaining_candidates;

update public.enrollments enrollment
set plan_id=candidate.new_plan_id,start_date=candidate.new_start_date,end_date=candidate.new_end_date,
    payment_date=coalesce(candidate.new_payment_date,enrollment.payment_date),status=candidate.new_status,updated_at=now()
from pg_temp.bn_remaining_candidates candidate
where enrollment.id=candidate.enrollment_id
  and enrollment.start_date=candidate.expected_start_date and enrollment.end_date=candidate.expected_end_date;

update public.enrollment_legacy_term_repair_audit audit
set after_enrollment=to_jsonb(enrollment),after_student=to_jsonb(student),
    after_sha256=encode(extensions.digest((to_jsonb(enrollment)||jsonb_build_object('student',to_jsonb(student)))::text,'sha256'),'hex')
from public.enrollments enrollment join public.students student on student.id=enrollment.student_id
where audit.repair_key='bn_remaining_legacy_terms_20260909' and audit.enrollment_id=enrollment.id;

do $postflight$
declare v_changed integer; v_before record; v_after record;
begin
 select count(*) into v_changed from public.enrollment_legacy_term_repair_audit where repair_key='bn_remaining_legacy_terms_20260909' and after_sha256 is distinct from before_sha256;
 if v_changed<>6 then raise exception 'bn_remaining_term_changed_count_mismatch expected=6 actual=%',v_changed; end if;
 if exists(select 1 from pg_temp.bn_remaining_candidates c join public.enrollments e on e.id=c.enrollment_id join public.students s on s.id=c.student_id
   where e.plan_id is distinct from c.new_plan_id or e.start_date is distinct from c.new_start_date or e.end_date is distinct from c.new_end_date
      or e.payment_date is distinct from coalesce(c.new_payment_date,(c.before_enrollment->>'payment_date')::date)
      or e.status is distinct from c.new_status or s.status is distinct from c.new_status)
 then raise exception 'bn_remaining_term_after_state_mismatch'; end if;

 select * into v_before from pg_temp.bn_remaining_dependency_baseline;
 with target_enrollments as (select enrollment_id from pg_temp.bn_remaining_candidates),
 cycles as (select c.* from public.training_cycles c join target_enrollments t on t.enrollment_id=c.enrollment_id),
 workout_rows as (select w.* from public.workouts w join cycles c on c.id=w.cycle_id),
 log_rows as (select l.* from public.workout_logs l join workout_rows w on w.id=l.workout_id),
 session_rows as (select s.* from public.workout_sessions s join workout_rows w on w.id=s.workout_id)
 select
  (select count(*) from cycles) cycles_count,(select md5(string_agg(to_jsonb(cycles)::text,'|' order by id)) from cycles) cycles_md5,
  (select count(*) from workout_rows) workouts_count,(select md5(string_agg(to_jsonb(workout_rows)::text,'|' order by id)) from workout_rows) workouts_md5,
  (select count(*) from log_rows) logs_count,(select md5(string_agg(to_jsonb(log_rows)::text,'|' order by id)) from log_rows) logs_md5,
  (select count(*) from session_rows) sessions_count,(select md5(string_agg(to_jsonb(session_rows)::text,'|' order by id)) from session_rows) sessions_md5
 into v_after;
 if to_jsonb(v_after) is distinct from to_jsonb(v_before) then raise exception 'bn_remaining_term_dependencies_changed'; end if;
end
$postflight$;

commit;
