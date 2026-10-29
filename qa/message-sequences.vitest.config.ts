import { defineConfig } from 'vitest/config';

// Isolated, pure QA: no application setup, credentials, browser or database.
export default defineConfig({ test: {
  environment: 'node',
  include: ['qa/message-sequences-invalidpayload.test.ts', 'qa/message-sequences-consumer-inventory.test.ts'],
  fileParallelism: false,
} });
