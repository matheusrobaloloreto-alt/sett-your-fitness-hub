begin;
set local lock_timeout='8s';
set local statement_timeout='180s';
select pg_advisory_xact_lock(hashtextextended('sett:bn-remaining-legacy-terms:20260909',0));
lock table public.students in share row exclusive mode;
lock table public.enrollments in share row exclusive mode;
lock table public.enrollment_legacy_term_repair_audit in share row exclusive mode;

do $guard$
declare v_count integer;
begin
 select count(*) into v_count from public.enrollment_legacy_term_repair_audit a
 join public.enrollments e on e.id=a.enrollment_id join public.students s on s.id=a.student_id
 where a.repair_key='bn_remaining_legacy_terms_20260909' and a.state='applied'
 and a.after_sha256=encode(extensions.digest((to_jsonb(e)||jsonb_build_object('student',to_jsonb(s)))::text,'sha256'),'hex');
 if v_count<>6 then raise exception 'bn_remaining_term_rollback_afterimage_mismatch expected=6 actual=%',v_count; end if;
end
$guard$;

update public.enrollments e
set plan_id=(a.before_enrollment->>'plan_id')::uuid,start_date=(a.before_enrollment->>'start_date')::date,
 end_date=(a.before_enrollment->>'end_date')::date,payment_date=(a.before_enrollment->>'payment_date')::date,
 status=a.before_enrollment->>'status',updated_at=(a.before_enrollment->>'updated_at')::timestamptz
from public.enrollment_legacy_term_repair_audit a join public.students s on s.id=a.student_id
where a.repair_key='bn_remaining_legacy_terms_20260909' and a.state='applied' and e.id=a.enrollment_id
and a.after_sha256=encode(extensions.digest((to_jsonb(e)||jsonb_build_object('student',to_jsonb(s)))::text,'sha256'),'hex');

do $postflight$
declare v_count integer;
begin
 select count(*) into v_count from public.enrollment_legacy_term_repair_audit a
 join public.enrollments e on e.id=a.enrollment_id join public.students s on s.id=a.student_id
 where a.repair_key='bn_remaining_legacy_terms_20260909' and a.state='applied'
 and a.before_sha256=encode(extensions.digest((to_jsonb(e)||jsonb_build_object('student',to_jsonb(s)))::text,'sha256'),'hex');
 if v_count<>6 then raise exception 'bn_remaining_term_rollback_beforeimage_mismatch expected=6 actual=%',v_count; end if;
end
$postflight$;

update public.enrollment_legacy_term_repair_audit set state='rolled_back',rolled_back_at=now()
where repair_key='bn_remaining_legacy_terms_20260909' and state='applied';
commit;
