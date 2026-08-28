import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const stagingWorkdir =
  process.env.SETT_MFIT_STAGING_WORKDIR ??
  "/tmp/sett-mfit-staging-harness-20260828";
const migrationPath = new URL(
  "../supabase/migrations/20260828010500_consolidate_lossless_mfit_cycle_overlaps.sql",
  import.meta.url,
);
const rollbackPath = new URL("./mfit-overlap-repair-rollback.sql", import.meta.url);

function withoutTransaction(sql) {
  return sql
    .replace(/^([\s\S]*?\n)?begin;\s*/i, (match, prefix = "") => prefix)
    .replace(/\s*commit;\s*$/i, "\n");
}

function stagingFingerprintOverride() {
  return String.raw`
select set_config(
  'sett.mfit_expected_sha256',
  (
    select encode(extensions.digest(string_agg(
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
    from pg_temp.mfit_lossless_candidates
  ),
  true
);
`;
}

function useSessionFingerprint(sql, variableName) {
  const declaration = new RegExp(
    `${variableName} constant text := '[0-9a-f]{64}';`,
  );
  assert.match(sql, declaration);
  return sql.replace(
    declaration,
    `${variableName} constant text := current_setting('sett.mfit_expected_sha256', true);`,
  );
}

function syntheticSeedSql() {
  return String.raw`
-- Staging is intentionally older than production. These production columns and
-- the normalized exercise table exist only for this transaction and disappear
-- with the final ROLLBACK.
alter table public.training_cycles add column if not exists workouts jsonb;
alter table public.training_cycles add column if not exists notes text;
alter table public.training_cycles add column if not exists anamnese_id uuid;
alter table public.training_cycles add column if not exists bundle_id uuid;

create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade
);

create function pg_temp.synthetic_uuid(label text)
returns uuid language sql immutable strict as $$
  select (
    substr(md5(label), 1, 8) || '-' ||
    substr(md5(label), 9, 4) || '-' ||
    substr(md5(label), 13, 4) || '-' ||
    substr(md5(label), 17, 4) || '-' ||
    substr(md5(label), 21, 12)
  )::uuid
$$;

insert into public.companies (id, name, slug)
values (
  pg_temp.synthetic_uuid('mfit-staging-company'),
  'Synthetic MFIT staging tenant',
  'synthetic-mfit-staging-20260828'
);

insert into public.students (id, company_id, full_name, status)
select
  pg_temp.synthetic_uuid('mfit-staging-student-' || pair_no),
  pg_temp.synthetic_uuid('mfit-staging-company'),
  'Synthetic staging student ' || pair_no,
  'active'
from generate_series(1, 15) as pair_no;

insert into public.enrollments (id, company_id, student_id, status, start_date)
select
  pg_temp.synthetic_uuid('mfit-staging-enrollment-' || pair_no),
  pg_temp.synthetic_uuid('mfit-staging-company'),
  pg_temp.synthetic_uuid('mfit-staging-student-' || pair_no),
  'active',
  date '2035-01-01'
from generate_series(1, 15) as pair_no;

insert into public.training_cycles (
  id, enrollment_id, cycle_number, start_date, end_date, status,
  company_id, student_id, name, objective, duration_weeks, delivery_status
)
select
  pg_temp.synthetic_uuid('mfit-staging-original-cycle-' || pair_no),
  pg_temp.synthetic_uuid('mfit-staging-enrollment-' || pair_no),
  pair_no,
  date '2035-01-01' + ((pair_no - 1) * 50),
  date '2035-02-14' + ((pair_no - 1) * 50),
  case when pair_no = 15 then 'active' else 'completed' end,
  pg_temp.synthetic_uuid('mfit-staging-company'),
  pg_temp.synthetic_uuid('mfit-staging-student-' || pair_no),
  null,
  null,
  6,
  null
from generate_series(1, 15) as pair_no;

insert into public.training_cycles (
  id, enrollment_id, cycle_number, start_date, end_date, status,
  company_id, student_id, name, objective, duration_weeks, delivery_status
)
select
  pg_temp.synthetic_uuid('mfit-staging-imported-cycle-' || pair_no),
  pg_temp.synthetic_uuid('mfit-staging-enrollment-' || pair_no),
  100 + pair_no,
  date '2035-01-01' + ((pair_no - 1) * 50),
  date '2035-02-14' + ((pair_no - 1) * 50),
  case when pair_no = 15 then 'pending' else 'completed' end,
  pg_temp.synthetic_uuid('mfit-staging-company'),
  pg_temp.synthetic_uuid('mfit-staging-student-' || pair_no),
  'Synthetic imported cycle ' || pair_no,
  'Synthetic lossless staging objective',
  6,
  'ready'
from generate_series(1, 15) as pair_no;

with workout_inventory as (
  select
    pair_no,
    workout_no,
    row_number() over (order by pair_no, workout_no) as global_workout_no
  from generate_series(1, 15) as pair_no
  cross join lateral generate_series(1, case when pair_no <= 11 then 4 else 3 end) as workout_no
)
insert into public.workouts (
  id, cycle_id, name, notes, sort_order, company_id, created_at, updated_at
)
select
  pg_temp.synthetic_uuid('mfit-staging-workout-' || global_workout_no),
  pg_temp.synthetic_uuid('mfit-staging-imported-cycle-' || pair_no),
  'Synthetic workout ' || global_workout_no,
  'mfit-import:v1:' || md5('synthetic-pair-' || pair_no) || E'\nstaging-only',
  workout_no,
  pg_temp.synthetic_uuid('mfit-staging-company'),
  timestamptz '2034-12-01 12:00:00+00' + (global_workout_no || ' minutes')::interval,
  timestamptz '2034-12-01 12:00:00+00' + (global_workout_no || ' minutes')::interval
from workout_inventory;

with workout_inventory as (
  select
    global_workout_no,
    case when global_workout_no <= 17 then 9 else 8 end as exercise_count
  from generate_series(1, 56) as global_workout_no
)
insert into public.workout_exercises (id, workout_id)
select
  pg_temp.synthetic_uuid('mfit-staging-exercise-' || global_workout_no || '-' || exercise_no),
  pg_temp.synthetic_uuid('mfit-staging-workout-' || global_workout_no)
from workout_inventory
cross join lateral generate_series(1, exercise_count) as exercise_no;

do $synthetic_seed_assertions$
begin
  if (select count(*) from public.training_cycles
      where company_id = pg_temp.synthetic_uuid('mfit-staging-company')) <> 30
     or (select count(*) from public.workouts
      where company_id = pg_temp.synthetic_uuid('mfit-staging-company')) <> 56
     or (select count(*) from public.workout_exercises as exercise
      join public.workouts as workout on workout.id = exercise.workout_id
      where workout.company_id = pg_temp.synthetic_uuid('mfit-staging-company')) <> 465 then
    raise exception 'mfit_staging_seed_inventory_mismatch';
  end if;
end
$synthetic_seed_assertions$;
`;
}

function appliedAssertionsSql() {
  return String.raw`
do $synthetic_apply_assertions$
begin
  if (select count(*) from public.mfit_cycle_overlap_repairs
      where company_id = pg_temp.synthetic_uuid('mfit-staging-company')
        and state = 'applied') <> 15
     or (select count(*) from public.training_cycles
      where company_id = pg_temp.synthetic_uuid('mfit-staging-company')) <> 15 then
    raise exception 'mfit_staging_apply_cardinality_mismatch';
  end if;

  if exists (
    select 1
    from public.mfit_cycle_overlap_repairs as repair
    left join public.workouts as workout
      on workout.id = any(repair.workout_ids)
     and workout.cycle_id = repair.original_cycle_id
    where repair.company_id = pg_temp.synthetic_uuid('mfit-staging-company')
    group by repair.id, repair.workout_count
    having count(workout.id) <> repair.workout_count
  ) then
    raise exception 'mfit_staging_apply_workout_owner_mismatch';
  end if;
end
$synthetic_apply_assertions$;
`;
}

function rollbackAssertionsSql() {
  return String.raw`
do $synthetic_rollback_assertions$
begin
  if (select count(*) from public.mfit_cycle_overlap_repairs
      where company_id = pg_temp.synthetic_uuid('mfit-staging-company')
        and state = 'rolled_back') <> 15
     or (select count(*) from public.training_cycles
      where company_id = pg_temp.synthetic_uuid('mfit-staging-company')) <> 30
     or (select count(*) from public.workouts
      where company_id = pg_temp.synthetic_uuid('mfit-staging-company')) <> 56
     or (select count(*) from public.workout_exercises as exercise
      join public.workouts as workout on workout.id = exercise.workout_id
      where workout.company_id = pg_temp.synthetic_uuid('mfit-staging-company')) <> 465
     or exists (
       select 1
       from public.mfit_cycle_overlap_repairs as repair
       left join public.workouts as workout
         on workout.id = any(repair.workout_ids)
        and workout.cycle_id = repair.imported_cycle_id
       where repair.company_id = pg_temp.synthetic_uuid('mfit-staging-company')
       group by repair.id, repair.workout_count
       having count(workout.id) <> repair.workout_count
     ) then
    raise exception 'mfit_staging_rollback_inventory_mismatch';
  end if;
end
$synthetic_rollback_assertions$;
`;
}

test(
  "lossless MFIT consolidation applies and rolls back on isolated synthetic staging data",
  { timeout: 180_000 },
  async () => {
    const migration = withoutTransaction(await readFile(migrationPath, "utf8"));
    const rollback = withoutTransaction(await readFile(rollbackPath, "utf8"));
    assert.match(migration, /do \$mfit_lossless_repair\$/);

    const migrationWithStagingFingerprint = useSessionFingerprint(migration, "v_expected_sha256").replace(
      "do $mfit_lossless_repair$",
      `${stagingFingerprintOverride()}\ndo $mfit_lossless_repair$`,
    );
    const rollbackWithStagingFingerprint = useSessionFingerprint(rollback, "v_batch_sha256");

    const sql = [
      "begin;",
      syntheticSeedSql(),
      migrationWithStagingFingerprint,
      appliedAssertionsSql(),
      rollbackWithStagingFingerprint,
      rollbackAssertionsSql(),
      "rollback;",
      "select true as staging_round_trip_ok, 15 as repaired_cycles, 56 as preserved_workouts, 465 as preserved_exercise_rows;",
    ].join("\n");

    const result = spawnSync(
      "supabase",
      ["db", "query", "--linked", "--workdir", stagingWorkdir, "-o", "json", sql],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 180_000 },
    );

    assert.equal(
      result.status,
      0,
      `isolated staging round-trip failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
    const output = JSON.parse(result.stdout);
    const row = output.rows?.[0];
    assert.equal(row?.staging_round_trip_ok, true);
    assert.equal(Number(row?.repaired_cycles), 15);
    assert.equal(Number(row?.preserved_workouts), 56);
    assert.equal(Number(row?.preserved_exercise_rows), 465);
  },
);
