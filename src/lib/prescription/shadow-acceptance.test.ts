// B7 — Hardening + aceitação do shadow mode (B5/B6).
// Parte unitária: lógica pura de shadow.ts. Parte estática: contract tests lendo a edge Deno
// (que o Vitest não executa). Itens marcados STATIC são checados por leitura do arquivo.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { generateTrainingProgram } from "./engine";
import { buildExerciseCatalogFromEdgeRows } from "../../../supabase/functions/_shared/prescription/adapters/catalogAdapter.ts";
import { adaptTrainingProgramForAiStrengthPlan } from "../../../supabase/functions/_shared/prescription/adapters/outputAdapter.ts";
import {
  resolveEngineFlag,
  buildShadowComparison,
  SHADOW_LOG_SOURCE,
  SHADOW_LOG_KIND,
} from "../../../supabase/functions/_shared/prescription/shadow.ts";
import type { EdgeExerciseRow } from "../../../supabase/functions/_shared/prescription/adapters/types.ts";

const ROWS: EdgeExerciseRow[] = [
  { id: "mob", name: "Mobilidade de Quadril", muscle_group: "mobilidade", equipment: "livre" },
  { id: "plank", name: "Prancha", muscle_group: "core", equipment: "livre" },
  { id: "glute", name: "Abdução Mini Band", muscle_group: "glúteos", equipment: "mini band" },
  { id: "box-squat", name: "Agachamento na Caixa", muscle_group: "quadríceps", equipment: "livre" },
  { id: "leg-press", name: "Leg Press", muscle_group: "quadríceps", equipment: "máquina" },
  { id: "leg-curl", name: "Mesa Flexora", muscle_group: "posterior", equipment: "máquina" },
  { id: "face-pull", name: "Face Pull", muscle_group: "ombros", equipment: "cabo" },
  { id: "row", name: "Remada Baixa", muscle_group: "costas", equipment: "máquina" },
  { id: "press", name: "Supino Máquina", muscle_group: "peitoral", equipment: "máquina" },
  { id: "pulldown", name: "Puxada", muscle_group: "costas", equipment: "máquina" },
  { id: "hip-thrust", name: "Hip Thrust", muscle_group: "glúteos", equipment: "máquina" },
  { id: "calf", name: "Panturrilha + Core", muscle_group: "core", equipment: "livre" },
];
const CATALOG = buildExerciseCatalogFromEdgeRows({ exercises: ROWS }).catalog;
const CATALOG_IDS = CATALOG.map((e) => e.id);
const CURRENT_PLAN = { generated_by: "ai_anthropic", weekly_structure: "Push/Pull/Legs", workouts: [{ exercises: [{ muscle_group: "costas", sets: 3 }] }] };
const CURRENT_VALIDATION = { status: "ok" as const, warnings: [], corrections: [], blockers: [], volume_review: [] };

function cmpFor(input: any, opts?: { catalogIds?: string[]; mode?: "shadow" | "on"; timingMs?: number }) {
  const program = generateTrainingProgram({ catalog: CATALOG, ...input });
  const output = adaptTrainingProgramForAiStrengthPlan({ program });
  return buildShadowComparison({
    mode: opts?.mode ?? "shadow",
    currentPlan: CURRENT_PLAN,
    currentValidation: CURRENT_VALIDATION,
    program,
    output,
    catalogIds: opts?.catalogIds ?? CATALOG_IDS,
    timingMs: opts?.timingMs ?? 5,
  });
}

const EDGE = readFileSync("supabase/functions/ai-prescribe-workout/index.ts", "utf8");

describe("B7 — shadow hardening (lógica pura)", () => {
  it("1) flag ausente => off", () => { expect(resolveEngineFlag(undefined)).toBe("off"); });
  it("2) flag inválida => off", () => { expect(resolveEngineFlag("banana")).toBe("off"); expect(resolveEngineFlag("")).toBe("off"); });
  it("5) flag on é reconhecida (mas não é default)", () => { expect(resolveEngineFlag("on")).toBe("on"); expect(resolveEngineFlag(undefined)).not.toBe("on"); });
  it("7) log usa source='prescricao' e kind='shadow_comparison'", () => {
    expect(SHADOW_LOG_SOURCE).toBe("prescricao");
    expect(SHADOW_LOG_KIND).toBe("shadow_comparison");
    const cmp = cmpFor({ objective: "hipertrofia", fitnessLevel: "intermediario", daysPerWeek: 4 });
    expect(cmp.kind).toBe("shadow_comparison");
  });
  it("8) payload de shadow é serializável em JSON", () => {
    const cmp = cmpFor({ objective: "hipertrofia", fitnessLevel: "intermediario", daysPerWeek: 4 });
    expect(() => JSON.stringify(cmp)).not.toThrow();
    expect(JSON.parse(JSON.stringify(cmp)).kind).toBe("shadow_comparison");
  });
  it("9) payload não contém dados sensíveis desnecessários (nome/restrições crus)", () => {
    const cmp = cmpFor({
      studentName: "SENSITIVE_NAME_XYZ", objective: "hipertrofia", fitnessLevel: "intermediario",
      daysPerWeek: 4, restrictions: "INFO_PRIVADA_SECRETA dor", anamneseContext: { obs: "DADO_CLINICO_CRU" },
    });
    const json = JSON.stringify(cmp);
    expect(json).not.toContain("SENSITIVE_NAME_XYZ");
    expect(json).not.toContain("INFO_PRIVADA_SECRETA");
    expect(json).not.toContain("DADO_CLINICO_CRU");
  });
  it("10) preserva blocker/handoff do engine no resumo novo (EVA>5)", () => {
    const cmp = cmpFor({ objective: "hipertrofia", fitnessLevel: "intermediario", daysPerWeek: 4, restrictions: "", painReports: [{ region: "joelho", eva: 7 }] }, { mode: "on" });
    expect((cmp.new_engine_summary as any).handoff).toBe(true);
    expect(cmp.diff.handoff_count).toBe(1);
    expect((cmp.new_engine_summary as any).blockers.length).toBeGreaterThan(0);
  });
  it("11) mede missing_exercises (vazio com catálogo completo; detecta quando id falta)", () => {
    const ok = cmpFor({ objective: "hipertrofia", fitnessLevel: "intermediario", daysPerWeek: 4 });
    expect(ok.diff.missing_exercises).toEqual([]);
    const detect = cmpFor({ objective: "hipertrofia", fitnessLevel: "intermediario", daysPerWeek: 4 }, { catalogIds: [] });
    expect(detect.diff.missing_exercises.length).toBeGreaterThan(0);
  });
  it("12) mede safe_alternative_unavailable_count (catálogo sem substituto seguro)", () => {
    const program = generateTrainingProgram({
      objective: "hipertrofia", fitnessLevel: "iniciante", daysPerWeek: 3, restrictions: "dor no joelho EVA 4 e valgo",
      painReports: [{ region: "joelho", eva: 4 }],
      catalog: [{ id: "unsafe", name: "Agachamento Livre Profundo ATG", muscle_group: "quadríceps", contraindications: ["joelho"], pain_limitation_tags: ["joelho"] }],
    });
    const output = adaptTrainingProgramForAiStrengthPlan({ program });
    const cmp = buildShadowComparison({ mode: "shadow", currentPlan: CURRENT_PLAN, currentValidation: CURRENT_VALIDATION, program, output, catalogIds: ["unsafe"], timingMs: 1 });
    expect(cmp.diff.safe_alternative_unavailable_count).toBeGreaterThanOrEqual(1);
  });
  it("13) mede volume_by_group_delta (objeto de deltas numéricos)", () => {
    const cmp = cmpFor({ objective: "hipertrofia", fitnessLevel: "intermediario", daysPerWeek: 4 });
    expect(typeof cmp.diff.volume_by_group_delta).toBe("object");
    // 'costas' existe no plano atual e no novo => delta é número
    expect(typeof cmp.diff.volume_by_group_delta["costas"]).toBe("number");
  });
  it("14) mede timing_ms", () => {
    const cmp = cmpFor({ objective: "hipertrofia", fitnessLevel: "intermediario", daysPerWeek: 4 }, { timingMs: 42 });
    expect(cmp.timing_ms).toBe(42);
  });
});

describe("B7 — contract tests estáticos da edge (Deno; não executável no Vitest)", () => {
  it("3+20) STATIC: engine v1 é importado estaticamente como gerador principal", () => {
    expect(/import\s+\{\s*generateTrainingProgram\s*\}\s+from\s+["']\.\.\/_shared\/prescription\/engine\.ts["']/.test(EDGE)).toBe(true);
    expect(EDGE.includes("planJson = engineOutput.plan")).toBe(true);
  });
  it("3) STATIC: bloco shadow é guardado pela flag", () => {
    expect(EDGE.includes('(Deno.env.get("PRESCRIPTION_ENGINE_V1") ?? "off")')).toBe(true);
    expect(EDGE.includes('engineFlag === "shadow" || engineFlag === "on"')).toBe(true);
  });
  it("4) STATIC: shadow compara contra planJson e não muta o plano principal", () => {
    expect(EDGE.includes("buildShadowComparison")).toBe(true);
    expect(EDGE.includes("currentPlan: planJson")).toBe(true);
  });
  it("5) STATIC: resposta serve o planJson preenchido pelo engine v1", () => {
    expect(EDGE.includes("planJson = engineOutput.plan")).toBe(true);
    expect(EDGE.includes("JSON.stringify({ id: planId, plan: planJson, updated_at: persistence.data.updated_at })")).toBe(true);
  });
  it("6) STATIC: erro no shadow é capturado (try/catch dedicado)", () => {
    expect(EDGE.includes("catch (shadowError)")).toBe(true);
  });
  it("7) STATIC: log na edge usa SHADOW_LOG_SOURCE e payload de comparação", () => {
    expect(EDGE.includes("source: shadow.SHADOW_LOG_SOURCE")).toBe(true);
  });
  it("15) STATIC: buildEmergencyFallbackPlan continua presente", () => {
    expect(EDGE.includes("buildEmergencyFallbackPlan")).toBe(true);
  });
  it("16) STATIC: Anthropic continua presente", () => {
    expect(EDGE.includes("ANTHROPIC_API_KEY")).toBe(true);
  });
  it("19) STATIC: contrato de resposta padrão inclui id, plano e versão para edição CAS", () => {
    expect(EDGE.includes("JSON.stringify({ id: planId, plan: planJson, updated_at: persistence.data.updated_at })")).toBe(true);
  });
});
