-- Apply the four explicit owner decisions for the remaining BN cycle overlaps.
-- Historical content is preserved in place; losing cycles are only hidden from
-- operational scheduling through semantic supersession.
--
-- Decisions received on 2026-09-09:
-- - Aldylayne: keep the latest cycle.
-- - Rebecca: keep the current cycle.
-- - Julia: keep the latest prescription.
-- - Vitoria: keep the current cycle and discard the future one from visibility.
--
-- Do not run without an exact dry-run and independent QA.

begin;

set local lock_timeout = '8s';
set local statement_timeout = '180s';

select pg_advisory_xact_lock(hashtextextended('sett:bn-four-owner-cycle-decisions:20260909', 0));

create table if not exists public.training_cycle_owner_decision_repair_audit (
  id uuid primary key default gen_random_uuid(),
  repair_key text not null,
  batch_sha256 text not null,
  company_id uuid not null,
  student_id uuid not null,
  enrollment_id uuid not null,
  superseded_cycle_id uuid not null,
  canonical_cycle_id uuid not null,
  action text not null,
  decision text not null,
  superseded_before jsonb not null,
  canonical_before jsonb not null,
  dependencies_before jsonb not null,
  superseded_before_sha256 text not null,
  canonical_before_sha256 text not null,
  superseded_after jsonb,
  canonical_after jsonb,
  dependencies_after jsonb,
  superseded_after_sha256 text,
  canonical_after_sha256 text,
  state text not null default 'applied' check (state in ('applied', 'rolled_back')),
  applied_at timestamptz not null default now(),
  rolled_back_at timestamptz,
  unique (repair_key, superseded_cycle_id)
);

alter table public.training_cycle_owner_decision_repair_audit enable row level security;
revoke all on table public.training_cycle_owner_decision_repair_audit from public, anon, authenticated;
grant select, insert, update on table public.training_cycle_owner_decision_repair_audit to service_role;

lock table public.enrollments in share row exclusive mode;
lock table public.training_cycles in share row exclusive mode;
lock table public.workouts in share row exclusive mode;
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
lock table public.training_cycle_owner_decision_repair_audit in share row exclusive mode;

create or replace function pg_temp.bn_cycle_dependencies(p_cycle_id uuid)
returns jsonb
language sql
stable
as $function$
  select jsonb_build_object(
    'workouts', (select count(*) from public.workouts row_value where row_value.cycle_id = p_cycle_id and row_value.superseded_at is null),
    'all_workouts', (select count(*) from public.workouts row_value where row_value.cycle_id = p_cycle_id),
    'exercise_rows', coalesce((
      select sum(case
        when row_value.superseded_at is null and jsonb_typeof(coalesce(row_value.exercises, '[]'::jsonb)) = 'array'
          then jsonb_array_length(coalesce(row_value.exercises, '[]'::jsonb))
        else 0 end)::integer
      from public.workouts row_value
      where row_value.cycle_id = p_cycle_id
    ), 0),
    'workout_logs', (
      select count(distinct log.id)
      from public.workouts workout
      join public.workout_logs log on log.workout_id = workout.id
      where workout.cycle_id = p_cycle_id
    ),
    'workout_sessions', (
      select count(distinct session.id)
      from public.workouts workout
      join public.workout_sessions session on session.workout_id = workout.id
      where workout.cycle_id = p_cycle_id
    ),
    'cycle_feedback', (select count(*) from public.cycle_feedback row_value where row_value.cycle_id = p_cycle_id),
    'ai_plan_versions', (select count(*) from public.ai_plan_versions row_value where row_value.cycle_id = p_cycle_id),
    'ai_strength_plans', (select count(*) from public.ai_strength_plans row_value where row_value.training_cycle_id = p_cycle_id),
    'running_plans', (select count(*) from public.running_plans row_value where row_value.training_cycle_id = p_cycle_id),
    'nutrition_plans', (select count(*) from public.nutrition_plans row_value where row_value.training_cycle_id = p_cycle_id),
    'prescription_bundles', (select count(*) from public.prescription_bundles row_value where row_value.training_cycle_id = p_cycle_id),
    'active_prescription_bundles', (select count(*) from public.prescription_bundles row_value where row_value.training_cycle_id = p_cycle_id and row_value.status = 'active'),
    'prescription_bundle_items', (select count(*) from public.prescription_bundle_items row_value where row_value.entity_type = 'training_cycle' and row_value.entity_id = p_cycle_id),
    'intercycle_anamneses', (select count(*) from public.intercycle_anamneses row_value where row_value.training_cycle_id = p_cycle_id),
    'intercycle_deliveries', (select count(*) from public.intercycle_anamnesis_deliveries row_value where row_value.training_cycle_id = p_cycle_id),
    'intercycle_invites', (select count(*) from public.intercycle_anamnesis_invites row_value where row_value.training_cycle_id = p_cycle_id),
    'intercycle_waivers', (select count(*) from public.intercycle_anamnesis_waivers row_value where row_value.training_cycle_id = p_cycle_id or row_value.prior_cycle_id = p_cycle_id),
    'workout_archive_events', (select count(*) from public.workout_archive_events row_value where row_value.cycle_id = p_cycle_id),
    'cycle_clear_events', (select count(*) from public.cycle_prescription_clear_events row_value where row_value.cycle_id = p_cycle_id),
    'carried_over_refs', (select count(*) from public.enrollments row_value where row_value.carried_over_cycle_id = p_cycle_id)
  );
$function$;

create temporary table pg_temp.bn_owner_targets on commit drop as
select *
from (values
  ('d735907ca436', 'b41fde29a9c4', '311f71c93012', 'keep_latest', 'completed', null::text, date '2026-09-01', date '2026-10-12', 'active', null::text, date '2026-09-03', date '2026-10-14', null::date),
  ('5f9de190f3c7', 'd48b4ada7cfa', 'cf75bbafaa2b', 'keep_current', 'completed', null::text, date '2026-08-31', date '2026-10-11', 'active', null::text, date '2026-09-03', date '2026-10-14', null::date),
  ('467cc79d6c5b', '3f3ba457e7d0', 'ebf991044552', 'keep_latest_and_normalize_42_days', 'pending', 'sent', date '2026-11-30', date '2027-01-10', 'pending', 'sent', date '2026-11-30', date '2027-12-11', date '2027-01-10'),
  ('7975a4d98a88', '8d56a0f1060d', '8f758b912507', 'keep_current_hide_future', 'pending', null::text, date '2026-10-08', date '2026-11-18', 'active', 'sent', date '2026-08-27', date '2026-10-16', null::date)
) as target(
  enrollment_ref,
  superseded_cycle_ref,
  canonical_cycle_ref,
  decision,
  expected_superseded_status,
  expected_superseded_delivery,
  expected_superseded_start,
  expected_superseded_end,
  expected_canonical_status,
  expected_canonical_delivery,
  expected_canonical_start,
  expected_canonical_end,
  canonical_new_end
);

create temporary table pg_temp.bn_owner_candidates on commit drop as
select
  target.*,
  enrollment.company_id,
  enrollment.student_id,
  enrollment.id as enrollment_id,
  enrollment.status as enrollment_status,
  superseded.id as superseded_cycle_id,
  canonical.id as canonical_cycle_id,
  superseded.created_at as superseded_created_at,
  canonical.created_at as canonical_created_at,
  to_jsonb(superseded) as superseded_before,
  to_jsonb(canonical) as canonical_before,
  jsonb_build_object(
    'superseded', pg_temp.bn_cycle_dependencies(superseded.id),
    'canonical', pg_temp.bn_cycle_dependencies(canonical.id)
  ) as dependencies_before,
  encode(extensions.digest(to_jsonb(superseded)::text, 'sha256'), 'hex') as superseded_before_sha256,
  encode(extensions.digest(to_jsonb(canonical)::text, 'sha256'), 'hex') as canonical_before_sha256
from pg_temp.bn_owner_targets target
join public.enrollments enrollment
  on substr(md5(enrollment.id::text), 1, 12) = target.enrollment_ref
join public.companies company
  on company.id = enrollment.company_id
 and company.slug = 'bn-performance-training'
join public.training_cycles superseded
  on superseded.enrollment_id = enrollment.id
 and substr(md5(superseded.id::text), 1, 12) = target.superseded_cycle_ref
join public.training_cycles canonical
  on canonical.enrollment_id = enrollment.id
 and substr(md5(canonical.id::text), 1, 12) = target.canonical_cycle_ref;

do $preflight$
declare
  v_count integer;
begin
  select count(*) into v_count from pg_temp.bn_owner_candidates;
  if v_count <> 4 then
    raise exception 'bn_owner_decision_target_count_mismatch expected=4 actual=%', v_count;
  end if;

  if exists (
    select 1
    from pg_temp.bn_owner_candidates
    where enrollment_status not in ('active', 'awaiting_training', 'awaiting_renewal')
       or superseded_cycle_id = canonical_cycle_id
       or superseded_before->>'status' is distinct from expected_superseded_status
       or superseded_before->>'delivery_status' is distinct from expected_superseded_delivery
       or (superseded_before->>'start_date')::date is distinct from expected_superseded_start
       or (superseded_before->>'end_date')::date is distinct from expected_superseded_end
       or canonical_before->>'status' is distinct from expected_canonical_status
       or canonical_before->>'delivery_status' is distinct from expected_canonical_delivery
       or (canonical_before->>'start_date')::date is distinct from expected_canonical_start
       or (canonical_before->>'end_date')::date is distinct from expected_canonical_end
       or superseded_before->>'superseded_by_cycle_id' is not null
       or superseded_before->>'superseded_at' is not null
       or canonical_before->>'superseded_by_cycle_id' is not null
       or canonical_before->>'superseded_at' is not null
       or canonical_created_at <= superseded_created_at
       or expected_superseded_start > expected_superseded_end
       or expected_canonical_start > expected_canonical_end
       or expected_superseded_start > expected_canonical_end
       or expected_canonical_start > expected_superseded_end
  ) then
    raise exception 'bn_owner_decision_before_state_mismatch';
  end if;

  if exists (
    select 1 from pg_temp.bn_owner_candidates
    where superseded_cycle_ref = 'b41fde29a9c4'
      and dependencies_before is distinct from jsonb_build_object(
        'superseded', jsonb_build_object('workouts',0,'all_workouts',0,'exercise_rows',0,'workout_logs',0,'workout_sessions',0,'cycle_feedback',0,'ai_plan_versions',0,'ai_strength_plans',0,'running_plans',1,'nutrition_plans',0,'prescription_bundles',6,'active_prescription_bundles',1,'prescription_bundle_items',0,'intercycle_anamneses',0,'intercycle_deliveries',0,'intercycle_invites',0,'intercycle_waivers',0,'workout_archive_events',0,'cycle_clear_events',0,'carried_over_refs',0),
        'canonical', jsonb_build_object('workouts',4,'all_workouts',4,'exercise_rows',40,'workout_logs',10,'workout_sessions',0,'cycle_feedback',0,'ai_plan_versions',0,'ai_strength_plans',0,'running_plans',0,'nutrition_plans',0,'prescription_bundles',0,'active_prescription_bundles',0,'prescription_bundle_items',0,'intercycle_anamneses',0,'intercycle_deliveries',0,'intercycle_invites',0,'intercycle_waivers',0,'workout_archive_events',0,'cycle_clear_events',0,'carried_over_refs',0)
      )
  ) then raise exception 'bn_owner_decision_aldylayne_dependencies_changed'; end if;

  if exists (
    select 1 from pg_temp.bn_owner_candidates
    where superseded_cycle_ref = 'd48b4ada7cfa'
      and (
        (dependencies_before#>>'{superseded,workouts}')::int <> 1
        or (dependencies_before#>>'{superseded,exercise_rows}')::int <> 7
        or (dependencies_before#>>'{superseded,workout_logs}')::int <> 0
        or (dependencies_before#>>'{superseded,workout_sessions}')::int <> 0
        or (dependencies_before#>>'{canonical,workouts}')::int <> 4
        or (dependencies_before#>>'{canonical,exercise_rows}')::int <> 40
        or (dependencies_before#>>'{canonical,workout_logs}')::int <> 154
        or (dependencies_before#>>'{canonical,workout_sessions}')::int <> 6
      )
  ) then raise exception 'bn_owner_decision_rebecca_dependencies_changed'; end if;

  if exists (
    select 1 from pg_temp.bn_owner_candidates
    where superseded_cycle_ref = '3f3ba457e7d0'
      and (
        (dependencies_before#>>'{superseded,workouts}')::int <> 3
        or (dependencies_before#>>'{superseded,exercise_rows}')::int <> 18
        or (dependencies_before#>>'{superseded,running_plans}')::int <> 1
        or (dependencies_before#>>'{superseded,ai_strength_plans}')::int <> 1
        or (dependencies_before#>>'{superseded,prescription_bundles}')::int <> 1
        or (dependencies_before#>>'{canonical,workouts}')::int <> 3
        or (dependencies_before#>>'{canonical,exercise_rows}')::int <> 28
        or canonical_new_end <> expected_canonical_start + 41
      )
  ) then raise exception 'bn_owner_decision_julia_dependencies_or_window_changed'; end if;

  if exists (
    select 1 from pg_temp.bn_owner_candidates
    where superseded_cycle_ref = '8d56a0f1060d'
      and (
        (dependencies_before#>>'{superseded,workouts}')::int <> 6
        or (dependencies_before#>>'{superseded,exercise_rows}')::int <> 64
        or (dependencies_before#>>'{superseded,workout_logs}')::int <> 0
        or (dependencies_before#>>'{superseded,workout_sessions}')::int <> 0
        or (dependencies_before#>>'{canonical,workouts}')::int <> 7
        or (dependencies_before#>>'{canonical,exercise_rows}')::int <> 73
      )
  ) then raise exception 'bn_owner_decision_vitoria_dependencies_changed'; end if;

  if exists (
    select 1 from public.training_cycle_owner_decision_repair_audit
    where repair_key = 'bn_four_owner_cycle_decisions_20260909'
  ) then
    raise exception 'bn_owner_decision_repair_key_residue';
  end if;
end
$preflight$;

insert into public.training_cycle_owner_decision_repair_audit (
  repair_key, batch_sha256, company_id, student_id, enrollment_id,
  superseded_cycle_id, canonical_cycle_id, action, decision,
  superseded_before, canonical_before, dependencies_before,
  superseded_before_sha256, canonical_before_sha256
)
select
  'bn_four_owner_cycle_decisions_20260909',
  'd251f267a7ee060a9726726476ebcc972345a5f9274bed62f998cb060e15a48f',
  company_id, student_id, enrollment_id, superseded_cycle_id, canonical_cycle_id,
  case when canonical_new_end is null then 'semantic_supersession' else 'semantic_supersession_and_canonical_window_fix' end,
  decision, superseded_before, canonical_before, dependencies_before,
  superseded_before_sha256, canonical_before_sha256
from pg_temp.bn_owner_candidates;

update public.training_cycles cycle
set status = 'superseded',
    superseded_by_cycle_id = candidate.canonical_cycle_id,
    superseded_at = now(),
    superseded_by = null,
    superseded_previous_status = candidate.expected_superseded_status,
    superseded_reason = 'canonical_cycle_selected_by_owner_20260909'
from pg_temp.bn_owner_candidates candidate
where cycle.id = candidate.superseded_cycle_id
  and cycle.status = candidate.expected_superseded_status
  and cycle.superseded_by_cycle_id is null
  and cycle.superseded_at is null;

update public.training_cycles cycle
set end_date = candidate.canonical_new_end
from pg_temp.bn_owner_candidates candidate
where cycle.id = candidate.canonical_cycle_id
  and candidate.canonical_new_end is not null
  and cycle.end_date = candidate.expected_canonical_end
  and cycle.status = candidate.expected_canonical_status
  and cycle.superseded_by_cycle_id is null;

update public.training_cycle_owner_decision_repair_audit audit
set superseded_after = to_jsonb(superseded),
    canonical_after = to_jsonb(canonical),
    dependencies_after = jsonb_build_object(
      'superseded', pg_temp.bn_cycle_dependencies(superseded.id),
      'canonical', pg_temp.bn_cycle_dependencies(canonical.id)
    ),
    superseded_after_sha256 = encode(extensions.digest(to_jsonb(superseded)::text, 'sha256'), 'hex'),
    canonical_after_sha256 = encode(extensions.digest(to_jsonb(canonical)::text, 'sha256'), 'hex')
from public.training_cycles superseded, public.training_cycles canonical
where audit.repair_key = 'bn_four_owner_cycle_decisions_20260909'
  and audit.state = 'applied'
  and superseded.id = audit.superseded_cycle_id
  and canonical.id = audit.canonical_cycle_id;

do $postflight$
declare
  v_count integer;
  v_overlap_pairs integer;
  v_overlap_enrollments integer;
begin
  select count(*) into v_count
  from public.training_cycle_owner_decision_repair_audit
  where repair_key = 'bn_four_owner_cycle_decisions_20260909'
    and state = 'applied'
    and superseded_after_sha256 is not null
    and canonical_after_sha256 is not null;
  if v_count <> 4 then
    raise exception 'bn_owner_decision_afterimage_count_mismatch expected=4 actual=%', v_count;
  end if;

  if exists (
    select 1
    from public.training_cycle_owner_decision_repair_audit audit
    where audit.repair_key = 'bn_four_owner_cycle_decisions_20260909'
      and (
        audit.dependencies_after is distinct from audit.dependencies_before
        or audit.superseded_after->>'status' <> 'superseded'
        or audit.superseded_after->>'superseded_by_cycle_id' is distinct from audit.canonical_cycle_id::text
        or audit.superseded_after->>'superseded_previous_status' is distinct from audit.superseded_before->>'status'
        or audit.superseded_after->>'superseded_reason' <> 'canonical_cycle_selected_by_owner_20260909'
        or (audit.superseded_before - array['status','superseded_by_cycle_id','superseded_at','superseded_by','superseded_previous_status','superseded_reason'])
           is distinct from
           (audit.superseded_after - array['status','superseded_by_cycle_id','superseded_at','superseded_by','superseded_previous_status','superseded_reason'])
        or (
          audit.decision <> 'keep_latest_and_normalize_42_days'
          and audit.canonical_after is distinct from audit.canonical_before
        )
        or (
          audit.decision = 'keep_latest_and_normalize_42_days'
          and (
            (audit.canonical_after->>'end_date')::date <> date '2027-01-10'
            or (audit.canonical_before - 'end_date') is distinct from (audit.canonical_after - 'end_date')
          )
        )
      )
  ) then
    raise exception 'bn_owner_decision_unexpected_after_state';
  end if;

  with visible_cycles as (
    select cycle.*
    from public.training_cycles cycle
    join public.enrollments enrollment on enrollment.id = cycle.enrollment_id
    join public.companies company on company.id = enrollment.company_id
    where company.slug = 'bn-performance-training'
      and enrollment.status in ('active', 'awaiting_training', 'awaiting_renewal')
      and cycle.status <> 'superseded'
      and cycle.superseded_by_cycle_id is null
  ), pairs as (
    select left_cycle.enrollment_id
    from visible_cycles left_cycle
    join visible_cycles right_cycle
      on right_cycle.enrollment_id = left_cycle.enrollment_id
     and right_cycle.id > left_cycle.id
     and left_cycle.start_date <= right_cycle.end_date
     and right_cycle.start_date <= left_cycle.end_date
     and left_cycle.end_date >= public.current_business_date()
     and right_cycle.end_date >= public.current_business_date()
  )
  select count(*), count(distinct enrollment_id)
  into v_overlap_pairs, v_overlap_enrollments
  from pairs;

  if v_overlap_pairs <> 0 or v_overlap_enrollments <> 0 then
    raise exception 'bn_owner_decision_remaining_visible_overlap pairs=% enrollments=%', v_overlap_pairs, v_overlap_enrollments;
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.training_cycle_owner_decision_repair_audit'::regclass
  ) or has_table_privilege('anon', 'public.training_cycle_owner_decision_repair_audit', 'select')
     or has_table_privilege('authenticated', 'public.training_cycle_owner_decision_repair_audit', 'select') then
    raise exception 'bn_owner_decision_audit_rls_or_privilege_mismatch';
  end if;
end
$postflight$;

select
  'bn_four_owner_cycle_decisions_20260909' as repair_key,
  count(*) as reconciled_pairs,
  jsonb_agg(jsonb_build_object(
    'enrollment_ref', substr(md5(enrollment_id::text), 1, 12),
    'superseded_cycle_ref', substr(md5(superseded_cycle_id::text), 1, 12),
    'canonical_cycle_ref', substr(md5(canonical_cycle_id::text), 1, 12),
    'decision', decision,
    'superseded_before_status', superseded_before->>'status',
    'superseded_after_status', superseded_after->>'status',
    'canonical_before_end', canonical_before->>'end_date',
    'canonical_after_end', canonical_after->>'end_date',
    'content_preserved', dependencies_after = dependencies_before
  ) order by enrollment_id) as manifest
from public.training_cycle_owner_decision_repair_audit
where repair_key = 'bn_four_owner_cycle_decisions_20260909'
  and state = 'applied';

commit;
