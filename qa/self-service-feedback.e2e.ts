import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { api, login } from '../scripts/qa/self-service-api.mjs';
import { createFeedbackFixture, checked } from '../scripts/qa/self-service-feedback-fixture.mjs';
import { createHash } from 'node:crypto';
import { privateFile } from '../scripts/qa/self-service-local.mjs';

const ui = process.env.SELF_SERVICE_UI_ORIGIN ?? 'http://127.0.0.1:57431';
const storageKey = process.env.SELF_SERVICE_AUTH_STORAGE_KEY ?? 'sb-127-auth-token';
if (!['sb-127-auth-token', 'sb-sett-current-auth-token'].includes(storageKey)) throw new Error('Observed local SDK storage key required');

async function actor(context: BrowserContext, person: { id: string; email: string }) {
  const session = await login(person);
  await context.route('**/*', route => {
    const origin = new URL(route.request().url()).origin;
    return origin === ui || origin === 'http://127.0.0.1:57421' ? route.continue() : route.abort('blockedbyclient');
  });
  await context.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
  }, { key: storageKey, value: session });
  return session.access_token;
}
async function capture(page: Page, name: string) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true });
}

async function openHistory(page: Page) {
  const calendar = page.getByRole('button', { name: /Calend.rio/ });
  const back = page.getByRole('button', { name: 'Voltar ao início', exact: true });
  await expect(calendar.or(back).first()).toBeVisible({ timeout: 30000 });
  const install = page.getByRole('dialog', { name: 'Instalar o app', exact: true });
  await page.addLocatorHandler(install, async () => {
    await install.getByRole('button', { name: 'Dispensar', exact: true }).click();
  });
  if (await back.isVisible()) await back.click();
  await calendar.click();
  await expect(page.getByRole('heading', { name: 'CALENDÁRIO', exact: true })).toBeVisible();
}

const immutableTables = ['company_form_responses', 'student_anamnesis_history', 'intercycle_anamneses'];
const oldRows = new Map<string, Map<string, string>>();
const fingerprint = (row: unknown) => createHash('sha256').update(JSON.stringify(row)).digest('hex');
test.beforeEach(async () => {
  oldRows.clear();
  for (const table of immutableTables) {
    const rows = await checked(`/rest/v1/${table}?select=*&order=id`, { admin: true });
    oldRows.set(table, new Map(rows.map((row: { id: string }) => [row.id, fingerprint(row)])));
  }
});
test.afterEach(async () => {
  for (const [table, before] of oldRows) {
    const current = await checked(`/rest/v1/${table}?select=*&order=id`, { admin: true });
    const after = new Map(current.map((row: { id: string }) => [row.id, fingerprint(row)]));
    for (const [id, hash] of before) expect(after.get(id), `${table}: pre-existing immutable row preserved`).toBe(hash);
    test.info().annotations.push({ type: 'immutable-rows-preserved', description: `${table}: ${before.size}` });
  }
});

test('A16 real portal submits a pinned cycle form through RLS and keeps its enrollment on reload', async ({ page, context }) => {
  const state = await createFeedbackFixture(`cycle-${test.info().project.name}`);
  const token = await actor(context, state.people.student);
  await page.goto('/aluno');
  await expect(page.getByRole('heading', { name: state.cycleForm.definition.title, exact: true })).toBeVisible();
  // A newer publication must not change the already rendered immutable form.
  const newer = await state.publish('cycle_feedback', 1, true);
  await page.locator('#question-nps').fill('9');
  await page.locator('#question-goals_aligned').selectOption('true');
  await page.locator('#question-wants_adjustment').selectOption('true');
  await page.locator('#question-adjustment_notes').fill('Synthetic shorter sessions');
  await page.locator('#question-extra_feedback_ui').fill('Synthetic immutable cycle answer');
  await capture(page, 'cycle-versioned-form');
  const save = page.waitForResponse(r => r.url().includes('/rest/v1/cycle_feedback') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Enviar feedback', exact: true }).click();
  const response = await save;
  expect(response.ok(), `actual cycle insert HTTP ${response.status()}: ${await response.text()}`).toBe(true);
  const rows = await checked(`/rest/v1/cycle_feedback?student_id=eq.${state.student.id}&select=*`, { token });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ enrollment_id: state.enrollment.id, cycle_id: state.cycle.id, form_definition_id: state.cycleForm.id,
    nps: 9, goals_aligned: true, wants_adjustment: true, adjustment_notes: 'Synthetic shorter sessions' });
  expect(rows[0].answers.extra_feedback_ui).toBe('Synthetic immutable cycle answer');
  expect(rows[0].form_definition_id).not.toBe(newer.id);
  const pinned = await checked(`/rest/v1/company_form_definitions?id=eq.${state.cycleForm.id}&select=*`, { token });
  expect(pinned[0].definition).toEqual(state.cycleForm.definition);
  await page.reload();
  await expect(page.getByRole('heading', { name: newer.definition.title, exact: true })).toHaveCount(0);
  expect(await checked(`/rest/v1/cycle_feedback?student_id=eq.${state.student.id}&select=*`, { token })).toEqual(rows);
  const other = (await login(state.people.otherStudent)).access_token;
  expect(await checked(`/rest/v1/cycle_feedback?id=eq.${rows[0].id}&select=*`, { token: other })).toEqual([]);
  for (const body of [
    { ...rows[0], id: crypto.randomUUID(), student_id: state.otherStudent.id, cycle_id: null, enrollment_id: null },
    { ...rows[0], id: crypto.randomUUID(), company_id: state.foreignCompanyId, cycle_id: null, enrollment_id: null, form_definition_id: null },
  ]) {
    const denied = await api('/rest/v1/cycle_feedback', { method: 'POST', token, body });
    expect(denied.ok).toBe(false);
    expect(denied.data.code).toBe('42501');
  }
  for (const parents of [{ enrollment_id: state.otherEnrollment.id }, { cycle_id: state.otherCycle.id }]) {
    const denied = await api('/rest/v1/cycle_feedback', { method: 'POST', token,
      body: { ...rows[0], id: crypto.randomUUID(), ...parents } });
    expect(denied.ok).toBe(false);
    expect(denied.data.code).toBe('23514');
    expect(denied.data.message).toContain('student/company mismatch');
  }
  expect(await checked(`/rest/v1/cycle_feedback?student_id=eq.${state.student.id}&select=*`, { token })).toEqual(rows);
  await capture(page, 'cycle-reloaded-once');
});

test('A17 actual mounted trainer card replies by RPC and student reads author in real history', async ({ browser, page, context }) => {
  const state = await createFeedbackFixture(`reply-${test.info().project.name}`);
  const token = await actor(context, state.people.trainer);
  const failures: string[] = [];
  page.on('response', r => { if (r.status() >= 400 && r.url().startsWith('http://127.0.0.1:57421/')) failures.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  await page.goto(`/trainer/students/${state.student.id}`);
  await expect(page.getByText('SYNTHETIC FEEDBACK STUDENT', { exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByRole('tab', { name: /An.lise/ }).click();
  await expect(page.getByText('FEEDBACKS RECENTES DE TREINO', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic immutable workout answer', { exact: false })).toBeVisible();
  const reply = `Synthetic professor reply ${state.id}`;
  await page.getByRole('textbox', { name: `Responder feedback do treino ${state.workout.title}` }).fill(reply);
  await capture(page, 'trainer-real-card');
  const saved = page.waitForResponse(r => r.url().endsWith('/rpc/reply_to_workout_feedback') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Responder ao aluno', exact: true }).click();
  expect((await saved).ok()).toBe(true);
  await expect(page.getByText(reply, { exact: true })).toBeVisible();
  const row = (await checked(`/rest/v1/workout_feedback?id=eq.${state.feedback.id}&select=*`, { token }))[0];
  expect(row).toMatchObject({ trainer_reply: reply, trainer_replied_by: state.people.trainer.id, trainer_reply_author_name: state.people.trainer.fullName,
    instrument_answers: state.feedback.instrument_answers, form_definition_id: state.workoutForm.id });
  expect(row.trainer_replied_at).toBeTruthy();
  expect((await api(`/rest/v1/workout_feedback?id=eq.${row.id}`, { method: 'PATCH', token, body: { trainer_reply: 'Direct overwrite' } })).ok).toBe(false);
  await page.reload();
  await page.getByRole('tab', { name: /An.lise/ }).click();
  await expect(page.getByText(reply, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Responder ao aluno', exact: true })).toHaveCount(0);
  for (const person of [state.people.foreignTrainer, state.people.student, state.people.otherStudent]) {
    const deniedToken = (await login(person)).access_token;
    expect((await api('/rest/v1/rpc/reply_to_workout_feedback', { method: 'POST', token: deniedToken, body: { _feedback_id: row.id, _trainer_reply: 'Unauthorized overwrite' } })).ok).toBe(false);
  }
  const foreignToken = (await login(state.people.foreignTrainer)).access_token;
  const otherToken = (await login(state.people.otherStudent)).access_token;
  for (const deniedToken of [foreignToken, otherToken]) {
    expect(await checked(`/rest/v1/workout_feedback?id=eq.${row.id}&select=*`, { token: deniedToken })).toEqual([]);
  }
  expect((await checked(`/rest/v1/workout_feedback?id=eq.${row.id}&select=*`, { token }))[0]).toEqual(row);
  const studentContext = await browser.newContext({ ...test.info().project.use, serviceWorkers: 'block' });
  try {
    await actor(studentContext, state.people.student);
    const studentPage = await studentContext.newPage();
    await studentPage.goto(`${ui}/aluno`);
    await openHistory(studentPage);
    await expect(studentPage.getByText(`Resposta de ${state.people.trainer.fullName}`, { exact: true })).toBeVisible();
    await expect(studentPage.getByText(reply, { exact: true })).toBeVisible();
    await capture(studentPage, 'student-real-history');
    await studentPage.reload();
    await openHistory(studentPage);
    await expect(studentPage.getByText(reply, { exact: true })).toBeVisible();
  } finally { await studentContext.close(); }
  // Missing optional modules remain visible evidence; never convert errors to successful RPCs.
  test.info().annotations.push({ type: 'fixture-read-errors', description: JSON.stringify([...new Set(failures)]) });
  await test.info().attach('local-fixture-read-errors', { body: Buffer.from(JSON.stringify([...new Set(failures)])), contentType: 'application/json' });
  privateFile(`feedback-read-errors-${state.id}.json`, JSON.stringify([...new Set(failures)], null, 2));
});

test('A17 no logs: two completed same-day sessions preserve both UI replies and session totals after reload', async ({ browser, page, context }) => {
  const state = await createFeedbackFixture(`two-no-logs-${test.info().project.name}`, { withLogs: false, secondSession: true });
  const token = await actor(context, state.people.trainer);
  expect(await checked(`/rest/v1/workout_logs?student_id=eq.${state.student.id}&select=id`, { admin: true })).toEqual([]);
  await page.goto(`/trainer/students/${state.student.id}`);
  await page.getByRole('tab', { name: /An.lise/ }).click();
  const records = [state.feedback, state.second.feedback];
  const replies: string[] = [];
  for (const feedback of records) {
    const reflection = feedback.instrument_answers.reflection;
    const block = page.getByText(reflection, { exact: true }).locator('..');
    const reply = `Synthetic reply for concrete session ${feedback.workout_session_id}`;
    replies.push(reply);
    await block.getByRole('textbox').fill(reply);
    const saved = page.waitForResponse(r => r.url().endsWith('/rpc/reply_to_workout_feedback') && r.request().method() === 'POST');
    await block.getByRole('button', { name: 'Responder ao aluno', exact: true }).click();
    expect((await saved).ok()).toBe(true);
    expect((await checked(`/rest/v1/workout_feedback?id=eq.${feedback.id}&select=*`, { token }))[0]).toMatchObject({ trainer_reply: reply, workout_session_id: feedback.workout_session_id, trainer_replied_by: state.people.trainer.id });
  }
  const studentContext = await browser.newContext({ ...test.info().project.use, serviceWorkers: 'block' });
  try {
    await actor(studentContext, state.people.student);
    const studentPage = await studentContext.newPage();
    await studentPage.goto(`${ui}/aluno`);
    await openHistory(studentPage);
    for (const reply of replies) await expect(studentPage.getByText(reply, { exact: true })).toBeVisible();
    await expect(studentPage.getByText(`Resposta de ${state.people.trainer.fullName}`, { exact: true })).toHaveCount(2);
    await expect(studentPage.getByText('0.1t', { exact: true })).toHaveCount(1);
    await expect(studentPage.getByText('0.2t', { exact: true })).toHaveCount(1);
    await capture(studentPage, 'student-two-sessions-no-logs');
    await studentPage.reload();
    await openHistory(studentPage);
    for (const reply of replies) await expect(studentPage.getByText(reply, { exact: true })).toBeVisible();
    expect(await checked(`/rest/v1/workout_logs?student_id=eq.${state.student.id}&select=id`, { admin: true })).toEqual([]);
  } finally { await studentContext.close(); }
});
