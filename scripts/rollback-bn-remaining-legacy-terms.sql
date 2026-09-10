begin;

-- updated_at is owned by the live BEFORE UPDATE trigger. The rollback restores
-- business fields and verifies the trigger timestamp instead of forging history.
set local lock_timeout='8s';
set local statement_timeout='180s';
select pg_advisory_xact_lock(hashtextextended('sett:bn-remaining-legacy-terms:20260909',0));
lock table public.students in share row exclusive mode;
lock table public.enrollments in share row exclusive mode;
lock table public.enrollment_legacy_term_repair_audit in share row exclusive mode;
lock table public.training_cycles in share mode;
lock table public.workouts in share mode;
lock table public.workout_logs in share mode;
lock table public.workout_sessions in share mode;

do $guard$
declare v_count integer;
begin
 select count(*) into v_count from public.enrollment_legacy_term_repair_audit a
 join public.enrollments e on e.id=a.enrollment_id join public.students s on s.id=a.student_id
 where a.repair_key='bn_remaining_legacy_terms_20260909' and a.state='applied'
 and a.after_sha256=encode(extensions.digest((to_jsonb(e)||jsonb_build_object('student',to_jsonb(s)))::text,'sha256'),'hex');
 if v_count<>6 then raise exception 'bn_remaining_term_rollback_afterimage_mismatch expected=6 actual=%',v_count; end if;

 if exists(
   select 1 from public.enrollment_legacy_term_repair_audit a
   where a.repair_key='bn_remaining_legacy_terms_20260909' and a.state='applied'
     and (
       exists(
         select 1 from public.training_cycles c
         where c.enrollment_id=a.enrollment_id
           and greatest(
             c.created_at,
             coalesce(c.superseded_at,'-infinity'::timestamptz),
             coalesce(c.prescribed_offline_at,'-infinity'::timestamptz)
           )>a.applied_at
       )
       or exists(
         select 1 from public.training_cycles c join public.workouts w on w.cycle_id=c.id
         where c.enrollment_id=a.enrollment_id and greatest(w.created_at,w.updated_at)>a.applied_at
       )
       or exists(
         select 1 from public.training_cycles c join public.workouts w on w.cycle_id=c.id
         join public.workout_logs l on l.workout_id=w.id
         where c.enrollment_id=a.enrollment_id
           and greatest(l.created_at,l.updated_at,coalesce(l.completed_at,l.created_at))>a.applied_at
       )
       or exists(
         select 1 from public.training_cycles c join public.workouts w on w.cycle_id=c.id
         join public.workout_sessions s on s.workout_id=w.id
         where c.enrollment_id=a.enrollment_id
           and greatest(
             coalesce(s.created_at,'-infinity'::timestamptz),
             coalesce(s.started_at,'-infinity'::timestamptz),
             coalesce(s.completed_at,'-infinity'::timestamptz)
           )>a.applied_at
       )
     )
 ) then raise exception 'bn_remaining_term_rollback_post_repair_dependency_activity'; end if;
end
$guard$;

update public.enrollments e
set plan_id=(a.before_enrollment->>'plan_id')::uuid,start_date=(a.before_enrollment->>'start_date')::date,
 end_date=(a.before_enrollment->>'end_date')::date,payment_date=(a.before_enrollment->>'payment_date')::date,
 status=a.before_enrollment->>'status'
from public.enrollment_legacy_term_repair_audit a join public.students s on s.id=a.student_id
where a.repair_key='bn_remaining_legacy_terms_20260909' and a.state='applied' and e.id=a.enrollment_id
and a.after_sha256=encode(extensions.digest((to_jsonb(e)||jsonb_build_object('student',to_jsonb(s)))::text,'sha256'),'hex');

do $postflight$
declare v_count integer;
begin
 select count(*) into v_count from public.enrollment_legacy_term_repair_audit a
 join public.enrollments e on e.id=a.enrollment_id join public.students s on s.id=a.student_id
 where a.repair_key='bn_remaining_legacy_terms_20260909' and a.state='applied'
 and jsonb_strip_nulls(to_jsonb(e)-'updated_at') is not distinct from jsonb_strip_nulls(a.before_enrollment-'updated_at')
 and jsonb_strip_nulls(to_jsonb(s)-'updated_at') is not distinct from jsonb_strip_nulls(a.before_student-'updated_at');
 if v_count<>6 then raise exception 'bn_remaining_term_rollback_beforeimage_mismatch expected=6 actual=%',v_count; end if;

 if exists(
   select 1 from public.enrollment_legacy_term_repair_audit a
   join public.enrollments e on e.id=a.enrollment_id
   where a.repair_key='bn_remaining_legacy_terms_20260909' and a.state='applied'
     and e.updated_at is distinct from transaction_timestamp()
 ) then raise exception 'bn_remaining_term_rollback_enrollment_updated_at_trigger_mismatch'; end if;
end
$postflight$;

update public.enrollment_legacy_term_repair_audit set state='rolled_back',rolled_back_at=now()
where repair_key='bn_remaining_legacy_terms_20260909' and state='applied';
commit;
