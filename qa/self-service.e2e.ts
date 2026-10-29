import { test, expect, type BrowserContext } from '@playwright/test';
import { api, fixture, login } from '../scripts/qa/self-service-api.mjs';
import { eventMessage } from '../supabase/functions/_shared/communication-policy';

const data = fixture();
const ui = process.env.SELF_SERVICE_UI_ORIGIN ?? 'http://127.0.0.1:57431';
const storageKey = process.env.SELF_SERVICE_AUTH_STORAGE_KEY ?? 'sb-127-auth-token';
if (!['http://127.0.0.1:57431', 'http://127.0.0.1:57432'].includes(ui)) throw new Error('Only local QA UI origins allowed');
if (!['sb-127-auth-token', 'sb-sett-current-auth-token'].includes(storageKey)) throw new Error('Only observed local QA SDK storage keys allowed');
const backend = 'http://127.0.0.1:57421';
async function localOnly(context: BrowserContext) {
  const blocked: string[] = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === ui || url.origin === backend) await route.continue();
    else { blocked.push(url.origin); await route.abort('blockedbyclient'); }
  });
  return blocked;
}
async function authenticate(context: BrowserContext, role: string) {
  const session = await login(data.people[role]);
  await context.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
  }, { key: storageKey, value: session });
  return session.access_token;
}
async function capture(page: import('@playwright/test').Page, name: string) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const fullPage = await page.evaluate(() => document.documentElement.scrollHeight < 12000);
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage });
}

test('central settings save/reload, actual message renderer and tenant B preservation', async ({ page, context }) => {
  const blocked = await localOnly(context);
  const token = await authenticate(context, 'adminA');
  const bToken = (await login(data.people.adminB)).access_token;
  const bEndpoint = `/rest/v1/company_product_settings?company_id=eq.${data.companyB}&select=settings,version`;
  const bBefore = await api(bEndpoint, { token: bToken });
  await page.goto('/admin/settings');
  const message = `QA local ${Date.now()} para {{primeiro_nome}} da {{empresa}}`;
  await expect(page.getByLabel('Mensagem', { exact: true })).toBeVisible();
  const dismiss = page.getByRole('button', { name: 'Dispensar', exact: true });
  if (await dismiss.isVisible()) await dismiss.click();
  await page.getByLabel('Mensagem', { exact: true }).fill(message);
  await expect(page.getByLabel('Mensagem', { exact: true })).toHaveValue(message);
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toBeEnabled();
  const savedResponse = page.waitForResponse(response => response.url().endsWith('/rpc/save_company_product_settings') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  expect((await savedResponse).ok()).toBe(true);
  await expect(page.getByRole('status')).toContainText('Configurações salvas');
  await page.reload();
  await expect(page.getByLabel('Mensagem', { exact: true })).toHaveValue(message);
  await expect(page.getByTestId('message-preview')).toContainText(message.replace('{{primeiro_nome}}', 'Ana').split(' da ')[0]);
  await capture(page, 'central-messages');
  const stored = await api(`/rest/v1/company_product_settings?company_id=eq.${data.companyA}&select=settings,version`, { token });
  expect(stored.ok).toBe(true);
  expect(eventMessage(stored.data[0].settings.messages, 'weekly_contact', {
    primeiro_nome: 'Synthetic', empresa: 'Company A',
  }, 'fallback')).toBe(message.replace('{{primeiro_nome}}', 'Synthetic').replace('{{empresa}}', 'Company A'));
  expect(await api(bEndpoint, { token: bToken })).toEqual(bBefore);
  const rejected = await page.evaluate(async () => {
    try { await fetch('https://zshrcgbyhzxpnlccssyz.supabase.co/rest/v1/'); return false; }
    catch { return true; }
  });
  expect(rejected).toBe(true);
  expect(blocked).toContain('https://zshrcgbyhzxpnlccssyz.supabase.co');
  await page.getByRole('button', { name: 'Formulários', exact: true }).click();
  await expect(page.getByLabel('Formulario', { exact: true })).toBeEnabled();
  await capture(page, 'central-forms');
});

test('two real tabs surface stale version and keep the losing draft', async ({ page, context }) => {
  await localOnly(context);
  await authenticate(context, 'adminA');
  const other = await context.newPage();
  await page.goto('/admin/settings');
  await other.goto(`${ui}/admin/settings`);
  const marker = Date.now();
  await page.getByLabel('Mensagem', { exact: true }).fill(`Winner ${marker}`);
  await other.getByLabel('Mensagem', { exact: true }).fill(`Losing draft ${marker}`);
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Configurações salvas');
  const started = performance.now();
  const conflictResponse = other.waitForResponse(response => response.url().endsWith('/rpc/save_company_product_settings') && response.request().method() === 'POST');
  await other.getByRole('button', { name: 'Salvar', exact: true }).click();
  const conflict = await conflictResponse;
  expect(performance.now() - started).toBeLessThan(5000);
  expect(conflict.status()).toBe(409);
  expect((await conflict.json()).code).toBe('PT409');
  await expect(other.getByRole('alert').filter({ hasText: 'Outra pessoa' })).toBeVisible();
  await expect(other.getByLabel('Mensagem', { exact: true })).toHaveValue(`Losing draft ${marker}`);
  await capture(other, 'stale-version-draft-preserved');
  await page.reload();
  await expect(page.getByLabel('Mensagem', { exact: true })).toHaveValue(`Winner ${marker}`);
});

test('master catalog persists locally and public catalog consumes saved identity', async ({ page, context }) => {
  await localOnly(context);
  await authenticate(context, 'master');
  await page.goto('/master/settings');
  const marker = `Synthetic Basic ${Date.now()}`;
  await expect(page.locator('#basic-name')).toBeVisible();
  const dismiss = page.getByRole('button', { name: 'Dispensar', exact: true });
  if (await dismiss.isVisible()) await dismiss.click();
  await page.locator('#basic-name').fill(marker);
  const savedResponse = page.waitForResponse(response => response.url().endsWith('/rpc/save_platform_product_settings') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  const saved = await savedResponse;
  const savedBody = await saved.json();
  expect(saved.ok(), `catalog RPC: HTTP ${saved.status()}, code ${savedBody?.code}, message ${savedBody?.message}`).toBe(true);
  await expect(page.getByRole('status')).toContainText('Configuração salva');
  await page.reload();
  await expect(page.locator('#basic-name')).toHaveValue(marker);
  await capture(page, 'master-catalog');
  const catalog = await api('/rest/v1/rpc/get_public_platform_catalog', { method: 'POST', body: {} });
  expect(catalog.ok).toBe(true);
  expect(catalog.data.tiers.basic.name).toBe(marker);
});

test('published form versions pin old and new invitations; actual public handler reads each snapshot', async ({ page, context }) => {
  await localOnly(context);
  const token = await authenticate(context, 'adminA');
  await page.goto('/admin/settings');
  await expect(page.getByRole('button', { name: 'Formulários', exact: true })).toBeVisible();
  const dismiss = page.getByRole('button', { name: 'Dispensar', exact: true });
  if (await dismiss.isVisible()) await dismiss.click();
  await page.getByRole('button', { name: 'Formulários', exact: true }).click();
  await expect(page.getByLabel('Formulario', { exact: true })).toBeEnabled();
  const marker = Date.now();
  const publish = async (title: string) => {
    await page.getByLabel('Titulo', { exact: true }).fill(title);
    const response = page.waitForResponse(r => r.url().endsWith('/rpc/publish_company_form_definition') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Publicar versao', exact: true }).click();
    const result = await response;
    expect(result.ok()).toBe(true);
    return result.json();
  };
  const first = await publish(`Synthetic initial V1 ${marker}`);
  const issue = async () => {
    const opaque = crypto.randomUUID().replaceAll('-', '');
    const created = await api('/rest/v1/anamnese_invites', { method: 'POST', admin: true, body: {
      company_id: data.companyA, student_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      student_name: 'Synthetic Student', token: opaque, status: 'pending',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    } });
    expect(created.ok).toBe(true);
    return { opaque, row: created.data[0] };
  };
  const oldInvite = await issue();
  expect(oldInvite.row.form_definition_id).toBe(first.id);
  const second = await publish(`Synthetic initial V2 ${marker}`);
  const newInvite = await issue();
  expect(newInvite.row.form_definition_id).toBe(second.id);
  expect(second.version).toBe(first.version + 1);
  const edgeContext = async (opaque: string) => {
    const response = await fetch('http://127.0.0.1:57441', { method: 'POST', redirect: 'error',
      signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'context', accessKey: opaque }),
    });
    expect(response.ok).toBe(true);
    return response.json();
  };
  const oldContext = await edgeContext(oldInvite.opaque);
  const newContext = await edgeContext(newInvite.opaque);
  expect(oldContext.form_definition.id).toBe(first.id);
  expect(oldContext.form_definition.definition.title).toBe(first.definition.title);
  expect(newContext.form_definition.id).toBe(second.id);
  expect(newContext.form_definition.definition.title).toBe(second.definition.title);
  const mutateOld = await api(`/rest/v1/company_form_definitions?id=eq.${first.id}`, {
    method: 'PATCH', token, body: { definition: second.definition },
  });
  expect(mutateOld.ok).toBe(false);
  await page.reload();
  await page.getByRole('button', { name: 'Formulários', exact: true }).click();
  await expect(page.getByLabel('Titulo', { exact: true })).toHaveValue(second.definition.title);
  await capture(page, 'forms-published-reloaded');
});
