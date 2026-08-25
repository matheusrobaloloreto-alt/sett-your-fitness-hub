import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "..",
  testMatch: ["qa/student-benito-drag.e2e.ts", "qa/student-training-ux.e2e.ts"],
  timeout: 60_000,
  workers: 1,
  reporter: "list",
  use: {
    ...devices["iPhone 13"],
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8080",
    trace: "on-first-retry",
  },
  projects: [{ name: "webkit-iphone", use: { browserName: "webkit" } }],
});
