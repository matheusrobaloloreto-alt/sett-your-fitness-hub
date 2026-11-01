import base from '../../vitest.config';
import { defineConfig } from 'vitest/config';
export default defineConfig({ ...base, test: { ...base.test,
 include: ['src/lib/companyProductSettings.test.ts', 'src/pages/admin/ProductSettings.test.tsx', 'src/pages/admin/ProductSettings.review.test.tsx', 'src/pages/admin/ProductSettings.sequences.test.tsx', 'src/pages/admin/ProductSettings.integrations.test.tsx', 'src/components/admin/SettingHelp.test.tsx'],
 setupFiles: [...(base.test?.setupFiles as string[] ?? []), './qa/configurable-continuity-20261101/settings-worker-test-setup.ts'],
 maxWorkers: 1, fileParallelism: false, testTimeout: 30000, hookTimeout: 30000,
} });
