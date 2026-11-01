import base from '../../vitest.config';
import {defineConfig} from 'vitest/config';
export default defineConfig({...base,test:{...base.test,testTimeout:15000,include:['qa/configurable-continuity-20261101/**/*.test.{ts,tsx}']}});
