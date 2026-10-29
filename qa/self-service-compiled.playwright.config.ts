import { defineConfig } from '@playwright/test';
import base from './self-service.playwright.config';
export default defineConfig({ ...base, testMatch: 'self-service-compiled.e2e.ts',
  outputDir: `${base.outputDir}-compiled-auth`, retries: 0 });
