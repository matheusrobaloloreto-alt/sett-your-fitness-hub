import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const indexPath = resolve(process.cwd(), "dist/index.html");
const html = readFileSync(indexPath, "utf8");

if (/rel=["']modulepreload["'][^>]+recharts-/i.test(html)) {
  throw new Error("Performance regression: Recharts is preloaded on every route");
}

const initialScriptPaths = [...new Set(
  [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)=["'](\/assets\/[^"']+\.js)["']/gi)]
    .map((match) => match[1]),
)];
const initialScriptBytes = initialScriptPaths.reduce(
  (total, assetPath) => total + statSync(resolve(process.cwd(), `dist${assetPath}`)).size,
  0,
);
// Leaves normal hashing/minification headroom while still failing if the
// route-heavy chart bundle (~350 kB raw) becomes globally preloaded again.
const initialScriptBudgetBytes = 875_000;

if (initialScriptBytes > initialScriptBudgetBytes) {
  throw new Error(`Performance regression: initial scripts total ${initialScriptBytes} bytes (budget ${initialScriptBudgetBytes})`);
}

console.log(`Bundle performance: route-heavy charts excluded from the initial path; initial scripts ${initialScriptBytes} bytes`);
