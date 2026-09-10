begin;

-- updated_at is owned by the live BEFORE UPDATE trigger. The rollback restores
-- business fields and verifies the trigger timestamp instead of forging history.

set local lock_timeout = '8s';
set local statement_timeout = '180s';
select pg_advisory_xact_lock(hashtextextended('sett:bn-legacy-enrollment-terms:20260909',0));

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
  select count(*) into v_count
  from public.enrollment_legacy_term_repair_audit audit
  join public.enrollments enrollment on enrollment.id=audit.enrollment_id
  join public.students student on student.id=audit.student_id
  where audit.repair_key='bn_legacy_terms_20260909'
    and audit.state='applied'
    and audit.after_sha256=encode(extensions.digest((to_jsonb(enrollment)||jsonb_build_object('student',to_jsonb(student)))::text,'sha256'),'hex');
  if v_count<>12 then raise exception 'bn_legacy_term_rollback_afterimage_mismatch expected=12 actual=%',v_count; end if;

  if exists (
    select 1
    from public.enrollment_legacy_term_repair_audit audit
    where audit.repair_key='bn_legacy_terms_20260909'
      and audit.state='applied'
      and (
        exists (
          select 1 from public.training_cycles cycle
          where cycle.enrollment_id=audit.enrollment_id
            and greatest(
              cycle.created_at,
              coalesce(cycle.superseded_at,'-infinity'::timestamptz),
              coalesce(cycle.prescribed_offline_at,'-infinity'::timestamptz)
            )>audit.applied_at
        )
        or exists (
          select 1 from public.training_cycles cycle
          join public.workouts workout on workout.cycle_id=cycle.id
          where cycle.enrollment_id=audit.enrollment_id
            and greatest(workout.created_at,workout.updated_at)>audit.applied_at
        )
        or exists (
          select 1 from public.training_cycles cycle
          join public.workouts workout on workout.cycle_id=cycle.id
          join public.workout_logs log on log.workout_id=workout.id
          where cycle.enrollment_id=audit.enrollment_id
            and greatest(log.created_at,log.updated_at,coalesce(log.completed_at,log.created_at))>audit.applied_at
        )
        or exists (
          select 1 from public.training_cycles cycle
          join public.workouts workout on workout.cycle_id=cycle.id
          join public.workout_sessions session on session.workout_id=workout.id
          where cycle.enrollment_id=audit.enrollment_id
            and greatest(
              coalesce(session.created_at,'-infinity'::timestamptz),
              coalesce(session.started_at,'-infinity'::timestamptz),
              coalesce(session.completed_at,'-infinity'::timestamptz)
            )>audit.applied_at
        )
      )
  ) then
    raise exception 'bn_legacy_term_rollback_post_repair_dependency_activity';
  end if;
end
$guard$;

update public.enrollments enrollment
set start_date=(audit.before_enrollment->>'start_date')::date,
    end_date=(audit.before_enrollment->>'end_date')::date,
    payment_date=(audit.before_enrollment->>'payment_date')::date,
    status=audit.before_enrollment->>'status'
from public.enrollment_legacy_term_repair_audit audit
join public.students student on student.id=audit.student_id
where audit.repair_key='bn_legacy_terms_20260909'
  and audit.state='applied'
  and enrollment.id=audit.enrollment_id
  and audit.after_sha256=encode(extensions.digest((to_jsonb(enrollment)||jsonb_build_object('student',to_jsonb(student)))::text,'sha256'),'hex');

do $enrollment_count$
begin
  if (select count(*) from public.enrollment_legacy_term_repair_audit audit
      join public.enrollments enrollment on enrollment.id=audit.enrollment_id
      where audit.repair_key='bn_legacy_terms_20260909'
        and audit.state='applied'
        and enrollment.start_date=(audit.before_enrollment->>'start_date')::date
        and enrollment.end_date=(audit.before_enrollment->>'end_date')::date
        and enrollment.payment_date is not distinct from (audit.before_enrollment->>'payment_date')::date
        and enrollment.status=audit.before_enrollment->>'status') <> 12 then
    raise exception 'bn_legacy_term_rollback_enrollment_count_mismatch';
  end if;
end
$enrollment_count$;

update public.students student
set status=audit.before_student->>'status'
from public.enrollment_legacy_term_repair_audit audit
where audit.repair_key='bn_legacy_terms_20260909'
  and audit.state='applied'
  and student.id=audit.student_id
  and audit.after_student->>'status' is distinct from audit.before_student->>'status';

do $postflight$
declare v_count integer;
begin
  select count(*) into v_count
  from public.enrollment_legacy_term_repair_audit audit
  join public.enrollments enrollment on enrollment.id=audit.enrollment_id
  join public.students student on student.id=audit.student_id
  where audit.repair_key='bn_legacy_terms_20260909'
    and audit.state='applied'
    and jsonb_strip_nulls(to_jsonb(enrollment)-'updated_at')
        is not distinct from jsonb_strip_nulls(audit.before_enrollment-'updated_at')
    and jsonb_strip_nulls(to_jsonb(student)-'updated_at')
        is not distinct from jsonb_strip_nulls(audit.before_student-'updated_at');
  if v_count<>12 then raise exception 'bn_legacy_term_rollback_beforeimage_mismatch expected=12 actual=%',v_count; end if;

  if exists (
    select 1
    from public.enrollment_legacy_term_repair_audit audit
    join public.enrollments enrollment on enrollment.id=audit.enrollment_id
    where audit.repair_key='bn_legacy_terms_20260909'
      and audit.state='applied'
      and enrollment.updated_at is distinct from transaction_timestamp()
  ) then
    raise exception 'bn_legacy_term_rollback_enrollment_updated_at_trigger_mismatch';
  end if;

  if exists (
    select 1
    from public.enrollment_legacy_term_repair_audit audit
    join public.students student on student.id=audit.student_id
    where audit.repair_key='bn_legacy_terms_20260909'
      and audit.state='applied'
      and audit.after_student->>'status' is distinct from audit.before_student->>'status'
      and student.updated_at is distinct from transaction_timestamp()
  ) then
    raise exception 'bn_legacy_term_rollback_student_updated_at_trigger_mismatch';
  end if;
end
$postflight$;

update public.enrollment_legacy_term_repair_audit
set state='rolled_back',rolled_back_at=now()
where repair_key='bn_legacy_terms_20260909' and state='applied';

commit;
