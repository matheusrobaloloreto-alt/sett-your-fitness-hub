begin;

-- updated_at is owned by the live BEFORE UPDATE trigger. The rollback restores
-- business fields and verifies the trigger timestamp instead of forging history.
set local lock_timeout='8s';
set local statement_timeout='180s';
select pg_advisory_xact_lock(hashtextextended('sett:bn-remaining-legacy-terms:20260909',0));
lock table public.students in share row exclusive mode;
lock table public.enrollments in share row exclusive mode;
lock table public.enrollment_legacy_term_repair_audit in share row exclusive mode;
lock table public.training_cycles in share row exclusive mode;
lock table public.workouts in share row exclusive mode;
lock table public.workout_exercises in share row exclusive mode;
lock table public.workout_logs in share row exclusive mode;
lock table public.workout_sessions in share row exclusive mode;
lock table public.cycle_feedback in share row exclusive mode;
lock table public.ai_plan_versions in share row exclusive mode;
lock table public.ai_strength_plans in share row exclusive mode;
lock table public.running_plans in share row exclusive mode;
lock table public.nutrition_plans in share row exclusive mode;
lock table public.prescription_bundles in share row exclusive mode;
lock table public.prescription_bundle_items in share row exclusive mode;
lock table public.intercycle_anamneses in share row exclusive mode;
lock table public.intercycle_anamnesis_deliveries in share row exclusive mode;
lock table public.intercycle_anamnesis_invites in share row exclusive mode;
lock table public.intercycle_anamnesis_waivers in share row exclusive mode;
lock table public.workout_archive_events in share row exclusive mode;
lock table public.cycle_prescription_clear_events in share row exclusive mode;

create or replace function pg_temp.bn_legacy_term_has_post_repair_activity(
  p_enrollment_id uuid,
  p_applied_at timestamptz
)
returns boolean
language sql
stable
set search_path = pg_temp, public
as $function$
  with target_cycles as materialized (
    select cycle.*
    from public.training_cycles cycle
    where cycle.enrollment_id=p_enrollment_id
  ), target_workouts as materialized (
    select workout.*
    from public.workouts workout
    join target_cycles cycle on cycle.id=workout.cycle_id
  )
  select
    exists (
      select 1 from target_cycles cycle
      where greatest(
        cycle.created_at,
        coalesce(cycle.superseded_at,'-infinity'::timestamptz),
        coalesce(cycle.prescribed_offline_at,'-infinity'::timestamptz),
        coalesce(cycle.prescription_cleared_at,'-infinity'::timestamptz)
      )>p_applied_at
    )
    or exists (
      select 1 from target_workouts workout
      where greatest(
        workout.created_at,
        workout.updated_at,
        coalesce(workout.superseded_at,'-infinity'::timestamptz)
      )>p_applied_at
    )
    or exists (
      select 1 from public.workout_exercises exercise
      join target_workouts workout on workout.id=exercise.workout_id
      where exercise.created_at>p_applied_at
    )
    or exists (
      select 1 from public.workout_logs log
      join target_workouts workout on workout.id=log.workout_id
      where greatest(log.created_at,log.updated_at,coalesce(log.completed_at,log.created_at))>p_applied_at
    )
    or exists (
      select 1 from public.workout_sessions session
      join target_workouts workout on workout.id=session.workout_id
      where greatest(
        coalesce(session.created_at,'-infinity'::timestamptz),
        coalesce(session.started_at,'-infinity'::timestamptz),
        coalesce(session.completed_at,'-infinity'::timestamptz)
      )>p_applied_at
    )
    or exists (
      select 1 from public.cycle_feedback feedback
      where feedback.cycle_id in (select id from target_cycles)
        and feedback.created_at>p_applied_at
    )
    or exists (
      select 1 from public.ai_plan_versions version
      where version.cycle_id in (select id from target_cycles)
        and version.created_at>p_applied_at
    )
    or exists (
      select 1 from public.ai_strength_plans plan
      where plan.training_cycle_id in (select id from target_cycles)
        and greatest(plan.created_at,plan.updated_at)>p_applied_at
    )
    or exists (
      select 1 from public.running_plans plan
      where plan.training_cycle_id in (select id from target_cycles)
        and greatest(plan.created_at,plan.updated_at)>p_applied_at
    )
    or exists (
      select 1 from public.nutrition_plans plan
      where plan.training_cycle_id in (select id from target_cycles)
        and greatest(plan.created_at,plan.updated_at)>p_applied_at
    )
    or exists (
      select 1 from public.prescription_bundles bundle
      where bundle.training_cycle_id in (select id from target_cycles)
        and greatest(bundle.created_at,bundle.updated_at)>p_applied_at
    )
    or exists (
      select 1 from public.prescription_bundle_items item
      where (
        (item.entity_type='training_cycle' and item.entity_id in (select id from target_cycles))
        or item.bundle_id in (
          select bundle.id from public.prescription_bundles bundle
          where bundle.training_cycle_id in (select id from target_cycles)
        )
      )
      and item.created_at>p_applied_at
    )
    or exists (
      select 1 from public.intercycle_anamneses anamnese
      where anamnese.training_cycle_id in (select id from target_cycles)
        and greatest(
          anamnese.created_at,
          coalesce(anamnese.submitted_at,'-infinity'::timestamptz),
          coalesce(anamnese.consented_at,'-infinity'::timestamptz)
        )>p_applied_at
    )
    or exists (
      select 1 from public.intercycle_anamnesis_deliveries delivery
      where delivery.training_cycle_id in (select id from target_cycles)
        and greatest(
          delivery.created_at,
          delivery.updated_at,
          coalesce(delivery.sent_at,'-infinity'::timestamptz),
          coalesce(delivery.responded_at,'-infinity'::timestamptz),
          coalesce(delivery.cancelled_at,'-infinity'::timestamptz),
          coalesce(delivery.reopened_at,'-infinity'::timestamptz)
        )>p_applied_at
    )
    or exists (
      select 1 from public.intercycle_anamnesis_invites invite
      where invite.training_cycle_id in (select id from target_cycles)
        and greatest(invite.created_at,coalesce(invite.consumed_at,'-infinity'::timestamptz))>p_applied_at
    )
    or exists (
      select 1 from public.intercycle_anamnesis_waivers waiver
      where (
        waiver.training_cycle_id in (select id from target_cycles)
        or waiver.prior_cycle_id in (select id from target_cycles)
      )
      and waiver.waived_at>p_applied_at
    )
    or exists (
      select 1 from public.workout_archive_events event
      where event.cycle_id in (select id from target_cycles)
        and event.created_at>p_applied_at
    )
    or exists (
      select 1 from public.cycle_prescription_clear_events event
      where event.cycle_id in (select id from target_cycles)
        and greatest(event.created_at,coalesce(event.restored_at,'-infinity'::timestamptz))>p_applied_at
    )
    or exists (
      select 1 from public.enrollments carry
      where carry.carried_over_cycle_id in (select id from target_cycles)
        and greatest(
          carry.created_at,
          carry.updated_at,
          coalesce(carry.carried_over_cycle_cleared_at,'-infinity'::timestamptz)
        )>p_applied_at
    );
$function$;

do $guard$
declare v_count integer;
begin
 select count(*) into v_count
 from public.enrollment_legacy_term_repair_audit a
 where a.repair_key='bn_remaining_legacy_terms_20260909' and a.state='applied'
 and a.before_sha256=encode(extensions.digest(
   (a.before_enrollment||jsonb_build_object('student',a.before_student))::text,
   'sha256'
 ),'hex');
 if v_count<>6 then raise exception 'bn_remaining_term_rollback_beforeimage_hash_mismatch expected=6 actual=%',v_count; end if;

 select count(*) into v_count from public.enrollment_legacy_term_repair_audit a
 join public.enrollments e on e.id=a.enrollment_id join public.students s on s.id=a.student_id
 where a.repair_key='bn_remaining_legacy_terms_20260909' and a.state='applied'
 and a.after_sha256=encode(extensions.digest((to_jsonb(e)||jsonb_build_object('student',to_jsonb(s)))::text,'sha256'),'hex');
 if v_count<>6 then raise exception 'bn_remaining_term_rollback_afterimage_mismatch expected=6 actual=%',v_count; end if;

 if exists(
   select 1 from public.enrollment_legacy_term_repair_audit a
   where a.repair_key='bn_remaining_legacy_terms_20260909' and a.state='applied'
     and pg_temp.bn_legacy_term_has_post_repair_activity(a.enrollment_id,a.applied_at)
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
