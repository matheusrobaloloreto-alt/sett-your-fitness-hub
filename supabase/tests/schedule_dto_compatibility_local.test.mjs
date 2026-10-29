// Native PostgreSQL only, disposable LOCAL database. No hosted calls or real identities.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
let db = `schedule_dto_qa_${process.pid}`;
const originalPath = new URL('../migrations/20261029181000_schedule_contract_reconciliation.sql', import.meta.url);
const forwardPath = new URL('../migrations/20261029181100_schedule_read_dto_compatibility.sql', import.meta.url);
const actor = "set test.actor='00000001-0000-4000-8000-000000000001';";
const enrollment = '00000005-0000-4000-8000-000000000001';
function query(database, sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['--host', 'unix:///Users/macbookpro/.colima/default/docker.sock', 'exec', '-i',
      'supabase_db_sett-self-service-local-20261026', 'psql', '-X', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-d', database], { timeout: 30000 });
    let stdout = '', stderr = '';
    child.stdout.on('data', value => { stdout += value; });
    child.stderr.on('data', value => { stderr += value; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
    child.stdin.end(sql);
  });
}
async function ok(sql) {
  const result = await query(db, actor + sql);
  assert.equal(result.code, 0, result.stderr);
  return result.stdout.trim().split('\n').filter(Boolean).at(-1);
}
const read = `select public.get_prescription_schedule('${enrollment}');`;
const insert = `insert into public.enrollments(id,student_id,company_id,plan_id,status,start_date,end_date,training_start_date)
 values('${enrollment}','00000003-0000-4000-8000-000000000001','00000002-0000-4000-8000-000000000001','00000004-0000-4000-8000-000000000001','active','2026-01-01','2026-12-31','2025-01-01');`;
const acl = `select jsonb_build_object('acl',proacl::text,'owner',proowner::text,'definer',prosecdef,'volatility',provolatile,'config',proconfig) from pg_proc where oid='public.get_prescription_schedule(uuid)'::regprocedure;`;
test('forward DTO reads fresh legacy schemas without optional columns and preserves modern ACL', { timeout: 60000 }, async () => {
  const original = readFileSync(originalPath, 'utf8');
  const baseFixture = readFileSync(new URL('./schedule_reconciliation_fixture.sql', import.meta.url), 'utf8');
  const forward = readFileSync(forwardPath, 'utf8');
  for (const mode of ['modern', 'without_clear', 'without_clear_and_retirement']) {
    db = `schedule_dto_qa_${process.pid}_${mode}`;
    const created = await query('postgres', `create database ${db};`);
    assert.equal(created.code, 0, created.stderr);
    let failure;
    try {
      // Model the schema as it actually exists, without dropping columns from
      // an already queried composite type (unrelated cached-rowtype DDL behavior).
      let fixture = baseFixture;
      if (mode !== 'modern') fixture = fixture.replace(',prescription_cleared_at timestamptz', '');
      if (mode === 'without_clear_and_retirement') fixture = fixture.replace('exercises jsonb,superseded_at timestamptz', 'exercises jsonb');
      await ok(fixture + original
        + 'create trigger generate_training_cycles_trigger after insert or update on public.enrollments for each row execute function public.generate_training_cycles();'
        + insert
        + `insert into public.workouts(cycle_id,exercises) select id,'[{"exercise_id":"synthetic"}]'::jsonb from public.training_cycles where cycle_number=1;`);
      const beforeAcl = await ok(acl);
      if (mode !== 'without_clear_and_retirement') {
        await ok(`insert into public.workouts(cycle_id,exercises,superseded_at) select id,'[{"exercise_id":"synthetic-retired"}]'::jsonb,now() from public.training_cycles where cycle_number=2;`);
      }
      if (mode === 'modern') await ok(`update public.training_cycles set prescription_cleared_at='2026-01-20T12:00:00Z' where cycle_number=1;`);
      const beforeRows = await ok("select md5(jsonb_build_object('cycles',(select jsonb_agg(to_jsonb(c) order by id) from public.training_cycles c),'workouts',(select jsonb_agg(to_jsonb(w) order by id) from public.workouts w))::text);");
      let modern;
      const oldRead = await query(db, actor + read);
      if (mode === 'modern') { assert.equal(oldRead.code, 0, oldRead.stderr); modern = JSON.parse(oldRead.stdout.trim().split('\n').at(-1)); }
      else {
        if (process.env.SCHEDULE_DTO_BASELINE === '1') assert.equal(oldRead.code, 0, oldRead.stderr);
        assert.notEqual(oldRead.code, 0);
        assert.match(oldRead.stderr, /42703/);
        assert.match(oldRead.stderr, /prescription_cleared_at/);
      }
      await ok(forward);
      const value = JSON.parse(await ok(read));
      assert.equal(value.cycles.length, 9);
      assert.equal(value.contract.start_date, '2026-01-01');
      assert.equal(value.contract.end_date, '2026-12-31');
      const first = value.cycles.find(c => c.cycle_number === 1);
      assert.equal(first.has_usable_workouts, true);
      assert.equal(first.has_workouts, true);
      assert.equal(first.has_history, true);
      if (mode === 'modern') assert.deepEqual(value, modern, 'modern DTO must remain identical');
      else assert.equal(first.prescription_cleared_at, null);
      if (mode !== 'without_clear_and_retirement') assert.equal(value.cycles.find(c => c.cycle_number === 2).has_usable_workouts, false, 'retired revision cannot certify current content');
      assert.equal(await ok(acl), beforeAcl, 'ACL, owner, definer, volatility and search_path must be byte-identical');
      assert.equal(await ok("select md5(jsonb_build_object('cycles',(select jsonb_agg(to_jsonb(c) order by id) from public.training_cycles c),'workouts',(select jsonb_agg(to_jsonb(w) order by id) from public.workouts w))::text);"), beforeRows, 'forward is read-only with respect to data');
      const absent = await ok("select count(*) from information_schema.columns where table_schema='public' and ((table_name='training_cycles' and column_name='prescription_cleared_at') or (table_name='workouts' and column_name='superseded_at'));");
      assert.equal(absent, mode === 'modern' ? '2' : mode === 'without_clear' ? '1' : '0');
      await ok(forward);
      assert.deepEqual(JSON.parse(await ok(read)), value, 'forward replay is idempotent');
      assert.equal(await ok(acl), beforeAcl);
      const denied = await query(db, `set role authenticated;set test.actor='00000001-0000-4000-8000-000000000003';${read}`);
      assert.notEqual(denied.code, 0); assert.match(denied.stderr, /schedule_access_denied/);
      const own = await query(db, `set role authenticated;set test.actor='00000001-0000-4000-8000-000000000002';${read}`);
      assert.equal(own.code, 0, own.stderr);
      // On this local image, executing the denied anon call crashed PostgreSQL
      // (transcript retained). Check its real ACL without repeating that crash;
      // native Auth must still execute the anonymous case in the staging gate.
      assert.equal(await ok("select has_function_privilege('anon','public.get_prescription_schedule(uuid)','EXECUTE');"), 'f');
    } catch (error) { failure = error; }
    finally {
      const dropped = await query('postgres', `drop database ${db} with (force);`);
      if (dropped.code !== 0) {
        const cleanupFailure = new Error(dropped.stderr);
        if (failure) throw new AggregateError([failure, cleanupFailure], 'native assertion and cleanup failed');
        throw cleanupFailure;
      }
    }
    if (failure) throw failure;
  }
});
