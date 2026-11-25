import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { realpathSync } from "node:fs";

// Node 26's built-in storage shadows jsdom's browser storage without a backing
// file. Disable it in workers; older Node versions need no compatibility flag.
const browserStorageArgs = process.allowedNodeEnvironmentFlags.has("--no-experimental-webstorage")
  ? ["--no-experimental-webstorage"]
  : [];

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      allow: [__dirname, realpathSync(path.resolve(__dirname, "node_modules"))],
    },
  },
  test: {
    environment: "jsdom",
    poolOptions: {
      forks: { execArgv: browserStorageArgs },
      threads: { execArgv: browserStorageArgs },
    },
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
