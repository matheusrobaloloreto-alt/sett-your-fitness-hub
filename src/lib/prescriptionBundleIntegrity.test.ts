import { describe, expect, it, vi } from "vitest";
import {
  completedPrescriptionBundleBadges,
  updateBundleRunningPlanPointer,
} from "./prescriptionBundleIntegrity";

describe("prescription bundle integrity", () => {
  it("uses the aerobic pointer as a valid bundle anchor while validating each modality item", () => {
    const badges = completedPrescriptionBundleBadges({
      id: "bundle-1",
      has_strength: true,
      has_cardio: true,
      has_swimming: true,
      has_cycling: true,
      has_nutrition: true,
      strength_plan_id: "strength-1",
      running_plan_id: "run-1",
      nutrition_plan_id: "nutrition-1",
    }, [
      { bundle_id: "bundle-1", modality: "musculacao", entity_type: "ai_strength_plan", entity_id: "strength-1" },
      { bundle_id: "bundle-1", modality: "corrida", entity_type: "nutrition_plan", entity_id: "run-1" },
      { bundle_id: "bundle-1", modality: "natacao", entity_type: "running_plan", entity_id: "other-run" },
      { bundle_id: "bundle-1", modality: "ciclismo", entity_type: "running_plan", entity_id: "run-1" },
      { bundle_id: "bundle-1", modality: "nutricao", entity_type: "nutrition_plan", entity_id: "nutrition-1" },
      { bundle_id: "other-bundle", modality: "corrida", entity_type: "running_plan", entity_id: "run-1" },
    ]);

    expect(badges).toEqual({
      strength: true,
      cardio: false,
      swimming: true,
      cycling: true,
      nutrition: true,
    });
  });

  it("rejects every aerobic badge when the shared pointer is stale or not anchored by an item", () => {
    const badges = completedPrescriptionBundleBadges({
      id: "bundle-1",
      has_cardio: true,
      has_swimming: true,
      has_cycling: true,
      running_plan_id: "stale-plan",
    }, [
      { bundle_id: "bundle-1", modality: "corrida", entity_type: "running_plan", entity_id: "run-1" },
      { bundle_id: "bundle-1", modality: "natacao", entity_type: "running_plan", entity_id: "swim-1" },
      { bundle_id: "bundle-1", modality: "ciclismo", entity_type: "running_plan", entity_id: "bike-1" },
    ]);

    expect(badges.cardio).toBe(false);
    expect(badges.swimming).toBe(false);
    expect(badges.cycling).toBe(false);
  });

  it("rejects an aerobic modality item with an empty entity id or incompatible entity type", () => {
    const badges = completedPrescriptionBundleBadges({
      id: "bundle-1",
      has_cardio: true,
      has_swimming: true,
      has_cycling: true,
      running_plan_id: "run-1",
    }, [
      { bundle_id: "bundle-1", modality: "corrida", entity_type: "running_plan", entity_id: "run-1" },
      { bundle_id: "bundle-1", modality: "natacao", entity_type: "running_plan", entity_id: "" },
      { bundle_id: "bundle-1", modality: "ciclismo", entity_type: "nutrition_plan", entity_id: "bike-1" },
    ]);

    expect(badges.cardio).toBe(true);
    expect(badges.swimming).toBe(false);
    expect(badges.cycling).toBe(false);
  });

  it("does not show a badge when the request flag is absent even if a bundle item exists", () => {
    const badges = completedPrescriptionBundleBadges({
      id: "bundle-1",
      has_cardio: false,
      running_plan_id: "run-1",
    }, [
      { bundle_id: "bundle-1", modality: "corrida", entity_type: "running_plan", entity_id: "run-1" },
    ]);

    expect(badges.cardio).toBe(false);
  });

  it("updates the running pointer through select id single so zero rows cannot pass silently", async () => {
    const { db, calls } = fakeDb({ data: { id: "bundle-1" }, error: null });

    await updateBundleRunningPlanPointer(db, { bundleId: "bundle-1", runningPlanId: "run-1" });

    expect(calls).toEqual([
      ["from", "prescription_bundles"],
      ["update", { running_plan_id: "run-1" }],
      ["eq", "id", "bundle-1"],
      ["select", "id"],
      ["single"],
    ]);
  });

  it("fails when RLS or zero-row update returns no selected bundle", async () => {
    const { db } = fakeDb({
      data: null,
      error: { message: "JSON object requested, multiple (or no) rows returned" },
    });

    await expect(updateBundleRunningPlanPointer(db, {
      bundleId: "bundle-1",
      runningPlanId: "run-1",
    })).rejects.toThrow(/Falha ao ligar cardio.*multiple \(or no\) rows/i);
  });

  it("fails closed when a client returns no row without an explicit error", async () => {
    const { db } = fakeDb({ data: null, error: null });

    await expect(updateBundleRunningPlanPointer(db, {
      bundleId: "bundle-1",
      runningPlanId: "run-1",
    })).rejects.toThrow(/pacote nao confirmado/i);
  });
});

function fakeDb(response: { data: { id: string } | null; error: { message: string } | null }) {
  const calls: unknown[][] = [];
  const query = {
    update: vi.fn((payload: unknown) => {
      calls.push(["update", payload]);
      return query;
    }),
    eq: vi.fn((field: string, value: string) => {
      calls.push(["eq", field, value]);
      return query;
    }),
    select: vi.fn((columns: string) => {
      calls.push(["select", columns]);
      return query;
    }),
    single: vi.fn(() => {
      calls.push(["single"]);
      return Promise.resolve(response);
    }),
  };
  return {
    calls,
    db: {
      from: vi.fn((table: string) => {
        calls.push(["from", table]);
        return query;
      }),
    },
  };
}
