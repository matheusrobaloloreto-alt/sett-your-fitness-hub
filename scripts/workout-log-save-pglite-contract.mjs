#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// In-memory SQL only; no application client, credentials or remote database.
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || "@electric-sql/pglite");
const migrationPath = resolve(process.cwd(), "supabase/migrations/20260928065519_workout_logs_fractional_rpe_idempotency.sql");
const legacySql = await readFile(resolve(process.cwd(), "supabase/migrations/20260825210000_enforce_workout_set_types_wnf.sql"), "utf8");
const migrationSql = await readFile(migrationPath, "utf8");
const legacyContract = process.argv.includes("--legacy-contract");
const ids = {
  actor: "10000000-0000-4000-8000-000000000001",
  otherActor: "10000000-0000-4000-8000-000000000002",
  staff: "10000000-0000-4000-8000-000000000003",
  outsider: "10000000-0000-4000-8000-000000000004",
  company: "20000000-0000-4000-8000-000000000001",
  otherCompany: "20000000-0000-4000-8000-000000000002",
  student: "30000000-0000-4000-8000-000000000001",
  otherStudent: "30000000-0000-4000-8000-000000000002",
  cycle: "40000000-0000-4000-8000-000000000001",
  otherCycle: "40000000-0000-4000-8000-000000000002",
  workout: "50000000-0000-4000-8000-000000000001",
  otherWorkout: "50000000-0000-4000-8000-000000000002",
};
const db = new PGlite();
const checks = [];
const observations = [];
let sessionDate;

async function actor(user = ids.actor, role = "authenticated") {
  assert.ok(["authenticated", "anon", "service_role"].includes(role));
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', $2, true)", [user || "", role]);
  await db.exec(`set local role ${role}`);
}

function log(overrides = {}) {
  return {
    student_id: ids.student, workout_id: ids.workout, exercise_index: 0,
    set_number: 1, session_date: sessionDate, weight: 40, reps_done: 10,
    set_type: "normal", rpe: 8, completed: true, base_revision: null,
    ...overrides,
  };
}

async function save(rows) {
  return (await db.query("select public.save_workout_logs_if_current($1::jsonb) as result", [JSON.stringify(rows)])).rows[0].result;
}

function saved(result, count = 1) {
  assert.deepEqual(result.conflicts, [], "unexpected CAS conflict");
  assert.equal(result.saved.length, count, "wrong acknowledged row count");
  return result.saved[0];
}

async function snapshot() {
  return (await db.query(`select jsonb_build_object(
    'logs', (select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]') from public.workout_logs t),
    'workouts', (select jsonb_agg(to_jsonb(t) order by id) from public.workouts t),
    'cycles', (select jsonb_agg(to_jsonb(t) order by id) from public.training_cycles t),
    'students', (select jsonb_agg(to_jsonb(t) order by id) from public.students t),
    'staff', (select jsonb_agg(to_jsonb(t) order by user_id) from public.company_staff t)
  ) as state`)).rows[0].state;
}

async function rejected(rows, pattern, code) {
  const before = await snapshot();
  await db.exec("savepoint rejected_request");
  let error;
  try { await save(rows); } catch (caught) { error = caught; }
  await db.exec("rollback to savepoint rejected_request; release savepoint rejected_request");
  assert.ok(error, "invalid or unauthorized request was accepted");
  if (pattern) assert.match(error.message, pattern);
  if (code) assert.equal(error.code, code);
  assert.deepEqual(await snapshot(), before, "rejected request left writes behind");
}

async function conflict(rows) {
  const before = await snapshot();
  const result = await save(rows);
  assert.deepEqual(result.saved, [], "conflicting batch partially acknowledged writes");
  assert.ok(result.conflicts.length > 0, "stale different payload was accepted");
  assert.deepEqual(await snapshot(), before, "conflicting batch partially mutated data");
  return result;
}

async function check(name, body) {
  await db.exec("reset role; begin");
  try {
    await actor();
    await body();
    checks.push({ name, ok: true });
  } catch (error) {
    checks.push({ name, ok: false, code: error.code || "ASSERTION", message: String(error.message).split("\n")[0] });
  } finally {
    // ROLLBACK must precede RESET ROLE after a SQL error (25P02 otherwise).
    await db.exec("rollback");
    await db.exec("reset role");
  }
}

try {
  await db.exec(`
    create schema auth;
    create role anon;
    create role authenticated;
    create role service_role;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role', true), '')
    $$;
    create table public.company_staff (user_id uuid not null, company_id uuid not null, primary key (user_id, company_id));
    create function public.is_company_staff(_user_id uuid, _company_id uuid) returns boolean language sql stable as $$
      select exists(select 1 from public.company_staff where user_id = _user_id and company_id = _company_id)
    $$;
    create table public.students (id uuid primary key, user_id uuid, company_id uuid not null);
    create table public.training_cycles (id uuid primary key, student_id uuid not null references public.students(id), company_id uuid not null);
    create table public.workouts (id uuid primary key, cycle_id uuid not null references public.training_cycles(id), company_id uuid not null, exercises jsonb not null);
    create table public.workout_logs (
      id uuid primary key default gen_random_uuid(),
      student_id uuid not null references public.students(id),
      workout_id uuid not null references public.workouts(id),
      exercise_index integer not null, set_number integer not null, session_date date not null,
      weight numeric, reps_done integer, set_type text, rpe smallint, completed boolean,
      revision bigint not null default 1, created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(student_id, workout_id, exercise_index, set_number, session_date)
    );
    -- Same revision semantics as 20260814203000: any UPDATE increments revision.
    create function public.touch_workout_log_revision() returns trigger language plpgsql
    set search_path = public, pg_temp as $$
    begin
      new.revision := old.revision + 1;
      new.updated_at := now();
      return new;
    end;
    $$;
    create trigger touch_workout_log_revision before update on public.workout_logs
      for each row execute function public.touch_workout_log_revision();
    insert into public.students values
      ('${ids.student}', '${ids.actor}', '${ids.company}'),
      ('${ids.otherStudent}', '${ids.otherActor}', '${ids.otherCompany}');
    insert into public.training_cycles values
      ('${ids.cycle}', '${ids.student}', '${ids.company}'),
      ('${ids.otherCycle}', '${ids.otherStudent}', '${ids.otherCompany}');
    insert into public.workouts values
      ('${ids.workout}', '${ids.cycle}', '${ids.company}', '[{"sets":3,"weekly_prescription":[{"sets":5}]},{"sets":3},{"sets":3}]'),
      ('${ids.otherWorkout}', '${ids.otherCycle}', '${ids.otherCompany}', '[{"sets":3}]');
    insert into public.company_staff values ('${ids.staff}', '${ids.company}');
    grant usage on schema public, auth to authenticated, anon, service_role;
    grant select on public.workout_logs, public.workouts, public.training_cycles, public.students, public.company_staff to authenticated, anon, service_role;
  `);
  sessionDate = (await db.query("select to_char(current_date, 'YYYY-MM-DD') as date")).rows[0].date;
  await db.exec(legacySql);

  await check("legacy fractional RPE 9.5 fails with SQLSTATE 22P02", async () => {
    await rejected([log({ rpe: 9.5 })], /smallint/, "22P02");
  });
  await check("legacy lost insert response conflicts on exact replay", async () => {
    const request = [log()];
    saved(await save(request));
    await conflict(request);
  });

  // A pre-existing integer row must survive the column widening byte-for-byte in JSON.
  await db.exec("begin");
  await actor();
  saved(await save([log({ exercise_index: 2, set_number: 8 })]));
  await db.exec("reset role; commit");
  const historicalBefore = await snapshot();
  if (!legacyContract) await db.exec(migrationSql);
  assert.deepEqual(await snapshot(), historicalBefore, "migration changed historical rows");

  await check("RPE storage is unconstrained numeric", async () => {
    const column = (await db.query("select data_type, numeric_scale from information_schema.columns where table_schema = 'public' and table_name = 'workout_logs' and column_name = 'rpe'")).rows[0];
    assert.equal(column.data_type, "numeric");
    assert.equal(column.numeric_scale, null);
  });
  await check("fractional RPE 7.5/8.5/9.5 persists without rounding", async () => {
    for (const [index, rpe] of [7.5, 8.5, 9.5].entries()) {
      const row = saved(await save([log({ set_number: index + 1, rpe })]));
      assert.equal(row.rpe, rpe);
      assert.equal(row.revision, 1);
    }
    const rows = (await db.query("select rpe::text as rpe from public.workout_logs where exercise_index = 0 order by set_number")).rows;
    assert.deepEqual(rows.map(row => row.rpe), ["7.5", "8.5", "9.5"]);
  });
  await check("RPE boundaries 1 and 10 and nullable RPE save", async () => {
    for (const [index, rpe] of [1, 10, null].entries()) {
      assert.equal(saved(await save([log({ set_number: index + 1, rpe })])).rpe, rpe);
    }
  });
  for (const rpe of [0, 0.5, 10.5, 11, "NaN", "Infinity", "-Infinity"]) {
    await check(`RPE ${rpe} rejected without writes`, async () => {
      await rejected([log({ rpe })], /rpe out of range/);
    });
  }
  await check("exact insert replay with null base returns same id/revision and no duplicate", async () => {
    const request = [log()];
    const first = saved(await save(request));
    const before = await snapshot();
    for (let attempt = 0; attempt < 3; attempt++) assert.deepEqual(saved(await save(request)), first);
    assert.deepEqual(await snapshot(), before);
    assert.equal(before.logs.filter(row => row.exercise_index === 0).length, 1);
  });
  await check("exact update replay with old base returns same id/revision and no UPDATE", async () => {
    const original = saved(await save([log()]));
    const request = [log({ weight: 45, rpe: 9, base_revision: original.revision })];
    const updated = saved(await save(request));
    assert.equal(updated.id, original.id);
    assert.equal(updated.revision, original.revision + 1);
    const before = await snapshot();
    assert.deepEqual(saved(await save(request)), updated);
    assert.deepEqual(saved(await save([{ ...request[0], base_revision: null }])), updated);
    assert.deepEqual(saved(await save([{ ...request[0], base_revision: updated.revision }])), updated);
    assert.deepEqual(await snapshot(), before);
  });
  await check("fractional insert and update replays preserve the exact persisted RPE", async () => {
    const request = [log({ rpe: 7.5 })];
    const original = saved(await save(request));
    let before = await snapshot();
    assert.deepEqual(saved(await save(request)), original);
    assert.deepEqual(await snapshot(), before);
    const update = [log({ rpe: 9.5, base_revision: original.revision })];
    const current = saved(await save(update));
    assert.equal(current.rpe, 9.5);
    assert.equal(current.revision, original.revision + 1);
    before = await snapshot();
    assert.deepEqual(saved(await save(update)), current);
    assert.deepEqual(await snapshot(), before);
  });
  await check("typed equivalent replay and defaulted null values are read-only", async () => {
    const first = saved(await save([log({ weight: 0, reps_done: 0, set_type: "normal", rpe: null, completed: false })]));
    const before = await snapshot();
    const row = saved(await save([log({ exercise_index: "00", set_number: "01", weight: "", reps_done: null, set_type: "", rpe: "", completed: null })]));
    assert.deepEqual(row, first);
    assert.deepEqual(await snapshot(), before);
  });
  for (const [field, value] of Object.entries({ weight: 41, reps_done: 11, set_type: "failure", rpe: 9.5, completed: false })) {
    await check(`different ${field} with stale or null base conflicts atomically`, async () => {
      const first = saved(await save([log()]));
      const current = saved(await save([log({ weight: 45, base_revision: first.revision })]));
      assert.equal(current.revision, 2);
      for (const base_revision of [1, null]) {
        const result = await conflict([log({ weight: 45, [field]: value, base_revision })]);
        assert.deepEqual(result.conflicts[0], current);
      }
    });
  }
  await check("one conflict prevents unrelated inserts, updates, exact replay acknowledgements and tombstones", async () => {
    const first = saved(await save([log()]));
    const current = saved(await save([log({ weight: 45, base_revision: first.revision })]));
    const second = saved(await save([log({ set_number: 2 })]));
    const third = saved(await save([log({ set_number: 3 })]));
    const replay = log({ weight: 45, base_revision: 1 });
    const bad = log({ set_number: 2, weight: 99, base_revision: null });
    const insert = log({ set_number: 4, rpe: 7.5 });
    const update = log({ set_number: 3, reps_done: 12, base_revision: third.revision });
    await conflict([replay, insert, update, bad]);
    await conflict([bad, update, insert, replay]);
    await conflict([log({ set_number: 3, deleted: true, base_revision: third.revision }), insert, bad]);
    assert.equal(current.revision, 2);
    assert.equal(second.revision, 1);
  });
  await check("late validation exception rolls back an earlier valid insert and deletion", async () => {
    const first = saved(await save([log()]));
    await rejected([
      log({ deleted: true, base_revision: first.revision }),
      log({ set_number: 2 }),
      log({ set_number: 3, rpe: "NaN" }),
    ], /rpe out of range/);
  });
  await check("missing row with nonnull base returns server_missing and no other writes", async () => {
    const result = await conflict([log({ base_revision: 1 }), log({ set_number: 2 })]);
    assert.equal(result.conflicts[0].server_missing, true);
  });
  await check("cross-tenant insert, exact replay, deletion and forged workout/student pairing denied", async () => {
    const own = saved(await save([log()]));
    await actor(ids.otherActor);
    await rejected([log()], /actor cannot write/);
    await rejected([log({ deleted: true, base_revision: own.revision })], /actor cannot delete/);
    await actor();
    await rejected([log({ student_id: ids.otherStudent, workout_id: ids.otherWorkout })], /actor cannot write/);
    await rejected([log({ workout_id: ids.otherWorkout })], /does not belong to student tenant/);
    await rejected([log({ student_id: ids.otherStudent })], /does not belong to student tenant/);
  });
  await check("company staff can save only their own tenant", async () => {
    await actor(ids.staff);
    assert.equal(saved(await save([log({ rpe: 7.5 })])).rpe, 7.5);
    await rejected([log({ student_id: ids.otherStudent, workout_id: ids.otherWorkout })], /actor cannot write/);
    await actor(ids.outsider);
    await rejected([log({ set_number: 2 })], /actor cannot write/);
    await actor(null);
    await rejected([log({ set_number: 2 })], /actor cannot write/);
  });
  await check("tenant inconsistency between workout/cycle/student denied", async () => {
    await db.exec("reset role");
    await db.query("update public.workouts set company_id = $1 where id = $2", [ids.otherCompany, ids.workout]);
    await actor();
    await rejected([log()], /does not belong to student tenant/);
  });
  await check("anon cannot EXECUTE even with an owner-looking JWT sub", async () => {
    await actor(ids.actor, "anon");
    await rejected([log()], /permission denied for function/, "42501");
  });
  await check("SECURITY DEFINER search_path and function/table privileges remain scoped", async () => {
    const row = (await db.query(`select p.prosecdef, p.proconfig,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
      has_function_privilege('service_role', p.oid, 'EXECUTE') as service,
      has_table_privilege('authenticated', 'public.workout_logs', 'UPDATE') as direct_update
      from pg_proc p where p.oid = 'public.save_workout_logs_if_current(jsonb)'::regprocedure`)).rows[0];
    assert.equal(row.prosecdef, true);
    assert.deepEqual(row.proconfig, ["search_path=public, pg_temp"]);
    assert.equal(row.anon, false);
    assert.equal(row.authenticated, true);
    assert.equal(row.service, true);
    assert.equal(row.direct_update, false);
  });
  await check("service role bypasses actor check but cannot bypass tenant consistency", async () => {
    await actor(null, "service_role");
    saved(await save([log({ student_id: ids.otherStudent, workout_id: ids.otherWorkout, rpe: 8.5 })]));
    await rejected([log({ workout_id: ids.otherWorkout })], /does not belong to student tenant/);
  });
  await check("stale tombstone and replacement cannot delete a newer revision", async () => {
    const first = saved(await save([log()]));
    const current = saved(await save([log({ weight: 45, base_revision: first.revision })]));
    const result = await conflict([
      log({ deleted: true, base_revision: first.revision }),
      log({ weight: 60, rpe: 8.5 }),
      log({ set_number: 2 }),
    ]);
    assert.equal(result.conflicts[0].requested_deleted, true);
    assert.equal(result.conflicts[0].id, current.id);
    await conflict([log({ deleted: true, base_revision: null }), log({ weight: 45 })]);
  });
  await check("fresh tombstone plus replacement works regardless of input order", async () => {
    for (const reverse of [false, true]) {
      const set_number = reverse ? 2 : 1;
      const original = saved(await save([log({ set_number })]));
      const request = [
        log({ set_number, deleted: true, base_revision: original.revision }),
        log({ set_number, weight: 60, rpe: 7.5 }),
      ];
      const result = await save(reverse ? request.reverse() : request);
      saved(result, 2);
      assert.equal(result.saved[0].deleted, true);
      assert.equal(result.saved[0].id, original.id);
      assert.notEqual(result.saved[1].id, original.id);
      assert.equal(result.saved[1].revision, 1);
      assert.equal(result.saved[1].weight, 60);
    }
    assert.equal((await snapshot()).logs.filter(row => row.exercise_index === 0).length, 2);
  });
  await check("replacement cannot carry base/id/revision metadata and duplicate aliases reject", async () => {
    const original = saved(await save([log()]));
    for (const metadata of [{ base_revision: 1 }, { id: original.id }, { base_id: original.id }, { revision: 1 }]) {
      await rejected([
        log({ deleted: true, base_revision: original.revision }),
        log({ ...metadata, weight: 60 }),
      ], /replacement paired with tombstone must be a new insert/);
    }
    await rejected([log(), log({ set_number: "01", exercise_index: "00" })], /duplicate workout log identity/);
  });
  await check("delete-only replay of absent identity is read-only", async () => {
    const original = saved(await save([log()]));
    const request = [log({ deleted: true, base_revision: original.revision })];
    assert.equal(saved(await save(request)).deleted, true);
    const before = await snapshot();
    assert.equal(saved(await save(request)).deleted, true);
    assert.deepEqual(await snapshot(), before);
  });
  await check("response-lost delete/renumber with revision 2 rejects replay without writes", async () => {
    const first = saved(await save([log()]));
    const current = saved(await save([log({ weight: 45, base_revision: first.revision })]));
    const removed = saved(await save([log({ set_number: 2, weight: 60 })]));
    const request = [
      log({ deleted: true, base_revision: current.revision }),
      log({ set_number: 2, deleted: true, base_revision: removed.revision }),
      log({ weight: 60 }),
    ];
    saved(await save(request), 3);
    await conflict(request);
    observations.push({ name: "delete_renumber_lost_response", behavior: "conflicts_atomically", gap: "No batch receipt: successful renumber replay is not acknowledged as success." });
  });
  await check("characterize existing revision-1 ABA on delete/renumber replay", async () => {
    const original = saved(await save([log()]));
    const removed = saved(await save([log({ set_number: 2, weight: 60 })]));
    const request = [
      log({ deleted: true, base_revision: original.revision, base_id: original.id }),
      log({ set_number: 2, deleted: true, base_revision: removed.revision, base_id: removed.id }),
      log({ weight: 60 }),
    ];
    const initial = await save(request);
    saved(initial, 3);
    const firstReplacement = initial.saved.find(row => !row.deleted);
    const before = await snapshot();
    const replay = await save(request);
    if (replay.conflicts.length) {
      assert.deepEqual(replay.saved, []);
      assert.deepEqual(await snapshot(), before);
      observations.push({ name: "revision_1_ABA", behavior: "replay_rejected_atomically" });
    } else {
      saved(replay, 3);
      const secondReplacement = replay.saved.find(row => !row.deleted);
      assert.notEqual(secondReplacement.id, firstReplacement.id);
      assert.equal(secondReplacement.revision, 1);
      assert.equal(secondReplacement.weight, 60);
      observations.push({ name: "revision_1_ABA", behavior: "replacement_deleted_and_recreated", gap: "Tombstones compare revision only; base_id is ignored and reinsertion resets revision to 1." });
      // Prove a stale tombstone can also erase a genuinely different replacement.
      saved(await save([
        log({ deleted: true, base_revision: secondReplacement.revision }),
        log({ weight: 70 }),
      ]), 2);
      const lostUpdate = await save(request);
      saved(lostUpdate, 3);
      assert.equal(lostUpdate.saved.find(row => !row.deleted).weight, 60);
      observations.push({ name: "revision_1_ABA_different_replacement", behavior: "stale_batch_overwrites_replacement", gap: "Pre-existing generation-identity gap; exact ordinary replay does not fix tombstones." });
    }
  });
  await check("prescribed sets plus extras ceiling and W/N/F validation retained", async () => {
    saved(await save([log({ set_number: 10, set_type: "warmup" })]));
    saved(await save([log({ exercise_index: 1, set_number: 8, set_type: "failure" })]));
    await rejected([log({ set_number: 11 })], /set_number exceeds/);
    await rejected([log({ exercise_index: 1, set_number: 9 })], /set_number exceeds/);
    await rejected([log({ set_type: "drop_set" })], /invalid set_type/);
    await rejected([log({ weight: "NaN" })], /weight out of range/);
    await rejected([log({ weight: -1 })], /weight out of range/);
    await rejected([log({ reps_done: 1001 })], /reps_done out of range/);
  });
  await check("malformed batch, identities and 200-row limit retained", async () => {
    await rejected({}, /must be a JSON array/);
    await rejected(Array.from({ length: 201 }, () => log()), /200 item limit/);
    await rejected([log({ deleted: "true" })], /deleted must be a boolean/);
    await rejected([log({ set_number: 0 })], /invalid workout log identity/);
    await rejected([log({ student_id: "not-a-uuid" })], /invalid workout log identity/);
  });

  const failures = checks.filter(check => !check.ok);
  console.log(JSON.stringify({
    ok: failures.length === 0,
    mode: legacyContract ? "legacy_contract_expected_red" : "hotfix_contract",
    migration: migrationPath,
    migrationSha256: createHash("sha256").update(migrationSql).digest("hex"),
    historicalRowsPreserved: true,
    passed: checks.length - failures.length, failed: failures.length,
    checks, observations,
    limits: ["Synthetic minimal schema; not the live Supabase schema or RLS policy suite.", "Single PGlite connection; no concurrent-session lock/race proof.", "Known tombstone ABA is characterized, not counted as safe or fixed."],
  }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  await db.close();
}
