#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const modulePath = process.env.PGLITE_MODULE_PATH || "@electric-sql/pglite";
const { PGlite } = await import(modulePath);

const projectRoot = process.cwd();
const migrationPath = resolve(projectRoot, "supabase/migrations/20260914104500_return_workout_revision_rows.sql");
const migrationSql = await readFile(migrationPath, "utf8");

const ids = {
  actor: "10000000-0000-4000-8000-000000000001",
  company: "20000000-0000-4000-8000-000000000001",
  student: "30000000-0000-4000-8000-000000000001",
  enrollment: "40000000-0000-4000-8000-000000000001",
  cycle: "50000000-0000-4000-8000-000000000001",
};

const db = new PGlite();

await db.exec(`
  create schema if not exists auth;
  create schema if not exists extensions;
  create role anon;
  create role authenticated;
  create role service_role;
  create sequence public.pglite_uuid_seq;

  create or replace function public.gen_random_uuid()
  returns uuid
  language sql
  volatile
  as $$
    select ('00000000-0000-4000-8000-' || lpad(nextval('public.pglite_uuid_seq')::text, 12, '0'))::uuid
  $$;

  create or replace function auth.uid()
  returns uuid
  language sql
  stable
  as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  create or replace function public.current_business_date()
  returns date
  language sql
  stable
  as $$
    select date '2026-09-14'
  $$;

  create or replace function public.can_manage_staff_student(_company_id uuid, _student_id uuid)
  returns boolean
  language sql
  stable
  as $$
    select auth.uid() is not null and _company_id is not null and _student_id is not null
  $$;

  create table public.training_cycles (
    id uuid primary key,
    enrollment_id uuid not null,
    cycle_number integer not null,
    company_id uuid not null,
    student_id uuid not null,
    status text not null default 'active',
    superseded_by_cycle_id uuid,
    start_date date not null,
    end_date date not null
  );

  create table public.workouts (
    id uuid primary key default gen_random_uuid(),
    cycle_id uuid not null,
    company_id uuid not null,
    name text,
    title text,
    description text,
    day_of_week integer,
    sort_order integer,
    exercises jsonb not null default '[]'::jsonb,
    created_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    revision_id uuid,
    superseded_at timestamptz,
    superseded_by_revision_id uuid,
    superseded_reason text
  );

  create table public.ai_plan_versions (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null,
    student_id uuid not null,
    cycle_id uuid not null,
    plan jsonb not null,
    edited boolean not null default false,
    edit_summary text,
    created_by uuid,
    created_at timestamptz not null default now()
  );

  insert into public.training_cycles (
    id, enrollment_id, cycle_number, company_id, student_id, status, start_date, end_date
  ) values (
    '${ids.cycle}', '${ids.enrollment}', 1, '${ids.company}', '${ids.student}', 'active',
    date '2026-09-01', date '2026-10-12'
  );

  insert into public.workouts (
    id, cycle_id, company_id, name, title, description, day_of_week, sort_order, exercises,
    created_by, created_at, updated_at, revision_id
  ) values
    (
      '60000000-0000-4000-8000-000000000001', '${ids.cycle}', '${ids.company}',
      'Treino A', 'Treino A', 'base', 1, 1, '[{"exercise_id":"old-a"}]'::jsonb,
      '${ids.actor}', timestamptz '2026-09-14 08:00:00+00', timestamptz '2026-09-14 08:00:00+00',
      '70000000-0000-4000-8000-000000000001'
    ),
    (
      '60000000-0000-4000-8000-000000000002', '${ids.cycle}', '${ids.company}',
      'Treino B', 'Treino B', 'base', null, 2, '[{"exercise_id":"old-b"}]'::jsonb,
      '${ids.actor}', timestamptz '2026-09-14 08:01:00+00', timestamptz '2026-09-14 08:01:00+00',
      '70000000-0000-4000-8000-000000000001'
    );
`);

await db.exec(migrationSql);
await db.exec(`select set_config('request.jwt.claim.sub', '${ids.actor}', false);`);

const initial = await db.query(`
  select jsonb_agg(jsonb_build_object('id', id, 'updated_at', updated_at) order by sort_order, created_at) as expected
  from public.workouts
  where cycle_id = '${ids.cycle}' and superseded_at is null
`);
const expectedRows = JSON.stringify(initial.rows[0].expected);
const desiredOne = JSON.stringify([
  { title: "Treino A", description: "editado", day_of_week: 1, exercises: [{ exercise_id: "new-a" }] },
  { title: "Treino B", description: "editado", day_of_week: null, exercises: [{ exercise_id: "new-b" }] },
]);

const firstSave = await db.query(
  "select public.replace_cycle_workout_revision($1::uuid, $2::jsonb, $3::jsonb) as result",
  [ids.cycle, expectedRows, desiredOne],
);
const firstResult = firstSave.rows[0].result;
if (firstResult.workouts_created !== 2 || firstResult.workout_rows.length !== 2) {
  throw new Error(`first_save_bad_result ${JSON.stringify(firstResult)}`);
}
if (!firstResult.workout_rows.every((row) => row.id && row.updated_at)) {
  throw new Error("first_save_missing_confirmed_row_snapshot");
}

const desiredTwo = JSON.stringify([
  { title: "Treino A", description: "segunda edicao", day_of_week: 1, exercises: [{ exercise_id: "newer-a" }] },
  { title: "Treino B", description: "segunda edicao", day_of_week: null, exercises: [{ exercise_id: "newer-b" }] },
]);
const secondExpected = JSON.stringify(firstResult.workout_rows);
const secondSave = await db.query(
  "select public.replace_cycle_workout_revision($1::uuid, $2::jsonb, $3::jsonb) as result",
  [ids.cycle, secondExpected, desiredTwo],
);
const secondResult = secondSave.rows[0].result;
if (secondResult.workouts_created !== 2 || secondResult.workout_rows.length !== 2) {
  throw new Error(`second_save_bad_result ${JSON.stringify(secondResult)}`);
}

let staleRejected = false;
try {
  await db.query(
    "select public.replace_cycle_workout_revision($1::uuid, $2::jsonb, $3::jsonb)",
    [ids.cycle, expectedRows, desiredOne],
  );
} catch (error) {
  staleRejected = String(error?.message || error).includes("workout_revision_changed");
}
if (!staleRejected) throw new Error("stale_snapshot_was_accepted");

const removeOneWorkout = JSON.stringify([
  { title: "Treino A", description: "remove treino b", day_of_week: 1, exercises: [{ exercise_id: "kept-a" }] },
]);
const removeSave = await db.query(
  "select public.replace_cycle_workout_revision($1::uuid, $2::jsonb, $3::jsonb) as result",
  [ids.cycle, JSON.stringify(secondResult.workout_rows), removeOneWorkout],
);
const removeResult = removeSave.rows[0].result;
if (removeResult.workouts_created !== 1 || removeResult.workout_rows.length !== 1) {
  throw new Error(`remove_save_bad_result ${JSON.stringify(removeResult)}`);
}

const addWorkoutBack = JSON.stringify([
  { title: "Treino A", description: "mantido", day_of_week: 1, exercises: [{ exercise_id: "kept-a" }] },
  { title: "Treino C", description: "adicionado", day_of_week: null, exercises: [{ exercise_id: "added-c" }] },
]);
const addSave = await db.query(
  "select public.replace_cycle_workout_revision($1::uuid, $2::jsonb, $3::jsonb) as result",
  [ids.cycle, JSON.stringify(removeResult.workout_rows), addWorkoutBack],
);
const addResult = addSave.rows[0].result;
if (addResult.workouts_created !== 2 || addResult.workout_rows.length !== 2) {
  throw new Error(`add_save_bad_result ${JSON.stringify(addResult)}`);
}

const summary = await db.query(`
  select
    count(*) filter (where superseded_at is null)::int as current_rows,
    count(*) filter (where superseded_at is not null)::int as superseded_rows,
    array_agg(day_of_week order by sort_order, created_at) filter (where superseded_at is null) as current_days,
    count(distinct revision_id) filter (where superseded_at is null)::int as current_revisions,
    count(*) filter (where superseded_at is null and updated_at is null)::int as current_rows_without_updated_at,
    (select count(*)::int from public.ai_plan_versions) as version_rows
  from public.workouts
  where cycle_id = '${ids.cycle}'
`);
const row = summary.rows[0];
if (
  row.current_rows !== 2
  || row.superseded_rows !== 7
  || JSON.stringify(row.current_days) !== JSON.stringify([1, null])
  || row.current_revisions !== 1
  || row.current_rows_without_updated_at !== 0
  || row.version_rows !== 4
) {
  throw new Error(`contract_summary_failed ${JSON.stringify(row)}`);
}

console.log(JSON.stringify({
  ok: true,
  firstWorkoutRows: firstResult.workout_rows.length,
  secondWorkoutRows: secondResult.workout_rows.length,
  removeWorkoutRows: removeResult.workout_rows.length,
  addWorkoutRows: addResult.workout_rows.length,
  staleRejected,
  summary: row,
}, null, 2));
