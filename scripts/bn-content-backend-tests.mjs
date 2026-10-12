import { spawnSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const result = spawnSync("deno", [
  "test",
  "--no-lock",
  "--node-modules-dir=none",
  "supabase/functions/bn-content-studio/handler.test.ts",
  "supabase/functions/bn-content-studio/provider.test.ts",
], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
