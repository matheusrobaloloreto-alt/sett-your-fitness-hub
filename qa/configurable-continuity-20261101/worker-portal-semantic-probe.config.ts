import base from '../../vitest.config';
import { defineConfig } from 'vitest/config';
export default defineConfig({...base,test:{...base.test,testTimeout:20000,include:['qa/configurable-continuity-20261101/worker-portal-active-session.probe.tsx']}});
