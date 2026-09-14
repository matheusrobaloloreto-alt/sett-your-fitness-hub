import { describe, it, expect } from "vitest";
import { generateTrainingProgram } from "./engine";
import { buildExerciseCatalogFromEdgeRows } from "../../../supabase/functions/_shared/prescription/adapters/catalogAdapter.ts";
import { adaptTrainingProgramForAiStrengthPlan } from "../../../supabase/functions/_shared/prescription/adapters/outputAdapter.ts";
import {
  resolveEngineFlag,
  buildShadowComparison,
  volumeByGroup,
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

const CURRENT_PLAN = {
  generated_by: "ai_anthropic",
  weekly_structure: "Push/Pull/Legs",
  workouts: [{ exercises: [{ muscle_group: "costas", sets: 3 }, { muscle_group: "peitoral", sets: 4 }] }],
};
const CURRENT_VALIDATION = { status: "ok" as const, warnings: [], corrections: [], blockers: [], volume_review: [] };

describe("shadow — feature flag (B6)", () => {
  it("resolveEngineFlag: ausente/vazio/desconhecido => off (default seguro)", () => {
    expect(resolveEngineFlag(undefined)).toBe("off");
    expect(resolveEngineFlag(null)).toBe("off");
    expect(resolveEngineFlag("")).toBe("off");
    expect(resolveEngineFlag("off")).toBe("off");
    expect(resolveEngineFlag("qualquer-coisa")).toBe("off");
  });

  it("resolveEngineFlag: shadow/on reconhecidos (case-insensitive), on NÃO é default", () => {
    expect(resolveEngineFlag("shadow")).toBe("shadow");
    expect(resolveEngineFlag(" Shadow ")).toBe("shadow");
    expect(resolveEngineFlag("on")).toBe("on");
    expect(resolveEngineFlag("ON")).toBe("on");
    // garantia de que o default (sem env) nunca é "on"
    expect(resolveEngineFlag(undefined)).not.toBe("on");
  });

  it("constantes do log: source='prescricao' + kind='shadow_comparison'", () => {
    expect(SHADOW_LOG_SOURCE).toBe("prescricao");
    expect(SHADOW_LOG_KIND).toBe("shadow_comparison");
  });
});

describe("shadow — comparação (B5)", () => {
  it("buildShadowComparison monta o payload com todas as chaves e sem exercício fora da biblioteca", () => {
    const program = generateTrainingProgram({ objective: "hipertrofia", fitnessLevel: "intermediario", daysPerWeek: 4, catalog: CATALOG });
    const output = adaptTrainingProgramForAiStrengthPlan({ program });
    const cmp = buildShadowComparison({
      mode: "shadow",
      currentPlan: CURRENT_PLAN,
      currentValidation: CURRENT_VALIDATION,
      program,
      output,
      catalogIds: CATALOG_IDS,
      timingMs: 7,
    });

    expect(cmp.kind).toBe("shadow_comparison");
    expect(cmp.engine).toBe("bn_prescription_engine_v1");
    expect(cmp.mode).toBe("shadow");
    expect(cmp.created_by_edge).toBe(true);
    expect(cmp.timing_ms).toBe(7);
    // diff tem todas as chaves exigidas
    for (const k of ["split_changed", "volume_by_group_delta", "blockers_delta", "warnings_delta", "missing_exercises", "safe_alternative_unavailable_count", "handoff_count"] as const) {
      expect(cmp.diff).toHaveProperty(k);
    }
    // engine nunca inventa exercício => nenhum id fora do catálogo
    expect(cmp.diff.missing_exercises).toEqual([]);
    expect(cmp.diff.split_changed).toBe(true); // PPL (atual) vs Upper/Lower (engine)
    expect(typeof cmp.diff.volume_by_group_delta).toBe("object");
    // payload é serializável em JSON
    expect(() => JSON.stringify(cmp)).not.toThrow();
  });

  it("preserva handoff severo no log (EVA > 5 => handoff_count 1)", () => {
    const program = generateTrainingProgram({
      objective: "hipertrofia", fitnessLevel: "intermediario", daysPerWeek: 4, restrictions: "",
      painReports: [{ region: "joelho", eva: 7 }], catalog: CATALOG,
    });
    const output = adaptTrainingProgramForAiStrengthPlan({ program });
    const cmp = buildShadowComparison({
      mode: "on", currentPlan: CURRENT_PLAN, currentValidation: CURRENT_VALIDATION, program, output, catalogIds: CATALOG_IDS, timingMs: 3,
    });
    expect(cmp.mode).toBe("on");
    expect(output.handoff).toBe(true);
    expect(cmp.diff.handoff_count).toBe(1);
    expect((cmp.new_engine_summary as any).handoff).toBe(true);
  });

  it("volumeByGroup conta séries por grupo", () => {
    const v = volumeByGroup(CURRENT_PLAN);
    expect(v["dorsal"]).toBe(3);
    expect(v["peitoral"]).toBe(4);
  });
});
