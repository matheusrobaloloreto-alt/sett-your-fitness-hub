-- Aggregate-only production readiness audit for the two BN legacy-term repairs.
-- This script never selects identifiers, before-images, after-images, or free text.

begin transaction read only;

with expected as (
  select * from (values
    ('bn_legacy_terms_20260909'::text, 12::integer),
    ('bn_remaining_legacy_terms_20260909'::text, 6::integer)
  ) as item(repair_key, expected_rows)
), readiness as (
  select
    expected.repair_key,
    expected.expected_rows,
    count(audit.id)::integer as audit_rows,
    count(audit.id) filter (where audit.state='applied')::integer as applied_rows,
    count(audit.id) filter (
      where audit.before_sha256=encode(extensions.digest(
        (audit.before_enrollment||jsonb_build_object('student',audit.before_student))::text,
        'sha256'
      ),'hex')
    )::integer as valid_before_images,
    count(audit.id) filter (
      where audit.after_sha256=encode(extensions.digest(
        (to_jsonb(enrollment)||jsonb_build_object('student',to_jsonb(student)))::text,
        'sha256'
      ),'hex')
    )::integer as exact_after_image_matches,
    count(audit.id) filter (
      where jsonb_strip_nulls(to_jsonb(enrollment)-'updated_at')
              is not distinct from jsonb_strip_nulls(audit.after_enrollment-'updated_at')
        and jsonb_strip_nulls(to_jsonb(student)-'updated_at')
              is not distinct from jsonb_strip_nulls(audit.after_student-'updated_at')
    )::integer as semantic_after_image_matches,
    count(audit.id) filter (
      where audit.after_student->>'status' is distinct from audit.before_student->>'status'
    )::integer as student_rows_requiring_restore,
    count(audit.id) filter (
      where exists (
        select 1 from public.training_cycles cycle
        where cycle.enrollment_id=audit.enrollment_id
          and greatest(
            cycle.created_at,
            coalesce(cycle.superseded_at,'-infinity'::timestamptz),
            coalesce(cycle.prescribed_offline_at,'-infinity'::timestamptz),
            coalesce(cycle.prescription_cleared_at,'-infinity'::timestamptz)
          )>audit.applied_at
      ) or exists (
        select 1 from public.training_cycles cycle
        join public.workouts workout on workout.cycle_id=cycle.id
        where cycle.enrollment_id=audit.enrollment_id
          and greatest(
            workout.created_at,
            workout.updated_at,
            coalesce(workout.superseded_at,'-infinity'::timestamptz)
          )>audit.applied_at
      ) or exists (
        select 1 from public.training_cycles cycle
        join public.workouts workout on workout.cycle_id=cycle.id
        join public.workout_exercises exercise on exercise.workout_id=workout.id
        where cycle.enrollment_id=audit.enrollment_id
          and exercise.created_at>audit.applied_at
      ) or exists (
        select 1 from public.training_cycles cycle
        join public.workouts workout on workout.cycle_id=cycle.id
        join public.workout_logs log on log.workout_id=workout.id
        where cycle.enrollment_id=audit.enrollment_id
          and greatest(log.created_at,log.updated_at,coalesce(log.completed_at,log.created_at))>audit.applied_at
      ) or exists (
        select 1 from public.training_cycles cycle
        join public.workouts workout on workout.cycle_id=cycle.id
        join public.workout_sessions session on session.workout_id=workout.id
        where cycle.enrollment_id=audit.enrollment_id
          and greatest(
            coalesce(session.created_at,'-infinity'::timestamptz),
            coalesce(session.started_at,'-infinity'::timestamptz),
            coalesce(session.completed_at,'-infinity'::timestamptz)
          )>audit.applied_at
      ) or exists (
        select 1 from public.training_cycles cycle
        join public.cycle_feedback feedback on feedback.cycle_id=cycle.id
        where cycle.enrollment_id=audit.enrollment_id
          and feedback.created_at>audit.applied_at
      ) or exists (
        select 1 from public.training_cycles cycle
        join public.ai_plan_versions version on version.cycle_id=cycle.id
        where cycle.enrollment_id=audit.enrollment_id
          and version.created_at>audit.applied_at
      ) or exists (
        select 1 from public.training_cycles cycle
        join public.ai_strength_plans plan on plan.training_cycle_id=cycle.id
        where cycle.enrollment_id=audit.enrollment_id
          and greatest(plan.created_at,plan.updated_at)>audit.applied_at
      ) or exists (
        select 1 from public.training_cycles cycle
        join public.running_plans plan on plan.training_cycle_id=cycle.id
        where cycle.enrollment_id=audit.enrollment_id
          and greatest(plan.created_at,plan.updated_at)>audit.applied_at
      ) or exists (
        select 1 from public.training_cycles cycle
        join public.nutrition_plans plan on plan.training_cycle_id=cycle.id
        where cycle.enrollment_id=audit.enrollment_id
          and greatest(plan.created_at,plan.updated_at)>audit.applied_at
      ) or exists (
        select 1 from public.training_cycles cycle
        join public.prescription_bundles bundle on bundle.training_cycle_id=cycle.id
        where cycle.enrollment_id=audit.enrollment_id
          and greatest(bundle.created_at,bundle.updated_at)>audit.applied_at
      ) or exists (
        select 1 from public.training_cycles cycle
        join public.prescription_bundle_items item
          on item.entity_type='training_cycle' and item.entity_id=cycle.id
        where cycle.enrollment_id=audit.enrollment_id
          and item.created_at>audit.applied_at
      ) or exists (
        select 1 from public.training_cycles cycle
        join public.prescription_bundles bundle on bundle.training_cycle_id=cycle.id
        join public.prescription_bundle_items item on item.bundle_id=bundle.id
        where cycle.enrollment_id=audit.enrollment_id
          and item.created_at>audit.applied_at
      ) or exists (
        select 1 from public.training_cycles cycle
        join public.intercycle_anamneses anamnese on anamnese.training_cycle_id=cycle.id
        where cycle.enrollment_id=audit.enrollment_id
          and greatest(
            anamnese.created_at,
            coalesce(anamnese.submitted_at,'-infinity'::timestamptz),
            coalesce(anamnese.consented_at,'-infinity'::timestamptz)
          )>audit.applied_at
      ) or exists (
        select 1 from public.training_cycles cycle
        join public.intercycle_anamnesis_deliveries delivery on delivery.training_cycle_id=cycle.id
        where cycle.enrollment_id=audit.enrollment_id
          and greatest(
            delivery.created_at,
            delivery.updated_at,
            coalesce(delivery.sent_at,'-infinity'::timestamptz),
            coalesce(delivery.responded_at,'-infinity'::timestamptz),
            coalesce(delivery.cancelled_at,'-infinity'::timestamptz),
            coalesce(delivery.reopened_at,'-infinity'::timestamptz)
          )>audit.applied_at
      ) or exists (
        select 1 from public.training_cycles cycle
        join public.intercycle_anamnesis_invites invite on invite.training_cycle_id=cycle.id
        where cycle.enrollment_id=audit.enrollment_id
          and greatest(invite.created_at,coalesce(invite.consumed_at,'-infinity'::timestamptz))>audit.applied_at
      ) or exists (
        select 1 from public.training_cycles cycle
        join public.intercycle_anamnesis_waivers waiver
          on waiver.training_cycle_id=cycle.id or waiver.prior_cycle_id=cycle.id
        where cycle.enrollment_id=audit.enrollment_id
          and waiver.waived_at>audit.applied_at
      ) or exists (
        select 1 from public.training_cycles cycle
        join public.workout_archive_events event on event.cycle_id=cycle.id
        where cycle.enrollment_id=audit.enrollment_id
          and event.created_at>audit.applied_at
      ) or exists (
        select 1 from public.training_cycles cycle
        join public.cycle_prescription_clear_events event on event.cycle_id=cycle.id
        where cycle.enrollment_id=audit.enrollment_id
          and greatest(event.created_at,coalesce(event.restored_at,'-infinity'::timestamptz))>audit.applied_at
      ) or exists (
        select 1 from public.training_cycles cycle
        join public.enrollments carry on carry.carried_over_cycle_id=cycle.id
        where cycle.enrollment_id=audit.enrollment_id
          and greatest(
            carry.created_at,
            carry.updated_at,
            coalesce(carry.carried_over_cycle_cleared_at,'-infinity'::timestamptz)
          )>audit.applied_at
      ) or exists (
        select 1 from public.payments payment
        where coalesce(payment.lifecycle_enrollment_id,payment.enrollment_id)=audit.enrollment_id
          and greatest(
            payment.created_at,
            payment.updated_at,
            coalesce(payment.paid_at,'-infinity'::timestamptz),
            coalesce(payment.lifecycle_applied_at,'-infinity'::timestamptz)
          )>audit.applied_at
      ) or exists (
        select 1 from public.payment_recovery_events event
        left join public.payments payment on payment.id=event.payment_id
        where (
          event.enrollment_id=audit.enrollment_id
          or coalesce(payment.lifecycle_enrollment_id,payment.enrollment_id)=audit.enrollment_id
        )
        and greatest(event.occurred_at,event.created_at)>audit.applied_at
      )
    )::integer as rows_with_post_repair_dependency_activity
  from expected
  left join public.enrollment_legacy_term_repair_audit audit
    on audit.repair_key=expected.repair_key
  left join public.enrollments enrollment on enrollment.id=audit.enrollment_id
  left join public.students student on student.id=audit.student_id
  group by expected.repair_key,expected.expected_rows
), trigger_gate as (
  select
    count(*) filter (
      where trigger_name in ('update_enrollments_updated_at','update_students_updated_at')
        and tgenabled='O'
        and trigger_definition ilike '%before update%'
        and trigger_definition ilike '%update_updated_at_column()%'
    )::integer as enabled_expected_triggers,
    position('new.updated_at = now()' in lower(pg_get_functiondef(
      'public.update_updated_at_column()'::regprocedure
    ))) > 0 as function_forces_transaction_timestamp
  from (
    select
      trigger.tgname as trigger_name,
      trigger.tgenabled,
      pg_get_triggerdef(trigger.oid,true) as trigger_definition
    from pg_trigger trigger
    join pg_class relation on relation.oid=trigger.tgrelid
    join pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public'
      and relation.relname in ('enrollments','students')
      and not trigger.tgisinternal
  ) catalog
)
select
  now() as audited_at,
  readiness.repair_key,
  readiness.expected_rows,
  readiness.audit_rows,
  readiness.applied_rows,
  readiness.valid_before_images,
  readiness.exact_after_image_matches,
  readiness.semantic_after_image_matches,
  readiness.student_rows_requiring_restore,
  readiness.rows_with_post_repair_dependency_activity,
  trigger_gate.enabled_expected_triggers,
  trigger_gate.function_forces_transaction_timestamp,
  (
    readiness.audit_rows=readiness.expected_rows
    and readiness.applied_rows=readiness.expected_rows
    and readiness.valid_before_images=readiness.expected_rows
    and readiness.exact_after_image_matches=readiness.expected_rows
    and readiness.semantic_after_image_matches=readiness.expected_rows
    and readiness.rows_with_post_repair_dependency_activity=0
    and trigger_gate.enabled_expected_triggers=2
    and trigger_gate.function_forces_transaction_timestamp
  ) as rollback_ready
from readiness
cross join trigger_gate
order by readiness.repair_key;

rollback;
