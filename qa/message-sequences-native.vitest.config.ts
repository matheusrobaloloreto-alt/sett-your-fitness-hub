import {defineConfig} from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['qa/message-sequences-hosted-runtime.native.ts'],fileParallelism:false,testTimeout:180000}});
