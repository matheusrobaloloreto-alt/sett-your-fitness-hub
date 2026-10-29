import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import { api, credentials, fixture, login } from './self-service-api.mjs';
import { repo, sql, verifyProject, privateFile } from './self-service-local.mjs';
import { LOCAL_URL, assertLocalUrl } from './self-service-safety.mjs';

const state = fixture();
const root = path.resolve(repo);
const sessions = {};
const require = createRequire(import.meta.url);
const plain = value => JSON.parse(JSON.stringify(value));
const quote = value => { assert.match(value, /^[a-f0-9-]{36}$/i); return `'${value}'`; };
const source = relative => readFileSync(path.join(repo, relative), 'utf8');
const checksum = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Execute the actual local TypeScript graph. Only the Supabase transport is
// injected, using the real SDK and real local Auth; no domain result is mocked.
function modules(client) {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(repo, relative);
    assert.ok(filename.startsWith(`${root}${path.sep}`), 'Only repository modules allowed');
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const localRequire = id => {
      if (id === '@/integrations/supabase/client') return { supabase: client };
      if (id === 'jspdf') return require(id);
      assert.ok(id.startsWith('.') || id.startsWith('@/'), `External module forbidden: ${id}`);
      const target = id.startsWith('@/') ? path.join(repo, 'src', id.slice(2)) : path.resolve(path.dirname(filename), id);
      const resolved = [target, `${target}.ts`, `${target}.tsx`].find(file => existsSync(file) && /\.tsx?$/.test(file));
      assert.ok(resolved, `Local module unavailable: ${id}`);
      return load(resolved);
    };
    const invoke = runInNewContext(`(function(require,module,exports){${compiled}\n})`, {
      structuredClone, TextEncoder, TextDecoder, URL, Intl, console,
      fetch: () => { throw new Error('Engine/PDF provider access forbidden'); },
    }, { filename });
    invoke(localRequire, module, module.exports);
    return module.exports;
  }
  return load;
}

function sdk(role) {
  return createClient(LOCAL_URL, credentials().ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${sessions[role]}` }, fetch: (input, options) => {
      assertLocalUrl(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      return fetch(input, { ...options, redirect: 'error', signal: AbortSignal.timeout(20000) });
    } },
  });
}

async function read(table, query, role = 'adminA', admin = false) {
  const result = await api(`/rest/v1/${table}?${query}`, { token: admin ? undefined : sessions[role], admin });
  assert.equal(result.ok, true, `${table} read HTTP ${result.status} ${result.data?.code || ''}`);
  return result.data;
}
function prepareDependencies() {
  verifyProject();
  assert.equal(state.companyA, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(state.companyB, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  // Restore precisely the historical read policies omitted by the minimal QA
  // fixture. Do not grant new company/global edit authority or replace today's guard.
  const policies = source('supabase/migrations/20260815062126_remove_legacy_same_company_student_leaks.sql');
  const begin = policies.indexOf('drop policy if exists "Company scoped select" on public.exercise_library;');
  const end = policies.indexOf('create policy "Company staff manage owned exercise metadata"', begin);
  assert.ok(begin >= 0 && end > begin);
  const reads = policies.slice(begin, end).replace('drop policy if exists "Company staff manage owned exercise metadata" on public.exercise_metadata;', '');
  const ddl = source('supabase/migrations/20260602170724_f90505d7-c1f1-4fb2-86f5-1973eb99ab72.sql')
    .match(/CREATE TABLE public\.ai_strength_plans \([\s\S]*?\n\);/)?.[0];
  assert.ok(ddl, 'Historical strength-plan DDL required');
  sql(`begin;
    ${reads}
    grant select on public.exercise_library to authenticated;
    grant select,insert,update,delete on public.exercise_metadata to authenticated;
    ${sql("select to_regclass('public.ai_strength_plans') is null;").trim() === 't' ? ddl : ''}
    alter table public.ai_strength_plans enable row level security;
    grant all on public.ai_strength_plans to service_role;
    commit; notify pgrst, 'reload schema';`);
  assert.equal(sql("select count(*) from pg_trigger where tgname='validate_exercise_metadata_scope' and not tgisinternal;"), '1');
  assert.equal(sql("select count(*) from pg_policies where tablename='exercise_metadata' and policyname='Company staff manage owned exercise metadata' and with_check like '%NOT exercise.is_global%';"), '1');
}

const catalog = [
  ['Mobilidade Tornozelo Quadril', 'mobilidade'], ['Prancha Core', 'abdomen'], ['Dead Bug', 'abdomen'],
  ['Abducao Quadril Mini Band', 'gluteos'], ['Agachamento Caixa', 'quadriceps'], ['Leg Press', 'quadriceps'],
  ['Mesa Flexora', 'posterior'], ['Mobilidade Toracica', 'deltoide_posterior'], ['Face Pull', 'deltoide_posterior'],
  ['Remada Baixa', 'costas'], ['Supino Maquina Pegada Neutra', 'peitoral'], ['Puxada Frente', 'costas'],
  ['Step Up Baixo', 'gluteos'], ['Hip Thrust', 'gluteos'], ['Terra Romeno', 'posterior'], ['Panturrilha Core', 'abdomen'],
].map(([name, muscle_group]) => ({ id: randomUUID(), name, muscle_group, equipment: 'livre', targets: [{ muscle_group }] }));

test('real local prescription: HTTP settings -> deterministic engine -> real PDF, metadata RLS and protocol RPC', { timeout: 180000 }, async t => {
  prepareDependencies();
  for (const role of ['adminA', 'adminB', 'trainer', 'student']) sessions[role] = (await login(state.people[role])).access_token;
  const a = modules(sdk('adminA')); const b = modules(sdk('adminB'));
  const aSettings = a('src/lib/companyProductSettings.ts'); const bSettings = b('src/lib/companyProductSettings.ts');
  const originals = []; const published = [];
  const ids = { archive: randomUUID(), own: randomUUID(), ownTarget: randomUUID(), global: randomUUID(), foreign: randomUUID() };
  const legacyPlan = { cycle_name: 'SYNTHETIC ARCHIVED BN PLAN', workouts: [], marker: 'DO NOT REINTERPRET' };
  const archiveCreated = await api('/rest/v1/ai_strength_plans', { method: 'POST', admin: true, body: {
    id: ids.archive, student_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', company_id: state.companyA, plan: legacyPlan,
  } });
  assert.equal(archiveCreated.ok, true, `archived fixture HTTP ${archiveCreated.status} ${archiveCreated.data?.code || ''}`);
  const archiveBefore = (await read('ai_strength_plans', `id=eq.${ids.archive}&select=*`, 'adminA', true))[0];
  const archiveChecksum = checksum(archiveBefore);
  const archivedPlan = plain(archiveBefore.plan);
  const archivedPlanChecksum = checksum(archivedPlan);
  try {
    await t.test('two actual tenant policies affect new output and real PDF text, without reinterpreting an archived row', async () => {
      const programs = [];
      for (const [company, role, load, settingsClient, brand, cadence, multiplier] of [
        [state.companyA, 'adminA', a, aSettings, 'Aurora', '4020', 0.5],
        [state.companyB, 'adminB', b, bSettings, 'Boreal', '2020', 1],
      ]) {
        const previous = await settingsClient.fetchCompanyProductSettings(company);
        originals.push({ company, settingsClient, previous });
        const draft = plain(previous.settings);
        draft.brand = { ...draft.brand, company_name: `Synthetic ${brand}`, professional_name: `Professional ${brand}`, professional_registration: `CREF-${brand}-QA` };
        draft.prescription = { ...draft.prescription, default_cadence: cadence, beginner_max_weekly_sets: 12, first_week_volume_multiplier: multiplier, preferred_split: 'full_body' };
        const saved = await settingsClient.saveCompanyProductSettings(company, draft, previous.version);
        published.push({ company, settings: plain(saved.settings) });
        const fetched = await settingsClient.fetchCompanyProductSettings(company);
        assert.equal(fetched.version, previous.version + 1);
        assert.deepEqual(plain(fetched.settings), draft);
        const generate = load('supabase/functions/_shared/prescription/engine.ts').generateTrainingProgram;
        const plan = generate({ objective: 'hipertrofia', fitnessLevel: 'iniciante', daysPerWeek: 3,
          equipment: 'academia completa', catalog, companyPolicy: fetched.settings.prescription, previousPlanContext: archivedPlan });
        assert.equal(plan.engineMeta.company_policy.default_cadence, cadence);
        assert.equal(plan.weekly_periodization[0].volume_percent, multiplier * 100);
        assert.ok(plan.workouts.flatMap(workout => workout.exercises).length > 0);
        assert.ok(plan.workouts.flatMap(workout => workout.exercises).every(exercise => exercise.weekly_prescription[0].tempo === cadence));
        const logos = await read('platform_settings', `company_id=eq.${company}&select=logo_url`, role);
        assert.ok(logos.every(row => !row.logo_url || /^data:image\//.test(row.logo_url)), 'No external logo fetch allowed in local QA');
        const meta = await load('src/lib/prescription/pdfMeta.ts').loadCompanyPDFMeta(company, { studentName: 'Synthetic QA Student', date: '26/10/2026' });
        const pdf = load('src/lib/generatePDFs.ts').generateStrengthPDF(plan, meta);
        assert.ok(pdf instanceof require('jspdf').jsPDF || typeof pdf.output === 'function');
        const text = pdf.output();
        assert.ok(text.startsWith('%PDF-'), 'Actual jsPDF document required');
        for (const expected of [`Synthetic ${brand}`, `Professional ${brand}`, `CREF-${brand}-QA`]) assert.ok(text.includes(expected), `Missing PDF identity: ${expected}`);
        assert.doesNotMatch(text, new RegExp(brand === 'Aurora' ? 'Boreal' : 'Aurora'));
        assert.doesNotMatch(text, /\bBN\b|BN Performance|Matheus Loreto|040718/);
        privateFile(`prescription-${brand.toLowerCase()}.pdf`, Buffer.from(pdf.output('arraybuffer')));
        programs.push(plan);
      }
      const sets = plan => plan.workouts.flatMap(workout => workout.exercises).reduce((sum, exercise) => sum + exercise.weekly_prescription[0].sets, 0);
      assert.ok(sets(programs[0]) < sets(programs[1]), 'Persisted first-week policy must change actual generated exercise sets');
      t.diagnostic(`Real deterministic week-one sets: Aurora=${sets(programs[0])}, Boreal=${sets(programs[1])}; real jsPDF outputs stored privately; no LLM invoked.`);
      assert.equal(checksum((await read('ai_strength_plans', `id=eq.${ids.archive}&select=*`, 'adminA', true))[0]), archiveChecksum);
      assert.equal(checksum(archivedPlan), archivedPlanChecksum);
    });
    await t.test('actual metadata HTTP upsert/readback: owned source only, canonical own/global substitutes, trainer/student denied', async () => {
      const seeded = await api('/rest/v1/exercise_library', { method: 'POST', admin: true, body: [
        { id: ids.own, company_id: state.companyA, name: 'Synthetic private A', is_global: false },
        { id: ids.ownTarget, company_id: state.companyA, name: 'Synthetic private A alternative', is_global: false },
        { id: ids.global, company_id: null, name: 'Synthetic global reference', is_global: true },
        { id: ids.foreign, company_id: state.companyB, name: 'Synthetic private B', is_global: false },
      ] });
      assert.equal(seeded.ok, true);
      const metadata = a('src/lib/prescription/exerciseMetadata.ts');
      const payload = metadata.prepareExerciseMetadata({ id: ids.own, company_id: state.companyA, is_global: false }, state.companyA, 'admin', [
        { id: ids.ownTarget, company_id: state.companyA, is_global: false }, { id: ids.global, company_id: null, is_global: true },
      ], { contraindications: 'Synthetic contraindication', regressions: 'Synthetic regression', equivalent_substitutes: [ids.ownTarget, ids.global] });
      await metadata.saveExerciseMetadata(sdk('adminA'), payload);
      const persisted = await read('exercise_metadata', `exercise_id=eq.${ids.own}&select=*`);
      assert.equal(persisted.length, 1); assert.deepEqual(persisted[0].equivalent_substitutes, [ids.ownTarget, ids.global]);
      assert.deepEqual(persisted[0].contraindications, ['Synthetic contraindication']);
      assert.deepEqual(persisted[0].regressions, ['Synthetic regression']);
      const before = checksum(await read('exercise_metadata', `exercise_id=in.(${Object.values(ids).filter(id => id !== ids.archive).join(',')})&select=*&order=exercise_id`, 'adminA', true));
      for (const role of ['adminA', 'trainer', 'student']) {
        for (const target of role === 'adminA' ? [ids.global, ids.foreign] : [ids.own, ids.global, ids.foreign]) {
          const denied = await sdk(role).from('exercise_metadata').upsert({ ...plain(payload), exercise_id: target, equivalent_substitutes: [] }, { onConflict: 'exercise_id' });
          assert.ok(denied.error, `${role} must not modify ${target === ids.global ? 'global' : target === ids.foreign ? 'foreign' : 'owned'} metadata`);
          if (target !== ids.foreign) assert.equal(denied.error.code, '42501', 'Valid payload must be denied by row policy, not malformed metadata');
        }
      }
      const invalid = await sdk('adminA').from('exercise_metadata').upsert({ ...plain(payload), equivalent_substitutes: [ids.foreign] }, { onConflict: 'exercise_id' });
      assert.ok(invalid.error); assert.equal(invalid.error.code, '23514');
      assert.deepEqual(await read('exercise_metadata', `exercise_id=eq.${ids.own}&select=*`, 'adminB'), []);
      assert.equal(checksum(await read('exercise_metadata', `exercise_id=in.(${Object.values(ids).filter(id => id !== ids.archive).join(',')})&select=*&order=exercise_id`, 'adminA', true)), before);
    });
    await t.test('actual protocol RPC publication/readback preserves approved tests and rejects wrong tenant/role/hidden screening', async () => {
      const protocolClient = a('src/lib/prescription/companyAssessmentProtocol.ts');
      const previous = await protocolClient.fetchCompanyAssessmentProtocol(state.companyA);
      const draft = protocolClient.defaultAssessmentProtocol();
      const optional = draft.tests.find(entry => entry.id === 'toe_touch'); optional.enabled = true; optional.label = 'Synthetic optional label'; optional.instructions = 'Synthetic capture instruction';
      draft.tests = [optional, ...draft.tests.filter(entry => entry.id !== optional.id)];
      const saved = await protocolClient.saveCompanyAssessmentProtocol(state.companyA, draft, previous.version);
      const readback = await protocolClient.fetchCompanyAssessmentProtocol(state.companyA);
      assert.equal(readback.version, previous.version + 1); assert.deepEqual(plain(readback.protocol), plain(saved.protocol));
      const capture = protocolClient.resolveAssessmentCapture(readback.protocol);
      assert.equal(capture.vistas[0], 'Toe Touch'); assert.equal(capture.labels[0], optional.label); assert.equal(capture.instructions[0], optional.instructions);
      assert.equal(capture.vistas.length, 9);
      for (const [company, role] of [[state.companyA, 'trainer'], [state.companyA, 'student'], [state.companyB, 'adminA']]) {
        const denied = await api('/rest/v1/rpc/save_company_assessment_protocol', { method: 'POST', token: sessions[role], body: { _company_id: company, _protocol: plain(draft), _expected_version: readback.version } });
        assert.equal(denied.ok, false); assert.equal(denied.data.code, '42501');
      }
      const broken = plain(draft); broken.tests.find(entry => entry.id === 'posture_anterior').enabled = false;
      const denied = await api('/rest/v1/rpc/save_company_assessment_protocol', { method: 'POST', token: sessions.adminA, body: { _company_id: state.companyA, _protocol: broken, _expected_version: readback.version } });
      assert.equal(denied.ok, false); assert.equal(denied.data.code, '22023');
      assert.equal((await protocolClient.fetchCompanyAssessmentProtocol(state.companyA)).version, readback.version);
      // Restore through the real audited RPC, never delete immutable protocol history.
      await protocolClient.saveCompanyAssessmentProtocol(state.companyA, previous.protocol, readback.version);
    });
  } finally {
    assert.equal(checksum((await read('ai_strength_plans', `id=eq.${ids.archive}&select=*`, 'adminA', true))[0]), archiveChecksum, 'Archived persisted row changed');
    for (const { company, settingsClient, previous } of originals) {
      const current = await settingsClient.fetchCompanyProductSettings(company);
      const ours = published.find(entry => entry.company === company);
      assert.ok(ours && JSON.stringify(plain(current.settings)) === JSON.stringify(ours.settings), 'Concurrent QA settings changed; refusing to overwrite another worker');
      await settingsClient.saveCompanyProductSettings(company, previous.settings, current.version);
    }
    for (const [table, filter] of [['exercise_metadata', `exercise_id=in.(${[ids.own, ids.ownTarget, ids.global, ids.foreign].join(',')})`], ['exercise_library', `id=in.(${[ids.own, ids.ownTarget, ids.global, ids.foreign].join(',')})`], ['ai_strength_plans', `id=eq.${ids.archive}`]]) {
      const removed = await api(`/rest/v1/${table}?${filter}`, { method: 'DELETE', admin: true });
      assert.equal(removed.ok, true, `Synthetic ${table} cleanup failed`);
    }
  }
});
