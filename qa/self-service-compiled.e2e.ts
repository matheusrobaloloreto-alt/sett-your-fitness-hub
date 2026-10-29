import { test, expect } from '@playwright/test';
import { fixture, login } from '../scripts/qa/self-service-api.mjs';
import { writeFile } from 'node:fs/promises';

for (const [mode, origin] of [['dev', 'http://127.0.0.1:57431'], ['compiled', 'http://127.0.0.1:57432']] as const) {
  test(`${mode}: SDK storage-key discovery and actual authenticated settings reload`, async ({ page, context }) => {
    const observedOrigins = new Set<string>();
    await context.route('**/*', async route => {
      const target = new URL(route.request().url()).origin;
      if ([origin, 'http://127.0.0.1:57421'].includes(target)) await route.continue();
      else await route.abort('blockedbyclient');
    });
    page.on('request', request => {
      const target = new URL(request.url()).origin;
      if (target.includes('supabase.co') || target.includes('127.0.0.1:57421')) observedOrigins.add(target);
    });
    await context.addInitScript(() => {
      const read = Storage.prototype.getItem;
      const keys: string[] = [];
      Object.defineProperty(window, '__qaStorageReadNames', { value: keys });
      Storage.prototype.getItem = function (key: string) {
        if (key.endsWith('-auth-token') && !keys.includes(key)) keys.push(key);
        return read.call(this, key);
      };
    });
    await page.goto(`${origin}/admin/settings`);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __qaStorageReadNames: string[] }).__qaStorageReadNames.length)).toBeGreaterThan(0);
    const names = await page.evaluate(() => (window as unknown as { __qaStorageReadNames: string[] }).__qaStorageReadNames);
    for (const name of names) expect(name).toMatch(/^sb-[a-z0-9-]+-auth-token$/);
    const session = await login(fixture().people.adminB);
    const accepted: string[] = [];
    for (const candidate of names) {
      await page.evaluate(({ keys, key, value }) => {
        for (const name of keys) localStorage.removeItem(name);
        localStorage.setItem(key, JSON.stringify(value));
      }, { keys: names, key: candidate, value: session });
      await page.goto(`${origin}/admin/settings`);
      const authenticated = await page.getByLabel('Mensagem', { exact: true }).waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
      if (authenticated) accepted.push(candidate);
    }
    expect(accepted.length, 'An observed SDK storage key must authenticate the actual compiled UI').toBeGreaterThan(0);
    const storageKey = accepted[0];
    await page.evaluate(({ keys, key, value }) => {
      for (const name of keys) localStorage.removeItem(name);
      localStorage.setItem(key, JSON.stringify(value));
    }, { keys: names, key: storageKey, value: session });
    await page.goto(`${origin}/admin/settings`);
    await page.reload();
    await expect(page.getByLabel('Mensagem', { exact: true })).toBeVisible();
    await expect(page.getByText('Aguardando liberação', { exact: true })).toHaveCount(0);
    expect([...observedOrigins]).toEqual(['http://127.0.0.1:57421']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`${mode}-authenticated.png`), fullPage: true });
    const contract = test.info().outputPath('storage-key-contract.json');
    await writeFile(contract, JSON.stringify({ mode, origin, observedReadKeys: names, acceptedKeys: accepted, sdkReadKey: storageKey,
      seededSameKey: true, authenticatedRole: 'adminB', backendOrigins: [...observedOrigins], applicationAuthModified: false }, null, 2), { mode: 0o600 });
    await test.info().attach('storage-key-contract.json', { path: contract, contentType: 'application/json' });
  });
}
