import test from 'node:test';
import assert from 'node:assert/strict';
import { api, fixture, login } from './self-service-api.mjs';
import { sql } from './self-service-local.mjs';

const state = fixture();
const sessions = {};
test.before(async () => {
  for (const [name, person] of Object.entries(state.people)) sessions[name] = (await login(person)).access_token;
});
const read = (company, role = 'adminA') => api(`/rest/v1/company_product_settings?company_id=eq.${company}&select=settings,version`, { token: sessions[role] });
const save = (company, settings, version, role = 'adminA') => api('/rest/v1/rpc/save_company_product_settings', {
  method: 'POST', token: sessions[role], body: { _company_id: company, _settings: settings, _expected_version: version },
});
async function current(company, role) {
  const result = await read(company, role);
  assert.equal(result.ok, true, `settings read HTTP ${result.status}`);
  return result.data[0] || { settings: {}, version: 0 };
}

test('real Auth roles, tenant isolation, persistence, stale version and rollback', async t => {
  const legacy = sql('select md5(row_to_json(a)::text) from public.student_anamneses a order by id;');
  const bBefore = await current(state.companyB, 'adminB');
  let a = await current(state.companyA, 'adminA');
  await t.test('admin A saves and reloads the persisted value', async () => {
    const next = { ...a.settings, brand: { ...(a.settings.brand || {}), company_name: 'Synthetic QA A' } };
    const saved = await save(state.companyA, next, a.version);
    assert.equal(saved.ok, true, `save failed ${saved.status} ${saved.data?.code}`);
    assert.equal(saved.data.version, a.version + 1);
    a = await current(state.companyA, 'adminA');
    assert.equal(a.settings.brand.company_name, 'Synthetic QA A');
  });
  await t.test('admin B cannot read or write tenant A', async () => {
    const result = await read(state.companyA, 'adminB');
    assert.equal(result.ok, true);
    assert.deepEqual(result.data, []);
    const attempt = await save(state.companyA, {}, a.version, 'adminB');
    assert.equal(attempt.ok, false);
    assert.equal(attempt.data.code, '42501');
    assert.deepEqual(await current(state.companyB, 'adminB'), bBefore);
  });
  await t.test('student and trainer cannot write settings', async () => {
    for (const role of ['student', 'trainer']) {
      const attempt = await save(state.companyA, {}, a.version, role);
      assert.equal(attempt.ok, false, `${role} write must fail`);
      assert.equal(attempt.data.code, '42501');
    }
  });
  await t.test('caller controlled user_metadata cannot escalate a student', async () => {
    const forged = await api('/auth/v1/user', { method: 'PUT', token: sessions.student,
      body: { data: { role: 'master', company_id: state.companyA } } });
    assert.equal(forged.ok, true);
    sessions.student = (await login(state.people.student, { fresh: true })).access_token;
    assert.equal((await save(state.companyA, {}, a.version, 'student')).data.code, '42501');
  });
  await t.test('anonymous and direct DML cannot bypass the write RPC', async () => {
    const anon = await api('/rest/v1/rpc/save_company_product_settings', { method: 'POST',
      body: { _company_id: state.companyA, _settings: {}, _expected_version: a.version } });
    assert.equal(anon.ok, false);
    const direct = await api(`/rest/v1/company_product_settings?company_id=eq.${state.companyA}`, {
      method: 'PATCH', token: sessions.adminA, body: { version: 99999 },
    });
    assert.equal(direct.ok, false);
  });
  await t.test('malformed policy is rejected without creating history', async () => {
    const history = sql(`select count(*) from public.company_product_settings_history where company_id='${state.companyA}';`);
    for (const settings of [{ contact_policy: { minimum_interval_hours: 1 } },
      { messages: { weekly_contact: '{{unapproved_variable}}' } }, { prescription: { beginner_max_weekly_sets: 1000 } }]) {
      const rejected = await save(state.companyA, settings, a.version);
      assert.equal(rejected.ok, false);
      assert.equal(rejected.data.code, '22023');
    }
    assert.equal(sql(`select count(*) from public.company_product_settings_history where company_id='${state.companyA}';`), history);
    assert.deepEqual(await current(state.companyA, 'adminA'), a);
  });
  await t.test('two concurrent writes have exactly one winner', async () => {
    const started = performance.now();
    const results = await Promise.all([save(state.companyA, a.settings, a.version), save(state.companyA, a.settings, a.version)]);
    assert.ok(performance.now() - started < 5000, 'CAS conflict must return within 5s, without transaction retry');
    assert.equal(results.filter(result => result.ok).length, 1);
    const conflict = results.find(result => !result.ok);
    assert.equal(conflict?.status, 409);
    assert.equal(conflict?.data.code, 'PT409');
    a = await current(state.companyA, 'adminA');
  });
  await t.test('stale version cannot overwrite the successful save', async () => {
    const started = performance.now();
    const rejected = await save(state.companyA, {}, a.version - 1);
    assert.ok(performance.now() - started < 5000, 'Stale CAS must return promptly, without transaction retry');
    assert.equal(rejected.ok, false);
    assert.equal(rejected.status, 409);
    assert.equal(rejected.data.code, 'PT409');
    assert.deepEqual(await current(state.companyA, 'adminA'), a);
  });
  await t.test('master can write and audit records identify the real actor', async () => {
    const saved = await save(state.companyA, a.settings, a.version, 'master');
    assert.equal(saved.ok, true);
    a = await current(state.companyA, 'adminA');
    const actor = sql(`select changed_by from public.company_product_settings_history where company_id='${state.companyA}' and version=${a.version};`);
    assert.equal(actor, state.people.master.id);
  });
  await t.test('SQL transaction rollback restores settings and history atomically', async () => {
    const history = sql(`select count(*) from public.company_product_settings_history where company_id='${state.companyA}';`);
    sql(`begin; set local role authenticated;
      select set_config('request.jwt.claim.sub','${state.people.adminA.id}',true);
      select public.save_company_product_settings('${state.companyA}','{}'::jsonb,${a.version}); rollback;`);
    assert.deepEqual(await current(state.companyA, 'adminA'), a);
    assert.equal(sql(`select count(*) from public.company_product_settings_history where company_id='${state.companyA}';`), history);
  });
  assert.equal(sql('select md5(row_to_json(a)::text) from public.student_anamneses a order by id;'), legacy);
  assert.deepEqual(await current(state.companyB, 'adminB'), bBefore);
});
