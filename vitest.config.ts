import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { realpathSync } from "node:fs";

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      allow: [__dirname, realpathSync(path.resolve(__dirname, "node_modules"))],
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
