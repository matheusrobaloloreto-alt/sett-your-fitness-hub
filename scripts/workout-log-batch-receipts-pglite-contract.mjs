#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Synthetic, in-memory SQL only. No app client, environment file or remote DB.
const args = process.argv.slice(2);
const baseline = args.includes("--baseline-contract");
const pathIndex = args.indexOf("--migration");
if (pathIndex >= 0 && !args[pathIndex + 1]) throw new Error("--migration requires a local SQL path");
const migrationPath = resolve(args[pathIndex + 1] && pathIndex >= 0
  ? args[pathIndex + 1]
  : "supabase/migrations/20260928074406_workout_log_batch_receipts.sql");
let migrationSql;
if (!baseline) {
  try { migrationSql = await readFile(migrationPath, "utf8"); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    console.log(JSON.stringify({ ok: false, status: "awaiting_migration", migration: migrationPath }));
    process.exit(2);
  }
}
const legacySql = await readFile("supabase/migrations/20260825210000_enforce_workout_set_types_wnf.sql", "utf8");
const fractionalPath = "supabase/migrations/20260928065519_workout_logs_fractional_rpe_idempotency.sql";
const fractionalSql = await readFile(fractionalPath, "utf8");
const runtimePath = process.env.PGLITE_MODULE_PATH || "@electric-sql/pglite";
const { PGlite } = await import(runtimePath);
const db = new PGlite();
const checks = [];
const observations = [];
const ids = {
  actor: "10000000-0000-4000-8000-000000000001",
  otherActor: "10000000-0000-4000-8000-000000000002",
  staff: "10000000-0000-4000-8000-000000000003",
  outsider: "10000000-0000-4000-8000-000000000004",
  company: "20000000-0000-4000-8000-000000000001",
  otherCompany: "20000000-0000-4000-8000-000000000002",
  student: "3a000000-0000-4000-8000-000000000001",
  otherStudent: "30000000-0000-4000-8000-000000000002",
  cycle: "40000000-0000-4000-8000-000000000001",
  otherCycle: "40000000-0000-4000-8000-000000000002",
  workout: "5b000000-0000-4000-8000-000000000001",
  otherWorkout: "50000000-0000-4000-8000-000000000002",
};
let sessionDate;
let role = null;
let tables = [];
let sequences = [];
let receiptTables = [];
const quote = name => `"${name.replaceAll('"', '""')}"`;
const relation = row => `${quote(row.schema)}.${quote(row.name)}`;
const positiveRevision = row => {
  assert.ok(Number.isSafeInteger(Number(row.revision)) && Number(row.revision) > 0, "nonpositive or unsafe revision");
  return Number(row.revision);
};

function assertSortedWorkoutLocksBeforeReturns(body) {
  const source = body.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, "");
  const block = /for\s+workout_to_lock\s+in\s+select\s+distinct\s+\(row_value\s*->>\s*'workout_id'\)::uuid\s+from\s+jsonb_array_elements\(normalized\)\s+row_value\s+order\s+by\s+1\s+loop\s+perform\s+1\s+from\s+public\.workouts\s+where\s+id\s*=\s*workout_to_lock\s+for\s+update\s*;\s*end\s+loop\s*;/i.exec(source);
  assert.ok(block, "wrapper lacks unconditional sorted, distinct workout FOR UPDATE loop");
  assert.match(source.slice(0, block.index), /end\s+loop\s*;\s*$/i, "sorted locks are not immediately after the authorization loop");
  const firstReturn = /\breturn\b/i.exec(source);
  assert.ok(firstReturn, "wrapper return path not found");
  assert.ok(block.index + block[0].length <= firstReturn.index, "ordinary return bypasses sorted workout locks");
  const firstCoreCall = /public\.save_workout_logs_if_current_core\s*\(/i.exec(source);
  assert.ok(firstCoreCall && firstCoreCall.index >= block.index + block[0].length, "core is called before all workout locks are held");
  return { source, block };
}

async function admin(body) {
  await db.exec("reset role");
  try { return await body(); }
  finally { if (role) await db.exec(`set local role ${role}`); }
}

async function actor(user = ids.actor, nextRole = "authenticated") {
  assert.ok(["authenticated", "anon", "service_role"].includes(nextRole));
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', $2, true)", [user || "", nextRole]);
  role = nextRole;
  await db.exec(`set local role ${role}`);
}

function log(overrides = {}) {
  return {
    student_id: ids.student, workout_id: ids.workout, exercise_index: 0,
    set_number: 1, session_date: sessionDate, weight: 40, reps_done: 10,
    set_type: "normal", rpe: 8.5, completed: true, base_revision: null,
    ...overrides,
  };
}

async function save(rows) {
  return (await db.query("select public.save_workout_logs_if_current($1::jsonb) as result", [JSON.stringify(rows)])).rows[0].result;
}

function saved(result, count = 1) {
  assert.deepEqual(result.conflicts, [], "unexpected CAS conflict");
  assert.equal(result.saved.length, count, "wrong acknowledged row count");
  for (const row of result.saved) positiveRevision(row);
  return result.saved[0];
}

async function snapshot(includeSequences = true) {
  return admin(async () => {
    const state = { tables: {}, writes: [], sequences: {} };
    for (const table of tables) {
      state.tables[`${table.schema}.${table.name}`] = (await db.query(`select to_jsonb(t) as row from ${relation(table)} t order by to_jsonb(t)::text`)).rows.map(row => row.row);
    }
    state.writes = (await db.query("select * from qa_contract.writes order by schema_name, table_name, operation")).rows;
    if (includeSequences) for (const sequence of sequences) {
      state.sequences[`${sequence.schema}.${sequence.name}`] = (await db.query(`select last_value::text, is_called from ${relation(sequence)}`)).rows[0];
    }
    return state;
  });
}

async function receiptsCount() {
  return admin(async () => {
    let count = 0;
    for (const table of receiptTables) count += Number((await db.query(`select count(*) as n from ${relation(table)}`)).rows[0].n);
    return count;
  });
}

async function rejectedQuery(body, pattern, code) {
  const before = await snapshot(false);
  await db.exec("savepoint rejected_request");
  let error;
  try { await body(); } catch (caught) { error = caught; }
  await db.exec("rollback to savepoint rejected_request; release savepoint rejected_request");
  assert.ok(error, "invalid or unauthorized request was accepted");
  if (pattern) assert.match(error.message, pattern);
  if (code) assert.equal(error.code, code);
  assert.deepEqual(await snapshot(false), before, "rejected request left transactional writes or a receipt");
  // nextval is deliberately nontransactional: failures may consume, never reuse, values.
}

const rejected = (rows, pattern, code) => rejectedQuery(() => save(rows), pattern, code);

async function conflict(rows) {
  const before = await snapshot();
  const result = await save(rows);
  assert.deepEqual(result.saved, [], "stale batch returned a stale or partial ACK");
  assert.ok(result.conflicts.length > 0, "stale different payload was accepted");
  assert.deepEqual(await snapshot(), before, "conflict mutated tables, receipts, audit or sequence");
  return result;
}

async function readOnlyReplay(request, expected) {
  const before = await snapshot();
  const result = await save(request);
  saved(result, expected.saved.length);
  assert.deepEqual(result, expected, "receipt did not return the original acknowledged identities/revisions");
  assert.deepEqual(await snapshot(), before, "replay performed DML or consumed a revision");
}

async function check(name, body) {
  role = null;
  await db.exec("reset role; begin");
  try {
    await actor();
    await body();
    checks.push({ name, ok: true });
  } catch (error) {
    checks.push({ name, ok: false, code: error.code || "ASSERTION", message: String(error.message).split("\n")[0] });
  } finally {
    await db.exec("rollback");
    await db.exec("reset role");
    role = null;
  }
}

async function renumber({ reverse = false, updateFirst = false, otherTenant = false } = {}) {
  const tenant = otherTenant ? { student_id: ids.otherStudent, workout_id: ids.otherWorkout } : {};
  let first = saved(await save([log({ ...tenant, weight: 35, rpe: 7.5 })]));
  if (updateFirst) first = saved(await save([log({ ...tenant, weight: 36, rpe: 7.5, base_revision: first.revision })]));
  const second = saved(await save([log({ ...tenant, set_number: 2, weight: 60, rpe: 9.5 })]));
  const request = [
    log({ ...tenant, weight: first.weight, rpe: 7.5, deleted: true, base_revision: first.revision }),
    log({ ...tenant, set_number: 2, weight: 60, rpe: 9.5, deleted: true, base_revision: second.revision }),
    log({ ...tenant, weight: 60, rpe: 9.5 }),
  ];
  if (reverse) request.reverse();
  const result = await save(request);
  saved(result, 3);
  const replacement = result.saved.find(row => !row.deleted);
  assert.notEqual(replacement.id, first.id);
  return { first, second, request, result, replacement };
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
    create function public.touch_workout_log_revision() returns trigger language plpgsql
    set search_path = public, pg_temp as $$
    begin new.revision := old.revision + 1; new.updated_at := now(); return new; end;
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
    create schema qa_contract;
    create table qa_contract.writes (schema_name text, table_name text, operation text);
    create function qa_contract.audit_write() returns trigger language plpgsql security definer
    set search_path = pg_catalog, qa_contract as $$
    begin
      insert into qa_contract.writes values (tg_table_schema, tg_table_name, tg_op);
      return null;
    end;
    $$;
  `);
  sessionDate = (await db.query("select to_char(current_date, 'YYYY-MM-DD') as date")).rows[0].date;
  await db.exec(legacySql);
  await db.exec(fractionalSql);
  await db.query(`insert into public.workout_logs
    (student_id, workout_id, exercise_index, set_number, session_date, weight, reps_done, set_type, rpe, completed, revision)
    values ($1, $2, 2, 8, $3::date, 25, 8, 'normal', 8.5, true, 9000)`, [ids.student, ids.workout, sessionDate]);
  const historical = (await db.query("select to_jsonb(t) as row from public.workout_logs t")).rows;
  const catalogSql = `select n.nspname as schema, c.relname as name, c.relrowsecurity as rls, c.oid
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = $1 and n.nspname not like 'pg_%'
      and n.nspname not in ('information_schema', 'auth', 'qa_contract')
    order by n.nspname, c.relname`;
  const oldTables = (await db.query(catalogSql, ["r"])).rows;
  if (!baseline) {
    await db.exec("begin");
    await db.exec(migrationSql);
    await db.exec("rollback");
    assert.deepEqual((await db.query(catalogSql, ["r"])).rows, oldTables, "DDL rollback left receipt relations");
    assert.deepEqual((await db.query("select to_jsonb(t) as row from public.workout_logs t")).rows, historical);
    assert.equal((await db.query("select to_regprocedure('public.save_workout_logs_if_current(jsonb)') is not null as present")).rows[0].present, true);
    assert.equal((await db.query("select to_regprocedure('public.save_workout_logs_if_current_core(jsonb)') is null as absent")).rows[0].absent, true);
    assert.equal((await db.query("select to_regclass('public.workout_log_revision_seq') is null as absent")).rows[0].absent, true);
    checks.push({ name: "migration DDL rollback restores original RPC, trigger, data and catalog", ok: true });
    await db.exec("begin");
    await db.exec(migrationSql);
    await db.exec("commit");
  }
  assert.deepEqual((await db.query("select to_jsonb(t) as row from public.workout_logs t")).rows, historical, "migration rewrote or deleted existing row data");
  tables = (await db.query(catalogSql, ["r"])).rows;
  sequences = (await db.query(catalogSql, ["S"])).rows;
  receiptTables = tables.filter(table => !oldTables.some(old => old.schema === table.schema && old.name === table.name));
  for (const table of tables) await db.exec(`create trigger qa_contract_write_probe
    after insert or update or delete on ${relation(table)} for each row execute function qa_contract.audit_write()`);

  await check("structural guard: sorted workout locks precede ordinary return and every core call", async () => {
    const body = await admin(async () => (await db.query("select prosrc from pg_proc where oid = 'public.save_workout_logs_if_current(jsonb)'::regprocedure")).rows[0].prosrc);
    const { source, block } = assertSortedWorkoutLocksBeforeReturns(body);
    // Reconstruct the prior ordering in memory; this guard must catch it.
    const withoutLocks = source.slice(0, block.index) + source.slice(block.index + block[0].length);
    const ordinaryReturn = /return\s+public\.save_workout_logs_if_current_core\(normalized\)\s*;/i.exec(withoutLocks);
    assert.ok(ordinaryReturn, "ordinary core return not found");
    const branchEnd = /end\s+if\s*;/i.exec(withoutLocks.slice(ordinaryReturn.index + ordinaryReturn[0].length));
    assert.ok(branchEnd, "ordinary branch end not found");
    const insertion = ordinaryReturn.index + ordinaryReturn[0].length + branchEnd.index + branchEnd[0].length;
    const oldOrdering = withoutLocks.slice(0, insertion) + "\n" + block[0] + "\n" + withoutLocks.slice(insertion);
    assert.throws(() => assertSortedWorkoutLocksBeforeReturns(oldOrdering), /ordinary return bypasses sorted workout locks|not immediately after the authorization loop/);
    const conditionalLocks = source.slice(0, block.index) + "if false then\n" + block[0] + "\nend if;" + source.slice(block.index + block[0].length);
    assert.throws(() => assertSortedWorkoutLocksBeforeReturns(conditionalLocks), /not immediately after the authorization loop/);
    observations.push({ name: "lock_order_guard_red_proof", rejectedPriorOrdering: true });
  });
  await check("durable receipt relation exists with RLS and no app table grants", async () => {
    assert.ok(receiptTables.length > 0, "no durable receipt table");
    for (const table of receiptTables) {
      assert.equal(table.rls, true, "receipt RLS disabled");
      for (const appRole of ["anon", "authenticated", "service_role"]) {
        for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
          const granted = await admin(async () => (await db.query("select has_table_privilege($1, $2::oid, $3) as granted", [appRole, table.oid, privilege])).rows[0].granted);
          assert.equal(granted, false, `${appRole} can ${privilege} receipt table`);
        }
      }
    }
  });
  await check("global revisions start above existing max and advance across slots and tenants", async () => {
    const one = saved(await save([log()]));
    assert.ok(positiveRevision(one) > 9000, "sequence was not initialized above existing max");
    const two = saved(await save([log({ set_number: 2 })]));
    assert.ok(positiveRevision(two) > positiveRevision(one));
    const update = saved(await save([log({ weight: 45, base_revision: one.revision })]));
    assert.ok(positiveRevision(update) > positiveRevision(two));
    await actor(ids.otherActor);
    const other = saved(await save([log({ student_id: ids.otherStudent, workout_id: ids.otherWorkout })]));
    assert.ok(positiveRevision(other) > positiveRevision(update));
  });
  await check("ordinary fractional save and exact replay remain read-only without receipts", async () => {
    const count = await receiptsCount();
    const request = [log({ rpe: 7.5 })];
    const inserted = await save(request);
    saved(inserted);
    await readOnlyReplay(request, inserted);
    const update = [log({ weight: 47, rpe: 9.5, base_revision: inserted.saved[0].revision })];
    const updated = await save(update);
    saved(updated);
    await readOnlyReplay(update, updated);
    assert.equal(await receiptsCount(), count, "ordinary batch unexpectedly stored a delete receipt");
  });
  for (const reverse of [false, true]) await check(`lost-response renumber replay ACKs same IDs/revisions without DML (reverse=${reverse})`, async () => {
    const transaction = await renumber({ reverse, updateFirst: true });
    for (let attempt = 0; attempt < 3; attempt++) await readOnlyReplay(transaction.request, transaction.result);
    assert.ok(await receiptsCount() > 0, "successful deletion batch has no durable receipt");
    await readOnlyReplay([...transaction.request].reverse(), transaction.result);
    // JSONB object-key order and canonical integer/UUID identity aliases cannot defeat lookup.
    const aliases = [...transaction.request].reverse().map(row => ({ ...row,
      student_id: row.student_id.toUpperCase(), workout_id: row.workout_id.toUpperCase(),
      exercise_index: "00", set_number: String(row.set_number).padStart(2, "0"),
    }));
    await readOnlyReplay(aliases, transaction.result);
  });
  await check("lost-response renumber of original insert generations cannot recreate replacement IDs", async () => {
    const tx = await renumber();
    await readOnlyReplay(tx.request, tx.result);
    assert.ok(positiveRevision(tx.replacement) > Math.max(positiveRevision(tx.first), positiveRevision(tx.second)));
  });
  await check("MD5 bucket collision cannot ACK another full request or replace its durable receipt", async () => {
    const tx = await renumber();
    assert.ok(receiptTables.some(table => table.name === "workout_log_batch_receipts"), "receipt schema not available");
    // Privileged fixture simulates an occupied hash bucket with a different body.
    await admin(() => db.exec("update public.workout_log_batch_receipts set request_body = '[{\"qa_collision\":true}]'::jsonb"));
    await conflict(tx.request);
    const receipt = await admin(async () => (await db.query("select request_body from public.workout_log_batch_receipts")).rows[0]);
    assert.deepEqual(receipt.request_body, [{ qa_collision: true }]);
  });
  await check("old revision alone cannot delete a different post-deletion generation (old client without IDs)", async () => {
    const original = saved(await save([log()]));
    saved(await save([log({ deleted: true, base_revision: original.revision })]));
    const replacement = saved(await save([log({ weight: 65 })]));
    assert.notEqual(replacement.id, original.id);
    assert.ok(positiveRevision(replacement) > positiveRevision(original));
    const result = await conflict([
      log({ deleted: true, base_revision: original.revision }), log({ weight: 99 }), log({ set_number: 2 }),
    ]);
    const authoritative = result.conflicts.find(row => row.set_number === 1);
    assert.equal(authoritative.id, replacement.id);
    assert.equal(authoritative.requested_deleted, true);
  });
  await check("direct INSERT/UPDATE ignores supplied revisions and never reuses a deleted slot generation", async () => {
    await admin(async () => {
      const insert = async () => (await db.query(`insert into public.workout_logs
        (student_id, workout_id, exercise_index, set_number, session_date, weight, revision)
        values ($1, $2, 0, 1, $3::date, 40, 1) returning *`, [ids.student, ids.workout, sessionDate])).rows[0];
      const original = await insert();
      assert.ok(positiveRevision(original) > 9000);
      const updated = (await db.query("update public.workout_logs set weight = 42, revision = 1 where id = $1 returning *", [original.id])).rows[0];
      assert.ok(positiveRevision(updated) > positiveRevision(original));
      const deleted = (await db.query("delete from public.workout_logs where id = $1 returning *", [original.id])).rows[0];
      positiveRevision(deleted);
      const replacement = await insert();
      assert.notEqual(replacement.id, original.id);
      assert.ok(positiveRevision(replacement) > positiveRevision(updated));
    });
  });
  for (const mutation of ["rpc_update", "rpc_delete", "direct_update", "direct_replace"]) {
    await check(`receipt replay after ${mutation} returns authoritative conflict and no stale ACK`, async () => {
      const tx = await renumber();
      let current;
      if (mutation === "rpc_update") current = saved(await save([log({ weight: 75, base_revision: tx.replacement.revision })]));
      if (mutation === "rpc_delete") saved(await save([log({ deleted: true, base_revision: tx.replacement.revision })]));
      if (mutation === "direct_update") current = await admin(async () => (await db.query("update public.workout_logs set weight = 76 where id = $1 returning *", [tx.replacement.id])).rows[0]);
      if (mutation === "direct_replace") current = await admin(async () => {
        await db.query("delete from public.workout_logs where id = $1", [tx.replacement.id]);
        return (await db.query(`insert into public.workout_logs
          (student_id, workout_id, exercise_index, set_number, session_date, weight, reps_done, set_type, rpe, completed)
          values ($1, $2, 0, 1, $3::date, 77, 10, 'normal', 8.5, true) returning *`, [ids.student, ids.workout, sessionDate])).rows[0];
      });
      const result = await conflict(tx.request);
      const slot = result.conflicts.find(row => row.set_number === 1);
      assert.ok(slot, "changed slot not included in receipt conflict");
      assert.equal(slot.requested_deleted, true);
      if (current) { assert.equal(slot.id, current.id); assert.equal(slot.revision, current.revision); }
      else assert.equal(slot.server_missing, true);
    });
  }
  await check("receipt scope ignores unrelated slot writes but tracks formerly absent touched identities", async () => {
    const tx = await renumber();
    saved(await save([log({ set_number: 3, weight: 90 })]));
    await readOnlyReplay(tx.request, tx.result);
    const reappeared = saved(await save([log({ set_number: 2, weight: 80 })]));
    const result = await conflict(tx.request);
    assert.ok(result.conflicts.some(row => row.set_number === 2 && row.id === reappeared.id && row.requested_deleted === true));
  });
  for (const [field, value] of Object.entries({ weight: 61, reps_done: 12, set_type: "failure", rpe: 7.5, completed: false })) {
    await check(`changed ${field} cannot reuse a deletion receipt or overwrite a new generation`, async () => {
      const tx = await renumber();
      const changed = tx.request.map(row => row.deleted ? row : { ...row, [field]: value });
      await conflict(changed);
    });
  }
  await check("cancellation tombstones are atomic and delete-only lost-response replay is read-only", async () => {
    const first = saved(await save([log()]));
    const second = saved(await save([log({ set_number: 2 })]));
    const request = [log({ deleted: true, base_revision: first.revision }), log({ set_number: 2, deleted: true, base_revision: second.revision })];
    const result = await save(request);
    saved(result, 2);
    assert.ok(result.saved.every(row => row.deleted === true));
    await readOnlyReplay(request, result);
    const reincarnated = saved(await save([log({ weight: 70 })]));
    assert.ok(positiveRevision(reincarnated) > positiveRevision(second));
    await conflict(request);
  });
  await check("one stale tombstone cancels all deletes/inserts/updates and creates no receipt", async () => {
    const first = saved(await save([log()]));
    const second = saved(await save([log({ set_number: 2 })]));
    const third = saved(await save([log({ set_number: 3 })]));
    const newer = saved(await save([log({ set_number: 2, weight: 70, base_revision: second.revision })]));
    const count = await receiptsCount();
    const result = await conflict([
      log({ deleted: true, base_revision: first.revision }), log({ weight: 60 }),
      log({ set_number: 2, deleted: true, base_revision: second.revision }),
      log({ set_number: 3, weight: 50, base_revision: third.revision }), log({ set_number: 4 }),
    ]);
    assert.ok(result.conflicts.some(row => row.id === newer.id));
    assert.equal(await receiptsCount(), count);
  });
  await check("late validation failure rolls back deletions, insertions and any receipt", async () => {
    const original = saved(await save([log()]));
    for (const bad of [{ rpe: "NaN" }, { rpe: 10.5 }, { weight: -1 }, { set_type: "drop_set" }]) {
      await rejected([
        log({ deleted: true, base_revision: original.revision }), log({ weight: 60 }), log({ set_number: 2, ...bad }),
      ]);
    }
  });
  await check("savepoint rollback removes receipt and next attempt really executes, never reuses revision", async () => {
    const first = saved(await save([log()]));
    const second = saved(await save([log({ set_number: 2 })]));
    const request = [log({ deleted: true, base_revision: first.revision }), log({ set_number: 2, deleted: true, base_revision: second.revision }), log({ weight: 60 })];
    const before = await snapshot(false);
    await db.exec("savepoint cancelled_save");
    const cancelled = await save(request);
    saved(cancelled, 3);
    const cancelledRow = cancelled.saved.find(row => !row.deleted);
    await db.exec("rollback to savepoint cancelled_save; release savepoint cancelled_save");
    assert.deepEqual(await snapshot(false), before, "rollback left receipt or transactional writes");
    const committed = await save(request);
    saved(committed, 3);
    const replacement = committed.saved.find(row => !row.deleted);
    assert.notEqual(replacement.id, cancelledRow.id, "rolled-back receipt falsely acknowledged cancelled work");
    assert.ok(positiveRevision(replacement) > positiveRevision(cancelledRow));
    await readOnlyReplay(request, committed);
  });
  await check("cross-tenant and unauthenticated receipt replay is authorized before lookup", async () => {
    const tx = await renumber();
    for (const user of [ids.otherActor, ids.outsider, null]) {
      await actor(user);
      await rejected(tx.request, /actor cannot|not authorized|unauthorized/i);
    }
    await actor(ids.actor, "anon");
    await rejected(tx.request, /permission denied/, "42501");
    await actor(ids.actor);
    await readOnlyReplay(tx.request, tx.result);
  });
  await check("staff membership revocation cannot be bypassed by a previously saved receipt", async () => {
    await actor(ids.staff);
    const tx = await renumber();
    await admin(() => db.query("delete from public.company_staff where user_id = $1", [ids.staff]));
    await rejected(tx.request, /actor cannot|not authorized|unauthorized/i);
    await actor(ids.actor);
    await readOnlyReplay(tx.request, tx.result);
  });
  await check("changed workout/student tenant pairing denies receipt replay even for service role", async () => {
    const tx = await renumber();
    await admin(() => db.query("update public.workouts set company_id = $1 where id = $2", [ids.otherCompany, ids.workout]));
    await actor(null, "service_role");
    await rejected(tx.request, /tenant|belong|company/i);
  });
  await check("service role can write consistent foreign tenant and replay fractional renumber", async () => {
    await actor(null, "service_role");
    const tx = await renumber({ otherTenant: true });
    await readOnlyReplay(tx.request, tx.result);
    await actor();
    await rejected(tx.request, /actor cannot|not authorized|unauthorized/i);
  });
  await check("mixed-tenant batches reject atomically before any receipt or row writes", async () => {
    const original = saved(await save([log()]));
    await rejected([
      log({ deleted: true, base_revision: original.revision }), log({ weight: 60 }),
      log({ student_id: ids.otherStudent, workout_id: ids.otherWorkout }),
    ], /actor cannot|not authorized|unauthorized/i);
  });
  await check("private core RPC cannot EXECUTE under any app role", async () => {
    const cores = await admin(async () => (await db.query(`select p.oid, n.nspname as schema, p.proname as name
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where p.proname like '%save_workout_logs%' and p.proargtypes::text = '3802'
        and not (n.nspname = 'public' and p.proname = 'save_workout_logs_if_current')`)).rows);
    assert.ok(cores.length > 0, "private core was not separated from public wrapper");
    for (const core of cores) for (const appRole of ["anon", "authenticated", "service_role"]) {
      await actor(ids.actor, appRole);
      const granted = await admin(async () => (await db.query("select has_function_privilege($1, $2::oid, 'EXECUTE') as granted", [appRole, core.oid])).rows[0].granted);
      assert.equal(granted, false, `${appRole} has private core execute`);
      await rejectedQuery(() => db.query(`select ${relation(core)}($1::jsonb)`, [JSON.stringify([log()])]), /permission denied/, "42501");
    }
  });
  await check("receipt SELECT/UPDATE and sequence nextval denied to app roles", async () => {
    assert.ok(receiptTables.length > 0, "no receipt table");
    assert.ok(sequences.length > 0, "no global revision sequence");
    for (const appRole of ["anon", "authenticated", "service_role"]) {
      await actor(ids.actor, appRole);
      for (const table of receiptTables) {
        await rejectedQuery(() => db.query(`select * from ${relation(table)}`), /permission denied/, "42501");
        await rejectedQuery(() => db.query(`delete from ${relation(table)}`), /permission denied/, "42501");
      }
      for (const sequence of sequences) {
        const granted = await admin(async () => (await db.query("select has_sequence_privilege($1, $2::oid, 'USAGE') as usage, has_sequence_privilege($1, $2::oid, 'UPDATE') as update", [appRole, sequence.oid])).rows[0]);
        assert.equal(granted.usage, false); assert.equal(granted.update, false);
        await rejectedQuery(() => db.query("select nextval($1::regclass)", [`${sequence.schema}.${sequence.name}`]), /permission denied/, "42501");
      }
    }
  });
  await check("wrapper and revision trigger SECURITY DEFINER/search_path remain pinned", async () => {
    const wrapper = await admin(async () => (await db.query(`select p.prosecdef, p.proconfig,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
      has_function_privilege('service_role', p.oid, 'EXECUTE') as service
      from pg_proc p where p.oid = 'public.save_workout_logs_if_current(jsonb)'::regprocedure`)).rows[0]);
    assert.equal(wrapper.prosecdef, true);
    assert.ok(wrapper.proconfig?.some(setting => setting.startsWith("search_path=") && !setting.includes('"$user"')), "wrapper search_path not pinned");
    assert.equal(wrapper.anon, false); assert.equal(wrapper.authenticated, true); assert.equal(wrapper.service, true);
    const triggers = await admin(async () => (await db.query(`select t.tgtype, p.prosecdef, p.proconfig from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid where t.tgrelid = 'public.workout_logs'::regclass and not t.tgisinternal and (t.tgtype & 2) = 2`)).rows);
    assert.ok(triggers.some(trigger => (trigger.tgtype & 4) && (trigger.tgtype & 16) && trigger.prosecdef && trigger.proconfig?.some(setting => setting.startsWith("search_path="))), "no secure BEFORE INSERT/UPDATE revision trigger");
  });
  await check("wrapper 256 kB bound rejects oversized inputs including valid receipt replay", async () => {
    const tx = await renumber();
    const oversized = tx.request.map((row, index) => index ? row : { ...row, qa_padding: "x".repeat(300000) });
    await rejected(oversized, /size|large|limit|256|262144/i);
    await rejected([log({ set_number: 3, qa_padding: "x".repeat(300000) })], /size|large|limit|256|262144/i);
    saved(await save([log({ set_number: 3, qa_padding: "x".repeat(200000) })]));
  });
  await check("legacy validations and delete/replacement metadata restrictions remain atomic", async () => {
    const original = saved(await save([log()]));
    for (const metadata of [{ base_revision: original.revision }, { id: original.id }, { base_id: original.id }, { revision: original.revision }]) {
      await rejected([log({ deleted: true, base_revision: original.revision }), log({ weight: 60, ...metadata })], /replacement paired with tombstone/);
    }
    await rejected([log(), log({ exercise_index: "00", set_number: "01" })], /duplicate workout log identity/);
    await rejected({}, /JSON array|array/i);
    await rejected(Array.from({ length: 201 }, () => log()), /200/);
    await rejected([log({ deleted: "true" })], /deleted.*boolean/);
    await rejected([log({ set_number: 11 })], /set_number exceeds/);
    for (const rpe of [0, 10.5, "NaN", "Infinity", "-Infinity"]) await rejected([log({ set_number: 2, rpe })], /rpe out of range/);
  });

  // Earlier checks intentionally rolled back their fixture transactions. This
  // batch commits before its response is "lost", then replays in a new one.
  await db.exec("begin");
  await actor();
  const committedTransaction = await renumber({ updateFirst: true });
  await db.exec("commit");
  role = null;
  await check("receipt survives COMMIT and ACKs lost response in a separate transaction", async () => {
    assert.ok(await receiptsCount() > 0, "committed deletion receipt is absent");
    await readOnlyReplay(committedTransaction.request, committedTransaction.result);
    await readOnlyReplay([...committedTransaction.request].reverse(), committedTransaction.result);
  });

  const failures = checks.filter(check => !check.ok);
  console.log(JSON.stringify({
    ok: failures.length === 0, mode: baseline ? "fractional_backend_expected_red" : "batch_receipts_contract",
    migration: baseline ? null : migrationPath,
    migrationSha256: migrationSql ? createHash("sha256").update(migrationSql).digest("hex") : null,
    fractionalSha256: createHash("sha256").update(fractionalSql).digest("hex"),
    runtime: runtimePath, passed: checks.length - failures.length, failed: failures.length,
    historicalRowsPreserved: true, receiptRelations: receiptTables.map(relation), checks, observations,
    limits: ["Synthetic schema, not live Supabase/RLS integration.", "Single connection: sorted lock order requires independent SQL review; no concurrent-session proof.", "MD5 bucket collision is simulated by privileged fixture tampering, not a cryptographic collision attack.", "Sequence gaps on rollback are allowed; generation reuse is not."],
  }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  await db.close();
}
