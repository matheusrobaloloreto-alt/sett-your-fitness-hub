import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixture, login } from './qa/self-service-api.mjs';

const ui = 'http://127.0.0.1:57431';
const backend = 'http://127.0.0.1:57421';
const output = resolve('output/self-service-local-root-20261026');
await mkdir(output, { recursive: true });
const data = fixture();
const session = await login(data.people.adminB);
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const origin = new URL(route.request().url()).origin;
      if ([ui, backend].includes(origin)) await route.continue();
      else await route.abort('blockedbyclient');
    });
    await context.addInitScript(value => localStorage.setItem('sb-127-auth-token', JSON.stringify(value)), session);
    const page = await context.newPage();
    const pageErrors = [];
    const failures = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('requestfailed', request => failures.push(`${new URL(request.url()).origin}${new URL(request.url()).pathname}`));
    await page.goto(`${ui}/admin/settings`, { timeout: 120000 });
    try { await page.getByLabel('Mensagem', { exact: true }).waitFor({ timeout: 45000 }); }
    catch (error) {
      await page.screenshot({ path: resolve(output, `load-failed-${viewport.width}.png`), fullPage: true });
      console.log(JSON.stringify({ path: new URL(page.url()).pathname, errors: pageErrors, failedRequests: failures.slice(0, 12),
        body: (await page.locator('body').innerText()).slice(0, 2000),
        storageKeys: await page.evaluate(() => Object.keys(localStorage)) }));
      throw error;
    }
    for (const [label, target] of [['Mensagens', 'messages'], ['Contatos', 'contacts'], ['Formulários', 'forms'], ['Experiência', 'experience'], ['Operação', 'business']]) {
      await page.getByRole('button', { name: label, exact: true }).click();
      if (label === 'Formulários') await page.getByLabel('Formulario', { exact: true }).waitFor();
      if (label === 'Experiência') await page.getByRole('heading', { name: 'Conquistas', exact: true }).waitFor();
      if (label === 'Operação') await page.getByRole('heading', { name: 'Funil, condições comerciais e páginas públicas' }).waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      if (overflow) throw new Error(`Horizontal overflow: ${target}/${viewport.width}`);
      if (pageErrors.length) throw new Error(`Runtime error: ${pageErrors[0]}`);
      await page.screenshot({ path: resolve(output, `${target}-${viewport.width}.png`), fullPage: true });
      console.log(`PASS readonly UI ${target} ${viewport.width}px; no horizontal overflow`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
