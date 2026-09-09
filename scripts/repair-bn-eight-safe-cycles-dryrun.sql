-- Dry-run wrapper for the safe BN cycle repair.
--
-- This intentionally performs the same writes as the apply script inside one
-- transaction, returns the changed manifest, and then rolls everything back.
-- Do not run against production until root/independent QA asks for the dry-run.

begin;

set local lock_timeout = '8s';
set local statement_timeout = '180s';

select pg_advisory_xact_lock(hashtextextended('sett:bn-eight-safe-cycle-repair:20260909', 0));

create temporary table pg_temp.training_cycle_safe_overlap_repair_audit (
  id uuid primary key default gen_random_uuid(),
  repair_key text not null,
  batch_sha256 text not null,
  action text not null check (action in ('boundary_start_plus_1', 'trim_empty_placeholder_end')),
  company_id uuid not null,
  student_id uuid not null,
  enrollment_id uuid not null,
  cycle_id uuid not null,
  canonical_cycle_id uuid,
  before_cycle jsonb not null,
  before_dependencies jsonb not null,
  before_sha256 text not null,
  after_cycle jsonb,
  after_sha256 text,
  state text not null default 'applied' check (state in ('applied', 'rolled_back')),
  applied_at timestamptz not null default now(),
  rolled_back_at timestamptz,
  unique (repair_key, cycle_id)
) on commit drop;

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

create temporary table pg_temp.bn_safe_targets on commit drop as
select *
from (values
  ('boundary_start_plus_1', '2d93f08d4f16', '24b181831b95', date '2026-10-16', null::date, date '2026-10-17', null::date, null),
  ('boundary_start_plus_1', '2d93f08d4f16', '120347c569b4', date '2026-11-27', null::date, date '2026-11-28', null::date, null),
  ('boundary_start_plus_1', '2d93f08d4f16', 'd28979e23b2d', date '2027-01-04', null::date, date '2027-01-05', null::date, null),
  ('trim_empty_placeholder_end', '078e2d2b9409', '0728d0cffd1f', date '2026-09-29', date '2026-11-09', null::date, date '2026-09-30', '1ea03950be0a'),
  ('boundary_start_plus_1', '93c4213741e0', '079fed89fe2a', date '2026-10-29', null::date, date '2026-10-30', null::date, null),
  ('boundary_start_plus_1', '93c4213741e0', '9fe14bd06b5e', date '2026-12-10', null::date, date '2026-12-11', null::date, null)
) as target(action, enrollment_ref, cycle_ref, expected_start_date, expected_end_date, new_start_date, new_end_date, canonical_cycle_ref);

create temporary table pg_temp.bn_safe_candidates on commit drop as
with resolved as (
  select
    target.*,
    enrollment.company_id,
    enrollment.student_id,
    enrollment.id as enrollment_id,
    cycle.id as cycle_id,
    canonical.id as canonical_cycle_id,
    canonical.start_date as canonical_start_date,
    canonical.end_date as canonical_end_date,
    canonical.status as canonical_status,
    canonical.superseded_by_cycle_id as canonical_superseded_by_cycle_id,
    canonical.superseded_at as canonical_superseded_at,
    cycle.start_date,
    cycle.end_date,
    cycle.status,
    cycle.delivery_status,
    cycle.name,
    cycle.prescribed_offline_at,
    cycle.superseded_by_cycle_id,
    cycle.superseded_at
  from pg_temp.bn_safe_targets target
  join public.enrollments enrollment
    on substr(md5(enrollment.id::text), 1, 12) = target.enrollment_ref
  join public.companies company
    on company.id = enrollment.company_id
   and company.slug = 'bn-performance-training'
  join public.training_cycles cycle
    on cycle.enrollment_id = enrollment.id
   and substr(md5(cycle.id::text), 1, 12) = target.cycle_ref
  left join public.training_cycles canonical
    on canonical.enrollment_id = enrollment.id
   and substr(md5(canonical.id::text), 1, 12) = target.canonical_cycle_ref
), deps as (
  select
    resolved.*,
    jsonb_build_object(
      'workouts', (select count(*) from public.workouts workout where workout.cycle_id = resolved.cycle_id),
      'exercise_rows', coalesce((
        select sum(
          case
            when jsonb_typeof(coalesce(workout.exercises, '[]'::jsonb)) = 'array'
              then jsonb_array_length(coalesce(workout.exercises, '[]'::jsonb))
            else 0
          end
        )::integer
        from public.workouts workout
        where workout.cycle_id = resolved.cycle_id
      ), 0),
      'workout_logs', (
        select count(distinct log.id)
        from public.workouts workout
        join public.workout_logs log on log.workout_id = workout.id
        where workout.cycle_id = resolved.cycle_id
      ),
      'workout_sessions', (
        select count(distinct session.id)
        from public.workouts workout
        join public.workout_sessions session on session.workout_id = workout.id
        where workout.cycle_id = resolved.cycle_id
      ),
      'cycle_feedback', (select count(*) from public.cycle_feedback row_value where row_value.cycle_id = resolved.cycle_id),
      'ai_plan_versions', (select count(*) from public.ai_plan_versions row_value where row_value.cycle_id = resolved.cycle_id),
      'ai_strength_plans', (select count(*) from public.ai_strength_plans row_value where row_value.training_cycle_id = resolved.cycle_id),
      'running_plans', (select count(*) from public.running_plans row_value where row_value.training_cycle_id = resolved.cycle_id),
      'nutrition_plans', (select count(*) from public.nutrition_plans row_value where row_value.training_cycle_id = resolved.cycle_id),
      'prescription_bundles', (select count(*) from public.prescription_bundles row_value where row_value.training_cycle_id = resolved.cycle_id),
      'prescription_bundle_items', (select count(*) from public.prescription_bundle_items row_value where row_value.entity_type = 'training_cycle' and row_value.entity_id = resolved.cycle_id),
      'intercycle_anamneses', (select count(*) from public.intercycle_anamneses row_value where row_value.training_cycle_id = resolved.cycle_id),
      'intercycle_deliveries', (select count(*) from public.intercycle_anamnesis_deliveries row_value where row_value.training_cycle_id = resolved.cycle_id),
      'intercycle_invites', (select count(*) from public.intercycle_anamnesis_invites row_value where row_value.training_cycle_id = resolved.cycle_id),
      'intercycle_waivers', (select count(*) from public.intercycle_anamnesis_waivers row_value where row_value.training_cycle_id = resolved.cycle_id or row_value.prior_cycle_id = resolved.cycle_id),
      'workout_archive_events', (select count(*) from public.workout_archive_events row_value where row_value.cycle_id = resolved.cycle_id),
      'carried_over_refs', (select count(*) from public.enrollments row_value where row_value.carried_over_cycle_id = resolved.cycle_id)
    ) as before_dependencies
  from resolved
), canonical_deps as (
  select
    deps.*,
    case when deps.canonical_cycle_id is null then null else (
      select count(*)
      from public.workouts workout
      where workout.cycle_id = deps.canonical_cycle_id
        and workout.superseded_at is null
    ) end as canonical_visible_workouts,
    case when deps.canonical_cycle_id is null then null else coalesce((
      select sum(
        case
          when jsonb_typeof(coalesce(workout.exercises, '[]'::jsonb)) = 'array'
            then jsonb_array_length(coalesce(workout.exercises, '[]'::jsonb))
          else 0
        end
      )::integer
      from public.workouts workout
      where workout.cycle_id = deps.canonical_cycle_id
        and workout.superseded_at is null
    ), 0) end as canonical_visible_exercise_rows,
    case when deps.canonical_cycle_id is null then null else (
      select encode(extensions.digest(to_jsonb(canonical)::text, 'sha256'), 'hex')
      from public.training_cycles canonical
      where canonical.id = deps.canonical_cycle_id
    ) end as canonical_sha256
  from deps
)
select
  canonical_deps.*,
  to_jsonb(cycle_row) as before_cycle,
  encode(extensions.digest(to_jsonb(cycle_row)::text, 'sha256'), 'hex') as before_sha256
from canonical_deps
join public.training_cycles cycle_row on cycle_row.id = canonical_deps.cycle_id;

do $manifest_gate$
declare
  v_expected_count constant integer := 6;
  v_expected_beforeimagehash constant text := '8d79773289aef338a89b5f0dc2c9d917f810625ce33d316364725efb5b2d728a';
  v_count integer;
  v_beforeimagehash text;
begin
  select count(*) into v_count from pg_temp.bn_safe_candidates;
  if v_count <> v_expected_count then
    raise exception 'bn_safe_cycle_target_count_mismatch expected=% actual=%', v_expected_count, v_count;
  end if;

  select encode(extensions.digest(string_agg(
    concat_ws('|',
      action,
      enrollment_ref,
      cycle_ref,
      start_date::text,
      end_date::text,
      status,
      coalesce(delivery_status, ''),
      coalesce(canonical_cycle_ref, ''),
      coalesce(canonical_start_date::text, ''),
      coalesce(canonical_end_date::text, ''),
      coalesce(canonical_status, ''),
      coalesce(canonical_visible_workouts::text, ''),
      coalesce(canonical_visible_exercise_rows::text, ''),
      coalesce(canonical_sha256, ''),
      (before_dependencies->>'workouts'),
      (before_dependencies->>'exercise_rows'),
      (before_dependencies->>'workout_logs'),
      (before_dependencies->>'workout_sessions'),
      (
        ((before_dependencies->>'cycle_feedback')::int)
        + ((before_dependencies->>'ai_plan_versions')::int)
        + ((before_dependencies->>'ai_strength_plans')::int)
        + ((before_dependencies->>'running_plans')::int)
        + ((before_dependencies->>'nutrition_plans')::int)
        + ((before_dependencies->>'prescription_bundles')::int)
        + ((before_dependencies->>'prescription_bundle_items')::int)
        + ((before_dependencies->>'intercycle_anamneses')::int)
        + ((before_dependencies->>'intercycle_deliveries')::int)
        + ((before_dependencies->>'intercycle_invites')::int)
        + ((before_dependencies->>'intercycle_waivers')::int)
        + ((before_dependencies->>'workout_archive_events')::int)
        + ((before_dependencies->>'carried_over_refs')::int)
      )::text,
      encode(extensions.digest((to_jsonb(candidate_row) - array[
        'company_id', 'student_id', 'enrollment_id', 'cycle_id', 'canonical_cycle_id',
        'before_cycle', 'before_dependencies', 'before_sha256'
      ])::text, 'sha256'), 'hex')
    ),
    E'\n' order by enrollment_ref, cycle_ref
  ), 'sha256'), 'hex')
  into v_beforeimagehash
  from pg_temp.bn_safe_candidates candidate_row;

  if v_beforeimagehash is distinct from v_expected_beforeimagehash then
    raise exception 'bn_safe_cycle_beforeimagehash_mismatch expected=% actual=%',
      v_expected_beforeimagehash, v_beforeimagehash;
  end if;

  if exists (
    select 1 from pg_temp.bn_safe_candidates
    where status = 'superseded'
       or superseded_by_cycle_id is not null
       or superseded_at is not null
       or start_date is distinct from expected_start_date
       or (expected_end_date is not null and end_date is distinct from expected_end_date)
       or start_date > end_date
  ) then
    raise exception 'bn_safe_cycle_state_or_date_mismatch';
  end if;

  if exists (
    select 1 from pg_temp.bn_safe_candidates
    where action = 'trim_empty_placeholder_end'
      and (
        status <> 'pending'
        or canonical_cycle_id is null
        or canonical_start_date is null
        or canonical_end_date is null
        or canonical_status = 'superseded'
        or canonical_superseded_by_cycle_id is not null
        or canonical_superseded_at is not null
        or coalesce(canonical_visible_workouts, 0) <= 0
        or coalesce(canonical_visible_exercise_rows, 0) <= 0
        or canonical_sha256 is null
        or name is not null
        or delivery_status is not null
        or prescribed_offline_at is not null
        or (before_dependencies->>'workouts')::int <> 0
        or (before_dependencies->>'exercise_rows')::int <> 0
        or (before_dependencies->>'workout_logs')::int <> 0
        or (before_dependencies->>'workout_sessions')::int <> 0
        or (
          ((before_dependencies->>'cycle_feedback')::int)
          + ((before_dependencies->>'ai_plan_versions')::int)
          + ((before_dependencies->>'ai_strength_plans')::int)
          + ((before_dependencies->>'running_plans')::int)
          + ((before_dependencies->>'nutrition_plans')::int)
          + ((before_dependencies->>'prescription_bundles')::int)
          + ((before_dependencies->>'prescription_bundle_items')::int)
          + ((before_dependencies->>'intercycle_anamneses')::int)
          + ((before_dependencies->>'intercycle_deliveries')::int)
          + ((before_dependencies->>'intercycle_invites')::int)
          + ((before_dependencies->>'intercycle_waivers')::int)
          + ((before_dependencies->>'workout_archive_events')::int)
          + ((before_dependencies->>'carried_over_refs')::int)
        ) <> 0
        or new_end_date is null
        or new_end_date < start_date
        or new_end_date <> canonical_start_date - 1
        or end_date < canonical_start_date
      )
  ) then
    raise exception 'bn_safe_cycle_trim_placeholder_gate_failed';
  end if;

  if exists (
    select 1 from pg_temp.bn_safe_candidates candidate
    where action = 'boundary_start_plus_1'
      and (
        status <> 'pending'
        or start_date <= public.current_business_date()
        or new_start_date is distinct from start_date + 1
        or new_start_date > end_date
        or (before_dependencies->>'workout_logs')::int <> 0
        or (before_dependencies->>'workout_sessions')::int <> 0
        or (before_dependencies->>'intercycle_anamneses')::int <> 0
        or (before_dependencies->>'intercycle_deliveries')::int <> 0
        or (before_dependencies->>'intercycle_invites')::int <> 0
        or (before_dependencies->>'intercycle_waivers')::int <> 0
        or (before_dependencies->>'workout_archive_events')::int <> 0
        or (before_dependencies->>'carried_over_refs')::int <> 0
        or not exists (
          select 1
          from public.training_cycles previous_cycle
          where previous_cycle.enrollment_id = candidate.enrollment_id
            and previous_cycle.id <> candidate.cycle_id
            and previous_cycle.status <> 'superseded'
            and previous_cycle.superseded_by_cycle_id is null
            and previous_cycle.end_date = candidate.start_date
        )
      )
  ) then
    raise exception 'bn_safe_cycle_boundary_gate_failed';
  end if;
end
$manifest_gate$;

do $residue_gate$
begin
  if to_regclass('public.training_cycle_safe_overlap_repair_audit') is not null then
    if exists (
      select 1
      from public.training_cycle_safe_overlap_repair_audit
      where repair_key = 'bn_eight_safe_cycles_20260909'
    ) then
      raise exception 'bn_safe_cycle_repair_key_residue';
    end if;
  end if;
end
$residue_gate$;

insert into pg_temp.training_cycle_safe_overlap_repair_audit (
  repair_key,
  batch_sha256,
  action,
  company_id,
  student_id,
  enrollment_id,
  cycle_id,
  canonical_cycle_id,
  before_cycle,
  before_dependencies,
  before_sha256
)
select
  'bn_eight_safe_cycles_20260909',
  '8d79773289aef338a89b5f0dc2c9d917f810625ce33d316364725efb5b2d728a',
  action,
  company_id,
  student_id,
  enrollment_id,
  cycle_id,
  canonical_cycle_id,
  before_cycle,
  before_dependencies,
  before_sha256
from pg_temp.bn_safe_candidates;

update public.training_cycles cycle
set start_date = candidate.new_start_date
from pg_temp.bn_safe_candidates candidate
where cycle.id = candidate.cycle_id
  and candidate.action = 'boundary_start_plus_1'
  and cycle.start_date = candidate.expected_start_date
  and cycle.status = 'pending'
  and cycle.superseded_by_cycle_id is null;

update public.training_cycles cycle
set end_date = candidate.new_end_date
from pg_temp.bn_safe_candidates candidate
where cycle.id = candidate.cycle_id
  and candidate.action = 'trim_empty_placeholder_end'
  and cycle.status = 'pending'
  and cycle.end_date = candidate.expected_end_date
  and cycle.superseded_by_cycle_id is null;

update pg_temp.training_cycle_safe_overlap_repair_audit audit
set after_cycle = to_jsonb(cycle),
    after_sha256 = encode(extensions.digest(to_jsonb(cycle)::text, 'sha256'), 'hex')
from public.training_cycles cycle
where audit.repair_key = 'bn_eight_safe_cycles_20260909'
  and audit.cycle_id = cycle.id
  and audit.state = 'applied';

do $post_gate$
declare
  v_changed_count integer;
  v_remaining_overlaps integer;
begin
  select count(*) into v_changed_count
  from pg_temp.training_cycle_safe_overlap_repair_audit
  where repair_key = 'bn_eight_safe_cycles_20260909'
    and after_sha256 is not null
    and after_sha256 is distinct from before_sha256;

  if v_changed_count <> 6 then
    raise exception 'bn_safe_cycle_changed_count_mismatch expected=6 actual=%', v_changed_count;
  end if;

  with affected_enrollments as (
    select distinct enrollment_id
    from pg_temp.bn_safe_candidates
  ), visible_cycles as (
    select cycle.*
    from public.training_cycles cycle
    join affected_enrollments affected on affected.enrollment_id = cycle.enrollment_id
    where cycle.status <> 'superseded'
      and cycle.superseded_by_cycle_id is null
  )
  select count(*) into v_remaining_overlaps
  from visible_cycles left_cycle
  join visible_cycles right_cycle
    on right_cycle.enrollment_id = left_cycle.enrollment_id
   and right_cycle.id > left_cycle.id
   and left_cycle.start_date <= right_cycle.end_date
   and right_cycle.start_date <= left_cycle.end_date
   and left_cycle.end_date >= public.current_business_date()
   and right_cycle.end_date >= public.current_business_date();

  if v_remaining_overlaps <> 0 then
    raise exception 'bn_safe_cycle_remaining_overlap_count=%', v_remaining_overlaps;
  end if;
end
$post_gate$;

select
  'DRY_RUN_ROLLBACK_ONLY' as mode,
  'bn_eight_safe_cycles_20260909' as repair_key,
  '8d79773289aef338a89b5f0dc2c9d917f810625ce33d316364725efb5b2d728a' as beforeimagehash,
  count(*) as changed_cycles,
  jsonb_agg(jsonb_build_object(
    'action', audit.action,
    'enrollment_ref', substr(md5(audit.enrollment_id::text), 1, 12),
    'cycle_ref', substr(md5(audit.cycle_id::text), 1, 12),
    'before_start', audit.before_cycle->>'start_date',
    'after_start', audit.after_cycle->>'start_date',
    'before_end', audit.before_cycle->>'end_date',
    'after_end', audit.after_cycle->>'end_date',
    'before_status', audit.before_cycle->>'status',
    'after_status', audit.after_cycle->>'status',
    'before_sha256', audit.before_sha256,
    'after_sha256', audit.after_sha256
  ) order by audit.enrollment_id, audit.cycle_id) as changed_manifest
from pg_temp.training_cycle_safe_overlap_repair_audit audit
where audit.repair_key = 'bn_eight_safe_cycles_20260909';

rollback;
