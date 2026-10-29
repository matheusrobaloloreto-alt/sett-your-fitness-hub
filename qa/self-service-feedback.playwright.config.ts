import { defineConfig, devices } from '@playwright/test';
const origin = process.env.SELF_SERVICE_UI_ORIGIN ?? 'http://127.0.0.1:57431';
if (!['http://127.0.0.1:57431', 'http://127.0.0.1:57432'].includes(origin)) throw new Error('Loopback UI only');
export default defineConfig({
  testDir: '.', testMatch: 'self-service-feedback.e2e.ts', timeout: 90000,
  workers: 1, fullyParallel: false, retries: 0, reporter: 'list',
  outputDir: '../output/self-service-local-20261026/feedback-ui',
  use: { baseURL: origin, actionTimeout: 15000, navigationTimeout: 20000, serviceWorkers: 'block', trace: 'off', video: 'off', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
});
