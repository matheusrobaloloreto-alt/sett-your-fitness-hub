-- Fail-closed repair for the Beatriz/Aldylayne BN cycle-overlap subset.
--
-- Scope:
-- - enrollment 3530d245ed22: close the unused active cycle before the sent replacement
--   and shift two future one-day boundaries.
-- - enrollment d735907ca436: shift only the empty future boundary to start after the
--   used active cycle.
--
-- Explicitly out of scope:
-- - enrollment terms, payments, Asaas records and legacy-vigencia files.
-- - Aldylayne's completed cycle b41fde29a9c4, because it has cardio/bundle state.
-- - workouts, workout logs, workout sessions, bundles, running plans and enrollments.
--
-- Do not run without an approved dry-run and independent QA.

begin;

set local lock_timeout = '8s';
set local statement_timeout = '180s';

select pg_advisory_xact_lock(hashtextextended('sett:bn-beatriz-aldylayne-cycle-repair:20260909', 0));

create table if not exists public.training_cycle_targeted_overlap_repair_audit (
  id uuid primary key default gen_random_uuid(),
  repair_key text not null,
  batch_sha256 text not null,
  scope text not null,
  action text not null check (action in ('close_active_before_sent_replacement', 'future_start_after_previous_end')),
  company_id uuid not null,
  student_id uuid not null,
  enrollment_id uuid not null,
  cycle_id uuid not null,
  previous_cycle_id uuid not null,
  before_cycle jsonb not null,
  before_dependencies jsonb not null,
  before_sha256 text not null,
  after_cycle jsonb,
  after_sha256 text,
  state text not null default 'applied' check (state in ('applied', 'rolled_back')),
  applied_at timestamptz not null default now(),
  rolled_back_at timestamptz,
  unique (repair_key, cycle_id)
);

alter table public.training_cycle_targeted_overlap_repair_audit enable row level security;
revoke all on table public.training_cycle_targeted_overlap_repair_audit from public, anon, authenticated;
grant select, insert, update on table public.training_cycle_targeted_overlap_repair_audit to service_role;

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

create temporary table pg_temp.bn_targeted_targets on commit drop as
select *
from (values
  ('close_active_before_sent_replacement', '3530d245ed22', '2024d5159013', date '2026-08-06', date '2026-09-16', null::date, date '2026-09-06', '4c5a69f9b36c'),
  ('future_start_after_previous_end', '3530d245ed22', '7c16117aefd4', date '2026-10-23', date '2026-12-04', date '2026-10-24', null::date, '4c5a69f9b36c'),
  ('future_start_after_previous_end', '3530d245ed22', '5ca7adcdcc45', date '2026-12-04', date '2027-01-15', date '2026-12-05', null::date, '7c16117aefd4'),
  ('future_start_after_previous_end', 'd735907ca436', '5e8114de5c79', date '2026-10-13', date '2026-11-23', date '2026-10-15', null::date, '311f71c93012')
) as target(
  action,
  enrollment_ref,
  cycle_ref,
  expected_start_date,
  expected_end_date,
  new_start_date,
  new_end_date,
  previous_cycle_ref
);

create temporary table pg_temp.bn_targeted_candidates on commit drop as
with resolved as (
  select
    target.*,
    enrollment.company_id,
    enrollment.student_id,
    enrollment.id as enrollment_id,
    cycle.id as cycle_id,
    previous_cycle.id as previous_cycle_id,
    cycle.start_date,
    cycle.end_date,
    cycle.status,
    cycle.delivery_status,
    cycle.name,
    cycle.prescribed_offline_at,
    cycle.superseded_by_cycle_id,
    cycle.superseded_at,
    previous_cycle.start_date as previous_start_date,
    previous_cycle.end_date as previous_end_date,
    previous_cycle.status as previous_status,
    previous_cycle.delivery_status as previous_delivery_status,
    previous_cycle.superseded_by_cycle_id as previous_superseded_by_cycle_id,
    previous_cycle.superseded_at as previous_superseded_at
  from pg_temp.bn_targeted_targets target
  join public.enrollments enrollment
    on substr(md5(enrollment.id::text), 1, 12) = target.enrollment_ref
  join public.companies company
    on company.id = enrollment.company_id
   and company.slug = 'bn-performance-training'
  join public.training_cycles cycle
    on cycle.enrollment_id = enrollment.id
   and substr(md5(cycle.id::text), 1, 12) = target.cycle_ref
  join public.training_cycles previous_cycle
    on previous_cycle.enrollment_id = enrollment.id
   and substr(md5(previous_cycle.id::text), 1, 12) = target.previous_cycle_ref
), deps as (
  select
    resolved.*,
    jsonb_build_object(
      'workouts', (select count(*) from public.workouts row_value where row_value.cycle_id = resolved.cycle_id and row_value.superseded_at is null),
      'all_workouts', (select count(*) from public.workouts row_value where row_value.cycle_id = resolved.cycle_id),
      'exercise_rows', coalesce((
        select sum(
          case
            when row_value.superseded_at is null and jsonb_typeof(coalesce(row_value.exercises, '[]'::jsonb)) = 'array'
              then jsonb_array_length(coalesce(row_value.exercises, '[]'::jsonb))
            else 0
          end
        )::integer
        from public.workouts row_value
        where row_value.cycle_id = resolved.cycle_id
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
      'active_prescription_bundles', (select count(*) from public.prescription_bundles row_value where row_value.training_cycle_id = resolved.cycle_id and row_value.status = 'active'),
      'prescription_bundle_items', (select count(*) from public.prescription_bundle_items row_value where row_value.entity_type = 'training_cycle' and row_value.entity_id = resolved.cycle_id),
      'intercycle_anamneses', (select count(*) from public.intercycle_anamneses row_value where row_value.training_cycle_id = resolved.cycle_id),
      'intercycle_deliveries', (select count(*) from public.intercycle_anamnesis_deliveries row_value where row_value.training_cycle_id = resolved.cycle_id),
      'intercycle_invites', (select count(*) from public.intercycle_anamnesis_invites row_value where row_value.training_cycle_id = resolved.cycle_id),
      'intercycle_waivers', (select count(*) from public.intercycle_anamnesis_waivers row_value where row_value.training_cycle_id = resolved.cycle_id or row_value.prior_cycle_id = resolved.cycle_id),
      'workout_archive_events', (select count(*) from public.workout_archive_events row_value where row_value.cycle_id = resolved.cycle_id),
      'cycle_clear_events', (select count(*) from public.cycle_prescription_clear_events row_value where row_value.cycle_id = resolved.cycle_id),
      'carried_over_refs', (select count(*) from public.enrollments row_value where row_value.carried_over_cycle_id = resolved.cycle_id)
    ) as before_dependencies,
    (
      select count(*)
      from public.workouts row_value
      where row_value.cycle_id = resolved.previous_cycle_id
        and row_value.superseded_at is null
    ) as previous_workouts,
    coalesce((
      select sum(
        case
          when row_value.superseded_at is null and jsonb_typeof(coalesce(row_value.exercises, '[]'::jsonb)) = 'array'
            then jsonb_array_length(coalesce(row_value.exercises, '[]'::jsonb))
          else 0
        end
      )::integer
      from public.workouts row_value
      where row_value.cycle_id = resolved.previous_cycle_id
    ), 0) as previous_exercise_rows
  from resolved
)
select
  deps.*,
  to_jsonb(cycle_row) as before_cycle,
  encode(extensions.digest(to_jsonb(cycle_row)::text, 'sha256'), 'hex') as before_sha256
from deps
join public.training_cycles cycle_row on cycle_row.id = deps.cycle_id;

create temporary table pg_temp.bn_targeted_preservation_before on commit drop as
with affected_enrollments as (
  select distinct enrollment_id from pg_temp.bn_targeted_candidates
), cycles as (
  select cycle.*
  from public.training_cycles cycle
  join affected_enrollments affected on affected.enrollment_id = cycle.enrollment_id
), workouts as (
  select workout.*
  from public.workouts workout
  join cycles cycle on cycle.id = workout.cycle_id
), workout_logs as (
  select log.*
  from public.workout_logs log
  join workouts workout on workout.id = log.workout_id
), workout_sessions as (
  select session.*
  from public.workout_sessions session
  join workouts workout on workout.id = session.workout_id
)
select *
from (values
  ('enrollments', (select count(*)::bigint from public.enrollments enrollment join affected_enrollments affected on affected.enrollment_id = enrollment.id), (select coalesce(md5(string_agg(to_jsonb(enrollment)::text, '|' order by enrollment.id)), '') from public.enrollments enrollment join affected_enrollments affected on affected.enrollment_id = enrollment.id)),
  ('workouts', (select count(*)::bigint from workouts), (select coalesce(md5(string_agg(to_jsonb(workouts)::text, '|' order by id)), '') from workouts)),
  ('workout_logs', (select count(*)::bigint from workout_logs), (select coalesce(md5(string_agg(to_jsonb(workout_logs)::text, '|' order by id)), '') from workout_logs)),
  ('workout_sessions', (select count(*)::bigint from workout_sessions), (select coalesce(md5(string_agg(to_jsonb(workout_sessions)::text, '|' order by id)), '') from workout_sessions)),
  ('running_plans', (select count(*)::bigint from public.running_plans row_value join cycles cycle on cycle.id = row_value.training_cycle_id), (select coalesce(md5(string_agg(to_jsonb(row_value)::text, '|' order by row_value.id)), '') from public.running_plans row_value join cycles cycle on cycle.id = row_value.training_cycle_id)),
  ('ai_strength_plans', (select count(*)::bigint from public.ai_strength_plans row_value join cycles cycle on cycle.id = row_value.training_cycle_id), (select coalesce(md5(string_agg(to_jsonb(row_value)::text, '|' order by row_value.id)), '') from public.ai_strength_plans row_value join cycles cycle on cycle.id = row_value.training_cycle_id)),
  ('prescription_bundles', (select count(*)::bigint from public.prescription_bundles row_value join cycles cycle on cycle.id = row_value.training_cycle_id), (select coalesce(md5(string_agg(to_jsonb(row_value)::text, '|' order by row_value.id)), '') from public.prescription_bundles row_value join cycles cycle on cycle.id = row_value.training_cycle_id))
) as snapshot(label, row_count, md5_hash);

do $manifest_gate$
declare
  v_expected_count constant integer := 4;
  v_expected_beforeimagehash constant text := '6bcfc8b3d08068df07978cdf11421a566c92e56e1d50ff86746ec46e11b2f968';
  v_count integer;
  v_beforeimagehash text;
begin
  select count(*) into v_count from pg_temp.bn_targeted_candidates;
  if v_count <> v_expected_count then
    raise exception 'bn_targeted_cycle_target_count_mismatch expected=% actual=%', v_expected_count, v_count;
  end if;

  if exists (
    select 1
    from pg_temp.bn_targeted_candidates
    group by cycle_id
    having count(*) <> 1
  ) then
    raise exception 'bn_targeted_cycle_duplicate_target';
  end if;

  select encode(extensions.digest(string_agg(concat_ws('|',
    action,
    enrollment_ref,
    cycle_ref,
    expected_start_date::text,
    expected_end_date::text,
    coalesce(new_start_date::text, ''),
    coalesce(new_end_date::text, ''),
    coalesce(previous_cycle_ref, ''),
    start_date::text,
    end_date::text,
    status,
    coalesce(delivery_status, ''),
    coalesce(name, ''),
    coalesce(prescribed_offline_at::text, ''),
    coalesce(previous_start_date::text, ''),
    coalesce(previous_end_date::text, ''),
    coalesce(previous_status, ''),
    coalesce(previous_delivery_status, ''),
    coalesce(previous_workouts::text, ''),
    coalesce(previous_exercise_rows::text, ''),
    before_dependencies->>'workouts',
    before_dependencies->>'all_workouts',
    before_dependencies->>'exercise_rows',
    before_dependencies->>'workout_logs',
    before_dependencies->>'workout_sessions',
    before_dependencies->>'cycle_feedback',
    before_dependencies->>'ai_plan_versions',
    before_dependencies->>'ai_strength_plans',
    before_dependencies->>'running_plans',
    before_dependencies->>'nutrition_plans',
    before_dependencies->>'prescription_bundles',
    before_dependencies->>'active_prescription_bundles',
    before_dependencies->>'prescription_bundle_items',
    before_dependencies->>'intercycle_anamneses',
    before_dependencies->>'intercycle_deliveries',
    before_dependencies->>'intercycle_invites',
    before_dependencies->>'intercycle_waivers',
    before_dependencies->>'workout_archive_events',
    before_dependencies->>'cycle_clear_events',
    before_dependencies->>'carried_over_refs',
    before_sha256
  ), E'\n' order by enrollment_ref, cycle_ref), 'sha256'), 'hex')
  into v_beforeimagehash
  from pg_temp.bn_targeted_candidates;

  if v_beforeimagehash is distinct from v_expected_beforeimagehash then
    raise exception 'bn_targeted_cycle_beforeimagehash_mismatch expected=% actual=%',
      v_expected_beforeimagehash, v_beforeimagehash;
  end if;

  if exists (
    select 1
    from pg_temp.bn_targeted_candidates
    where status = 'superseded'
       or superseded_by_cycle_id is not null
       or superseded_at is not null
       or previous_status = 'superseded'
       or previous_superseded_by_cycle_id is not null
       or previous_superseded_at is not null
       or start_date is distinct from expected_start_date
       or end_date is distinct from expected_end_date
       or start_date > end_date
  ) then
    raise exception 'bn_targeted_cycle_state_or_date_mismatch';
  end if;

  if exists (
    select 1
    from pg_temp.bn_targeted_candidates
    where action = 'close_active_before_sent_replacement'
      and (
        enrollment_ref <> '3530d245ed22'
        or cycle_ref <> '2024d5159013'
        or status <> 'active'
        or new_end_date is null
        or new_end_date <> previous_start_date - 1
        or new_end_date < start_date
        or previous_status <> 'pending'
        or previous_delivery_status <> 'sent'
        or coalesce(previous_workouts, 0) <= 0
        or coalesce(previous_exercise_rows, 0) <= 0
        or (before_dependencies->>'workouts')::int <> 11
        or (before_dependencies->>'exercise_rows')::int <> 116
        or (before_dependencies->>'workout_logs')::int <> 0
        or (before_dependencies->>'workout_sessions')::int <> 0
        or (before_dependencies->>'running_plans')::int <> 0
        or (before_dependencies->>'prescription_bundles')::int <> 0
        or (before_dependencies->>'intercycle_anamneses')::int <> 0
        or (before_dependencies->>'intercycle_deliveries')::int <> 0
        or (before_dependencies->>'intercycle_invites')::int <> 0
        or (before_dependencies->>'intercycle_waivers')::int <> 0
        or (before_dependencies->>'workout_archive_events')::int <> 0
        or (before_dependencies->>'cycle_clear_events')::int <> 0
        or (before_dependencies->>'carried_over_refs')::int <> 0
      )
  ) then
    raise exception 'bn_targeted_cycle_close_active_gate_failed';
  end if;

  if exists (
    select 1
    from pg_temp.bn_targeted_candidates
    where action = 'future_start_after_previous_end'
      and (
        status <> 'pending'
        or start_date <= public.current_business_date()
        or new_start_date is null
        or new_start_date <> previous_end_date + 1
        or new_start_date > end_date
        or previous_status = 'superseded'
        or previous_superseded_by_cycle_id is not null
        or previous_superseded_at is not null
        or (before_dependencies->>'workout_logs')::int <> 0
        or (before_dependencies->>'workout_sessions')::int <> 0
        or (before_dependencies->>'intercycle_anamneses')::int <> 0
        or (before_dependencies->>'intercycle_deliveries')::int <> 0
        or (before_dependencies->>'intercycle_invites')::int <> 0
        or (before_dependencies->>'intercycle_waivers')::int <> 0
        or (before_dependencies->>'workout_archive_events')::int <> 0
        or (before_dependencies->>'cycle_clear_events')::int <> 0
        or (before_dependencies->>'carried_over_refs')::int <> 0
      )
  ) then
    raise exception 'bn_targeted_cycle_future_boundary_gate_failed';
  end if;

  if exists (
    select 1
    from pg_temp.bn_targeted_candidates
    where enrollment_ref = 'd735907ca436'
      and (
        cycle_ref <> '5e8114de5c79'
        or new_start_date <> date '2026-10-15'
        or previous_cycle_ref <> '311f71c93012'
        or (before_dependencies->>'workouts')::int <> 0
        or (before_dependencies->>'exercise_rows')::int <> 0
        or (before_dependencies->>'running_plans')::int <> 0
        or (before_dependencies->>'prescription_bundles')::int <> 0
        or coalesce(previous_workouts, 0) <> 4
        or coalesce(previous_exercise_rows, 0) <> 40
      )
  ) then
    raise exception 'bn_targeted_cycle_aldylayne_boundary_not_empty_or_wrong_previous';
  end if;
end
$manifest_gate$;

do $residue_gate$
begin
  if exists (
    select 1
    from public.training_cycle_targeted_overlap_repair_audit
    where repair_key = 'bn_beatriz_aldylayne_cycles_20260909'
  ) then
    raise exception 'bn_targeted_cycle_repair_key_residue';
  end if;
end
$residue_gate$;

insert into public.training_cycle_targeted_overlap_repair_audit (
  repair_key,
  batch_sha256,
  scope,
  action,
  company_id,
  student_id,
  enrollment_id,
  cycle_id,
  previous_cycle_id,
  before_cycle,
  before_dependencies,
  before_sha256
)
select
  'bn_beatriz_aldylayne_cycles_20260909',
  '6bcfc8b3d08068df07978cdf11421a566c92e56e1d50ff86746ec46e11b2f968',
  'beatriz-active-replacement-and-aldylayne-empty-future-boundary',
  action,
  company_id,
  student_id,
  enrollment_id,
  cycle_id,
  previous_cycle_id,
  before_cycle,
  before_dependencies,
  before_sha256
from pg_temp.bn_targeted_candidates;

update public.training_cycles cycle
set end_date = candidate.new_end_date
from pg_temp.bn_targeted_candidates candidate
where cycle.id = candidate.cycle_id
  and candidate.action = 'close_active_before_sent_replacement'
  and cycle.end_date = candidate.expected_end_date
  and cycle.status = 'active'
  and cycle.superseded_by_cycle_id is null;

update public.training_cycles cycle
set start_date = candidate.new_start_date
from pg_temp.bn_targeted_candidates candidate
where cycle.id = candidate.cycle_id
  and candidate.action = 'future_start_after_previous_end'
  and cycle.start_date = candidate.expected_start_date
  and cycle.status = 'pending'
  and cycle.superseded_by_cycle_id is null;

update public.training_cycle_targeted_overlap_repair_audit audit
set after_cycle = to_jsonb(cycle),
    after_sha256 = encode(extensions.digest(to_jsonb(cycle)::text, 'sha256'), 'hex')
from public.training_cycles cycle
where audit.repair_key = 'bn_beatriz_aldylayne_cycles_20260909'
  and audit.cycle_id = cycle.id
  and audit.state = 'applied';

do $post_gate$
declare
  v_changed_count integer;
  v_beatriz_overlaps integer;
  v_aldylayne_overlaps integer;
  v_aldylayne_future_target_overlaps integer;
  v_preservation_mismatches integer;
begin
  select count(*) into v_changed_count
  from public.training_cycle_targeted_overlap_repair_audit audit
  where audit.repair_key = 'bn_beatriz_aldylayne_cycles_20260909'
    and audit.state = 'applied'
    and audit.after_sha256 is not null
    and audit.after_sha256 is distinct from audit.before_sha256;

  if v_changed_count <> 4 then
    raise exception 'bn_targeted_cycle_changed_count_mismatch expected=4 actual=%', v_changed_count;
  end if;

  if exists (
    select 1
    from public.training_cycle_targeted_overlap_repair_audit audit
    where audit.repair_key = 'bn_beatriz_aldylayne_cycles_20260909'
      and (
        (
          audit.action = 'close_active_before_sent_replacement'
          and ((audit.before_cycle - array['end_date', 'updated_at']) <> (audit.after_cycle - array['end_date', 'updated_at']))
        )
        or (
          audit.action = 'future_start_after_previous_end'
          and ((audit.before_cycle - array['start_date', 'updated_at']) <> (audit.after_cycle - array['start_date', 'updated_at']))
        )
      )
  ) then
    raise exception 'bn_targeted_cycle_unexpected_column_change';
  end if;

  with current_preservation as (
    with affected_enrollments as (
      select distinct enrollment_id from pg_temp.bn_targeted_candidates
    ), cycles as (
      select cycle.*
      from public.training_cycles cycle
      join affected_enrollments affected on affected.enrollment_id = cycle.enrollment_id
    ), workouts as (
      select workout.*
      from public.workouts workout
      join cycles cycle on cycle.id = workout.cycle_id
    ), workout_logs as (
      select log.*
      from public.workout_logs log
      join workouts workout on workout.id = log.workout_id
    ), workout_sessions as (
      select session.*
      from public.workout_sessions session
      join workouts workout on workout.id = session.workout_id
    )
    select *
    from (values
      ('enrollments', (select count(*)::bigint from public.enrollments enrollment join affected_enrollments affected on affected.enrollment_id = enrollment.id), (select coalesce(md5(string_agg(to_jsonb(enrollment)::text, '|' order by enrollment.id)), '') from public.enrollments enrollment join affected_enrollments affected on affected.enrollment_id = enrollment.id)),
      ('workouts', (select count(*)::bigint from workouts), (select coalesce(md5(string_agg(to_jsonb(workouts)::text, '|' order by id)), '') from workouts)),
      ('workout_logs', (select count(*)::bigint from workout_logs), (select coalesce(md5(string_agg(to_jsonb(workout_logs)::text, '|' order by id)), '') from workout_logs)),
      ('workout_sessions', (select count(*)::bigint from workout_sessions), (select coalesce(md5(string_agg(to_jsonb(workout_sessions)::text, '|' order by id)), '') from workout_sessions)),
      ('running_plans', (select count(*)::bigint from public.running_plans row_value join cycles cycle on cycle.id = row_value.training_cycle_id), (select coalesce(md5(string_agg(to_jsonb(row_value)::text, '|' order by row_value.id)), '') from public.running_plans row_value join cycles cycle on cycle.id = row_value.training_cycle_id)),
      ('ai_strength_plans', (select count(*)::bigint from public.ai_strength_plans row_value join cycles cycle on cycle.id = row_value.training_cycle_id), (select coalesce(md5(string_agg(to_jsonb(row_value)::text, '|' order by row_value.id)), '') from public.ai_strength_plans row_value join cycles cycle on cycle.id = row_value.training_cycle_id)),
      ('prescription_bundles', (select count(*)::bigint from public.prescription_bundles row_value join cycles cycle on cycle.id = row_value.training_cycle_id), (select coalesce(md5(string_agg(to_jsonb(row_value)::text, '|' order by row_value.id)), '') from public.prescription_bundles row_value join cycles cycle on cycle.id = row_value.training_cycle_id))
    ) as snapshot(label, row_count, md5_hash)
  )
  select count(*) into v_preservation_mismatches
  from pg_temp.bn_targeted_preservation_before before_snapshot
  join current_preservation after_snapshot using (label)
  where before_snapshot.row_count is distinct from after_snapshot.row_count
     or before_snapshot.md5_hash is distinct from after_snapshot.md5_hash;

  if v_preservation_mismatches <> 0 then
    raise exception 'bn_targeted_cycle_preservation_mismatch count=%', v_preservation_mismatches;
  end if;

  with visible_cycles as (
    select cycle.*
    from public.training_cycles cycle
    join public.enrollments enrollment on enrollment.id = cycle.enrollment_id
    where cycle.status <> 'superseded'
      and cycle.superseded_by_cycle_id is null
      and substr(md5(enrollment.id::text), 1, 12) = '3530d245ed22'
  )
  select count(*) into v_beatriz_overlaps
  from visible_cycles left_cycle
  join visible_cycles right_cycle
    on right_cycle.enrollment_id = left_cycle.enrollment_id
   and right_cycle.id > left_cycle.id
   and left_cycle.start_date <= right_cycle.end_date
   and right_cycle.start_date <= left_cycle.end_date
   and left_cycle.end_date >= public.current_business_date()
   and right_cycle.end_date >= public.current_business_date();

  if v_beatriz_overlaps <> 0 then
    raise exception 'bn_targeted_cycle_beatriz_remaining_overlap_count=%', v_beatriz_overlaps;
  end if;

  with visible_cycles as (
    select cycle.*
    from public.training_cycles cycle
    join public.enrollments enrollment on enrollment.id = cycle.enrollment_id
    where cycle.status <> 'superseded'
      and cycle.superseded_by_cycle_id is null
      and substr(md5(enrollment.id::text), 1, 12) = 'd735907ca436'
  ), pairs as (
    select
      substr(md5(left_cycle.id::text), 1, 12) as left_ref,
      substr(md5(right_cycle.id::text), 1, 12) as right_ref,
      least(left_cycle.end_date, right_cycle.end_date) - greatest(left_cycle.start_date, right_cycle.start_date) + 1 as overlap_days
    from visible_cycles left_cycle
    join visible_cycles right_cycle
      on right_cycle.enrollment_id = left_cycle.enrollment_id
     and right_cycle.id > left_cycle.id
     and left_cycle.start_date <= right_cycle.end_date
     and right_cycle.start_date <= left_cycle.end_date
     and left_cycle.end_date >= public.current_business_date()
     and right_cycle.end_date >= public.current_business_date()
  )
  select
    count(*),
    count(*) filter (where left_ref = '5e8114de5c79' or right_ref = '5e8114de5c79')
  into v_aldylayne_overlaps, v_aldylayne_future_target_overlaps
  from pairs
  where (left_ref, right_ref, overlap_days) is distinct from ('b41fde29a9c4', '311f71c93012', 40);

  if v_aldylayne_overlaps <> 0 or v_aldylayne_future_target_overlaps <> 0 then
    raise exception 'bn_targeted_cycle_aldylayne_unexpected_overlap_count=% target_overlap_count=%',
      v_aldylayne_overlaps, v_aldylayne_future_target_overlaps;
  end if;
end
$post_gate$;

select
  'bn_beatriz_aldylayne_cycles_20260909' as repair_key,
  '6bcfc8b3d08068df07978cdf11421a566c92e56e1d50ff86746ec46e11b2f968' as beforeimagehash,
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
from public.training_cycle_targeted_overlap_repair_audit audit
where audit.repair_key = 'bn_beatriz_aldylayne_cycles_20260909'
  and audit.state = 'applied';

commit;
