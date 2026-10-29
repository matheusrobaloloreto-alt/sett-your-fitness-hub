import {defineConfig,devices} from '@playwright/test';
const origin=process.env.SELF_SERVICE_UI_ORIGIN??'http://127.0.0.1:57432';
if(!['http://127.0.0.1:57431','http://127.0.0.1:57432'].includes(origin))throw new Error('Loopback UI required');
export default defineConfig({testDir:'.',testMatch:'recovery-entitlements.e2e.ts',workers:1,fullyParallel:false,retries:0,timeout:90000,expect:{timeout:15000},reporter:'list',outputDir:'../output/self-service-local-20261026/recovery-entitlements-ui',use:{baseURL:origin,serviceWorkers:'block',trace:'off',video:'off',screenshot:'only-on-failure',actionTimeout:15000,navigationTimeout:20000},projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}}]});
