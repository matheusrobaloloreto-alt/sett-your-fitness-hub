import { expect, test, type Page } from '@playwright/test';
import { supabaseAuthStorageKeyFromUrl } from '../src/lib/supabaseAuthStorage';
import { companyFeatureKeys } from '../supabase/functions/_shared/platform-product-settings';

const backend = 'http://127.0.0.1:59991';
const companyId = '10000000-0000-4000-8000-000000000001';
const userId = '10000000-0000-4000-8000-000000000002';

test.use({ serviceWorkers: 'block' });

async function useSettingsFixture(page: Page, origin: string, role: 'admin' | 'trainer' | 'coordinator') {
  if (new URL(origin).hostname !== '127.0.0.1') throw new Error('Use a loopback server with the settings fixture backend.');
  const user = { id: userId, aud: 'authenticated', role: 'authenticated' };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const exp = 4_102_444_800;
  const token = `${encode({ alg: 'none' })}.${encode({ sub: userId, exp })}.fixture`;
  await page.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
    key: supabaseAuthStorageKeyFromUrl(backend),
    session: { user, access_token: token, refresh_token: 'fixture', expires_at: exp },
  });

  let snapshot = { version: 7, settings: {}, expired_workout_behavior: 'keep_until_replaced' };
  const writes: unknown[] = [];
  const readScopes: (string | null)[] = [];
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin && request.method() === 'GET') return route.continue();
    if (url.origin !== backend) return route.abort();
    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': request.headers()['access-control-request-headers'] ?? '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: data, headers });
    const table = url.pathname.split('/').pop();
    switch (table) {
      case 'user': return json(user);
      case 'get_user_role': return json(role);
      case 'get_company_feature_entitlements': return json({
        company_id: companyId, tier: 'advanced', source: 'legacy', version: 0,
        catalog_version: null, adopted_tier: null,
        features: Object.fromEntries(companyFeatureKeys.map(key => [key, key === 'hasDashboard'])),
      });
      case 'company_members': return json([{ company_id: companyId, companies: { tier: 'advanced' } }]);
      case 'staff_sessions': return json([{ id: 'settings-fixture-session' }]);
      case 'company_product_settings':
        readScopes.push(url.searchParams.get('company_id'));
        return json(snapshot);
      case 'company_commercial_settings': return json({ version: 1, settings: {} });
      case 'save_company_product_settings': {
        const body = request.postDataJSON();
        writes.push(body);
        if (role !== 'admin' || body._company_id !== companyId) return json({ code: '42501' }, 403);
        if (body._expected_version !== snapshot.version) return json({ code: 'PT409' }, 409);
        snapshot = { ...snapshot, version: snapshot.version + 1, settings: body._settings };
        return json(snapshot);
      }
      default:
        if (url.pathname.startsWith('/functions/') || url.pathname.startsWith('/storage/')) return route.abort();
        return json(request.headers().accept?.includes('vnd.pgrst.object') ? null : []);
    }
  });
  return { writes, readScopes };
}

for (const width of [320, 360, 390, 1280]) {
  test(`settings sections and links fit at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    await useSettingsFixture(page, new URL(baseURL!).origin, 'admin');
    await page.goto('/admin/settings', { waitUntil: 'domcontentloaded' });
    const tabs = page.getByRole('navigation', { name: 'Seções de configuração' });
    for (const label of ['Mensagens', 'Contatos', 'Formulários', 'Prescrição', 'Identidade', 'Experiência', 'Integrações']) {
      const tab = tabs.getByRole('button', { name: label });
      await tab.click();
      await expect(tab).toHaveAttribute('aria-current', 'page');
      expect((await tab.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      const layout = await page.evaluate(() => {
        const { scrollWidth, clientWidth } = document.documentElement;
        if (scrollWidth <= clientWidth) return { scrollWidth, overflowing: [] };
        const overflowing = [...document.querySelectorAll('main *')].flatMap(element => {
          const right = Math.round(element.getBoundingClientRect().right);
          return right > clientWidth ? [{ tag: element.tagName, id: element.id, class: element.getAttribute('class'), right }] : [];
        }).sort((a, b) => b.right - a.right).slice(0, 8);
        return { scrollWidth, overflowing };
      });
      expect(layout.scrollWidth, `${label} ${JSON.stringify(layout.overflowing)}`).toBeLessThanOrEqual(width);
    }
    const links = page.getByRole('navigation', { name: 'Outras configurações da empresa' }).getByRole('link');
    expect(await links.evaluateAll(items => items.map(link => link.getAttribute('href'))))
      .toEqual(['/admin/governance', '/admin/operations', '/suporte']);
  });
}

test('admin keeps commercial draft through tabs and central reload, then reads back a central save', async ({ page, baseURL }) => {
  const { writes, readScopes } = await useSettingsFixture(page, new URL(baseURL!).origin, 'admin');
  await page.goto('/admin/settings?tab=brand', { waitUntil: 'domcontentloaded' });
  const commercialDraft = page.getByRole('textbox', { name: 'Título do documento', exact: true });
  await commercialDraft.fill('Documento fictício em edição');
  await page.getByRole('button', { name: 'Contatos', exact: true }).click();
  await page.getByRole('button', { name: 'Recarregar configurações' }).click();
  await expect.poll(() => readScopes.length).toBeGreaterThanOrEqual(2);
  await page.getByRole('button', { name: 'Identidade', exact: true }).click();
  await expect(commercialDraft).toHaveValue('Documento fictício em edição');

  await page.getByRole('textbox', { name: 'Nome público da empresa', exact: true }).fill('Empresa de teste');
  await expect(page.getByText('Alterações gerais pendentes.')).toBeVisible();
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Versão 8', { exact: true })).toBeVisible();
  expect(writes).toEqual([expect.objectContaining({ _company_id: companyId, _expected_version: 7 })]);
  expect(new Set(readScopes)).toEqual(new Set([`eq.${companyId}`]));
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Nome público da empresa', exact: true })).toHaveValue('Empresa de teste');
});

test('settings drafts survive cancelling sidebar, browser back and browser reload', async ({ page, baseURL }) => {
  const { writes } = await useSettingsFixture(page, new URL(baseURL!).origin, 'admin');
  const decisions: string[] = [];
  let discard = false;
  page.on('dialog', async dialog => {
    decisions.push(dialog.type());
    if (discard) await dialog.accept();
    else await dialog.dismiss();
  });
  await page.goto('/admin/settings?tab=brand', { waitUntil: 'commit' });
  const sidebar = page.locator('[data-sidebar="sidebar"]');
  const settings = sidebar.getByRole('link', { name: 'Configurações', exact: true });
  const dashboard = sidebar.getByRole('link', { name: 'Dashboard', exact: true });
  const name = page.getByRole('textbox', { name: 'Nome público da empresa', exact: true });
  const commercial = page.getByRole('textbox', { name: 'Título do documento', exact: true });
  await expect(commercial).toBeEditable();
  await dashboard.click();
  await expect(page).toHaveURL(/\/admin$/);
  await settings.click();
  await page.getByRole('button', { name: 'Identidade', exact: true }).click();
  await name.fill('Empresa em edição');
  await commercial.fill('Documento em edição');

  await dashboard.click();
  await expect.poll(() => decisions).toEqual(['confirm']);
  await expect(page).toHaveURL(/\/admin\/settings\?tab=brand$/);
  await expect(name).toHaveValue('Empresa em edição');
  await expect(commercial).toHaveValue('Documento em edição');
  await sidebar.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect.poll(() => decisions).toEqual(['confirm', 'confirm']);
  await expect(commercial).toHaveValue('Documento em edição');

  // An unsaved commercial editor still blocks departure while hidden.
  await page.getByRole('button', { name: 'Descartar alterações', exact: true }).click();
  await page.getByRole('button', { name: 'Contatos', exact: true }).click();
  await page.evaluate(() => history.back());
  await expect.poll(() => decisions).toEqual(['confirm', 'confirm', 'confirm']);
  await expect(page).toHaveURL(/\/admin\/settings\?tab=contact_policy$/);
  await page.getByRole('button', { name: 'Identidade', exact: true }).click();
  await expect(commercial).toHaveValue('Documento em edição');
  await page.evaluate(() => { setTimeout(() => location.reload(), 0); });
  await expect.poll(() => decisions).toEqual(['confirm', 'confirm', 'confirm', 'beforeunload']);
  await expect(commercial).toHaveValue('Documento em edição');
  expect(writes).toEqual([]);

  discard = true;
  await dashboard.click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Configurações da empresa' })).toHaveCount(0);
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/admin\/settings\?tab=brand$/);
  await expect(commercial).not.toHaveValue('Documento em edição');
  await dashboard.click();
  await expect(page).toHaveURL(/\/admin$/);
  expect(decisions).toEqual(['confirm', 'confirm', 'confirm', 'beforeunload', 'confirm']);
});

for (const role of ['trainer', 'coordinator'] as const) {
  test(`${role} cannot open admin settings by URL and gets only operational settings`, async ({ page, baseURL }) => {
    const { writes } = await useSettingsFixture(page, new URL(baseURL!).origin, role);
    await page.goto('/admin/settings', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`/${role}$`));
    await page.goto(`/${role}/settings`);
    await expect(page.getByRole('heading', { name: 'Configurações', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Diagnóstico' })).toHaveAttribute('href', '/suporte');
    await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toHaveCount(0);
    expect(writes).toEqual([]);
  });
}
