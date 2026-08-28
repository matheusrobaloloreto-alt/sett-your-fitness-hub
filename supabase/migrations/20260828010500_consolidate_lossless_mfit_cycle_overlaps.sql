-- Consolidate only the 15 legacy MFIT overlaps that are provably lossless.
-- The canonical enrollment cycle remains; MFIT workouts are moved into it.
-- Three semantic conflicts and one cycle with real usage are intentionally
-- excluded by the dependency gates below.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

select pg_advisory_xact_lock(hashtextextended('sett:mfit-cycle-overlap-repair:v1', 0));

do $mfit_lossless_schema_preflight$
declare
  v_table text;
  v_missing_columns text;
begin
  if to_regprocedure('extensions.digest(text,text)') is null then
    raise exception 'mfit_lossless_missing_extensions_digest';
  end if;

  foreach v_table in array array[
    'training_cycles', 'workouts', 'workout_exercises', 'workout_logs',
    'workout_sessions', 'cycle_feedback', 'ai_plan_versions',
    'ai_strength_plans', 'running_plans', 'nutrition_plans',
    'prescription_bundles'
  ]
  loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'mfit_lossless_missing_table=%', v_table;
    end if;
  end loop;

  select string_agg(required.table_name || '.' || required.column_name, ', ' order by required.table_name, required.column_name)
  into v_missing_columns
  from (values
    ('training_cycles', 'id'), ('training_cycles', 'company_id'),
    ('training_cycles', 'student_id'), ('training_cycles', 'enrollment_id'),
    ('training_cycles', 'cycle_number'), ('training_cycles', 'start_date'),
    ('training_cycles', 'end_date'), ('training_cycles', 'status'),
    ('training_cycles', 'name'), ('training_cycles', 'objective'),
    ('training_cycles', 'duration_weeks'), ('training_cycles', 'workouts'),
    ('training_cycles', 'notes'), ('training_cycles', 'anamnese_id'),
    ('training_cycles', 'bundle_id'), ('training_cycles', 'delivery_status'),
    ('training_cycles', 'prescribed_offline_at'),
    ('training_cycles', 'prescribed_offline_by'),
    ('training_cycles', 'prescribed_offline_note'),
    ('workouts', 'id'), ('workouts', 'cycle_id'), ('workouts', 'company_id'),
    ('workouts', 'notes'), ('workouts', 'sort_order'), ('workouts', 'updated_at'),
    ('workout_exercises', 'workout_id'), ('workout_logs', 'workout_id'),
    ('workout_sessions', 'workout_id'), ('cycle_feedback', 'cycle_id'),
    ('ai_plan_versions', 'cycle_id'), ('ai_strength_plans', 'training_cycle_id'),
    ('running_plans', 'training_cycle_id'),
    ('nutrition_plans', 'training_cycle_id'),
    ('prescription_bundles', 'training_cycle_id')
  ) as required(table_name, column_name)
  where not exists (
    select 1
    from information_schema.columns as actual
    where actual.table_schema = 'public'
      and actual.table_name = required.table_name
      and actual.column_name = required.column_name
  );

  if v_missing_columns is not null then
    raise exception 'mfit_lossless_missing_columns=%', v_missing_columns;
  end if;
end
$mfit_lossless_schema_preflight$;

create table if not exists public.mfit_cycle_overlap_repairs (
  id uuid primary key default gen_random_uuid(),
  batch_sha256 text not null,
  company_id uuid not null,
  student_id uuid not null,
  enrollment_id uuid not null,
  imported_cycle_id uuid not null unique,
  original_cycle_id uuid not null,
  imported_cycle_snapshot jsonb not null,
  original_cycle_snapshot jsonb not null,
  workout_snapshots jsonb not null,
  imported_cycle_snapshot_sha256 text not null,
  original_cycle_snapshot_sha256 text not null,
  workout_snapshots_sha256 text not null,
  workout_ids uuid[] not null,
  workout_count integer not null check (workout_count > 0),
  exercise_row_count integer not null check (exercise_row_count >= 0),
  state text not null default 'applied' check (state in ('applied', 'rolled_back')),
  applied_at timestamptz not null default now(),
  rolled_back_at timestamptz
);

create index if not exists idx_mfit_cycle_overlap_repairs_batch
  on public.mfit_cycle_overlap_repairs (batch_sha256, applied_at);

alter table public.mfit_cycle_overlap_repairs enable row level security;
revoke all on table public.mfit_cycle_overlap_repairs from public, anon, authenticated;
grant select on table public.mfit_cycle_overlap_repairs to service_role;

comment on table public.mfit_cycle_overlap_repairs is
  'Restricted before-images for the evidence-backed 2026-08-28 lossless MFIT cycle consolidation. No public mutation API exists.';

-- Prevent a soft reference or a new workout/session from appearing between
-- classification and mutation. If production is busy, lock_timeout aborts the
-- whole migration without partial writes.
lock table
  public.training_cycles,
  public.workouts,
  public.workout_exercises,
  public.workout_logs,
  public.workout_sessions,
  public.cycle_feedback,
  public.ai_plan_versions,
  public.ai_strength_plans,
  public.running_plans,
  public.nutrition_plans,
  public.prescription_bundles
in share row exclusive mode;

create temporary table pg_temp.mfit_lossless_candidates
on commit drop
as
with marker_workouts as (
  select
    workout.*,
    substring(
      split_part(coalesce(workout.notes, ''), E'\n', 1)
      from '^mfit-import:v1:([0-9a-f]+)$'
    ) as marker_hash
  from public.workouts as workout
  where split_part(coalesce(workout.notes, ''), E'\n', 1) like 'mfit-import:v1:%'
),
imported_cycles as (
  select
    cycle.*,
    count(workout.id)::integer as imported_workouts,
    count(*) filter (where workout.marker_hash is null)::integer as imported_non_mfit_workouts,
    count(distinct workout.marker_hash)::integer as marker_count,
    array_agg(workout.id order by workout.sort_order, workout.id) as imported_workout_ids,
    encode(extensions.digest(to_jsonb(cycle)::text, 'sha256'), 'hex') as imported_cycle_snapshot_sha256,
    encode(extensions.digest(
      string_agg((to_jsonb(workout) - 'marker_hash')::text, E'\n' order by workout.id),
      'sha256'
    ), 'hex') as imported_workouts_snapshot_sha256
  from public.training_cycles as cycle
  join marker_workouts as workout on workout.cycle_id = cycle.id
  group by cycle.id
),
paired as (
  select
    imported.id as imported_cycle_id,
    original.id as original_cycle_id,
    imported.company_id,
    imported.student_id,
    imported.enrollment_id,
    imported.cycle_number as imported_cycle_number,
    original.cycle_number as original_cycle_number,
    imported.start_date,
    imported.end_date,
    imported.status as imported_status,
    original.status as original_status,
    imported.imported_workouts,
    imported.imported_non_mfit_workouts,
    imported.marker_count,
    imported.imported_workout_ids,
    imported.imported_cycle_snapshot_sha256,
    imported.imported_workouts_snapshot_sha256,
    imported.name as imported_name,
    imported.objective as imported_objective,
    imported.duration_weeks as imported_duration_weeks,
    imported.workouts as imported_workouts_json,
    imported.notes as imported_notes,
    imported.anamnese_id as imported_anamnese_id,
    imported.bundle_id as imported_bundle_id,
    imported.delivery_status as imported_delivery_status,
    imported.prescribed_offline_at as imported_prescribed_offline_at,
    imported.prescribed_offline_by as imported_prescribed_offline_by,
    imported.prescribed_offline_note as imported_prescribed_offline_note,
    original.name as original_name,
    original.objective as original_objective,
    original.duration_weeks as original_duration_weeks,
    original.workouts as original_workouts_json,
    original.notes as original_notes,
    original.anamnese_id as original_anamnese_id,
    original.bundle_id as original_bundle_id,
    original.delivery_status as original_delivery_status,
    original.prescribed_offline_at as original_prescribed_offline_at,
    original.prescribed_offline_by as original_prescribed_offline_by,
    original.prescribed_offline_note as original_prescribed_offline_note,
    encode(extensions.digest(to_jsonb(original)::text, 'sha256'), 'hex') as original_cycle_snapshot_sha256,
    count(*) over (partition by imported.id) as originals_for_imported,
    count(*) over (partition by original.id) as imported_for_original
  from imported_cycles as imported
  join public.training_cycles as original
    on original.company_id = imported.company_id
   and original.student_id = imported.student_id
   and original.enrollment_id = imported.enrollment_id
   and original.id <> imported.id
   and not exists (
     select 1 from marker_workouts as marker where marker.cycle_id = original.id
   )
   and imported.start_date = original.start_date
   and abs(imported.end_date - original.end_date) <= 1
),
gated as (
  select
    paired.*,
    (select count(*)::integer from public.workout_exercises as exercise
      where exercise.workout_id = any(paired.imported_workout_ids)) as imported_workout_exercise_rows,
    not exists (
      select 1 from public.workouts as workout
      where workout.id = any(paired.imported_workout_ids)
        and workout.company_id is not null
        and workout.company_id <> paired.company_id
    ) as workout_company_scope_valid,
    not exists (select 1 from public.workouts where cycle_id = paired.original_cycle_id)
      and not exists (select 1 from public.cycle_feedback where cycle_id = paired.original_cycle_id)
      and not exists (select 1 from public.ai_plan_versions where cycle_id = paired.original_cycle_id)
      and not exists (select 1 from public.ai_strength_plans where training_cycle_id = paired.original_cycle_id)
      and not exists (select 1 from public.running_plans where training_cycle_id = paired.original_cycle_id)
      and not exists (select 1 from public.nutrition_plans where training_cycle_id = paired.original_cycle_id)
      and not exists (select 1 from public.prescription_bundles where training_cycle_id = paired.original_cycle_id)
      as original_cycle_is_unreferenced,
    not exists (select 1 from public.workout_logs where workout_id = any(paired.imported_workout_ids))
      and not exists (select 1 from public.workout_sessions where workout_id = any(paired.imported_workout_ids))
      and not exists (select 1 from public.cycle_feedback where cycle_id = paired.imported_cycle_id)
      and not exists (select 1 from public.ai_plan_versions where cycle_id = paired.imported_cycle_id)
      and not exists (select 1 from public.ai_strength_plans where training_cycle_id = paired.imported_cycle_id)
      and not exists (select 1 from public.running_plans where training_cycle_id = paired.imported_cycle_id)
      and not exists (select 1 from public.nutrition_plans where training_cycle_id = paired.imported_cycle_id)
      and not exists (select 1 from public.prescription_bundles where training_cycle_id = paired.imported_cycle_id)
      as imported_cycle_has_no_history,
    not (
      (original_name is not null and imported_name is not null and original_name is distinct from imported_name)
      or (original_objective is not null and imported_objective is not null and original_objective is distinct from imported_objective)
      or (original_duration_weeks is not null and imported_duration_weeks is not null and original_duration_weeks is distinct from imported_duration_weeks)
      or (original_workouts_json is not null and imported_workouts_json is not null and original_workouts_json is distinct from imported_workouts_json)
      or (original_notes is not null and imported_notes is not null and original_notes is distinct from imported_notes)
      or (original_anamnese_id is not null and imported_anamnese_id is not null and original_anamnese_id is distinct from imported_anamnese_id)
      or (original_bundle_id is not null and imported_bundle_id is not null and original_bundle_id is distinct from imported_bundle_id)
      or (original_delivery_status is not null and imported_delivery_status is not null and original_delivery_status is distinct from imported_delivery_status)
      or (original_prescribed_offline_at is not null and imported_prescribed_offline_at is not null and original_prescribed_offline_at is distinct from imported_prescribed_offline_at)
      or (original_prescribed_offline_by is not null and imported_prescribed_offline_by is not null and original_prescribed_offline_by is distinct from imported_prescribed_offline_by)
      or (original_prescribed_offline_note is not null and imported_prescribed_offline_note is not null and original_prescribed_offline_note is distinct from imported_prescribed_offline_note)
    ) as metadata_is_mergeable
  from paired
)
select
  imported_cycle_id,
  original_cycle_id,
  company_id,
  student_id,
  enrollment_id,
  imported_cycle_number,
  original_cycle_number,
  start_date,
  end_date,
  imported_status,
  original_status,
  imported_workouts,
  imported_workout_exercise_rows,
  imported_workout_ids,
  imported_cycle_snapshot_sha256,
  original_cycle_snapshot_sha256,
  imported_workouts_snapshot_sha256,
  imported_name,
  imported_objective,
  imported_duration_weeks,
  imported_workouts_json,
  imported_notes,
  imported_anamnese_id,
  imported_bundle_id,
  imported_delivery_status,
  imported_prescribed_offline_at,
  imported_prescribed_offline_by,
  imported_prescribed_offline_note
from gated
where originals_for_imported = 1
  and imported_for_original = 1
  and imported_non_mfit_workouts = 0
  and marker_count = 1
  and workout_company_scope_valid
  and original_cycle_is_unreferenced
  and imported_cycle_has_no_history
  and metadata_is_mergeable;

do $mfit_lossless_repair$
declare
  v_expected_count constant integer := 15;
  v_expected_workouts constant integer := 56;
  v_expected_exercise_rows constant integer := 465;
  v_expected_sha256 constant text := '943ddc3130e12cece0b1d46fefecd9d5fbd84b0ac7b887b2311f2d3a58ab0070';
  v_count integer;
  v_workouts integer;
  v_exercise_rows integer;
  v_sha256 text;
  v_affected integer;
begin
  select
    count(*)::integer,
    coalesce(sum(imported_workouts), 0)::integer,
    coalesce(sum(imported_workout_exercise_rows), 0)::integer,
    encode(extensions.digest(string_agg(
      concat_ws('|',
        company_id::text,
        student_id::text,
        enrollment_id::text,
        imported_cycle_id::text,
        original_cycle_id::text,
        imported_cycle_snapshot_sha256,
        original_cycle_snapshot_sha256,
        imported_workouts_snapshot_sha256,
        array_to_string(imported_workout_ids, ','),
        imported_workouts::text,
        imported_workout_exercise_rows::text,
        imported_cycle_number::text,
        original_cycle_number::text,
        start_date::text,
        end_date::text,
        coalesce(imported_status, ''),
        coalesce(original_status, '')
      ),
      E'\n' order by imported_cycle_id
    ), 'sha256'), 'hex')
  into v_count, v_workouts, v_exercise_rows, v_sha256
  from pg_temp.mfit_lossless_candidates;

  if v_count <> v_expected_count
     or v_workouts <> v_expected_workouts
     or v_exercise_rows <> v_expected_exercise_rows
     or v_sha256 is distinct from v_expected_sha256 then
    raise exception 'mfit_lossless_manifest_changed count=% workouts=% rows=% sha=%',
      v_count, v_workouts, v_exercise_rows, coalesce(v_sha256, 'null');
  end if;

  if exists (
    select 1 from public.mfit_cycle_overlap_repairs
    where batch_sha256 = v_expected_sha256 or imported_cycle_id in (
      select imported_cycle_id from pg_temp.mfit_lossless_candidates
    )
  ) then
    raise exception 'mfit_lossless_repair_already_recorded';
  end if;

  insert into public.mfit_cycle_overlap_repairs (
    batch_sha256,
    company_id,
    student_id,
    enrollment_id,
    imported_cycle_id,
    original_cycle_id,
    imported_cycle_snapshot,
    original_cycle_snapshot,
    workout_snapshots,
    imported_cycle_snapshot_sha256,
    original_cycle_snapshot_sha256,
    workout_snapshots_sha256,
    workout_ids,
    workout_count,
    exercise_row_count
  )
  select
    v_expected_sha256,
    candidate.company_id,
    candidate.student_id,
    candidate.enrollment_id,
    candidate.imported_cycle_id,
    candidate.original_cycle_id,
    to_jsonb(imported_cycle),
    to_jsonb(original_cycle),
    (
      select jsonb_agg(to_jsonb(workout) order by workout.sort_order, workout.id)
      from public.workouts as workout
      where workout.id = any(candidate.imported_workout_ids)
    ),
    candidate.imported_cycle_snapshot_sha256,
    candidate.original_cycle_snapshot_sha256,
    candidate.imported_workouts_snapshot_sha256,
    candidate.imported_workout_ids,
    candidate.imported_workouts,
    candidate.imported_workout_exercise_rows
  from pg_temp.mfit_lossless_candidates as candidate
  join public.training_cycles as imported_cycle on imported_cycle.id = candidate.imported_cycle_id
  join public.training_cycles as original_cycle on original_cycle.id = candidate.original_cycle_id;

  get diagnostics v_affected = row_count;
  if v_affected <> v_expected_count then
    raise exception 'mfit_lossless_backup_count_mismatch expected=% actual=%', v_expected_count, v_affected;
  end if;

  update public.workouts as workout
  set
    cycle_id = candidate.original_cycle_id,
    updated_at = now()
  from pg_temp.mfit_lossless_candidates as candidate
  where workout.id = any(candidate.imported_workout_ids)
    and workout.cycle_id = candidate.imported_cycle_id
    and split_part(coalesce(workout.notes, ''), E'\n', 1) like 'mfit-import:v1:%';

  get diagnostics v_affected = row_count;
  if v_affected <> v_expected_workouts then
    raise exception 'mfit_lossless_workout_move_mismatch expected=% actual=%', v_expected_workouts, v_affected;
  end if;

  update public.training_cycles as original
  set
    name = coalesce(original.name, candidate.imported_name),
    objective = coalesce(original.objective, candidate.imported_objective),
    duration_weeks = coalesce(original.duration_weeks, candidate.imported_duration_weeks),
    workouts = coalesce(original.workouts, candidate.imported_workouts_json),
    notes = coalesce(original.notes, candidate.imported_notes),
    anamnese_id = coalesce(original.anamnese_id, candidate.imported_anamnese_id),
    bundle_id = coalesce(original.bundle_id, candidate.imported_bundle_id),
    delivery_status = coalesce(original.delivery_status, candidate.imported_delivery_status),
    prescribed_offline_at = coalesce(original.prescribed_offline_at, candidate.imported_prescribed_offline_at),
    prescribed_offline_by = coalesce(original.prescribed_offline_by, candidate.imported_prescribed_offline_by),
    prescribed_offline_note = coalesce(original.prescribed_offline_note, candidate.imported_prescribed_offline_note)
  from pg_temp.mfit_lossless_candidates as candidate
  where original.id = candidate.original_cycle_id;

  get diagnostics v_affected = row_count;
  if v_affected <> v_expected_count then
    raise exception 'mfit_lossless_target_merge_mismatch expected=% actual=%', v_expected_count, v_affected;
  end if;

  delete from public.training_cycles as imported
  using pg_temp.mfit_lossless_candidates as candidate
  where imported.id = candidate.imported_cycle_id
    and not exists (
      select 1 from public.workouts as workout where workout.cycle_id = imported.id
    )
    and not exists (
      select 1 from public.cycle_feedback as feedback where feedback.cycle_id = imported.id
    )
    and not exists (
      select 1 from public.ai_plan_versions as version where version.cycle_id = imported.id
    )
    and not exists (
      select 1 from public.ai_strength_plans as plan where plan.training_cycle_id = imported.id
    )
    and not exists (
      select 1 from public.running_plans as plan where plan.training_cycle_id = imported.id
    )
    and not exists (
      select 1 from public.nutrition_plans as plan where plan.training_cycle_id = imported.id
    )
    and not exists (
      select 1 from public.prescription_bundles as bundle where bundle.training_cycle_id = imported.id
    );

  get diagnostics v_affected = row_count;
  if v_affected <> v_expected_count then
    raise exception 'mfit_lossless_source_delete_mismatch expected=% actual=%', v_expected_count, v_affected;
  end if;

  if exists (
    select 1
    from pg_temp.mfit_lossless_candidates as candidate
    join public.training_cycles as imported on imported.id = candidate.imported_cycle_id
  ) then
    raise exception 'mfit_lossless_source_cycle_survived';
  end if;

  select count(*)::integer into v_affected
  from public.workouts as workout
  join pg_temp.mfit_lossless_candidates as candidate
    on workout.id = any(candidate.imported_workout_ids)
   and workout.cycle_id = candidate.original_cycle_id;
  if v_affected <> v_expected_workouts then
    raise exception 'mfit_lossless_post_move_count_mismatch expected=% actual=%', v_expected_workouts, v_affected;
  end if;

  select count(*)::integer into v_affected
  from public.workout_exercises as exercise
  where exercise.workout_id in (
    select unnest(imported_workout_ids) from pg_temp.mfit_lossless_candidates
  );
  if v_affected <> v_expected_exercise_rows then
    raise exception 'mfit_lossless_post_exercise_count_mismatch expected=% actual=%', v_expected_exercise_rows, v_affected;
  end if;
end
$mfit_lossless_repair$;

commit;
