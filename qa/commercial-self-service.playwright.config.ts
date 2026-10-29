import {defineConfig} from '@playwright/test';
import base from './self-service.playwright.config';
export default defineConfig({...base,testMatch:'commercial-self-service.e2e.ts',outputDir:'../output/commercial-self-service/playwright'});
