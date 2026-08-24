import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import fs from "fs";
import path from "path";

const workspaceRoot = __dirname;
const linkedNodeModulesRoot = fs.realpathSync(path.resolve(workspaceRoot, "node_modules"));

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      allow: [workspaceRoot, linkedNodeModulesRoot],
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(workspaceRoot, "./src") },
  },
});
