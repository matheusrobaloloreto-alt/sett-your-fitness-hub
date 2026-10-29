import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  test: {
    environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'], fileParallelism: false,
    include: ['qa/message-sequences-frontend*.test.ts', 'src/pages/admin/ProductSettings.sequences.test.tsx', 'src/lib/companyMessageMedia.test.ts'],
  },
});
