import { describe, expect, it, vi } from "vitest";
import * as planPersistence from "@/lib/cardioPlanPersistence";

const { buildCardioPlanPatch, captureGeneratedCardioPlan, saveCardioPlanDraft } = planPersistence;

const plan = {
  plan_name: "Base 10 km",
  sport: "corrida",
  goal: "Completar 10 km",
  duration_weeks: 6,
  model: "polarizado",
  weeks: [{ week_number: 1, focus: "Base", sessions: [] }],
  fc_zones: { z1: { min: 110, max: 120 } },
  safety_check: { restrictions: [] },
  general_tips: "Ritmo confortável",
  warnings: ["Revisar dor"],
  complementary_strength: ["Panturrilha"],
  nutrition_alert: "Hidratar",
  ignored_field: "não persistir",
};

const generatedAt = "2026-08-25T18:00:00.000Z";

describe("cardio plan persistence", () => {
  it("retains the persisted row id together with the generated draft", () => {
    const state = captureGeneratedCardioPlan({ plans: {}, planIds: {}, planVersions: {} }, "corrida", {
      id: "plan-1",
      plan,
      updated_at: generatedAt,
    });

    expect(state.planIds.corrida).toBe("plan-1");
    expect(state.plans.corrida).toBe(plan);
    expect(state.planVersions.corrida).toBe(generatedAt);
  });

  it("keeps only the editable running_plans columns", () => {
    expect(buildCardioPlanPatch(plan)).toEqual({
      plan_name: "Base 10 km",
      sport: "corrida",
      goal: "Completar 10 km",
      duration_weeks: 6,
      model: "polarizado",
      weeks: plan.weeks,
      fc_zones: plan.fc_zones,
      safety_check: plan.safety_check,
      general_tips: "Ritmo confortável",
      warnings: ["Revisar dor"],
      complementary_strength: ["Panturrilha"],
      nutrition_alert: "Hidratar",
    });
  });

  it("invokes the authenticated edge with only the plan id, version and editable draft", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error: { message: "Plano não encontrado." } });

    await expect(saveCardioPlanDraft({ functions: { invoke } } as never, {
      planId: "plan-1",
      expectedUpdatedAt: generatedAt,
      plan,
    })).rejects.toThrow("não encontrado");

    expect(invoke).toHaveBeenCalledWith("update-running-plan-draft", {
      body: {
        plan_id: "plan-1",
        expected_updated_at: generatedAt,
        plan: buildCardioPlanPatch(plan),
      },
    });
  });
});

describe("strength plan persistence", () => {
  it("retains the persisted strength row id and version with the editable draft", () => {
    expect(typeof (planPersistence as any).captureGeneratedStrengthPlan).toBe("function");
    const captured = (planPersistence as any).captureGeneratedStrengthPlan({
      id: "strength-1",
      plan: { workouts: [{ name: "Treino A", exercises: [] }] },
      updated_at: generatedAt,
    });
    expect(captured).toEqual({
      planId: "strength-1",
      planVersion: generatedAt,
      plan: { workouts: [{ name: "Treino A", exercises: [] }] },
    });
  });

  it("saves a strength draft with compare-and-swap versioning", async () => {
    expect(typeof (planPersistence as any).saveStrengthPlanDraft).toBe("function");
    const invoke = vi.fn().mockResolvedValue({
      data: {
        id: "strength-1",
        updated_at: "2026-08-25T18:01:00.000Z",
        plan: { workouts: [{ name: "Treino A", exercises: [] }] },
      },
      error: null,
    });
    const result = await (planPersistence as any).saveStrengthPlanDraft({ functions: { invoke } }, {
      planId: "strength-1",
      expectedUpdatedAt: generatedAt,
      plan: { workouts: [{ name: "Treino A", exercises: [] }] },
    });
    expect(invoke).toHaveBeenCalledWith("update-strength-plan-draft", {
      body: {
        plan_id: "strength-1",
        expected_updated_at: generatedAt,
        plan: { workouts: [{ name: "Treino A", exercises: [] }] },
      },
    });
    expect(result.updatedAt).toBe("2026-08-25T18:01:00.000Z");
  });
});
