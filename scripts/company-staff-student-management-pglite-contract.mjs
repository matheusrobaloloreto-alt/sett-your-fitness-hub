#!/usr/bin/env node
// Run from the repository root. PGLITE_MODULE_PATH may point to an existing install.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const db = new PGlite();
const migration = async (name) => readFile(resolve('supabase/migrations', name), 'utf8');
const sources = {
  base: await migration('20260330175153_fa8a3919-7cf0-4576-a68d-6daf91bd7ed4.sql'),
  staff: await migration('20260718120000_harden_student_tenant_isolation.sql'),
  integrity: await migration('20260815062126_remove_legacy_same_company_student_leaks.sql'),
  permissions: await migration('20260820113000_add_explicit_staff_permissions.sql'),
  reads: await migration('20260922110000_trainer_company_student_read_access.sql'),
  revisions: await migration('20260914104500_return_workout_revision_rows.sql'),
  oldReassign: await migration('20260914163000_reassign_student_trainer.sql'),
  sync: await migration('20260721133000_sync_student_enrollment_trainers.sql'),
  history: await migration('20260420174013_51ac3ed1-223a-4b52-b3d8-38fc43a6fe8f.sql'),
  historyIntegrity: await migration('20260820093445_preserve_legacy_trainer_history_references.sql'),
  management: await migration('20261014164920_company_staff_student_management.sql'),
};

// Extract bounded, unmodified statements from canonical migrations; fail on drift.
function section(sql, start, end) {
  const a = sql.indexOf(start);
  const b = sql.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Migration section missing: ${start}`);
  return sql.slice(a, b);
}
function functionSql(sql, name) {
  const match = sql.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`, 'i'));
  assert.ok(match, `Canonical function missing: ${name}`);
  return match[0];
}
const uid = (kind, n) => `${String(kind).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = {
  trainer: uid(1, 1), otherTrainer: uid(1, 2), admin: uid(1, 3),
  coordinator: uid(1, 4), master: uid(1, 5), foreignTrainer: uid(1, 6),
  student: uid(1, 7), memberOnly: uid(1, 8), roleOnly: uid(1, 9),
};
const company = uid(2, 1), foreignCompany = uid(2, 2);
const student = { assigned: uid(3, 1), other: uid(3, 2), unassigned: uid(3, 3), foreign: uid(3, 4), nullCompany: uid(3, 5) };
const enrollment = (n) => uid(4, n);
const cycle = (n) => uid(5, n);
const workout = (n) => uid(6, n);
const tables = ['students', 'enrollments', 'training_cycles', 'workouts'];
const rowIds = (n) => [uid(3, n), enrollment(n), cycle(n), workout(n)];
const q = (sql, params = []) => db.query(sql, params);
const scalar = async (sql, params = []) => (await q(sql, params)).rows[0]?.value;
const login = async (user, role = 'authenticated') => {
  assert.ok(['authenticated', 'anon'].includes(role));
  await db.exec(`reset role; set role ${role}`);
  await q("select set_config('request.jwt.claim.sub', $1, false)", [user || '']);
};
const owner = () => db.exec('reset role');
let passed = 0;
const failures = [];
async function test(name, run) {
  await owner();
  await db.exec('begin');
  try {
    await run();
    passed += 1;
    console.log(`ok ${passed + failures.length} - ${name}`);
  } catch (error) {
    failures.push({ name, message: error.message });
    console.error(`not ok ${passed + failures.length} - ${name}: ${error.message}`);
  } finally {
    await db.exec('rollback; reset role');
  }
}
async function rejected(sql, params, code, message) {
  await db.exec('savepoint expected_rejection');
  let error;
  try { await q(sql, params); } catch (caught) { error = caught; }
  await db.exec('rollback to savepoint expected_rejection; release savepoint expected_rejection');
  assert.ok(error, 'Statement unexpectedly succeeded');
  if (code) assert.ok((Array.isArray(code) ? code : [code]).includes(error.code), `${error.message}: unexpected SQLSTATE ${error.code}, expected ${code}`);
  if (message) assert.match(error.message, message);
}
async function unchanged(statement, params, expectedRows = 0) {
  assert.equal((await q(statement, params)).rows.length, expectedRows);
}
const manage = (c, s) => scalar('select public.can_manage_staff_student($1, $2) as value', [c, s]);
const reassign = (s, target, expected) => q('select * from public.reassign_student_trainer($1, $2, $3)', [s, target, expected]);
const directorySql = 'select * from public.get_company_student_staff_directory($1)';
const directory = async (c = company) => (await q(directorySql,[c])).rows;
const profileName = (name) => `Synthetic ${name}`;
const revisionSql = 'select public.replace_cycle_workout_revision($1, $2::jsonb, $3::jsonb) as value';
const desired = (label) => [
  { title: `A ${label}`, day_of_week: 1, exercises: [{ exercise_id: 'synthetic-a' }] },
  { title: `B ${label}`, day_of_week: null, exercises: [{ exercise_id: 'synthetic-b' }] },
];
const expectedWorkouts = (c) => scalar(`select coalesce(jsonb_agg(jsonb_build_object('id', id, 'updated_at', updated_at) order by sort_order, id), '[]') as value from workouts where cycle_id=$1 and superseded_at is null`, [c]);
const saveRevision = (c, expected, next) => scalar(revisionSql, [c, JSON.stringify(expected), JSON.stringify(next)]);
const financialBaselines = new Map();
async function financialMatrix(phase) {
  for (const role of ['trainer','otherTrainer','admin','coordinator','master','student','foreignTrainer']) {
    for (const n of [1,2,3,4]) {
      await test(`${phase}: payments CRUD parity ${role}, student ${n}`, async () => {
        const c = n === 4 ? foreignCompany : company;
        const ownCompany = role === 'foreignTrainer' ? n === 4 : n !== 4;
        const staff = ['trainer','otherTrainer','admin','coordinator','foreignTrainer'].includes(role);
        const readable = role === 'master' || (staff && ownCompany) || (role === 'student' && n === 2);
        const writable = role === 'master' || (ownCompany && (
          ['admin','coordinator'].includes(role) || (role === 'trainer' && n === 1)
          || (role === 'otherTrainer' && n === 2) || (role === 'foreignTrainer' && n === 4)
        ));
        await login(actor[role]);
        const result = {read:(await q('select id from payments where id=$1',[uid(8,n)])).rows.length};
        assert.equal(result.read,Number(readable));
        result.update = (await q("update payments set status='contract-edited' where id=$1 returning id",[uid(8,n)])).rows.length;
        assert.equal(result.update,Number(writable));
        const insertSql = 'insert into payments(id,company_id,student_id,enrollment_id) values($1,$2,$3,$4) returning id';
        const insertParams = [uid(90,n),c,uid(3,n),enrollment(n)];
        if (writable) {
          result.insert = (await q(insertSql,insertParams)).rows.length;
          assert.equal(result.insert,1);
          await unchanged('delete from payments where id=$1 returning id',[uid(90,n)],1);
        } else {
          await rejected(insertSql,insertParams,['42501','23514']);
          result.insert = 0;
        }
        result.delete = (await q('delete from payments where id=$1 returning id',[uid(8,n)])).rows.length;
        assert.equal(result.delete,Number(writable));
        const key = `${role}/${n}`;
        if (phase === 'before') financialBaselines.set(key,result);
        else assert.deepEqual(result,financialBaselines.get(key),'Financial CRUD must match the assignment-only baseline');
      });
    }
  }
}
const state = async () => {
  await owner();
  return scalar(`select jsonb_build_object(
    'students', (select jsonb_agg(to_jsonb(s) order by id) from students s),
    'enrollments', (select jsonb_agg(to_jsonb(e) order by id) from enrollments e),
    'workouts', (select jsonb_agg(to_jsonb(w) order by id) from workouts w),
    'versions', (select jsonb_agg(to_jsonb(v) order by id) from ai_plan_versions v),
    'history', (select jsonb_agg(to_jsonb(h) order by id) from trainer_assignments_history h)
  ) as value`);
};

try {
  // Synthetic minimal schema. Nullable links intentionally model corrupt legacy rows.
  // Auth shim is local only. All authorization functions/policies below are real SQL.
  await db.exec(`
    create schema auth;
    create schema extensions;
    create role anon;
    create role authenticated;
    create role service_role;
    create type public.app_role as enum ('admin','coordinator','trainer','master','student');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function public.current_business_date() returns date language sql stable as $$ select date '2026-10-14' $$;
    create table auth.users(id uuid primary key);
    create table companies(id uuid primary key);
    create table company_members(company_id uuid, user_id uuid, primary key(company_id,user_id));
    create table user_roles(user_id uuid, role public.app_role, primary key(user_id,role));
    create table profiles(user_id uuid primary key, full_name text);
    create table students(id uuid primary key default gen_random_uuid(), company_id uuid, user_id uuid,
      assigned_trainer_id uuid, full_name text default 'Synthetic', weekly_workout_goal int default 3,
      created_at timestamptz default now(), updated_at timestamptz default now());
    create table plans(id uuid primary key, company_id uuid);
    create table payments(id uuid primary key default gen_random_uuid(), company_id uuid, student_id uuid,
      enrollment_id uuid, status text default 'pending');
    create table payment_orphan_reconciliation_audit(id uuid primary key default gen_random_uuid(), company_id uuid, student_id uuid);
    create table payment_recovery_events(id uuid primary key default gen_random_uuid(), company_id uuid, student_id uuid);
    create table enrollments(id uuid primary key default gen_random_uuid(), company_id uuid, student_id uuid, plan_id uuid,
      trainer_id uuid, status text default 'active', updated_at timestamptz default now());
    create table training_cycles(id uuid primary key default gen_random_uuid(), company_id uuid, student_id uuid,
      enrollment_id uuid, cycle_number int default 1, status text default 'active', superseded_by_cycle_id uuid,
      start_date date default '2026-10-01', end_date date default '2026-11-30');
    create table workouts(id uuid primary key default gen_random_uuid(), cycle_id uuid, company_id uuid,
      name text, title text, description text, day_of_week int, sort_order int,
      exercises jsonb default '[{"exercise_id":"synthetic-old"}]', created_by uuid,
      created_at timestamptz default now(), updated_at timestamptz default now(), revision_id uuid,
      superseded_at timestamptz, superseded_by_revision_id uuid, superseded_reason text);
    create table ai_plan_versions(id uuid primary key default gen_random_uuid(), company_id uuid, student_id uuid,
      cycle_id uuid, plan jsonb, edited bool default false, edit_summary text, created_by uuid, created_at timestamptz default now());
    create table trainer_assignments_history(id uuid primary key default gen_random_uuid(), company_id uuid,
      student_id uuid, trainer_id uuid, previous_trainer_id uuid, assigned_at timestamptz default now(),
      unassigned_at timestamptz, changed_by uuid, deleted_at timestamptz);
    create table admin_alerts(id uuid primary key, company_id uuid, student_id uuid, enrollment_id uuid, target_user_id uuid);
  `);
  for (const table of ['weekly_contact_consent_events', 'intercycle_anamnesis_deliveries', 'intercycle_anamnesis_invites', 'intercycle_anamneses', 'intercycle_anamnesis_waivers']) {
    await db.exec(`create table ${table}(id uuid primary key, company_id uuid, student_id uuid); alter table ${table} enable row level security`);
  }
  await db.exec(functionSql(sources.base, 'has_role'));
  await db.exec(section(sources.staff, 'create or replace function public.is_company_staff', 'create or replace function public.is_student_company_staff'));
  await db.exec(sources.permissions);
  for (const table of [...tables, 'payments', 'payment_orphan_reconciliation_audit', 'payment_recovery_events', 'admin_alerts', 'ai_plan_versions', 'trainer_assignments_history']) {
    await db.exec(`alter table ${table} enable row level security`);
  }
  await db.exec(section(sources.integrity,'create policy "Company staff manage payments"','drop policy if exists "Company staff manage student evaluations"'));
  await db.exec(sources.base.match(/CREATE POLICY "Master full access" ON public\.payments[^;]*;/)[0]);
  await db.exec(sources.reads);
  await db.exec(sources.revisions);
  await db.exec(sources.oldReassign);
  await db.exec(sources.sync);
  await db.exec(section(sources.history, 'CREATE OR REPLACE FUNCTION public.log_trainer_assignment_change', '-- Backfill:'));
  await db.exec(section(sources.integrity, 'create or replace function public.prevent_student_self_privilege_escalation', '-- Student anamnesis.'));
  await db.exec(functionSql(sources.integrity, 'enforce_student_company_integrity'));
  for (const table of ['enrollments', 'payments', 'ai_plan_versions', 'trainer_assignments_history']) {
    await db.exec(`create trigger zz_enforce_student_company_integrity before insert or update on ${table} for each row execute function public.enforce_student_company_integrity()`);
  }
  await db.exec(section(sources.integrity, 'create or replace function public.enforce_enrollment_reference_integrity', 'create or replace function public.enforce_payment_reference_integrity'));
  await db.exec(section(sources.integrity,'create or replace function public.enforce_payment_reference_integrity','create or replace function public.enforce_evaluation_reference_integrity'));
  await db.exec(sources.historyIntegrity);
  await db.exec(`create trigger zz_enforce_trainer_history_reference_integrity before insert or update on trainer_assignments_history for each row execute function public.enforce_trainer_history_reference_integrity()`);
  for (const name of ['Master full access', 'Student updates own allowed fields']) {
    const match = sources.integrity.match(new RegExp(`create policy "${name}"[\\s\\S]*?;`, 'i'));
    assert.ok(match, `Missing real policy ${name}`);
    await db.exec(match[0]);
  }
  await db.exec(sources.base.match(/CREATE POLICY "Student reads own data"[^;]*;/)[0]);
  for (const table of ['enrollments','training_cycles','workouts']) {
    const policy = sources.base.match(new RegExp(`CREATE POLICY "Master full access" ON public\\.${table}[^;]*;`));
    assert.ok(policy, `Missing canonical master policy: ${table}`);
    await db.exec(policy[0]);
  }
  for (const [table,ownPolicy] of [['user_roles','Users can read own roles'],['profiles','Users can read own profile']]) {
    await db.exec(`alter table ${table} enable row level security`);
    for (const name of ['Master full access',ownPolicy]) {
      const policy = sources.base.match(new RegExp(`CREATE POLICY "${name}" ON public\\.${table}[^;]*;`));
      assert.ok(policy, `Missing canonical ${table} policy: ${name}`);
      await db.exec(policy[0]);
    }
  }
  await db.exec(sources.integrity.match(/create policy "Student reads own enrollments"[\s\S]*?;/i)[0]);
  await db.exec(`grant usage on schema public, auth to authenticated, anon;
    grant select on company_members, user_roles, profiles, plans to authenticated, anon;
    grant select, insert, update, delete on students, enrollments, training_cycles, workouts, payments to authenticated, anon`);

  await q('insert into companies values ($1), ($2)', [company, foreignCompany]);
  await q('insert into plans(id,company_id) values($1,$2),($3,$4)',[uid(20,1),company,uid(20,2),foreignCompany]);
  for (const [name, id] of Object.entries(actor)) {
    await q('insert into auth.users values ($1)', [id]);
    await q('insert into profiles(user_id,full_name) values($1,$2)',[id,profileName(name)]);
    if (name !== 'master' && name !== 'roleOnly') {
      await q('insert into company_members values ($1,$2)', [name === 'foreignTrainer' ? foreignCompany : company, id]);
    }
    if (name !== 'memberOnly') {
      const role = ['otherTrainer', 'foreignTrainer', 'roleOnly'].includes(name) ? 'trainer' : name;
      await q('insert into user_roles values ($1,$2)', [id, role]);
    }
  }
  for (let n = 1; n <= 5; n += 1) {
    const c = n === 4 ? foreignCompany : n === 5 ? null : company;
    const trainer = n === 1 ? actor.trainer : n === 3 || n === 5 ? null : n === 4 ? actor.foreignTrainer : actor.otherTrainer;
    await q('insert into students(id, company_id, user_id, assigned_trainer_id) values($1,$2,$3,$4)', [uid(3,n), c, n === 2 ? actor.student : null, trainer]);
    if (n <= 4) {
      await q('insert into enrollments(id,company_id,student_id,trainer_id) values($1,$2,$3,$4)', [enrollment(n), c, uid(3,n), trainer]);
      await q('insert into training_cycles(id,company_id,student_id,enrollment_id) values($1,$2,$3,$4)', [cycle(n), c, uid(3,n), enrollment(n)]);
      await q('insert into workouts(id,company_id,cycle_id,title,sort_order,created_by) values($1,$2,$3,$4,1,$5)', [workout(n), c, cycle(n), 'Synthetic original', trainer]);
      await q('insert into payments(id,company_id,student_id,enrollment_id) values($1,$2,$3,$4)',[uid(8,n),c,uid(3,n),enrollment(n)]);
    }
  }
  for (const [n, status] of [[21,'awaiting_training'],[22,'awaiting_renewal'],[23,'trial'],[24,'ended'],[25,'cancelled']]) {
    await q('insert into enrollments(id,company_id,student_id,trainer_id,status) values($1,$2,$3,$4,$5)', [enrollment(n), company, student.other, actor.otherTrainer, status]);
  }
  for (const [n,c,s] of [[10,company,student.foreign],[11,company,null],[12,null,student.other],[13,company,uid(3,99)]]) {
    await q('insert into training_cycles(id,company_id,student_id,enrollment_id) values($1,$2,$3,$4)', [cycle(n), c, s, enrollment(2)]);
  }
  // The old guards permitted member-only destinations; migration must preserve
  // these existing references without accepting them as new assignments.
  const legacyStudent = uid(3,6);
  await q('insert into students(id,company_id,assigned_trainer_id) values($1,$2,$3)',[legacyStudent,company,actor.memberOnly]);
  await q('insert into enrollments(id,company_id,student_id,trainer_id) values($1,$2,$3,$4)',[enrollment(6),company,legacyStudent,actor.memberOnly]);
  // Model an imported legacy NULL assignment, then restore the real autofill
  // trigger before any test or management migration runs.
  await db.exec('alter table enrollments disable trigger trg_fill_enrollment_trainer_from_student');
  await q('insert into enrollments(id,company_id,student_id,trainer_id) values($1,$2,$3,null)',[enrollment(7),company,legacyStudent]);
  await db.exec('alter table enrollments enable trigger trg_fill_enrollment_trainer_from_student');

  await test('fixture uses real staff function, membership, master exception and restrictive guards', async () => {
    assert.equal(await scalar("select count(*)::int as value from pg_policies where tablename in ('enrollments','training_cycles') and permissive='RESTRICTIVE'"), 6);
    await login(actor.trainer);
    assert.equal(await scalar('select current_user as value'), 'authenticated');
    assert.equal(await manage(company, student.assigned), true);
    assert.equal(await manage(company, student.other), false);
    assert.equal(await manage(company, student.unassigned), false);
    await login(actor.master);
    assert.equal(await manage(foreignCompany, student.foreign), true);
  });
  for (const [index, table] of tables.entries()) {
    await test(`before: other trainer may read but cannot update/delete ${table}`, async () => {
      await login(actor.trainer);
      assert.equal((await q(`select id from ${table} where id=$1`, [rowIds(2)[index]])).rows.length, 1);
      const field = table === 'students' ? 'full_name' : table === 'workouts' ? 'title' : 'status';
      await unchanged(`update ${table} set ${field}='unauthorized' where id=$1 returning id`, [rowIds(2)[index]]);
      await unchanged(`delete from ${table} where id=$1 returning id`, [rowIds(2)[index]]);
    });
  }
  for (const table of ['enrollments','training_cycles','workouts']) {
    await test(`before: assignment-only rejects insert ${table} for another trainer`, async () => {
      await login(actor.trainer);
      const sql = table === 'workouts'
        ? 'insert into workouts(company_id,cycle_id) values($1,$2)'
        : `insert into ${table}(company_id,student_id) values($1,$2)`;
      await rejected(sql, [company, table === 'workouts' ? cycle(2) : student.other], '42501');
    });
  }
  await test('before: trainer reassign RPC rejected even for own student', async () => {
    await login(actor.trainer);
    await rejected('select * from reassign_student_trainer($1,$2,$3)', [student.assigned,actor.otherTrainer,actor.trainer], '42501');
  });
  await test('before: revision RPC rejects other trainer and unassigned student', async () => {
    await login(actor.trainer);
    for (const n of [2,3]) {
      await rejected(revisionSql,[cycle(n),JSON.stringify(await expectedWorkouts(cycle(n))),JSON.stringify(desired('before'))],'P0001',/workout_revision_forbidden/);
    }
  });
  await test('before: direct assignment of another trainer student is denied by RLS', async () => {
    await login(actor.trainer);
    await unchanged('update students set assigned_trainer_id=$2 where id=$1 returning id',[student.other,actor.student]);
  });
  await test('before: existing student INSERT RETURNING policy rejects visibility of a new student', async () => {
    await login(actor.trainer);
    await rejected('insert into students(id,company_id) values($1,$2) returning id',[uid(30,2),company],'42501');
  });

  await financialMatrix('before');
  await owner();
  const baselineFinancialBody = await scalar("select prosrc as value from pg_proc where oid='public.can_manage_staff_student(uuid,uuid)'::regprocedure");
  try { await db.exec(sources.management); }
  catch (error) { throw new Error(`Management migration failed (${error.code}): ${error.message}; baseline passed=${passed}, failed=${failures.length}`); }
  await financialMatrix('after');
  await test('after: financial helper retains old predicate and all three financial tables have restrictive mutation guards', async () => {
    const financialBody = await scalar("select prosrc as value from pg_proc where oid='public.can_manage_staff_student_financial(uuid,uuid)'::regprocedure");
    const normalize = (sql) => sql.replace(/\s+/g,' ').trim();
    assert.equal(normalize(financialBody),normalize(baselineFinancialBody));
    const guards = (await q(`select tablename,cmd,qual,with_check from pg_policies
      where tablename in ('payments','payment_orphan_reconciliation_audit','payment_recovery_events')
      and policyname in ('Assigned staff insert guard','Assigned staff update guard','Assigned staff delete guard')
      and permissive='RESTRICTIVE'`)).rows;
    assert.equal(guards.length,9);
    for (const guard of guards) assert.match(`${guard.qual || ''} ${guard.with_check || ''}`,/can_manage_staff_student_financial/);
    await login(actor.trainer);
    assert.equal(await manage(company,student.other),true);
    assert.equal(await scalar('select can_manage_staff_student_financial($1,$2) as value',[company,student.other]),false);
  });
  for (const role of ['trainer','admin','coordinator','master']) {
    for (const target of ['other','unassigned']) {
      const n = target === 'other' ? 2 : 3;
      for (const [index,table] of tables.entries()) {
        await test(`after: ${role} CRUD ${table}, ${target} student`, async () => {
          await login(actor[role]);
          assert.equal(await manage(company,student[target]), true);
          const id = rowIds(n)[index];
          assert.equal((await q(`select id from ${table} where id=$1`, [id])).rows.length, 1);
          const field = table === 'students' ? 'full_name' : table === 'workouts' ? 'title' : 'status';
          await unchanged(`update ${table} set ${field}='edited' where id=$1 returning id`, [id], 1);
          const insertedStudent = uid(30,1);
          const sql = table === 'students' ? 'insert into students(company_id,id) values($1,$2)'
            : table === 'workouts' ? 'insert into workouts(company_id,cycle_id) values($1,$2) returning id'
            : `insert into ${table}(company_id,student_id) values($1,$2) returning id`;
          const params = table === 'students' ? [company,insertedStudent] : [company, table === 'workouts' ? cycle(n) : student[target]];
          const insertResult = await q(sql, params);
          const inserted = table === 'students' ? insertedStudent : insertResult.rows[0].id;
          assert.equal((await q(`select id from ${table} where id=$1`, [inserted])).rows.length, 1);
          await unchanged(`delete from ${table} where id=$1 returning id`, [inserted], 1);
          await unchanged(`delete from ${table} where id=$1 returning id`, [id], 1);
        });
      }
    }
    await test(`after: ${role} rejects null/mismatched/missing student-company pairs`, async () => {
      await login(actor[role]);
      for (const [c,s] of [[null,student.other],[company,null],[company,student.foreign],[foreignCompany,student.other],[company,student.nullCompany],[company,uid(3,99)]]) {
        assert.equal(await manage(c,s), false, `${role}: ${c}/${s}`);
      }
    });
  }
  for (const role of ['trainer','admin','coordinator']) {
    await test(`after: ${role} cannot read or mutate another tenant`, async () => {
      await login(actor[role]);
      assert.equal(await manage(foreignCompany,student.foreign), false);
      for (const [index,table] of tables.entries()) {
        const id = rowIds(4)[index];
        assert.equal((await q(`select id from ${table} where id=$1`, [id])).rows.length, 0);
        const field = table === 'students' ? 'full_name' : table === 'workouts' ? 'title' : 'status';
        await unchanged(`update ${table} set ${field}='forbidden' where id=$1 returning id`, [id]);
        await unchanged(`delete from ${table} where id=$1 returning id`, [id]);
      }
      await rejected('insert into students(company_id) values($1)', [foreignCompany], '42501');
      for (const table of ['enrollments','training_cycles','workouts']) {
        const sql = table === 'workouts' ? 'insert into workouts(company_id,cycle_id) values($1,$2)'
          : `insert into ${table}(company_id,student_id) values($1,$2)`;
        await rejected(sql,[foreignCompany,table === 'workouts' ? cycle(4) : student.foreign],table === 'enrollments' ? '23514' : '42501');
      }
      await rejected(revisionSql, [cycle(4),'[]',JSON.stringify(desired('forbidden'))], 'P0001', /workout_revision_forbidden/);
      await rejected('select * from reassign_student_trainer($1,$2,$3)', [student.foreign,actor.trainer,actor.foreignTrainer], '42501');
    });
  }
  for (const role of ['student','memberOnly','roleOnly','foreignTrainer']) {
    await test(`after: ${role} cannot manage same-company students or prescriptions`, async () => {
      await login(actor[role]);
      assert.equal(await manage(company,student.other), false);
      for (const [index,table] of tables.entries()) {
        const id = rowIds(2)[index];
        if (!(['students','enrollments'].includes(table) && role === 'student')) assert.equal((await q(`select id from ${table} where id=$1`, [id])).rows.length, 0);
        const field = table === 'students' ? 'full_name' : table === 'workouts' ? 'title' : 'status';
        if (table === 'students' && role === 'student') await rejected(`update students set full_name='forbidden' where id=$1`, [id], '42501');
        else await unchanged(`update ${table} set ${field}='forbidden' where id=$1 returning id`, [id]);
        await unchanged(`delete from ${table} where id=$1 returning id`, [id]);
      }
      await rejected('insert into students(company_id) values($1)', [company], '42501');
      await rejected('insert into enrollments(company_id,student_id) values($1,$2)', [company,student.other], ['42501','23514']);
      await rejected('insert into training_cycles(company_id,student_id) values($1,$2)', [company,student.other], '42501');
      await rejected('insert into workouts(company_id,cycle_id) values($1,$2)', [company,cycle(2)], '42501');
      await rejected(revisionSql, [cycle(2),'[]',JSON.stringify(desired('forbidden'))], 'P0001', /workout_revision_forbidden/);
      await rejected('select * from reassign_student_trainer($1,$2,$3)', [student.other,actor.trainer,actor.otherTrainer], '42501');
    });
  }
  await test('after: anonymous has neither CRUD visibility nor RPC execute privileges', async () => {
    await login(null,'anon');
    for (const table of tables) {
      assert.equal((await q(`select * from ${table}`)).rows.length, 0);
      await unchanged(`delete from ${table} returning id`, []);
      const field = table === 'students' ? 'full_name' : table === 'workouts' ? 'title' : 'status';
      await unchanged(`update ${table} set ${field}='anonymous' returning id`,[]);
    }
    for (const sql of [
      'select can_manage_staff_student($1,$2)',
      'select * from reassign_student_trainer($1,$2,$3)',
      'select replace_cycle_workout_revision($1,$2::jsonb,$3::jsonb)',
    ]) {
      const params = sql.includes('can_manage') ? [company,student.other]
        : sql.includes('reassign') ? [student.other,actor.trainer,actor.otherTrainer]
        : [cycle(2),'[]',JSON.stringify(desired('anonymous'))];
      await rejected(sql, params, '42501');
    }
    await rejected('insert into students(company_id) values($1)', [company], '42501');
    for (const table of ['enrollments','training_cycles','workouts']) {
      const sql = table === 'workouts' ? 'insert into workouts(company_id,cycle_id) values($1,$2)'
        : `insert into ${table}(company_id,student_id) values($1,$2)`;
      await rejected(sql,[company,table === 'workouts' ? cycle(2) : student.other],table === 'enrollments' ? '23514' : '42501');
    }
  });
  await test('after: authenticated role with missing uid is denied', async () => {
    await login(null);
    assert.equal(await manage(company,student.other), false);
    await rejected(revisionSql,[cycle(2),'[]',JSON.stringify(desired('no uid'))], 'P0001', /workout_revision_forbidden/);
    await rejected('select * from reassign_student_trainer($1,$2,$3)',[student.other,actor.trainer,actor.otherTrainer],'42501',/Authentication required/);
  });
  for (const role of ['trainer','admin','coordinator']) {
    await test(`after: ${role} cannot insert/reparent null or mismatched student-company/cycle links`, async () => {
      await login(actor[role]);
      for (const table of ['enrollments','training_cycles']) {
        for (const [c,s] of [[null,student.other],[company,null],[company,student.foreign],[company,uid(3,99)]]) {
          await rejected(`insert into ${table}(company_id,student_id) values($1,$2)`, [c,s], table === 'enrollments' && s !== null ? '23514' : '42501');
        }
        await rejected(`update ${table} set student_id=$2 where id=$1`, [table === 'enrollments' ? enrollment(2) : cycle(2), student.foreign], table === 'enrollments' ? '23514' : '42501');
      }
      await rejected('insert into workouts(company_id,cycle_id) values($1,$2)', [company,cycle(4)], '42501');
      await rejected('update workouts set company_id=$2 where id=$1', [workout(2),foreignCompany], '42501');
    });
  }
  for (const role of ['trainer','admin','coordinator','master']) {
    for (const n of [2,3]) {
      await test(`after: ${role} actual revision RPC saves ${n === 2 ? 'other' : 'unassigned'} student, preserves history and CAS`, async () => {
        await login(actor[role]);
        const initial = await expectedWorkouts(cycle(n));
        const first = await saveRevision(cycle(n), initial, desired('first'));
        assert.equal(first.workouts_created, 2);
        assert.equal(first.workout_rows.length, 2);
        assert.ok(first.workout_rows.every((w) => w.id && w.updated_at));
        const second = await saveRevision(cycle(n), first.workout_rows, desired('second'));
        assert.equal(second.workouts_created, 2);
        assert.notEqual(first.revision_id,second.revision_id);
        const before = await state();
        await login(actor[role]);
        await rejected(revisionSql,[cycle(n),JSON.stringify(first.workout_rows),JSON.stringify(desired('stale'))],'P0001',/workout_revision_changed/);
        const changedTimestamp = second.workout_rows.map((w) => ({...w,updated_at:'2000-01-01T00:00:00Z'}));
        await rejected(revisionSql,[cycle(n),JSON.stringify(changedTimestamp),JSON.stringify(desired('timestamp'))],'P0001',/workout_revision_changed/);
        await rejected(revisionSql,[cycle(n),JSON.stringify(second.workout_rows),JSON.stringify([{title:'Invalid',day_of_week:9,exercises:[]}])],'P0001',/workout_revision_payload_invalid/);
        assert.deepEqual(await state(),before,'Rejected saves must roll back supersession and version inserts');
        const saved = (await q('select * from workouts where cycle_id=$1',[cycle(n)])).rows;
        assert.equal(saved.length,5);
        assert.equal(saved.filter((w) => w.superseded_at !== null).length,3);
        const old = saved.find((w) => w.id === workout(n));
        assert.equal(old.title,'Synthetic original');
        assert.deepEqual(old.exercises,[{exercise_id:'synthetic-old'}]);
        assert.equal(old.superseded_by_revision_id,first.revision_id);
        assert.equal(saved.filter((w) => w.superseded_at === null && w.created_by === actor[role]).length,2);
        const versions = (await q('select * from ai_plan_versions where cycle_id=$1 order by created_at,id',[cycle(n)])).rows;
        assert.equal(versions.length,2);
        assert.ok(versions.every((v) => v.created_by === actor[role] && v.edited));
        assert.deepEqual(versions.map((v) => v.plan.revision_id).sort(),[first.revision_id,second.revision_id].sort());
      });
    }
  }
  for (const n of [10,11,12,13]) {
    await test(`after: revision rejects corrupt cycle ${n} and leaves state unchanged`, async () => {
      const before = await state();
      await login(actor.trainer);
      await rejected(revisionSql,[cycle(n),'[]',JSON.stringify(desired('corrupt'))],'P0001',/workout_revision_forbidden/);
      assert.deepEqual(await state(),before);
    });
  }
  for (const role of ['trainer','admin','coordinator','master']) {
    await test(`after: ${role} reassigns within company atomically, preserving enrollment/workout/assignment history`, async () => {
      const before = await state();
      await login(actor[role]);
      const result = (await reassign(student.other,actor.trainer,actor.otherTrainer)).rows[0];
      assert.deepEqual(result,{student_id:student.other,previous_trainer_id:actor.otherTrainer,trainer_id:actor.trainer,updated_enrollments:4});
      const after = await state();
      assert.equal(after.students.find((s) => s.id === student.other).assigned_trainer_id,actor.trainer);
      assert.deepEqual(after.workouts,before.workouts);
      assert.deepEqual(after.versions,before.versions);
      assert.equal(after.enrollments.length,before.enrollments.length);
      for (const row of after.enrollments.filter((e) => e.student_id === student.other)) {
        assert.equal(row.trainer_id,['active','awaiting_training','awaiting_renewal','trial'].includes(row.status) ? actor.trainer : actor.otherTrainer);
      }
      const history = after.history.filter((h) => h.student_id === student.other);
      assert.equal(history.length,2);
      assert.ok(history.find((h) => h.trainer_id === actor.otherTrainer).unassigned_at);
      assert.equal(history.find((h) => h.trainer_id === actor.trainer).previous_trainer_id,actor.otherTrainer);
      assert.equal(history.find((h) => h.trainer_id === actor.trainer).changed_by,actor[role]);
      await login(actor[role]);
      await rejected('select * from reassign_student_trainer($1,$2,$3)',[student.other,actor.otherTrainer,actor.otherTrainer],'40001',/assignment changed/);
      assert.deepEqual(await state(),after);
    });
  }
  await test('after: trainer can assign an unassigned same-company student with null expected trainer', async () => {
    await login(actor.trainer);
    const result = (await reassign(student.unassigned,actor.otherTrainer,null)).rows[0];
    assert.equal(result.previous_trainer_id,null);
    assert.equal(result.trainer_id,actor.otherTrainer);
    assert.equal(result.updated_enrollments,1);
  });
  for (const [name,target] of [['foreign trainer',actor.foreignTrainer],['student member',actor.student],['member without staff role',actor.memberOnly],['trainer without membership',actor.roleOnly],['master without explicit membership',actor.master],['null',null]]) {
    await test(`after: reassign rejects destination ${name} without side effects`, async () => {
      const before = await state();
      await login(actor.trainer);
      await rejected('select * from reassign_student_trainer($1,$2,$3)',[student.other,target,actor.otherTrainer],'23514',/Destination trainer/);
      assert.deepEqual(await state(),before);
    });
  }
  await test('after: stale expected, unchanged destination and missing student reject without side effects', async () => {
    const before = await state();
    await login(actor.trainer);
    await rejected('select * from reassign_student_trainer($1,$2,$3)',[student.other,actor.trainer,null],'40001');
    await rejected('select * from reassign_student_trainer($1,$2,$3)',[student.other,actor.otherTrainer,actor.otherTrainer],'22023');
    await rejected('select * from reassign_student_trainer($1,$2,$3)',[uid(3,99),actor.trainer,null],'P0002');
    assert.deepEqual(await state(),before);
  });
  for (const role of ['admin','coordinator']) {
    await test(`after: reassign RPC accepts same-company ${role} destination and preserves history`, async () => {
      const before = await state();
      await login(actor.trainer);
      assert.ok((await directory()).some((row) => row.user_id === actor[role] && row.roles.includes(role)));
      assert.deepEqual((await reassign(student.other,actor[role],actor.otherTrainer)).rows,[{
        student_id:student.other,previous_trainer_id:actor.otherTrainer,trainer_id:actor[role],updated_enrollments:4,
      }]);
      const after = await state();
      assert.deepEqual(after.workouts,before.workouts);
      assert.deepEqual(after.versions,before.versions);
      assert.equal(after.students.find((row) => row.id === student.other).assigned_trainer_id,actor[role]);
      for (const row of after.enrollments.filter((e) => e.student_id === student.other)) {
        assert.equal(row.trainer_id,['active','awaiting_training','awaiting_renewal','trial'].includes(row.status) ? actor[role] : actor.otherTrainer);
      }
      const history = after.history.filter((row) => row.student_id === student.other);
      assert.equal(history.length,2);
      assert.ok(history.find((row) => row.trainer_id === actor.otherTrainer).unassigned_at);
      assert.equal(history.find((row) => row.trainer_id === actor[role]).previous_trainer_id,actor.otherTrainer);
    });
  }
  await test('after: direct assignment must not bypass RPC destination-role validation', async () => {
    await login(actor.trainer);
    await rejected('update students set assigned_trainer_id=$2 where id=$1 returning id',[student.other,actor.student],['42501','23514']);
  });
  const assignmentTables = [
    {table:'students',field:'assigned_trainer_id',id:student.other,legacyId:legacyStudent},
    {table:'enrollments',field:'trainer_id',id:enrollment(2),legacyId:enrollment(6)},
  ];
  const invalidDestinations = [
    ['student member',actor.student],['foreign trainer',actor.foreignTrainer],
    ['member without staff role',actor.memberOnly],['trainer without membership',actor.roleOnly],
    ['master without explicit membership',actor.master],
  ];
  for (const {table,field,id,legacyId} of assignmentTables) {
    for (const [name,target] of invalidDestinations) {
      await test(`after: direct ${table} assignment rejects ${name} on UPDATE and INSERT`, async () => {
        const before = await state();
        await login(actor.trainer);
        await rejected(`update ${table} set ${field}=$2 where id=$1 returning id`,[id,target],'23514',/Assigned professional must be staff|Enrollment trainer\/company mismatch/);
        const sql = table === 'students'
          ? 'insert into students(id,company_id,assigned_trainer_id) values($1,$2,$3)'
          : 'insert into enrollments(id,company_id,trainer_id,student_id) values($1,$2,$3,$4)';
        const params = table === 'students' ? [uid(30,3),company,target] : [uid(40,3),company,target,student.unassigned];
        await rejected(sql,params,'23514',/Assigned professional must be staff|Enrollment trainer\/company mismatch/);
        assert.deepEqual(await state(),before,'Rejected direct assignments must not change history or linked enrollments');
      });
    }
    for (const role of ['trainer','coordinator','admin','master']) {
      await test(`after: direct ${table} assignment accepts same-company ${role} on UPDATE and INSERT`, async () => {
        if (role === 'master') await q('insert into company_members(company_id,user_id) values($1,$2)',[company,actor.master]);
        await login(actor.trainer);
        const target = actor[role];
        const result = (await q(`update ${table} set ${field}=$2 where id=$1 returning ${field} as destination`,[id,target])).rows;
        assert.deepEqual(result,[{destination:target}]);
        const newId = table === 'students' ? uid(30,3) : uid(40,3);
        if (table === 'students') {
          await q('insert into students(id,company_id,assigned_trainer_id) values($1,$2,$3)',[newId,company,target]);
          assert.equal(await scalar('select trainer_id as value from enrollments where id=$1',[enrollment(2)]),target);
        } else {
          await q('insert into enrollments(id,company_id,student_id,trainer_id) values($1,$2,$3,$4)',[newId,company,student.unassigned,target]);
          assert.equal(await scalar('select assigned_trainer_id as value from students where id=$1',[student.unassigned]),target);
        }
        assert.equal(await scalar(`select ${field} as value from ${table} where id=$1`,[newId]),target);
      });
    }
    await test(`after: direct ${table} UPDATE preserves unchanged legacy member-only assignment`, async () => {
      const before = await state();
      await login(actor.trainer);
      const extra = table === 'students' ? ", full_name='Updated legacy profile'" : ", status='awaiting_renewal'";
      assert.deepEqual((await q(`update ${table} set ${field}=${field}${extra} where id=$1 returning ${field} as destination`,[legacyId])).rows,[{destination:actor.memberOnly}]);
      const after = await state();
      assert.deepEqual(after.history,before.history,'Unchanged legacy references must not rewrite assignment history');
      assert.deepEqual(after.workouts,before.workouts);
      assert.equal(after[table].find((row) => row.id === legacyId)[field],actor.memberOnly);
    });
    for (const revoked of ['role','membership']) {
      await test(`after: direct ${table} new assignment rejects destination after ${revoked} revocation`, async () => {
        if (revoked === 'role') await q('delete from user_roles where user_id=$1 and role=$2',[actor.otherTrainer,'trainer']);
        else await q('delete from company_members where company_id=$1 and user_id=$2',[company,actor.otherTrainer]);
        const before = await state();
        await login(actor.trainer);
        const unassignedId = table === 'students' ? student.unassigned : enrollment(3);
        await rejected(`update ${table} set ${field}=$2 where id=$1 returning id`,[unassignedId,actor.otherTrainer],'23514',/Assigned professional must be staff|Enrollment trainer\/company mismatch/);
        await rejected('select * from reassign_student_trainer($1,$2,$3)',[student.unassigned,actor.otherTrainer,null],'23514',/Destination trainer/);
        assert.deepEqual(await state(),before);
      });
      await test(`after: direct ${table} preserves unchanged assignment after destination ${revoked} revocation`, async () => {
        if (revoked === 'role') await q('delete from user_roles where user_id=$1 and role=$2',[actor.otherTrainer,'trainer']);
        else await q('delete from company_members where company_id=$1 and user_id=$2',[company,actor.otherTrainer]);
        const before = await state();
        await login(actor.trainer);
        const extra = table === 'students' ? ", full_name='Updated retired profile'" : ", status='awaiting_renewal'";
        assert.deepEqual((await q(`update ${table} set ${field}=${field}${extra} where id=$1 returning ${field} as destination`,[id])).rows,[{destination:actor.otherTrainer}]);
        if (table === 'enrollments') {
          assert.deepEqual((await q('update enrollments set plan_id=$2 where id=$1 returning plan_id,trainer_id',[id,uid(20,1)])).rows,[{plan_id:uid(20,1),trainer_id:actor.otherTrainer}]);
          for (const invalidPlan of [uid(20,2),uid(20,99)]) {
            await rejected('update enrollments set plan_id=$2 where id=$1',[id,invalidPlan],'23514',/Enrollment plan\/company mismatch/);
          }
          await rejected('insert into enrollments(company_id,student_id,trainer_id,plan_id) values($1,$2,$3,$4)',[company,student.unassigned,actor.trainer,uid(20,2)],'23514',/Enrollment plan\/company mismatch/);
          await rejected('update enrollments set company_id=$2,plan_id=null where id=$1',[id,foreignCompany],'23514',/Enrollment trainer\/company mismatch/);
          // Even an unchanged plan link must be checked before preserving a
          // retired trainer reference if the plan's tenant has since changed.
          await owner();
          await q('update plans set company_id=$2 where id=$1',[uid(20,1),foreignCompany]);
          await login(actor.trainer);
          await rejected("update enrollments set trainer_id=trainer_id,status='active' where id=$1",[id],'23514',/Enrollment plan\/company mismatch/);
        }
        assert.deepEqual((await state()).history,before.history);
      });
    }
  }
  for (const revoked of ['role','membership']) {
    await test(`after: actor ${revoked} revocation denies CRUD, revision and reassignment`, async () => {
      if (revoked === 'role') await q('delete from user_roles where user_id=$1 and role=$2',[actor.trainer,'trainer']);
      else await q('delete from company_members where company_id=$1 and user_id=$2',[company,actor.trainer]);
      const before = await state();
      await login(actor.trainer);
      assert.equal(await manage(company,student.assigned),false);
      for (const [index,table] of tables.entries()) {
        const id = rowIds(1)[index];
        assert.equal((await q(`select id from ${table} where id=$1`,[id])).rows.length,0);
        const field = table === 'students' ? 'full_name' : table === 'workouts' ? 'title' : 'status';
        await unchanged(`update ${table} set ${field}='revoked actor' where id=$1 returning id`,[id]);
        await unchanged(`delete from ${table} where id=$1 returning id`,[id]);
      }
      await rejected('insert into students(company_id) values($1)',[company],'42501');
      await rejected(revisionSql,[cycle(1),'[]',JSON.stringify(desired('revoked actor'))],'P0001',/workout_revision_forbidden/);
      await rejected('select * from reassign_student_trainer($1,$2,$3)',[student.assigned,actor.otherTrainer,actor.trainer],'42501');
      assert.deepEqual(await state(),before);
    });
  }
  await test('after: enrollment autofill from a valid staff assignment remains accepted', async () => {
    await login(actor.trainer);
    await q('insert into enrollments(id,company_id,student_id) values($1,$2,$3)',[uid(40,4),company,student.other]);
    assert.equal(await scalar('select trainer_id as value from enrollments where id=$1',[uid(40,4)]),actor.otherTrainer);
  });
  for (const trainerClause of ['',',trainer_id']) {
    await test(`after: enrollment INSERT ${trainerClause ? 'explicit trainer NULL' : 'omitted trainer'} cannot inherit invalid legacy assignment`, async () => {
      const before = await state();
      await login(actor.trainer);
      await rejected(`insert into enrollments(id,company_id,student_id${trainerClause}) values($1,$2,$3${trainerClause ? ',null' : ''})`,[uid(40,4),company,legacyStudent],'23514',/Assigned professional must be staff/);
      assert.deepEqual(await state(),before);
    });
  }
  await test('after: status-only enrollment UPDATE leaves legacy trainer NULL without autofill', async () => {
    await login(actor.trainer);
    assert.equal(await scalar('select trainer_id as value from enrollments where id=$1',[enrollment(7)]),null);
    assert.deepEqual((await q("update enrollments set status='awaiting_renewal' where id=$1 returning trainer_id,status",[enrollment(7)])).rows,[{trainer_id:null,status:'awaiting_renewal'}]);
  });
  await test('after: enrollment UPDATE without trainer field cannot inherit invalid assignee through student-id autofill', async () => {
    const before = await state();
    await login(actor.trainer);
    assert.equal(await scalar('select trainer_id as value from enrollments where id=$1',[enrollment(7)]),null);
    await rejected("update enrollments set student_id=student_id,status='awaiting_renewal' where id=$1",[enrollment(7)],'23514',/Assigned professional must be staff/);
    assert.deepEqual(await state(),before);
  });
  await test('after: both staff assignment guards run AFTER INSERT and every UPDATE', async () => {
    const triggers = (await q(`select tgname,pg_get_triggerdef(oid) as definition from pg_trigger
      where tgname in ('student_staff_assignment_guard','enrollment_staff_assignment_guard') order by tgname`)).rows;
    assert.equal(triggers.length,2);
    for (const trigger of triggers) {
      assert.match(trigger.definition,/AFTER INSERT OR UPDATE ON/);
      assert.doesNotMatch(trigger.definition,/UPDATE OF/);
    }
  });
  const staffNames = ['trainer','otherTrainer','admin','coordinator'];
  const expectedDirectory = (names = staffNames) => names.map((name) => ({user_id:actor[name],full_name:profileName(name),roles:[name === 'otherTrainer' ? 'trainer' : name]}));
  const byUser = (rows) => [...rows].sort((a,b) => a.user_id.localeCompare(b.user_id));
  for (const role of ['trainer','admin','coordinator','master']) {
    await test(`after: directory ${role} sees exact same-company staff names and role arrays`, async () => {
      await login(actor[role]);
      const rows = await directory();
      assert.deepEqual(byUser(rows),byUser(expectedDirectory()));
      assert.deepEqual(rows.map((row) => row.full_name),rows.map((row) => row.full_name).sort());
      assert.ok(rows.every((row) => Object.keys(row).sort().join(',') === 'full_name,roles,user_id'));
      for (const excluded of ['student','memberOnly','foreignTrainer','roleOnly']) {
        assert.ok(!rows.some((row) => row.user_id === actor[excluded]));
      }
    });
  }
  await test('after: directory exposes colleague names without widening raw roles/profile reads', async () => {
    await login(actor.trainer);
    const beforeRoles = (await q('select user_id,role from user_roles order by user_id,role')).rows;
    const beforeProfiles = (await q('select user_id,full_name from profiles order by user_id')).rows;
    assert.deepEqual(beforeRoles,[{user_id:actor.trainer,role:'trainer'}]);
    assert.deepEqual(beforeProfiles,[{user_id:actor.trainer,full_name:profileName('trainer')}]);
    assert.equal((await directory()).find((row) => row.user_id === actor.otherTrainer).full_name,profileName('otherTrainer'));
    assert.deepEqual((await q('select user_id,role from user_roles order by user_id,role')).rows,beforeRoles);
    assert.deepEqual((await q('select user_id,full_name from profiles order by user_id')).rows,beforeProfiles);
    assert.equal(await scalar("select has_table_privilege('authenticated','public.user_roles','INSERT') as value"),false);
    assert.equal(await scalar("select has_table_privilege('authenticated','public.user_roles','UPDATE') as value"),false);
  });
  for (const role of ['student','memberOnly','roleOnly','foreignTrainer']) {
    await test(`after: directory denies ${role} in requested company`, async () => {
      await login(actor[role]);
      await rejected(directorySql,[company],'42501',/Company staff access required/);
    });
  }
  await test('after: directory denies trainer access to foreign, null or nonexistent companies', async () => {
    await login(actor.trainer);
    for (const c of [foreignCompany,null,uid(2,99)]) await rejected(directorySql,[c],'42501',/Company staff access required/);
  });
  await test('after: foreign-company trainer sees only their own company staff', async () => {
    await login(actor.foreignTrainer);
    assert.deepEqual(await directory(foreignCompany),[{user_id:actor.foreignTrainer,full_name:profileName('foreignTrainer'),roles:['trainer']}]);
  });
  await test('after: directory denies anon execute even with spoofed uid and denies missing authenticated uid', async () => {
    for (const id of [null,actor.trainer]) {
      await login(id,'anon');
      await rejected(directorySql,[company],'42501');
    }
    await login(null);
    await rejected(directorySql,[company],'42501',/Company staff access required/);
  });
  for (const revoked of ['role','membership']) {
    await test(`after: directory denies actor after ${revoked} revocation`, async () => {
      if (revoked === 'role') await q('delete from user_roles where user_id=$1 and role=$2',[actor.trainer,'trainer']);
      else await q('delete from company_members where company_id=$1 and user_id=$2',[company,actor.trainer]);
      await login(actor.trainer);
      await rejected(directorySql,[company],'42501',/Company staff access required/);
    });
    await test(`after: directory removes destination after ${revoked} revocation`, async () => {
      if (revoked === 'role') await q('delete from user_roles where user_id=$1 and role=$2',[actor.otherTrainer,'trainer']);
      else await q('delete from company_members where company_id=$1 and user_id=$2',[company,actor.otherTrainer]);
      await login(actor.trainer);
      assert.deepEqual(byUser(await directory()),byUser(expectedDirectory(staffNames.filter((name) => name !== 'otherTrainer'))));
    });
  }
  await test('after: directory aggregates only distinct eligible roles and includes explicitly affiliated master', async () => {
    await q('insert into user_roles(user_id,role) values($1,$2),($1,$3)',[actor.otherTrainer,'admin','student']);
    await q('insert into company_members(company_id,user_id) values($1,$2)',[company,actor.master]);
    await login(actor.trainer);
    const rows = await directory();
    assert.equal(rows.length,5);
    assert.deepEqual(rows.find((row) => row.user_id === actor.otherTrainer).roles,['admin','trainer']);
    assert.deepEqual(rows.find((row) => row.user_id === actor.master),{user_id:actor.master,full_name:profileName('master'),roles:['master']});
  });
  await test('after: directory uses fallback name for eligible staff without profile', async () => {
    await q('delete from profiles where user_id=$1',[actor.otherTrainer]);
    await login(actor.trainer);
    assert.deepEqual((await directory()).find((row) => row.user_id === actor.otherTrainer),{user_id:actor.otherTrainer,full_name:'Sem nome',roles:['trainer']});
  });
  await test('after: existing student INSERT RETURNING limitation remains reproducible', async () => {
    await login(actor.trainer);
    await rejected('insert into students(id,company_id) values($1,$2) returning id',[uid(30,2),company],'42501');
  });
  await test('after: real master helper retains pre-existing global tenant access', async () => {
    await login(actor.master);
    assert.equal(await manage(foreignCompany,student.foreign),true);
    assert.equal((await q('update students set full_name=$2 where id=$1 returning id',[student.foreign,'Master synthetic edit'])).rows.length,1);
    const result = await saveRevision(cycle(4),await expectedWorkouts(cycle(4)),desired('master global'));
    assert.equal(result.workouts_created,2);
  });

  console.log(JSON.stringify({ok:failures.length===0,passed,failed:failures.length,total:passed+failures.length,
    environment:'local in-memory PGlite; synthetic fixtures; no live database',
    policySources:['20260820113000','20260922110000'],
    actualMigration:'20261014164920_company_staff_student_management.sql',
    limitations:['Minimal schema, not complete production schema replay','CAS tested sequentially; no concurrent multi-connection lock scheduling','Master global access is inherited from the real is_company_staff function'],
    failures},null,2));
  if (failures.length) process.exitCode = 1;
} finally {
  await db.close();
}
