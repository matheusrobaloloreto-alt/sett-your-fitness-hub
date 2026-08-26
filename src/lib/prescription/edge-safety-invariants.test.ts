// ORDEM 045 — Deno Static Guard + Edge Safety Invariants.
// A edge `ai-prescribe-workout/index.ts` roda em Deno (deno check não roda neste ambiente).
// Este guard ESTÁTICO lê o fonte e trava invariantes de segurança para prevenir regressão,
// SEM importar/rodar o módulo Deno e SEM alterar comportamento. Robusto (regex flexível).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const EDGE = "supabase/functions/ai-prescribe-workout/index.ts";
const src = readFileSync(EDGE, "utf8");
// fonte sem comentários de linha — para checagens de "statement ativo"
const noLineComments = src.replace(/^\s*\/\/.*$/gm, "");

function edgePresetRir(presetKey: string) {
  const match = src.match(new RegExp(`${presetKey}:\\s*{[\\s\\S]*?rir:\\s*["']([^"']+)["']`));
  return match?.[1] || "";
}

function numericRirBounds(rir: string) {
  return (rir.match(/\d+/g) || []).map(Number);
}

describe("ORDEM 045 — edge safety invariants (estático)", () => {
  // ── segredos: só via ambiente, nada hardcoded ───────────────────────────
  it("não contém JWT/segredos hardcoded", () => {
    expect(src).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);   // JWT (anon/service key)
    expect(src).not.toMatch(/\bsk-[A-Za-z0-9]{20,}/);   // chave estilo OpenAI/Anthropic
    expect(src).not.toMatch(/\bsbp_[A-Za-z0-9]{16,}/);  // token Supabase
  });

  it("service role e chaves vêm de Deno.env.get (não literais)", () => {
    expect(src).toMatch(/Deno\.env\.get\(\s*["']SUPABASE_SERVICE_ROLE_KEY["']\s*\)/);
    expect(src).toMatch(/Deno\.env\.get\(\s*["']SUPABASE_URL["']\s*\)/);
    expect(src).toMatch(/Deno\.env\.get\(\s*["']ANTHROPIC_API_KEY["']\s*\)/);
  });

  it("é um módulo Deno (usa Deno.env; não usa process.env)", () => {
    expect(src).toMatch(/Deno\.env\.get\(/);
    expect(src).not.toMatch(/process\.env/);
  });

  // ── biblioteca-only / não inventar exercício ────────────────────────────
  it("biblioteca-only: only_library_exercises e seleção por catálogo", () => {
    expect(src).toMatch(/only_library_exercises\s*:\s*true/);
    expect(src).toMatch(/pickCatalogExercise\(/);
  });

  it("engine v1 é o gerador principal e fallback legado fica como reserva catalog-driven", () => {
    expect(src).toMatch(/import\s+\{\s*generateTrainingProgram\s*\}\s+from\s+["']\.\.\/_shared\/prescription\/engine\.ts["']/);
    expect(src).toMatch(/adaptTrainingProgramForAiStrengthPlan/);
    expect(src).toMatch(/buildEmergencyFallbackPlan/);
    expect(src).toMatch(/bn_emergency_fallback/);
  });

  it("fallback legado da edge mantém presets de hipertrofia intermediária e força dentro de RIR 2-4", () => {
    const criticalPresets = [
      { key: "hipertrofia_intermediario", preserveText: null },
      { key: "forca", preserveText: "nunca falha sistematica" },
    ];

    for (const preset of criticalPresets) {
      const rir = edgePresetRir(preset.key);
      const bounds = numericRirBounds(rir);

      expect(rir, preset.key).toBeTruthy();
      expect(bounds.length, `${preset.key}: ${rir}`).toBeGreaterThan(0);
      expect(bounds.every((value) => value >= 2 && value <= 4), `${preset.key}: ${rir}`).toBe(true);
      expect(rir, preset.key).not.toMatch(/\b1\s*-/);
      if (preset.preserveText) expect(rir).toContain(preset.preserveText);
    }
  });

  // ── IA / fallback preservados ───────────────────────────────────────────
  it("Anthropic preservado (não removido)", () => {
    expect(src).toMatch(/ANTHROPIC_API_KEY/);
    expect(src.toLowerCase()).toMatch(/anthropic/);
  });

  // ── flag default OFF e ausência de cutover ──────────────────────────────
  it("feature flag default OFF (shadow não liga sozinho)", () => {
    expect(src).toMatch(/Deno\.env\.get\(\s*["']PRESCRIPTION_ENGINE_V1["']\s*\)\s*\?\?\s*["']off["']/);
  });

  it("cutover determinístico: planJson vem do engine v1 antes do fallback legado", () => {
    expect(src).toMatch(/const\s+program\s*=\s*generateTrainingProgram\(input\)/);
    expect(src).toMatch(/planJson\s*=\s*engineOutput\.plan/);
    expect(src).toMatch(/catch\s*\(engineError\)/);
  });

  // ── catálogo: cobertura total via paginação, sem teto antigo ─────────────
  it("catálogo paginado: range() + CATALOG_PAGE_SIZE, sem .limit(700)", () => {
    expect(src).toMatch(/CATALOG_PAGE_SIZE\s*=\s*\d+/);
    expect(src).toMatch(/\.range\(/);
    expect(src).not.toMatch(/\.limit\(\s*700\s*\)/);
  });

  it("nenhum .limit(<1000) no carregamento de catálogo", () => {
    const limits = [...src.matchAll(/\.limit\(\s*(\d+)\s*\)/g)].map((m) => Number(m[1]));
    expect(limits.every((n) => n >= 1000)).toBe(true);
    const pageSize = Number((src.match(/CATALOG_PAGE_SIZE\s*=\s*(\d+)/) || [])[1] || 0);
    expect(pageSize).toBeGreaterThanOrEqual(1000);
  });

  // ── contrato de resposta + shadow log + bloqueio ────────────────────────
  it("contrato de resposta { id: planId, plan: planJson } preservado", () => {
    expect(src).toMatch(/id:\s*planId/);
    expect(src).toMatch(/plan:\s*planJson/);
  });

  it("shadow logging é guardado pela flag e usa source permitido", () => {
    expect(src).toMatch(/ai_decision_logs/);
    expect(src).toMatch(/SHADOW_LOG_SOURCE/);
    // o bloco shadow está atrás da flag (shadow|on)
    expect(src).toMatch(/engineFlag\s*===\s*["']shadow["']\s*\|\|\s*engineFlag\s*===\s*["']on["']/);
  });

  it("plano com exercício fora da biblioteca é bloqueado (422), não aplicado", () => {
    expect(noLineComments).toMatch(/status:\s*422/);
    expect(src).toMatch(/exercise_id|fora da biblioteca|only_library_exercises/);
  });

  it("auth gate preservado (não responde sem autorização)", () => {
    expect(src).toMatch(/Unauthorized/);
  });
});
