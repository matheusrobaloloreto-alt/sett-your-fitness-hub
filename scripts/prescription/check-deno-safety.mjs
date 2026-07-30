#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_REPORT = "docs/prescription/bn-prescription-engine-v1-deno-static-guard-report.md";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const reportPath = arg("--report", DEFAULT_REPORT);
const files = [
  "supabase/functions/ai-prescribe-workout/index.ts",
  "supabase/functions/_shared/prescription/engine.ts",
  "supabase/functions/_shared/prescription/shadow.ts",
  "supabase/functions/_shared/prescription/adapters/inputAdapter.ts",
  "supabase/functions/_shared/prescription/adapters/catalogAdapter.ts",
  "supabase/functions/_shared/prescription/adapters/outputAdapter.ts",
];

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

function check(file, label, pass, detail) {
  return { file, label, pass: Boolean(pass), detail };
}

const checks = [];
for (const file of files) {
  const text = read(file);
  checks.push(check(file, "file_exists", text != null, text == null ? "Arquivo não encontrado." : "OK"));
  if (text == null) continue;

  if (file.includes("/_shared/prescription/")) {
    checks.push(check(file, "no_path_alias", !/from\s+["']@\//.test(text), "Sem import @/ em _shared."));
    checks.push(check(file, "no_react_dom_browser", !/\b(document|window|localStorage|navigator)\b/.test(text), "Sem APIs DOM/browser."));
    checks.push(check(file, "no_node_or_npm_import", !/from\s+["'](node:|npm:|react|react-dom|https?:)/.test(text), "Sem imports Node/npm/http/React."));
    checks.push(check(file, "relative_imports_have_ts", !/from\s+["']\.{1,2}\/(?![^"']+\.ts["'])/.test(text), "Imports relativos Deno-safe com .ts."));
  }
}

const edge = read("supabase/functions/ai-prescribe-workout/index.ts") ?? "";
checks.push(check("supabase/functions/ai-prescribe-workout/index.ts", "feature_flag_default_off", /Deno\.env\.get\(\s*["']PRESCRIPTION_ENGINE_V1["']\s*\)\s*\?\?\s*["']off["']/.test(edge), "PRESCRIPTION_ENGINE_V1 default off."));
checks.push(check("supabase/functions/ai-prescribe-workout/index.ts", "shadow_guarded_by_flag", /engineFlag\s*===\s*["']shadow["']\s*\|\|\s*engineFlag\s*===\s*["']on["']/.test(edge), "Shadow só roda atrás de shadow/on."));
checks.push(check("supabase/functions/ai-prescribe-workout/index.ts", "no_prescricao_shadow_source", !/source\s*:\s*["']prescricao_shadow["']/.test(edge), "source prescricao_shadow ausente."));
checks.push(check("supabase/functions/ai-prescribe-workout/index.ts", "shadow_kind_payload", /kind:\s*["']shadow_comparison["']/.test(edge), "payload.kind shadow_comparison presente."));
checks.push(check(
  "supabase/functions/ai-prescribe-workout/index.ts",
  "catalog_pagination",
  /CATALOG_PAGE_SIZE\s*=\s*\d+/.test(edge) &&
    /\.range\(from,\s*(?:to|from\s*\+\s*CATALOG_PAGE_SIZE\s*-\s*1)\)/.test(edge) &&
    /page\.length\s*<\s*CATALOG_PAGE_SIZE/.test(edge),
  "loadExerciseCatalog paginado via range e parada por página incompleta.",
));
checks.push(check("supabase/functions/ai-prescribe-workout/index.ts", "no_limit_700", !/\.limit\(\s*700\s*\)/.test(edge), "Sem .limit(700) em ai-prescribe-workout."));
checks.push(check("supabase/functions/ai-prescribe-workout/index.ts", "fallback_preserved", /function\s+buildEmergencyFallbackPlan/.test(edge), "buildEmergencyFallbackPlan preservado."));
checks.push(check("supabase/functions/ai-prescribe-workout/index.ts", "anthropic_preserved", /ANTHROPIC_API_KEY/.test(edge), "Anthropic preservado."));
checks.push(check("supabase/functions/ai-prescribe-workout/index.ts", "response_contract_id_plan", /JSON\.stringify\(\s*\{\s*id:\s*planId,\s*plan:\s*planJson\s*\}/.test(edge), "Resposta padrão { id, plan }."));
checks.push(check(
  "supabase/functions/ai-prescribe-workout/index.ts",
  "deterministic_primary_with_legacy_fallback",
  /const\s+program\s*=\s*generateTrainingProgram\(input\)/.test(edge) &&
    /planJson\s*=\s*engineOutput\.plan/.test(edge) &&
    /catch\s*\(engineError\)/.test(edge) &&
    /planJson\s*=\s*buildEmergencyFallbackPlan/.test(edge),
  "Engine v1 é o caminho principal e o fallback legado permanece protegido por catch.",
));

const passCount = checks.filter((c) => c.pass).length;
const failCount = checks.length - passCount;
const lines = [
  "# BN Prescription Engine v1 — Deno Static Guard Report",
  "",
  `Generated at: ${new Date().toISOString()}`,
  "",
  `Status: ${failCount === 0 ? "PASS" : "FAIL"}`,
  "",
  `Checks: ${passCount}/${checks.length} pass`,
  "",
  "| File | Check | Result | Detail |",
  "|---|---|---:|---|",
  ...checks.map((c) => `| \`${c.file}\` | \`${c.label}\` | ${c.pass ? "PASS" : "FAIL"} | ${String(c.detail).replace(/\|/g, "\\|")} |`),
  "",
  "> Static guard only. It does not run Deno typechecking.",
  "",
];

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, lines.join("\n"));
console.log(`status=${failCount === 0 ? "PASS" : "FAIL"} checks=${passCount}/${checks.length} report=${reportPath}`);
process.exit(failCount === 0 ? 0 : 1);
