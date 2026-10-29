import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { api, credentials, login } from './self-service-api.mjs';
import { sql, privateFile, repo, output, localEnv } from './self-service-local.mjs';
import { captureData } from '../../qa/self-service-dispatch-snapshot.mjs';

const functions = [
  'checkpoint_automation_dispatch(text,uuid,uuid,jsonb)',
  'begin_automation_dispatch(text,uuid,uuid,text)', 'authorize_automation_dispatch(text,uuid,uuid,text)',
  'ack_automation_dispatch(text,uuid,uuid,text,text)', 'service_company_feature_allowed(uuid,text)',
  'claim_automation_sessions(integer)', 'process_automation_triggers()',
  'process_intercycle_anamnesis_schedule()', 'claim_intercycle_anamnesis_deliveries(integer)',
  'weekly_contact_policy_version()', 'weekly_contact_consent_is_current(uuid,uuid,text,bigint)',
  'record_weekly_contact_consent(uuid,text,text,text,text)',
  'weekly_contact_recipient_key(text)', 'weekly_contact_current_recipient_key(text,text,text)',
  'save_company_product_settings(uuid,jsonb,integer)', 'company_product_settings_defaults()',
  'mark_payment_recovery_abandoned()',
];
const columns = {
  students: ['id', 'company_id', 'phone', 'whatsapp', 'country_code', 'weekly_contact_enabled', 'weekly_contact_recipient_generation'],
  flow_sessions: ['id', 'flow_id', 'chat_id', 'current_node_id', 'status', 'context', 'started_at', 'created_at', 'last_activity_at', 'updated_at', 'dispatch_lease_token', 'dispatch_lease_until'],
  automation_dispatch_attempts: ['kind','owner_id','send_key','lease_token','state','provider_message_id'],
  whatsapp_chats: ['id', 'company_id', 'student_id', 'instance_id', 'remote_jid', 'last_message', 'last_message_at', 'updated_at'],
  whatsapp_messages: ['id', 'company_id', 'chat_id', 'content', 'source', 'type', 'is_from_me', 'message_id_external', 'origin', 'timestamp'],
  whatsapp_labels: ['id', 'company_id', 'name', 'color'], whatsapp_chat_labels: ['id', 'chat_id', 'label_id'],
  weekly_contact_consent_events: ['student_id', 'company_id', 'event_type', 'recipient_generation', 'recipient_key'],
};
const literal = value => `'${String(value).replaceAll("'", "''")}'`;

function inventory() {
  // Catalog-only inspection never invokes missing functions or exception probes.
  const snapshot = JSON.parse(sql(`select json_build_object(
    'functions',(select coalesce(json_agg(json_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid))),'[]'::json)
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (${functions.map(f => literal(f.split('(')[0])).join(',')})),
    'columns',(select coalesce(json_agg(table_name||'.'||column_name),'[]'::json) from information_schema.columns where table_schema='public'),
    'triggers',(select coalesce(json_agg(t.tgname),'[]'::json) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal));`));
  const missing = functions.filter(f => !snapshot.functions.some(p => p.signature.replace(/^public\./, '') === f));
  for (const [table, names] of Object.entries(columns)) {
    for (const name of names) if (!snapshot.columns.includes(`${table}.${name}`)) missing.push(`${table}.${name}`);
  }
  for (const trigger of ['track_weekly_contact_recipient_generation', 'guard_weekly_contact_consent_event', 'guard_weekly_contact_boolean_write']) {
    if (!snapshot.triggers.includes(trigger)) missing.push(`trigger:${trigger}`);
  }
  return { snapshot, missing };
}

async function rest(table, options = {}) {
  const result = await api(`/rest/v1/${table}`, { admin: true, ...options });
  assert.equal(result.ok, true, `local REST ${table.split('?')[0]} failed: HTTP ${result.status} code=${result.data?.code || 'unknown'}`);
  return result.data;
}
async function listen(server) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return server.address().port;
}
async function close(server) { await new Promise(resolve => server.close(resolve)); }
async function freePort() { const server = createServer(); const port = await listen(server); await close(server); return port; }

test('actual dispatcher HTTP -> Supabase SDK -> PostgREST -> Postgres, persisted process restart and consent', { timeout: 300000 }, async t => {
  const { snapshot, missing } = inventory();
  const evidence = { stage: 'preflight', runtime: 'native Deno (not hosted Edge)', fakeBoundary: 'loopback WhatsApp provider only', missing };
  privateFile('self-service-dispatch-evidence.private.json', JSON.stringify(evidence, null, 2));
  assert.deepEqual(missing, [], 'Canonical dependencies missing; root must coordinate additive installation. No DB writes or handler execution occurred. See qa/self-service-dispatch-handoff.md');

  // Global production RPCs cannot be tenant-filtered by this harness. Refuse
  // concurrent actionable workloads rather than changing another tenant's state.
  assert.ok(snapshot.columns.includes('payment_recovery_events.event_type'), 'Canonical payment recovery table required by global trigger scan');
  // Reuse the exact READ-ONLY candidate CTEs of the installed product scanners.
  // Existing opted-in students which are not due do not block this harness.
  const scheduler = snapshot.functions.find(p => p.signature === 'process_intercycle_anamnesis_schedule()').definition;
  const dueStart = scheduler.indexOf('with due as (');
  const dueEnd = scheduler.indexOf('), inserted as (', dueStart);
  assert.ok(dueStart >= 0 && dueEnd > dueStart, 'Installed scheduler CTE shape drift');
  // v_today is the scheduler's PL/pgSQL local initialized by this exact function.
  const dueCTE = scheduler.slice(dueStart, dueEnd).replaceAll('v_today', 'public.current_business_date()') + ')';
  const recovery = snapshot.functions.find(p => p.signature === 'mark_payment_recovery_abandoned()').definition;
  const recoveryStart = recovery.indexOf('WITH candidates AS (');
  const recoveryEnd = recovery.indexOf('),\n  inserted AS (', recoveryStart);
  assert.ok(recoveryStart >= 0 && recoveryEnd > recoveryStart, 'Installed recovery candidate CTE shape drift');
  const recoveryCTE = recovery.slice(recoveryStart, recoveryEnd) + ')';
  function assertNoForeignWork(ownedCompany) {
    const tenant = alias => ownedCompany ? ` and ${alias}.company_id is distinct from ${literal(ownedCompany)}::uuid` : '';
    const foreignSession = ownedCompany ? ` and exists(select 1 from public.automation_flows f where f.id=fs.flow_id${tenant('f')})` : '';
    const busy = Number(sql(`select (select count(*) from public.flow_sessions fs where fs.status in ('active','processing','waiting_response')${foreignSession})+
      (select count(*) from public.automation_flows f where f.is_active and f.trigger_type in ('weekly_contact','no_workout_7d','payment_pending')${tenant('f')})+
      (select count(*) from public.intercycle_anamnesis_deliveries d where
        ((d.status in ('scheduled','failed') and coalesce(d.last_error_code,'') not in ('dispatch_uncertain','company_feature_denied','company_feature_unavailable'))
        or (d.status='sending' and (d.dispatch_lease_until<=now() or d.dispatch_lease_token is null)))
        and d.scheduled_for<=now() and (d.next_attempt_at is null or d.next_attempt_at<=now())${tenant('d')})+
      (${dueCTE} select count(*) from due where not exists(select 1 from public.intercycle_anamnesis_deliveries d where d.company_id=due.company_id and d.training_cycle_id=due.training_cycle_id)${tenant('due')})+
      (${recoveryCTE} select count(*) from candidates c where true${tenant('c')});`));
    assert.equal(busy, 0, 'Root must serialize this global dispatcher gate with other actionable automation/intercycle/recovery workloads');
  }
  assertNoForeignWork();
  const keys = credentials();
  const company = randomUUID();
  const email = `dispatch-${randomUUID()}@self-service.invalid`;
  const auth = await api('/auth/v1/admin/users', { method: 'POST', admin: true, body: { email, email_confirm: true } });
  assert.equal(auth.ok, true, 'local synthetic GoTrue identity');
  sql(`begin; insert into public.companies(id,name,slug) values(${literal(company)},'Synthetic dispatcher QA',${literal(`dispatch-${company}`)});
    insert into public.company_members(company_id,user_id) values(${literal(company)},${literal(auth.data.id)});
    insert into public.user_roles(user_id,role) values(${literal(auth.data.id)},'admin'); commit;`);
  const token = (await login({ id: auth.data.id, email })).access_token;
  const defaults = JSON.parse(sql('select public.company_product_settings_defaults();'));
  const expectedFirst = 'RPC persisted weekly template for Synthetic';
  defaults.messages.weekly_contact = 'RPC persisted weekly template for {{primeiro_nome}}';
  const saved = await api('/rest/v1/rpc/save_company_product_settings', { token, method: 'POST', body: { _company_id: company, _settings: defaults, _expected_version: 0 } });
  assert.equal(saved.ok, true, 'template saved by actual authenticated settings RPC');
  assert.equal(saved.data.version, 1);
  const [settings] = await rest(`company_product_settings?company_id=eq.${company}&select=settings,version`);
  assert.equal(settings.settings.messages.weekly_contact, defaults.messages.weekly_contact);
  const policy = sql('select public.weekly_contact_policy_version();');
  const own = { company, user: auth.data.id };
  const baseline = captureData(undefined, own);
  privateFile('self-service-dispatch-data-before.private.json', JSON.stringify(baseline));
  privateFile(`self-service-dispatch-data-before-${company}.private.json`, JSON.stringify(baseline));
  const calls = [];
  let failOnceText;
  const allowedNumbers = new Set();
  const provider = createServer(async (request, response) => {
    try {
      assert.equal(request.method, 'POST');
      assert.equal(request.url, `/message/sendText/dispatch-${company}`);
      let raw = '';
      for await (const chunk of request) { raw += chunk; assert.ok(raw.length < 20000); }
      const body = JSON.parse(raw);
      assert.ok(allowedNumbers.has(body.number), 'foreign recipient reached fake provider');
      if (body.text === failOnceText) {
        failOnceText = undefined;
        calls.push({ ...body, status: 503 });
        response.writeHead(503); response.end('{}'); return;
      }
      const receipt = `dispatch-receipt-${randomUUID()}`;
      calls.push({ ...body, receipt });
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ key: { id: receipt } }));
    } catch {
      calls.push({ rejected: true });
      response.writeHead(422); response.end('{}');
    }
  });
  const providerPort = await listen(provider);
  const cronSecret = randomBytes(32).toString('hex');
  const runs = [];
  const children = new Set();
  async function check(name, body) {
    await t.test(name, async () => {
      try { await body(); } catch (error) { evidence.stage = 'failed'; throw error; }
    });
    assert.notEqual(evidence.stage, 'failed', 'Stop dispatcher cases after first failed subtest');
  }
  async function dispatch(authorized = true) {
    // Recheck after each real wait so work that became due meanwhile cannot be
    // picked up by this run's fresh process. Root serializes other SQL writers.
    if (authorized) assertNoForeignWork(company);
    const port = await freePort();
    const envFile = privateFile(`self-service-dispatch-${company}.env.local`, [
      'SUPABASE_URL=http://127.0.0.1:57421', `SUPABASE_SERVICE_ROLE_KEY=${keys.SERVICE_ROLE_KEY}`,
      `AUTOMATION_CRON_SECRET=${cronSecret}`, `EVOLUTION_API_URL=http://127.0.0.1:${providerPort}`,
      'EVOLUTION_API_KEY=synthetic-loopback-only',
    ].join('\n'));
    const child = spawn('deno', ['run', '--no-config', '--no-lock', '--cached-only', '--no-prompt', '--node-modules-dir=none',
      '--allow-env=SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,AUTOMATION_CRON_SECRET,EVOLUTION_API_URL,EVOLUTION_API_KEY,PUBLIC_APP_ORIGIN',
      `--allow-net=127.0.0.1:57421,127.0.0.1:${providerPort},127.0.0.1:${port}`,
      `--env-file=${envFile}`, 'qa/self-service-dispatch-runner.ts', String(port)],
    { cwd: repo, env: { ...localEnv, DENO_DIR: path.join(output, 'deno-cache') }, stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(child);
    let logs = '';
    child.stdout.on('data', chunk => { logs += chunk; }); child.stderr.on('data', chunk => { logs += chunk; });
    const exited = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => { children.delete(child); resolve(code); }); });
    let timer;
    try {
      await Promise.race([
        new Promise((resolve, reject) => {
          child.stdout.on('data', () => { if (logs.includes('dispatch-ready')) resolve(); });
          child.once('exit', () => reject(new Error('Native dispatcher exited before ready; inspect private run log')));
          timer = setTimeout(() => reject(new Error('Native dispatcher startup timed out')), 15000);
        }), exited.then(() => { throw new Error('Native dispatcher exited before ready'); }),
      ]);
      clearTimeout(timer);
      const response = await fetch(`http://127.0.0.1:${port}`, { method: 'POST', headers: authorized ? { 'x-cron-secret': cronSecret } : {}, signal: AbortSignal.timeout(30000) });
      const data = await response.json();
      const code = await Promise.race([exited, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('One-shot dispatcher did not exit')), 5000);
      })]);
      clearTimeout(timer);
      assert.equal(code, 0, 'one-shot dispatcher must exit before next process');
      const record = { pid: child.pid, status: response.status, data };
      runs.push(record);
      if (authorized) {
        assert.equal(response.status, 200);
        assert.equal(data.intercycle.failed, 0);
        assert.ok(!/automation trigger scan failed|intercycle dispatcher unavailable|message log failed/.test(logs), 'Product dependency/write failure; inspect private run log');
      }
      return record;
    } finally {
      clearTimeout(timer);
      if (children.has(child)) { child.kill('SIGTERM'); await exited; }
      privateFile(`self-service-dispatch-run-${company}-${child.pid}.private.log`, logs);
    }
  }
  const instance = randomUUID();
  const sessions = [];
  async function scenario({ delay = false, consent = true, retry = false } = {}) {
    const ids = Object.fromEntries(['student', 'chat', 'flow', 'first', 'second', 'session'].map(key => [key, randomUUID()]));
    const number = `55489${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`;
    const jid = `${number}@s.whatsapp.net`;
    allowedNumbers.add(number);
    await rest('students', { method: 'POST', body: { id: ids.student, company_id: company, full_name: 'Synthetic Dispatcher', phone: `+${number}`, country_code: 'BR' } });
    await rest('whatsapp_chats', { method: 'POST', body: { id: ids.chat, company_id: company, student_id: ids.student, instance_id: instance, remote_jid: jid } });
    // No enrollment: global trigger scan cannot create extra weekly sessions.
    await rest('automation_flows', { method: 'POST', body: { id: ids.flow, company_id: company, name: `Synthetic ${ids.flow}`, trigger_type: 'weekly_contact', is_active: true } });
    await rest('automation_flow_nodes', { method: 'POST', body: [
      { id: ids.first, flow_id: ids.flow, node_type: 'content', data: { message: 'STALE NODE COPY MUST NOT SEND', use_company_template: 'weekly_contact' } },
      ...(delay || retry ? [{ id: ids.second, flow_id: ids.flow, node_type: 'content', data: { message: retry ? 'Retry second {{checkpoint}}' : 'Resumed context {{checkpoint}} for {{primeiro_nome}}', delay_minutes: delay ? 1 : 0 } }] : []),
    ] });
    if (delay || retry) await rest('automation_flow_edges', { method: 'POST', body: { flow_id: ids.flow, source_node_id: ids.first, target_node_id: ids.second } });
    async function record(event) {
      const result = await api('/rest/v1/rpc/record_weekly_contact_consent', { token, method: 'POST', body: { _student_id: ids.student, _event_type: event, _policy_version: policy, _source: 'staff_confirmed_student', _recipient_key: event === 'granted' ? jid : null } });
      assert.equal(result.ok, true, `actual ledger RPC ${event}`);
    }
    if (consent) await record('granted');
    const [student] = await rest(`students?id=eq.${ids.student}&select=weekly_contact_recipient_generation`);
    const context = { trigger_type: 'weekly_contact', student_id: ids.student, nome: 'Synthetic Dispatcher', student_name: 'Synthetic Dispatcher', recipient_candidate: jid, recipient_generation: student.weekly_contact_recipient_generation, recipient_country_code: 'BR', checkpoint: ids.session };
    await rest('flow_sessions', { method: 'POST', body: { id: ids.session, flow_id: ids.flow, chat_id: ids.chat, current_node_id: ids.first, status: 'active', context } });
    sessions.push(ids.session);
    return { ...ids, jid, number, record, context };
  }
  const readSession = async id => (await rest(`flow_sessions?id=eq.${id}&select=*`))[0];
  const messages = chat => rest(`whatsapp_messages?chat_id=eq.${chat}&select=content,message_id_external,origin&order=timestamp.asc`);
  try {
    await rest('whatsapp_instances', { method: 'POST', body: { id: instance, company_id: company, instance_name: `dispatch-${company}`, status: 'connected' } });
    await check('missing cron auth is rejected without claims or messages', async () => {
      assert.equal((await dispatch(false)).status, 401); assert.equal(calls.length, 0);
    });
    await check('ACKed first node survives ambiguous second-node503; fresh process never blindly retries', async () => {
      const item = await scenario({ retry: true });
      const before = calls.length;
      failOnceText = `Retry second ${item.session}`;
      const failure = await dispatch();
      assert.equal(failure.data.failed, 1);
      const failed = await readSession(item.session);
      assert.equal(failed.status, 'failed');
      assert.equal(failed.context.next_dispatch_at, null);
      assert.equal(failed.context.dispatch_error, 'dispatch_uncertain');
      assert.equal(failed.context.checkpoint, item.session);
      assert.equal((await messages(item.chat)).length, 1);
      const retry = await dispatch();
      assert.notEqual(retry.pid, failure.pid); assert.equal(retry.data.claimed, 0);
      const attempts = calls.slice(before);
      assert.equal(attempts.filter(c => c.text === expectedFirst).length, 1);
      assert.equal(failed.current_node_id, item.second, 'ACKed first content must checkpoint its successor before a later send fails');
      assert.equal(attempts.filter(c => c.text === `Retry second ${item.session}`).length, 1);
      const persisted = await messages(item.chat);
      assert.deepEqual(persisted.map(m => m.message_id_external), attempts.filter(c => c.receipt).map(c => c.receipt));
      assert.equal(persisted.length, 1); assert.equal((await readSession(item.session)).status, 'failed');
      const ledger = await rest(`automation_dispatch_attempts?kind=eq.flow&owner_id=eq.${item.session}&select=send_key,state`);
      assert.deepEqual(ledger.map(a => a.state).sort(), ['acked','in_flight']);
    });
    await check('A defers and exits; B before due sends nothing; C after real due resumes DB context once', async () => {
      const initialCalls = calls.length;
      const item = await scenario({ delay: true });
      const a = await dispatch();
      assert.equal(a.data.claimed, 1); assert.equal(a.data.waiting, 1); assert.equal(calls.length, initialCalls + 1);
      assert.equal(calls[initialCalls].text, expectedFirst);
      const deferred = await readSession(item.session);
      assert.equal(deferred.status, 'active'); assert.equal(deferred.current_node_id, item.second);
      assert.equal(deferred.context.checkpoint, item.session);
      assert.equal(deferred.context._delay.due, deferred.context.next_dispatch_at);
      const b = await dispatch();
      assert.notEqual(b.pid, a.pid); assert.equal(b.data.claimed, 0); assert.equal(calls.length, initialCalls + 1);
      assert.deepEqual(await readSession(item.session), deferred, 'early process must not modify persisted wait');
      const remaining = Date.parse(deferred.context.next_dispatch_at) - Date.now();
      assert.ok(remaining < 61000, 'bounded real persisted wait');
      // Use the real deadline, with no SQL timestamp edits or fake process clock.
      const deadline = Date.now() + Math.max(0, remaining) + 100;
      while (Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, Math.min(30000, deadline - Date.now())));
      const c = await dispatch();
      assert.notEqual(c.pid, a.pid); assert.notEqual(c.pid, b.pid);
      assert.equal(c.data.claimed, 1); assert.equal(c.data.completed, 1);
      const completed = await readSession(item.session);
      assert.equal(completed.status, 'completed'); assert.equal(completed.current_node_id, null);
      assert.equal(completed.context.checkpoint, item.session); assert.equal(completed.context._delay, undefined);
      assert.equal(completed.context.next_dispatch_at, undefined);
      assert.equal(calls.length, initialCalls + 2); assert.equal(calls[initialCalls + 1].text, `Resumed context ${item.session} for Synthetic`);
      const persisted = await messages(item.chat);
      assert.deepEqual(persisted.map(m => m.content), calls.slice(initialCalls).map(m => m.text));
      assert.deepEqual(persisted.map(m => m.message_id_external), calls.slice(initialCalls).map(m => m.receipt));
      assert.ok(persisted.every(m => m.origin === 'automation'));
      assert.equal((await dispatch()).data.claimed, 0); assert.equal(calls.length, initialCalls + 2);
      assert.deepEqual(await messages(item.chat), persisted, 'replay cannot duplicate receipts/messages');
    });
    await check('consent revoked DURING deferred wait blocks second send after fresh-process resume', async () => {
      const item = await scenario({ delay: true }); const before = calls.length;
      const first = await dispatch(); assert.equal(first.data.waiting, 1);
      assert.equal(calls.length, before + 1);
      const deferred = await readSession(item.session);
      await item.record('revoked');
      const deadline = Date.parse(deferred.context.next_dispatch_at) + 100;
      assert.ok(deadline - Date.now() < 61000);
      while (Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, Math.min(30000, deadline - Date.now())));
      const resumed = await dispatch(); assert.notEqual(resumed.pid, first.pid);
      assert.equal(resumed.data.failed, 1); assert.equal(calls.length, before + 1);
      const row = await readSession(item.session);
      assert.equal(row.status, 'failed'); assert.equal(row.context.dispatch_error, 'weekly_contact_consent_missing');
      assert.equal((await messages(item.chat)).length, 1);
      assert.equal((await dispatch()).data.claimed, 0);
    });
    await check('revoked canonical consent blocks send and persists permanent failure', async () => {
      const item = await scenario(); await item.record('revoked');
      const before = calls.length; const result = await dispatch();
      assert.equal(result.data.failed, 1); assert.equal(calls.length, before);
      const row = await readSession(item.session);
      assert.equal(row.status, 'failed'); assert.equal(row.context.dispatch_error, 'weekly_contact_consent_missing');
      assert.equal((await messages(item.chat)).length, 0);
      assert.equal((await dispatch()).data.claimed, 0);
    });
    await check('changed current recipient/generation cannot use queued consent', async () => {
      const item = await scenario();
      const changed = item.number.endsWith('0') ? `${item.number.slice(0, -1)}1` : `${item.number.slice(0, -1)}0`;
      await rest(`students?id=eq.${item.student}`, { method: 'PATCH', body: { phone: `+${changed}` } });
      await rest(`whatsapp_chats?id=eq.${item.chat}`, { method: 'PATCH', body: { remote_jid: `${changed}@s.whatsapp.net` } });
      const before = calls.length; const result = await dispatch();
      assert.equal(result.data.failed, 1); assert.equal(calls.length, before);
      const row = await readSession(item.session);
      assert.equal(row.status, 'failed'); assert.equal(row.context.dispatch_error, 'weekly_contact_queued_recipient_changed');
      assert.equal((await messages(item.chat)).length, 0);
    });
    await check('two concurrent actual HTTP dispatchers claim a session once', async () => {
      const item = await scenario(); const before = calls.length;
      const results = await Promise.all([dispatch(), dispatch()]);
      assert.equal(results.reduce((n, r) => n + r.data.claimed, 0), 1);
      assert.equal(results.reduce((n, r) => n + r.data.completed, 0), 1);
      assert.equal(calls.length, before + 1); assert.equal((await messages(item.chat)).length, 1);
      assert.equal((await readSession(item.session)).status, 'completed');
    });
    await check('expired unsent processing claim recovers with a fresh fence', async () => {
      const item = await scenario(); const before = calls.length;
      const claimed = await rest('rpc/claim_automation_sessions', { method: 'POST', body: { _limit: 25 } });
      assert.deepEqual(claimed.map(row => row.id), [item.session]);
      // SQL claim contract only; separate root process-kill harness proves death.
      await rest(`flow_sessions?id=eq.${item.session}`, { method: 'PATCH', body: { dispatch_lease_until: new Date(Date.now() - 1000).toISOString() } });
      const resumed = await dispatch();
      assert.equal(resumed.data.claimed, 1); assert.equal(calls.length, before + 1);
      const recovered = await readSession(item.session);
      assert.equal(recovered.status, 'completed');
      assert.notEqual(recovered.dispatch_lease_token, claimed[0].dispatch_lease_token);
      evidence.residualLimitations = ['This case expires only an owned lease; actual process death is covered separately.', 'Ambiguous provider acceptance is parked for reconciliation, never guaranteed exactly once.'];
    });
    if (evidence.stage !== 'failed') evidence.stage = 'passed';
  } finally {
    for (const child of children) child.kill('SIGTERM');
    await close(provider);
    // Preserve synthetic evidence. Disable only this run's flows/sessions so a
    // failed run cannot be picked up by another owner's later dispatcher.
    await rest(`automation_flows?company_id=eq.${company}`, { method: 'PATCH', body: { is_active: false } });
    for (const id of sessions) {
      const row = await readSession(id);
      if (['active', 'processing', 'waiting_response'].includes(row.status)) await rest(`flow_sessions?id=eq.${id}`, { method: 'PATCH', body: { status: 'failed' } });
    }
    evidence.company = company; evidence.runs = runs; evidence.providerCalls = calls;
    evidence.functionHashes = snapshot.functions.map(p => ({ signature: p.signature, sha256: createHash('sha256').update(p.definition).digest('hex') }));
    privateFile(`self-service-dispatch-evidence-${company}.private.json`, JSON.stringify(evidence, null, 2));
    privateFile('self-service-dispatch-evidence.private.json', JSON.stringify(evidence, null, 2));
    const dataAfter = captureData(baseline.spec, own);
    privateFile('self-service-dispatch-data-after.private.json', JSON.stringify(dataAfter));
    privateFile(`self-service-dispatch-data-after-${company}.private.json`, JSON.stringify(dataAfter));
    try {
      assert.deepEqual(dataAfter.rows, baseline.rows, 'Preexisting public data changed; serialize other workers before rerun');
      evidence.preexistingDataUnchanged = true;
    } catch (error) { evidence.stage = 'failed'; evidence.preexistingDataUnchanged = false; throw error; }
    finally {
      privateFile('self-service-dispatch-evidence.private.json', JSON.stringify(evidence, null, 2));
      privateFile(`self-service-dispatch-evidence-${company}.private.json`, JSON.stringify(evidence, null, 2));
    }
  }
});
