begin;

set local lock_timeout = '8s';
set local statement_timeout = '180s';
select pg_advisory_xact_lock(hashtextextended('sett:bn-legacy-enrollment-terms:20260909',0));

lock table public.students in share row exclusive mode;
lock table public.enrollments in share row exclusive mode;
lock table public.enrollment_legacy_term_repair_audit in share row exclusive mode;

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
end
$guard$;

update public.enrollments enrollment
set start_date=(audit.before_enrollment->>'start_date')::date,
    end_date=(audit.before_enrollment->>'end_date')::date,
    payment_date=(audit.before_enrollment->>'payment_date')::date,
    status=audit.before_enrollment->>'status',
    updated_at=(audit.before_enrollment->>'updated_at')::timestamptz
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
set status=audit.before_student->>'status',
    sales_stage=audit.before_student->>'sales_stage',
    updated_at=(audit.before_student->>'updated_at')::timestamptz
from public.enrollment_legacy_term_repair_audit audit
where audit.repair_key='bn_legacy_terms_20260909' and audit.state='applied' and student.id=audit.student_id;

do $postflight$
declare v_count integer;
begin
  select count(*) into v_count
  from public.enrollment_legacy_term_repair_audit audit
  join public.enrollments enrollment on enrollment.id=audit.enrollment_id
  join public.students student on student.id=audit.student_id
  where audit.repair_key='bn_legacy_terms_20260909'
    and audit.state='applied'
    and audit.before_sha256=encode(extensions.digest((to_jsonb(enrollment)||jsonb_build_object('student',to_jsonb(student)))::text,'sha256'),'hex');
  if v_count<>12 then raise exception 'bn_legacy_term_rollback_beforeimage_mismatch expected=12 actual=%',v_count; end if;
end
$postflight$;

update public.enrollment_legacy_term_repair_audit
set state='rolled_back',rolled_back_at=now()
where repair_key='bn_legacy_terms_20260909' and state='applied';

commit;
