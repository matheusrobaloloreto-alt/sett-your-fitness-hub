import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import ts from 'typescript';
import { api, fixture, login } from './self-service-api.mjs';
import { sql, run, repo, output, localEnv } from './self-service-local.mjs';

const state = fixture();
const schema = readFileSync(new URL('../../supabase/functions/_shared/form-definitions.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(schema, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { defaultFormDefinition } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const extra = { key: 'extra_http_instrument', label: 'Synthetic instrument answer', type: 'text', required: true, hidden: false, help: '', options: [] };
const studentId = randomUUID();
const sessions = {};

async function rows(table, filter) {
  const result = await api(`/rest/v1/${table}?${filter}`, { admin: true });
  assert.equal(result.ok, true, `${table}: HTTP ${result.status} ${result.data?.code ?? ''}`);
  return result.data;
}
async function insert(table, body) {
  const result = await api(`/rest/v1/${table}`, { method: 'POST', admin: true, body });
  assert.equal(result.ok, true, `${table} insert: HTTP ${result.status} ${result.data?.code ?? ''}`);
  return result.data[0];
}
async function publish(kind, role = 'adminA', later = false) {
  const company = role === 'adminA' ? state.companyA : state.companyB;
  const definition = defaultFormDefinition(kind); definition.fields.push(extra);
  if (later) definition.fields.push({ ...extra, key: 'extra_http_later' });
  const current = await api('/rest/v1/rpc/get_company_form_definition', { method: 'POST', token: sessions[role], body: { _company_id: company, _kind: kind } });
  assert.equal(current.ok, true);
  const result = await api('/rest/v1/rpc/publish_company_form_definition', { method: 'POST', token: sessions[role], body: { _company_id: company, _definition: definition, _expected_version: current.data?.version ?? 0 } });
  assert.equal(result.ok, true, `instrument publish: ${result.data?.code ?? result.status}`);
  return result.data;
}
async function dependencies() {
  assert.equal(state.companyA, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  const source = readFileSync(new URL('../../supabase/migrations/20260717123000_production_schema_reconciliation.sql', import.meta.url), 'utf8');
  const alerts = source.match(/create table if not exists public\.admin_alerts \([\s\S]*?\n\);/i)?.[0];
  assert.ok(alerts);
  const policies = readFileSync(new URL('../../supabase/migrations/20260815062126_remove_legacy_same_company_student_leaks.sql', import.meta.url), 'utf8');
  const ownPolicy = policies.match(/create policy "checkins_student_own"[\s\S]*?\n\)\);/)?.[0];
  assert.ok(ownPolicy, 'canonical hardened check-in self/tenant policy');
  sql(`begin;
    alter table public.students add column if not exists whatsapp text, add column if not exists phone text;
    alter table public.enrollments add column if not exists trainer_id uuid, add column if not exists created_at timestamptz default now();
    alter table public.workout_feedback
      add column if not exists workout_session_id uuid references public.workout_sessions(id),
      add column if not exists workout_title text,
      add column if not exists pain_areas jsonb not null default '[]',
      add column if not exists notes text,
      add column if not exists created_at timestamptz default now();
    ${alerts}
    alter table public.admin_alerts enable row level security;
    grant all on public.admin_alerts,public.workout_feedback to service_role;
    grant select,insert,update,delete on public.student_checkins to authenticated;
    drop policy if exists "checkins_student_own" on public.student_checkins;
    ${ownPolicy}
    ${readFileSync(new URL('../../supabase/migrations/20260825180817_workout_feedback_session_idempotency.sql', import.meta.url), 'utf8')}
    commit; notify pgrst, 'reload schema';`);
  assert.equal(run('docker', ['kill', '--signal=SIGUSR1', 'supabase_rest_sett-self-service-local-20261026']).status, 0);
  for (let attempt = 0; attempt < 40; attempt++) {
    const result = await api('/rest/v1/workout_feedback?select=workout_title&limit=0', { admin: true });
    if (result.ok) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.fail('Instrument fixture schema cache did not refresh');
}
async function startActualHandler(t) {
  let occupied = false;
  try { await fetch('http://127.0.0.1:57444', { method: 'OPTIONS', signal: AbortSignal.timeout(300) }); occupied = true; } catch { /* dedicated QA port must be unused */ }
  assert.equal(occupied, false, 'refusing to claim an existing service on feedback QA port');
  // The std serve implementation may use either listen or serve depending on its cached version.
  // Bind both primitives to loopback; import the unchanged real business handler.
  const wrapper = `const listen=Deno.listen; Deno.listen=((options)=>listen({...options,hostname:'127.0.0.1',port:57444})); const serve=Deno.serve; Deno.serve=((handler)=>serve({hostname:'127.0.0.1',port:57444},handler)); await import(${JSON.stringify(new URL('../../supabase/functions/student-workout-feedback/index.ts', import.meta.url).href)});`;
  const child = spawn('deno', ['run', '--no-config', '--cached-only', '--node-modules-dir=none', '--lock', path.join(output, 'deno.lock'),
    '--allow-env=SUPABASE_URL,SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY', `--allow-read=${path.join(repo, 'supabase/functions')}`,
    '--allow-net=127.0.0.1:57421,127.0.0.1:57444', `--env-file=${path.join(output, 'qa.env.local')}`, '-'],
  { cwd: repo, env: { ...localEnv, DENO_DIR: path.join(output, 'deno-cache') }, stdio: ['pipe', 'pipe', 'pipe'] });
  let errors = ''; child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-3000); }); child.stdout.resume();
  t.after(async () => { if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } });
  child.stdin.end(wrapper);
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) assert.fail(`Actual feedback handler startup failed: ${errors.replace(/\x1b\[[0-9;]*m/g, '')}`);
    try { if ((await fetch('http://127.0.0.1:57444', { method: 'OPTIONS', signal: AbortSignal.timeout(300) })).ok) return; } catch { /* bounded local startup wait */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail('Actual local feedback handler startup timed out');
}
async function feedback(body, role = 'student') {
  const response = await fetch('http://127.0.0.1:57444', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessions[role]}` }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}
async function evidence() {
  return {
    feedback: await rows('workout_feedback', `student_id=eq.${studentId}&select=*&order=id`),
    alerts: await rows('admin_alerts', `student_id=eq.${studentId}&select=*&order=id`),
    checkins: await rows('student_checkins', `student_id=eq.${studentId}&select=*&order=id`),
    messages: await rows('whatsapp_messages', `company_id=eq.${state.companyA}&select=id&order=id`),
  };
}
test('actual post-workout handler and authenticated versioned check-in', async t => {
  await dependencies();
  await startActualHandler(t);
  for (const role of ['adminA', 'adminB']) sessions[role] = (await login(state.people[role])).access_token;
  const email = `qa-instrument-${randomUUID()}@self-service.invalid`;
  const created = await api('/auth/v1/admin/users', { method: 'POST', admin: true, body: { email, email_confirm: true } });
  assert.equal(created.ok, true);
  sessions.student = (await login({ id: created.data.id, email })).access_token;
  sql(`insert into public.user_roles(user_id,role) values('${created.data.id}','student');`);
  await insert('students', { id: studentId, company_id: state.companyA, user_id: created.data.id, full_name: 'Synthetic Instrument Student', email });
  await insert('enrollments', { student_id: studentId, company_id: state.companyA, status: 'active' });
  const workout = await insert('workout_sessions', { student_id: studentId, company_id: state.companyA, status: 'completed' });
  const first = await publish('workout_feedback');
  const second = await publish('workout_feedback', 'adminA', true);
  const foreign = await publish('workout_feedback', 'adminB');
  const payload = { student_id: studentId, workout_session_id: workout.id, workout_title: 'Synthetic workout', form_definition_id: first.id,
    versioned_answers: { perception: 'Bom', reflection: 'Registro sintetico', extra_http_instrument: 'Synthetic extra' } };
  const messages = await rows('whatsapp_messages', `company_id=eq.${state.companyA}&select=id&order=id`);
  await t.test('old published post-workout version persists canonical values/extras after new publication', async () => {
    const result = await feedback(payload);
    assert.equal(result.status, 200, result.data.error); assert.equal(result.data.persisted, true); assert.equal(result.data.delivered, false);
    const [stored] = await rows('workout_feedback', `id=eq.${result.data.feedback_id}&select=*`);
    assert.equal(stored.form_definition_id, first.id); assert.equal(stored.difficulty, 5);
    assert.deepEqual(stored.instrument_answers, payload.versioned_answers);
    assert.equal((await rows('admin_alerts', `student_id=eq.${studentId}&select=id`)).length, 1);
  });
  await t.test('retry returns the same feedback without duplicate alerts or delivery', async () => {
    const before = await evidence(); const result = await feedback(payload);
    assert.equal(result.status, 200); assert.equal(result.data.duplicate, true); assert.equal(result.data.delivered, false);
    assert.deepEqual(await evidence(), before);
  });
  await t.test('foreign version, missing ID, missing required extra and wrong actor cannot write', async () => {
    const before = await evidence();
    const missing = { ...payload }; delete missing.form_definition_id; delete missing.versioned_answers;
    for (const [body, role, status] of [[{ ...payload, form_definition_id: foreign.id }, 'student', 409], [missing, 'student', 409], [{ ...payload, form_definition_id: second.id }, 'student', 422], [payload, 'adminB', 403]]) {
      const result = await feedback(body, role); assert.equal(result.status, status, result.data.error);
      assert.deepEqual(await evidence(), before);
    }
  });
  await t.test('new post-workout version persists its new required extra and canonical perception', async () => {
    const nextWorkout = await insert('workout_sessions', { student_id: studentId, company_id: state.companyA, status: 'completed' });
    const raw = { ...payload.versioned_answers, perception: 'Difícil', reflection: 'Desconforto no joelho registrado para o treinador', extra_http_later: 'New required answer' };
    const result = await feedback({ ...payload, workout_session_id: nextWorkout.id, form_definition_id: second.id, versioned_answers: raw });
    assert.equal(result.status, 200, result.data.error); assert.equal(result.data.delivered, false);
    const [stored] = await rows('workout_feedback', `id=eq.${result.data.feedback_id}&select=*`);
    assert.equal(stored.form_definition_id, second.id); assert.equal(stored.difficulty, 8);
    assert.deepEqual(stored.instrument_answers, raw);
    assert.ok(stored.pain_areas.includes('joelho'));
    const alerts = await rows('admin_alerts', `student_id=eq.${studentId}&type=eq.workout_feedback_pain&select=severity`);
    assert.equal(alerts.length, 1); assert.equal(alerts[0].severity, 'warning');
  });
  const checkinForm = await publish('checkin');
  const foreignCheckin = await publish('checkin', 'adminB');
  const checkin = { student_id: studentId, company_id: state.companyA, sleep_quality: 4, stress: 2, pain: 0, form_definition_id: checkinForm.id,
    instrument_answers: { sleep_quality: '4', stress: '2', pain: '0', extra_http_instrument: 'Synthetic check-in' } };
  await t.test('real student Auth inserts a versioned check-in through canonical tenant RLS', async () => {
    const result = await api('/rest/v1/student_checkins', { method: 'POST', token: sessions.student, body: checkin });
    assert.equal(result.ok, true, `check-in HTTP ${result.status}: ${result.data?.message ?? ''}`);
    assert.equal(result.data[0].sleep_quality, 4); assert.equal(result.data[0].pain, 0);
    assert.deepEqual(result.data[0].instrument_answers, checkin.instrument_answers);
    assert.equal(result.data[0].form_definition_id, checkinForm.id);
  });
  await t.test('check-in tenant, required answer and canonical numeric mismatches are rejected', async () => {
    const before = await evidence();
    const missingExtra = { ...checkin.instrument_answers }; delete missingExtra.extra_http_instrument;
    for (const body of [{ ...checkin, form_definition_id: foreignCheckin.id }, { ...checkin, instrument_answers: missingExtra }, { ...checkin, sleep_quality: 1 }, { ...checkin, company_id: state.companyB }]) {
      const result = await api('/rest/v1/student_checkins', { method: 'POST', token: sessions.student, body });
      assert.equal(result.ok, false); assert.deepEqual(await evidence(), before);
    }
  });
  assert.deepEqual(await rows('whatsapp_messages', `company_id=eq.${state.companyA}&select=id&order=id`), messages);
});
