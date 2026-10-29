import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import ts from 'typescript';
import { api, fixture, login } from './self-service-api.mjs';
import { sql } from './self-service-local.mjs';

const source = readFileSync(new URL('../../supabase/functions/_shared/form-definitions.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { defaultFormDefinition, projectFormAnswers, validateFormAnswers } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const state = fixture();
const endpoint = 'http://127.0.0.1:57443';
const slug = 'qa-self-service-a';
const extra = { key: 'extra_qa_context', type: 'select', label: 'Synthetic QA context', required: true, hidden: false, help: '', options: [{ value: 'synthetic', label: 'Synthetic response' }] };
const extraMulti = { key: 'extra_qa_choices', type: 'multiselect', label: 'Synthetic QA choices', required: false, hidden: false, help: '', options: [{ value: 'first', label: 'First synthetic choice' }, { value: 'second', label: 'Second synthetic choice' }] };
const sessions = {};

async function prepareLocalDependencies() {
  assert.equal(state.companyA, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  // Extend Tesla's deliberately minimal synthetic schema, never a remote database.
  // The published-form migration and its real atomic trigger remain untouched.
  const funnel = readFileSync(new URL('../../supabase/migrations/20260831190000_pre_registration_whatsapp_confirmation.sql', import.meta.url), 'utf8');
  sql(`begin;
    alter table public.leads
      add column if not exists source text,
      add column if not exists stage text not null default 'interested',
      add column if not exists budget_range text,
      add column if not exists preferred_contact_period text,
      add column if not exists converted_to_student_id uuid references public.students(id),
      add column if not exists submitted_at timestamptz,
      add column if not exists updated_at timestamptz default now();
    ${funnel}
    create table if not exists public.whatsapp_instances (
      id uuid primary key default gen_random_uuid(), company_id uuid references public.companies,
      instance_name text, status text, updated_at timestamptz default now());
    create table if not exists public.whatsapp_chats (
      id uuid primary key default gen_random_uuid(), company_id uuid references public.companies);
    create table if not exists public.whatsapp_messages (
      id uuid primary key default gen_random_uuid(), company_id uuid references public.companies);
    alter table public.whatsapp_instances enable row level security;
    alter table public.whatsapp_chats enable row level security;
    alter table public.whatsapp_messages enable row level security;
    grant all on public.whatsapp_instances,public.whatsapp_chats,public.whatsapp_messages to service_role;
    commit; notify pgrst, 'reload schema';`);
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = await api('/rest/v1/lead_funnel_events?select=id&limit=0', { admin: true });
    if (result.ok) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.fail('Local PostgREST fixture schema did not refresh');
}

async function handler(body) {
  const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}
async function rows(table, filter) {
  const result = await api(`/rest/v1/${table}?${filter}`, { admin: true });
  assert.equal(result.ok, true, `${table} read HTTP ${result.status}`);
  return result.data;
}
async function publish(company, role, definition) {
  const current = await api('/rest/v1/rpc/get_company_form_definition', { method: 'POST', token: sessions[role],
    body: { _company_id: company, _kind: 'pre_registration' } });
  assert.equal(current.ok, true, 'read current definition through authenticated RPC');
  const result = await api('/rest/v1/rpc/publish_company_form_definition', { method: 'POST', token: sessions[role],
    body: { _company_id: company, _definition: definition, _expected_version: current.data?.version ?? 0 } });
  assert.equal(result.ok, true, `publication HTTP ${result.status}, code ${result.data?.code}`);
  assert.equal(result.data.version, (current.data?.version ?? 0) + 1);
  return result.data;
}
function submission(published) {
  const raw = { full_name: 'Synthetic Prereg QA', whatsapp: `489${randomInt(10000000, 99999999)}`, budget_range: '300_400',
    requested_services: ['strength'], modalities: ['Nenhum'], gender: 'M', age: 30, weight_kg: 70, height_cm: 170,
    preferred_contact_period: 'morning', extra_qa_context: 'synthetic', extra_qa_choices: ['first', 'second'] };
  for (const field of published.definition.fields) {
    if (raw[field.key] !== undefined || !field.required) continue;
    raw[field.key] = field.type === 'boolean' ? false : field.type === 'consent' ? true
      : field.type === 'number' ? (field.min ?? 0) : field.type === 'select'
        ? (field.options.some(option => option.value === 'nao') ? 'nao' : field.options[0].value)
        : 'Synthetic QA answer';
  }
  assert.deepEqual(validateFormAnswers(published.definition, raw), []);
  const { full_name, whatsapp, ...answers } = projectFormAnswers(published.definition, raw);
  return { action: 'pre-register', companyId: state.companyA, slug, fullName: full_name, whatsapp,
    whatsappConfirmed: true, budgetRange: raw.budget_range, preferredContactPeriod: raw.preferred_contact_period,
    answers, form_definition_id: published.id, versioned_answers: raw };
}
async function evidence() {
  return {
    leads: (await rows('leads', `company_id=eq.${state.companyA}&select=id&order=id`)).map(row => row.id),
    responses: (await rows('company_form_responses', `company_id=eq.${state.companyA}&source_kind=eq.pre_registration&select=id&order=id`)).map(row => row.id),
    events: (await rows('lead_funnel_events', `company_id=eq.${state.companyA}&select=id,status&order=id`)),
    messages: (await rows('whatsapp_messages', `company_id=eq.${state.companyA}&select=id&order=id`)).map(row => row.id),
    chats: (await rows('whatsapp_chats', `company_id=eq.${state.companyA}&select=id&order=id`)).map(row => row.id),
  };
}
async function rejectedWithoutEffects(body, status) {
  const before = await evidence();
  const result = await handler(body);
  assert.equal(result.status, status, `rejection: ${result.data.error ?? 'unexpected response'}`);
  assert.deepEqual(await evidence(), before, 'rejected submission must not change leads, snapshots, events, chats or messages');
}
async function accepted(published) {
  const body = submission(published);
  const before = await evidence();
  const result = await handler(body);
  assert.equal(result.status, 200, `positive submission: ${result.data.error ?? 'unexpected response'}`);
  assert.equal(result.data.confirmationMessageSent, false, 'no external confirmation delivery');
  assert.ok(result.data.leadId);
  const [lead] = await rows('leads', `id=eq.${result.data.leadId}&company_id=eq.${state.companyA}&select=id,phone,pre_registration_answers`);
  assert.equal(lead.phone, body.whatsapp);
  assert.equal(lead.pre_registration_answers.__form.definition_id, published.id);
  assert.deepEqual(lead.pre_registration_answers.custom_answers[extraMulti.key].value, ['first', 'second']);
  const snapshots = await rows('company_form_responses', `source_record_id=eq.${lead.id}&source_kind=eq.pre_registration&select=company_id,form_definition_id,source_id,answers`);
  assert.equal(snapshots.length, 1, 'lead and immutable form response committed by the same trigger');
  assert.equal(snapshots[0].company_id, state.companyA);
  assert.equal(snapshots[0].form_definition_id, published.id);
  assert.equal(snapshots[0].source_id, lead.pre_registration_answers.__form.submission_id);
  assert.deepEqual(snapshots[0].answers, body.versioned_answers);
  const after = await evidence();
  assert.equal(after.leads.length, before.leads.length + 1);
  assert.equal(after.responses.length, before.responses.length + 1);
  assert.deepEqual(after.messages, before.messages);
  assert.deepEqual(after.chats, before.chats);
  const events = await rows('lead_funnel_events', `lead_id=eq.${lead.id}&select=status`);
  assert.equal(events.length, 1);
  assert.equal(events[0].status, 'failed', 'disconnected synthetic WhatsApp records failure, never delivery');
}

test('actual local pre-registration: published definitions, atomic snapshots and rejection isolation', async t => {
  const commands = execFileSync('ps', ['-axo', 'command='], { encoding: 'utf8' }).split('\n');
  const runner = commands.find(command => /deno run .*qa\/self-service-edge-runner\.ts public-registration\s*$/.test(command));
  assert.ok(runner, 'real local Deno public-registration runner must be active');
  const net = runner.match(/--allow-net=([^\s]+)/)?.[1]?.split(',');
  assert.ok(net?.length && net.every(host => /^127\.0\.0\.1:574(?:21|41|42|43)$/.test(host)), 'Deno outbound network restricted to local QA ports');
  assert.ok(!/(?:--allow-all|\s-A(?:\s|$))/.test(runner));
  await prepareLocalDependencies();
  assert.deepEqual(await rows('whatsapp_instances', `company_id=eq.${state.companyA}&status=eq.connected&select=id`), [], 'synthetic tenant must have no connected provider');
  for (const role of ['adminA', 'adminB']) sessions[role] = (await login(state.people[role])).access_token;
  const definition = defaultFormDefinition('pre_registration');
  definition.fields.push(extra, extraMulti);
  const first = await publish(state.companyA, 'adminA', definition);
  const foreign = await publish(state.companyB, 'adminB', definition);
  await t.test('public context exposes the actual latest published definition', async () => {
    const result = await handler({ action: 'context', slug });
    assert.equal(result.status, 200);
    assert.equal(result.data.company.id, state.companyA);
    assert.equal(result.data.form_definition.id, first.id);
    assert.equal(result.data.form_definition.definition.fields.find(field => field.key === extra.key).required, true);
  });
  await t.test('valid canonical and required extra answers persist lead plus atomic snapshot without delivery', () => accepted(first));
  await t.test('a different tenant definition is rejected with no effects', () => rejectedWithoutEffects({ ...submission(first), form_definition_id: foreign.id }, 409));
  await t.test('omitting the version cannot bypass published required answers', async () => {
    const { form_definition_id, versioned_answers, ...legacy } = submission(first);
    await rejectedWithoutEffects(legacy, 409);
  });
  await t.test('missing required extra is rejected before any write', async () => {
    const body = submission(first);
    delete body.versioned_answers[extra.key];
    await rejectedWithoutEffects(body, 422);
  });
  await t.test('invalid required choice is rejected before any write', async () => {
    const body = submission(first);
    body.versioned_answers[extra.key] = 'unpublished-choice';
    await rejectedWithoutEffects(body, 422);
  });
  await t.test('unknown envelope keys are rejected before any write', () => rejectedWithoutEffects({ ...submission(first), bypass: true }, 422));
  await t.test('an optional multiselect still rejects unpublished choices without writes', async () => {
    const body = submission(first);
    body.versioned_answers[extraMulti.key] = ['unpublished-choice'];
    await rejectedWithoutEffects(body, 422);
  });
  await t.test('older published definition stays accepted after a newer required question is published', async () => {
    const nextDefinition = structuredClone(definition);
    nextDefinition.fields.push({ ...extra, key: 'extra_qa_later', label: 'Later required question' });
    const second = await publish(state.companyA, 'adminA', nextDefinition);
    const context = await handler({ action: 'context', slug });
    assert.equal(context.data.form_definition.id, second.id);
    await accepted(first);
    await rejectedWithoutEffects({ ...submission(first), form_definition_id: second.id }, 422);
  });
});
