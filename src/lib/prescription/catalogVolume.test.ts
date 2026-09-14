import { describe, expect, it } from "vitest";
import { canonicalCatalogTargets, buildCatalogVolumeSummary } from "../../../supabase/functions/_shared/prescription/catalogVolume.ts";
import { exerciseGroupFactors, normalizeMuscleGroup, reviewVolume } from "./volumeRules";
import { CATEGORY_OPTIONS, MUSCLE_GROUP_OPTIONS } from "../../../supabase/functions/_shared/exerciseTaxonomy.ts";
import type { TrainingProgram, MethodologyPreset } from "./types";

describe("canonical volume across engine and Bnito", () => {
  it("never counts any category as anatomy", () => {
    for (const category of CATEGORY_OPTIONS) {
      expect(normalizeMuscleGroup(category.slug)).toBeNull();
      expect(exerciseGroupFactors({ muscle_group: category.label, targets: [{ muscle_group: category.label, role: "primary" }] }).size).toBe(0);
    }
  });

  it("deduplicates aliases by strongest role and preserves each deltoid", () => {
    const targets = [
      { muscle_group: "Costas", role: "secondary", volume_percentage: 100 },
      { muscle_group: "Dorsal", role: "primary", volume_percentage: 20 },
      { muscle_group: "Deltoide Anterior", role: "secondary", volume_percentage: 0 },
      { muscle_group: "Deltoide Posterior", role: "primary", volume_percentage: 3 },
      { muscle_group: "Core", role: "primary", volume_percentage: 100 },
    ];
    expect(Object.fromEntries(exerciseGroupFactors({ targets }))).toEqual({
      dorsal: 1, deltoide_anterior: 0.5, deltoide_posterior: 1,
    });
    expect(canonicalCatalogTargets(targets)).toEqual([
      { muscle_group: "Dorsal", role: "primary", volume_percentage: 100 },
      { muscle_group: "Deltoide Anterior", role: "secondary", volume_percentage: 50 },
      { muscle_group: "Deltoide Posterior", role: "primary", volume_percentage: 100 },
    ]);
  });

  it("does not trust plan-supplied muscles, percentages or unknown exercises", () => {
    const plan = { workouts: [{ exercises: [
      { exercise_id: "press", sets: 4, muscle_group: "Quadríceps", targets: [{ muscle_group: "Core", role: "primary" }] },
      { exercise_id: "foreign", sets: 100, muscle_group: "Peitoral" },
      { exercise_id: "press", sets: -3 },
    ] }] };
    const catalog = [{ id: "press", muscle_group: "Core", targets: [
      { muscle_group: "Peitoral", role: "primary", volume_percentage: 20 },
      { muscle_group: "Tríceps", role: "secondary", volume_percentage: 100 },
      { muscle_group: "Peito", role: "secondary", volume_percentage: 100 },
    ] }];
    expect(Object.fromEntries(buildCatalogVolumeSummary(plan, catalog))).toEqual({ Peitoral: 4, Triceps: 2 });
  });

  it("keeps legacy role-less hints out, with only canonical legacy primary fallback", () => {
    expect(Object.fromEntries(exerciseGroupFactors({ muscle_group: "Peito", targets: [{ muscle_group: "Dorsal", volume_percentage: 100 }] }))).toEqual({ peitoral: 1 });
    expect(canonicalCatalogTargets([{ muscle_group: "Peito", is_primary: false, volume_percentage: 100 }])).toEqual([
      { muscle_group: "Peitoral", role: "secondary", volume_percentage: 50 },
    ]);
  });

  it("only emits requested anatomical slugs in the volume review, including empty groups", () => {
    const allowed = new Set(MUSCLE_GROUP_OPTIONS.map((group) => group.slug));
    const result = reviewVolume({ workouts: [] } as Pick<TrainingProgram, "workouts">, { catalog: [] }, {} as MethodologyPreset);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((row) => allowed.has(row.muscle_group as typeof MUSCLE_GROUP_OPTIONS[number]["slug"]))).toBe(true);
  });
});
