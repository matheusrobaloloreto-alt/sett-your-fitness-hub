import { defineConfig, devices } from '@playwright/test';
const run = process.env.SELF_SERVICE_QA_RUN ?? new Date().toISOString().replaceAll(/[^0-9]/g, '');
if (!/^[a-zA-Z0-9-]+$/.test(run)) throw new Error('Invalid local QA run identifier');
process.env.SELF_SERVICE_QA_RUN = run;
const ui = process.env.SELF_SERVICE_UI_ORIGIN ?? 'http://127.0.0.1:57431';
if (!['http://127.0.0.1:57431', 'http://127.0.0.1:57432'].includes(ui)) throw new Error('Only local dev/compiled QA origins allowed');
export default defineConfig({
  testDir: '.', testMatch: 'self-service.e2e.ts', timeout: 120000,
  fullyParallel: false, workers: 1, retries: 0,
  reporter: [['list']],
  outputDir: `../output/self-service-local-20261026/playwright-${run}`,
  use: { baseURL: ui, serviceWorkers: 'block',
    trace: 'off', screenshot: 'only-on-failure', video: 'off' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } }],
});
