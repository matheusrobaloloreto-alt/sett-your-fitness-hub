import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { api, fixture, login } from './self-service-api.mjs';
import { sql, run } from './self-service-local.mjs';

const state = fixture();
const source = name => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const schema = readFileSync(new URL('../../supabase/functions/_shared/form-definitions.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(schema, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { defaultFormDefinition, validateFormAnswers } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const extra = { key: 'extra_http_context', type: 'text', label: 'Synthetic HTTP context', required: true, hidden: false, help: '', options: [] };
const multi = { key: 'extra_http_choices', type: 'multiselect', label: 'Synthetic HTTP choices', required: false, hidden: false, help: '', options: [{ value: 'qa', label: 'Synthetic QA' }] };
const sessions = {};
const ids = { student: randomUUID(), enrollment: randomUUID(), firstCycle: randomUUID(), secondCycle: randomUUID() };

function tableDDL(text, table) {
  const ddl = text.match(new RegExp(`create table(?: if not exists)? public\\.${table} \\([\\s\\S]*?\\n\\);`, 'i'))?.[0];
  assert.ok(ddl, `canonical table DDL missing: ${table}`);
  return ddl.replace(/^create table(?: if not exists)?/i, 'create table if not exists');
}
async function prepareDependencies() {
  assert.equal(state.companyA, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  const initialTable = tableDDL(source('20260602170724_f90505d7-c1f1-4fb2-86f5-1973eb99ab72.sql'), 'student_anamneses');
  const additions = initialTable.split('\n').slice(1, -1).map(line => line.trim().replace(/,$/, ''))
    .filter(line => line && !/^constraint\b/i.test(line)).map(line => `alter table public.student_anamneses add column if not exists ${line};`).join('\n');
  const intercycle = source('20260908090000_intercycle_anamnesis.sql');
  const manualReady = source('20260909152020_intercycle_manual_link_ready.sql').split('create or replace function')[0];
  sql(`begin;
    ${additions}
    alter table public.students add column if not exists updated_at timestamptz default now();
    alter table public.student_anamneses
      add column if not exists endurance_session_duration_min integer,
      add column if not exists current_volume_unit text,
      add column if not exists nutrition_context text,
      add column if not exists wants_strength boolean default false,
      add column if not exists wants_running boolean default false,
      add column if not exists wants_cycling boolean default false,
      add column if not exists wants_swimming boolean default false,
      add column if not exists wants_nutrition boolean default false,
      add column if not exists has_nutritionist boolean default false,
      add column if not exists has_endurance_coach boolean default false,
      add column if not exists shown_blocks text[];
    create unique index if not exists qa_http_anamnesis_student_unique on public.student_anamneses(student_id);
    ${tableDDL(source('20260622044454_create_student_anamnesis_history.sql'), 'student_anamnesis_history')}
    ${tableDDL(source('20260614220000_student_body_limitations.sql'), 'student_body_limitations')}
    ${tableDDL(source('20260618201117_student_goals_provas_metas.sql'), 'student_goals')}
    ${tableDDL(intercycle, 'intercycle_anamnesis_deliveries')}
    ${tableDDL(intercycle, 'intercycle_anamneses')}
    ${manualReady}
    alter table public.intercycle_anamnesis_invites
      add column if not exists delivery_id uuid references public.intercycle_anamnesis_deliveries(id),
      add column if not exists enrollment_id uuid references public.enrollments(id),
      add column if not exists consumed_at timestamptz;
    create unique index if not exists qa_http_intercycle_delivery_unique on public.intercycle_anamnesis_invites(delivery_id);
    alter table public.student_anamnesis_history enable row level security;
    alter table public.student_body_limitations enable row level security;
    alter table public.student_goals enable row level security;
    alter table public.intercycle_anamnesis_deliveries enable row level security;
    alter table public.intercycle_anamneses enable row level security;
    grant all on public.student_anamnesis_history,public.student_body_limitations,public.student_goals,public.intercycle_anamnesis_deliveries,public.intercycle_anamneses to service_role;
    commit;`);
  // These are the complete existing service-only atomic functions, not QA stubs.
  sql(source('20260814210000_atomic_anamnesis_invite_submit.sql'));
  sql(source('20260921133000_allow_manual_intercycle_anamnesis_anytime.sql'));
  sql("notify pgrst, 'reload schema';");
  const reload = run('docker', ['kill', '--signal=SIGUSR1', 'supabase_rest_sett-self-service-local-20261026']);
  assert.equal(reload.status, 0, 'local PostgREST cache reload, not restart');
  for (let attempt = 0; attempt < 40; attempt++) {
    const probe = await api('/rest/v1/intercycle_anamnesis_invites?select=delivery_id,consumed_at&limit=0', { admin: true });
    if (probe.ok) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.fail('Local PostgREST did not load the explicit dependency extension');
}
async function request(kind, body, role) {
  const port = kind === 'initial' ? 57441 : 57442;
  const response = await fetch(`http://127.0.0.1:${port}`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: `Bearer ${sessions[role]}` } : {}) }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}
async function rows(table, filter) {
  const result = await api(`/rest/v1/${table}?${filter}`, { admin: true });
  assert.equal(result.ok, true, `${table}: HTTP ${result.status} ${result.data?.code ?? ''}`);
  return result.data;
}
async function insert(table, body) {
  const result = await api(`/rest/v1/${table}`, { method: 'POST', admin: true, body });
  assert.equal(result.ok, true, `${table} insert HTTP ${result.status} ${result.data?.code ?? ''}: ${result.data?.message ?? ''}`);
  return result.data[0];
}
async function publish(kind, role = 'adminA', later = false) {
  const company = role === 'adminA' ? state.companyA : state.companyB;
  const form = defaultFormDefinition(kind); form.fields.push(extra, multi);
  if (later) form.fields.push({ ...extra, key: 'extra_http_later', label: 'Later required answer' });
  if (kind === 'intercycle' && later) form.fields.find(field => field.key === 'sensitive_consent').label += ' Texto revisado pela empresa para este ciclo.';
  form.policy.invite_expiry_days = 3;
  const current = await api('/rest/v1/rpc/get_company_form_definition', { method: 'POST', token: sessions[role], body: { _company_id: company, _kind: kind } });
  assert.equal(current.ok, true);
  const result = await api('/rest/v1/rpc/publish_company_form_definition', { method: 'POST', token: sessions[role], body: { _company_id: company, _definition: form, _expected_version: current.data?.version ?? 0 } });
  assert.equal(result.ok, true, `${kind} publish HTTP ${result.status} ${result.data?.code ?? ''}`);
  return result.data;
}
function answers(form) {
  const raw = form.kind === 'initial' ? { requested_services: ['strength'], modalities: ['Nenhum'], gender: 'M', age: 30, weight_kg: 72, height_cm: 175 } : {
    prescription_evaluation: 'better', goals_continue: true, availability_changed: true, available_days: ['Seg', 'Qua'], session_duration_minutes: 45,
    training_location: 'Em casa', available_equipment: 'halteres', pain_present: true, pain_location: 'joelho', pain_eva: 2, sensitive_consent: true,
  };
  raw.extra_http_context = 'Synthetic HTTP answer'; raw.extra_http_choices = ['qa'];
  for (const field of form.fields) {
    if (!field.required || raw[field.key] !== undefined) continue;
    raw[field.key] = field.type === 'boolean' ? false : field.type === 'consent' ? true : field.type === 'number' ? (field.min ?? 0)
      : field.type === 'select' ? (field.options.some(option => option.value === 'nao') ? 'nao' : field.options[0].value) : 'Synthetic canonical answer';
  }
  assert.deepEqual(validateFormAnswers(form, raw), []);
  return raw;
}
async function initialInvite() {
  const token = randomBytes(32).toString('hex');
  const row = await insert('anamnese_invites', { company_id: state.companyA, student_id: ids.student, student_name: 'Synthetic HTTP Student', token });
  return { ...row, token };
}
async function intercycleInvite() {
  const result = await request('intercycle', { action: 'create-link', company_id: state.companyA, student_id: ids.student }, 'adminA');
  assert.equal(result.status, 200, `actual manual create-link: ${result.data.error ?? ''}`);
  const token = result.data.token;
  const [row] = await rows('intercycle_anamnesis_invites', `token_sha256=eq.${createHash('sha256').update(token).digest('hex')}&select=*`);
  assert.ok(row);
  assert.ok(Math.abs(new Date(result.data.expires_at).getTime() - Date.now() - 3 * 86400000) < 15000, 'actual link consumes configured expiry');
  return { ...row, token };
}
function body(invite, published) {
  return { action: 'submit', token: invite.token, form_definition_id: published.id, versioned_answers: answers(published.definition) };
}
async function evidence() {
  const result = {};
  for (const table of ['students', 'student_anamneses', 'student_anamnesis_history', 'student_body_limitations', 'student_goals', 'company_form_responses', 'anamnese_invites', 'intercycle_anamnesis_invites', 'intercycle_anamnesis_deliveries', 'intercycle_anamneses']) {
    result[table] = await rows(table, `${table === 'students' ? 'id' : 'student_id'}=eq.${ids.student}&select=*&order=id`);
  }
  return result;
}
async function rejectUnchanged(kind, payload, statuses, role) {
  const before = await evidence();
  const result = await request(kind, payload, role);
  assert.ok(statuses.includes(result.status), `rejection HTTP ${result.status}: ${result.data.error ?? ''}`);
  assert.deepEqual(await evidence(), before, 'rejection/replay must not write or consume any synthetic student state');
}
async function accept(kind, invite, published) {
  const payload = body(invite, published);
  const result = await request(kind, payload);
  assert.equal(result.status, 200, `${kind} positive HTTP ${result.status}: ${result.data.error ?? ''}`);
  assert.equal(result.data.ok, true);
  if (kind === 'initial') {
    const [stored] = await rows('student_anamneses', `student_id=eq.${ids.student}&select=*`);
    assert.equal(stored.id, result.data.student_anamnese_id);
    assert.equal(stored.objective, payload.versioned_answers.objective);
    assert.equal(stored.custom_answers.extra_http_context.value, payload.versioned_answers.extra_http_context);
    assert.deepEqual(stored.custom_answers.extra_http_choices.value, ['qa']);
    const [consumed] = await rows('anamnese_invites', `id=eq.${invite.id}&select=status,completed_at`);
    assert.equal(consumed.status, 'completed'); assert.ok(consumed.completed_at);
    const snapshots = await rows('company_form_responses', `source_kind=eq.initial&source_id=eq.${invite.id}&select=*`);
    assert.equal(snapshots.length, 1); assert.equal(snapshots[0].form_definition_id, published.id);
    assert.deepEqual(snapshots[0].answers, payload.versioned_answers);
    const history = await rows('student_anamnesis_history', `student_id=eq.${ids.student}&select=snapshot&order=version.desc&limit=1`);
    assert.equal(history[0].snapshot.id, stored.id);
  } else {
    const [stored] = await rows('intercycle_anamneses', `delivery_id=eq.${invite.delivery_id}&select=*`);
    assert.equal(stored.prescription_evaluation, 'better'); assert.equal(stored.pain_eva, 2);
    assert.deepEqual(stored.available_days, ['Seg', 'Qua']); assert.equal(stored.session_duration_minutes, 45);
    assert.equal(stored.sensitive_consent, true);
    assert.equal(stored.consent_text_version, `company-form:${published.id}:sensitive_consent`, 'consent provenance must identify the immutable text actually accepted, including manual label edits');
    const [consumed] = await rows('intercycle_anamnesis_invites', `id=eq.${invite.id}&select=consumed_at`);
    assert.ok(consumed.consumed_at);
    const [delivery] = await rows('intercycle_anamnesis_deliveries', `id=eq.${invite.delivery_id}&select=status`);
    assert.equal(delivery.status, 'responded');
    const snapshots = await rows('company_form_responses', `source_kind=eq.intercycle&source_id=eq.${stored.id}&select=*`);
    assert.equal(snapshots.length, 1); assert.equal(snapshots[0].form_definition_id, published.id);
    assert.deepEqual(snapshots[0].answers, payload.versioned_answers);
  }
  await rejectUnchanged(kind, payload, kind === 'initial' ? [409] : [409, 410]);
}

test('actual initial/intercycle HTTP: canonical atomic persistence, pinned versions and tenant isolation', async t => {
  const commands = execFileSync('ps', ['-axo', 'command='], { encoding: 'utf8' }).split('\n');
  for (const name of ['public-anamnesis', 'intercycle-anamnesis']) {
    const runner = commands.find(command => new RegExp(`deno run .*qa/self-service-edge-runner.ts ${name}\\s*$`).test(command));
    assert.ok(runner, `${name} actual local runner must be active`);
    assert.ok(runner.match(/--allow-net=([^\s]+)/)?.[1].split(',').every(host => /^127\.0\.0\.1:574(?:21|41|42|43)$/.test(host)));
    assert.ok(!/(?:--allow-all|\s-A(?:\s|$))/.test(runner));
  }
  await prepareDependencies();
  for (const role of ['adminA', 'adminB']) sessions[role] = (await login(state.people[role])).access_token;
  const email = `qa-invite-${randomUUID()}@self-service.invalid`;
  const auth = await api('/auth/v1/admin/users', { method: 'POST', admin: true, body: { email, email_confirm: true } });
  assert.equal(auth.ok, true, 'new isolated LOCAL GoTrue user');
  sessions.student = (await login({ id: auth.data.id, email })).access_token;
  sql(`insert into public.user_roles(user_id,role) values('${auth.data.id}','student');`);
  await insert('students', { id: ids.student, company_id: state.companyA, user_id: auth.data.id, full_name: 'Synthetic HTTP Student', email, intercycle_anamnesis_enabled: true });
  await insert('enrollments', { id: ids.enrollment, student_id: ids.student, company_id: state.companyA, status: 'active' });
  const addCycle = id => insert('training_cycles', { id, enrollment_id: ids.enrollment, company_id: state.companyA, student_id: ids.student, status: 'active', start_date: new Date(Date.now() - (id === ids.firstCycle ? 6 : 5) * 86400000).toISOString().slice(0, 10), end_date: new Date(Date.now() + 35 * 86400000).toISOString().slice(0, 10) });
  const messagesBefore = await rows('whatsapp_messages', `company_id=eq.${state.companyA}&select=id&order=id`);
  for (const kind of ['initial', 'intercycle']) {
    const first = await publish(kind);
    if (kind === 'intercycle') await addCycle(ids.firstCycle);
    const oldInvite = kind === 'initial' ? await initialInvite() : await intercycleInvite();
    assert.equal(oldInvite.form_definition_id, first.id);
    const second = await publish(kind, 'adminA', true);
    const foreign = await publish(kind, 'adminB');
    if (kind === 'intercycle') {
      await addCycle(ids.secondCycle);
    }
    const newInvite = kind === 'initial' ? await initialInvite() : await intercycleInvite();
    assert.equal(newInvite.form_definition_id, second.id);
    await t.test(`${kind}: actual context retains old/new issued versions`, async () => {
      for (const [invite, published] of [[oldInvite, first], [newInvite, second]]) {
        const result = await request(kind, { action: 'context', token: invite.token });
        assert.equal(result.status, 200, result.data.error);
        assert.equal(result.data.form_definition.id, published.id);
      }
    });
    await t.test(`${kind}: foreign/mismatched/omitted version and invalid required extra have no effects`, async () => {
      await rejectUnchanged(kind, { ...body(newInvite, second), form_definition_id: foreign.id }, [409, 422]);
      await rejectUnchanged(kind, { ...body(newInvite, second), form_definition_id: first.id }, [409, 422]);
      const omitted = body(newInvite, second); delete omitted.form_definition_id;
      await rejectUnchanged(kind, omitted, [409, 422]);
      const malformed = body(newInvite, second); malformed.versioned_answers.extra_http_context = '';
      await rejectUnchanged(kind, malformed, [422]);
      if (kind === 'initial') await rejectUnchanged(kind, { action: 'context', token: newInvite.token }, [403], 'adminB');
    });
    await t.test(`${kind}: old published invite submits after new publication and replay cannot write`, () => accept(kind, oldInvite, first));
    await t.test(`${kind}: new published invite persists required new extra and consumes exactly once`, () => accept(kind, newInvite, second));
  }
  await t.test('snapshot failure rolls back actual initial writes, history and invite consumption', async () => {
    const invite = await initialInvite();
    const [published] = await rows('company_form_definitions', `id=eq.${invite.form_definition_id}&select=id,version,definition`);
    await insert('company_form_responses', { company_id: state.companyA, form_definition_id: published.id, source_kind: 'initial', source_id: invite.id, student_id: ids.student, answers: answers(published.definition) });
    await rejectUnchanged('initial', body(invite, published), [409]);
  });
  assert.deepEqual(await rows('whatsapp_messages', `company_id=eq.${state.companyA}&select=id&order=id`), messagesBefore, 'public invite flows never send provider messages');
});
