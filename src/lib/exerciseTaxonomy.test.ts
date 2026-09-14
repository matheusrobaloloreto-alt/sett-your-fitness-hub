import { describe, expect, it } from "vitest";
import {
  CATEGORY_OPTIONS,
  MUSCLE_GROUP_OPTIONS,
  canonicalCategorySlug,
  canonicalMuscleSlug,
  categoryLabel,
  muscleLabel,
  normalizeExerciseCategories,
  normalizeExerciseTargets,
} from "./exerciseTaxonomy";

const exactMuscleContract = [
  ["abdomen", "Abdômen"],
  ["quadriceps", "Quadríceps"],
  ["posterior_de_coxa", "Posterior de coxa"],
  ["gluteos", "Glúteos"],
  ["adutores", "Adutores"],
  ["panturrilha", "Panturrilha"],
  ["deltoide_lateral", "Deltoide Lateral"],
  ["deltoide_posterior", "Deltoide Posterior"],
  ["deltoide_anterior", "Deltoide Anterior"],
  ["antebraco", "Antebraço"],
  ["biceps", "Biceps"],
  ["triceps", "Triceps"],
  ["dorsal", "Dorsal"],
  ["trapezio", "Trapezio"],
  ["peitoral", "Peitoral"],
] as const;

const exactCategoryContract = [
  ["core", "Core"],
  ["mobilidades", "Mobilidades"],
  ["funcionais", "Funcionais"],
  ["base", "Base"],
  ["pesos_livre", "Pesos Livre"],
  ["peso_corporal", "Peso Corporal"],
  ["maquinas", "Maquinas"],
  ["pliometria", "Pliometria"],
] as const;

describe("exercise taxonomy shared contract", () => {
  it("exports exactly the fixed volume muscle slugs and labels", () => {
    expect(MUSCLE_GROUP_OPTIONS.map((option) => [option.slug, option.label])).toEqual(exactMuscleContract);
    for (const [slug, label] of exactMuscleContract) {
      expect(canonicalMuscleSlug(label)).toBe(slug);
      expect(muscleLabel(slug)).toBe(label);
    }
  });

  it("keeps categories out of the anatomical muscle map", () => {
    for (const [slug, label] of exactCategoryContract) {
      expect(canonicalMuscleSlug(slug)).toBeNull();
      expect(canonicalMuscleSlug(label)).toBeNull();
    }
  });

  it.each(["rosca", "remada", "puxada", "elevacao lateral", "desenvolvimento", "face pull", "aducao", "pegada", "punho", "grip", "ombro", "deltoide", "lombar"])(
    "não trata movimento ou grupo genérico como alias anatômico: %s",
    (value) => {
      expect(canonicalMuscleSlug(value)).toBeNull();
    },
  );

  it("exports exactly the requested category filters", () => {
    expect(CATEGORY_OPTIONS.map((option) => [option.slug, option.label])).toEqual(exactCategoryContract);
    for (const [slug, label] of exactCategoryContract) {
      expect(canonicalCategorySlug(label)).toBe(slug);
      expect(categoryLabel(slug)).toBe(label);
    }
  });

  it("normalizes legacy category clues without creating anatomical targets", () => {
    expect(normalizeExerciseCategories({ muscle_group: "Fisioterapia", name: "Mobilidade de tornozelo" })).toEqual(["mobilidades"]);
    expect(normalizeExerciseCategories({ category: "Performance", name: "Salto em profundidade" })).toEqual(["pliometria"]);
    expect(normalizeExerciseCategories({ muscle_group: "Core" })).toEqual(["core"]);
    expect(canonicalMuscleSlug("Core")).toBeNull();
  });

  it("accepts explicit anatomical aliases found in the canonical muscle_groups table", () => {
    expect(canonicalMuscleSlug("Deltóide Frontal")).toBe("deltoide_anterior");
    expect(muscleLabel("Deltóide Frontal")).toBe("Deltoide Anterior");
    expect(canonicalMuscleSlug("Trapézio Inferior")).toBe("trapezio");
    expect(canonicalMuscleSlug("Braquiorradial")).toBe("antebraco");
    expect(canonicalMuscleSlug("Manguito Rotador")).toBeNull();
    expect(canonicalMuscleSlug("Lombar")).toBeNull();
    expect(canonicalMuscleSlug("Tibial Anterior")).toBeNull();
  });

  it("deduplicates targets by canonical muscle and primary wins over secondary", () => {
    expect(normalizeExerciseTargets([
      { muscle_group: "Peito", role: "secondary", is_primary: false, volume_percentage: 10 },
      { muscle_group_name: "Peitoral", role: "primary", is_primary: true, volume_percentage: 20 },
      { muscle_group: "Core", role: "primary", is_primary: true },
      { muscle_group: "Rosca", role: "primary", is_primary: true },
    ])).toEqual([
      expect.objectContaining({ muscle_slug: "peitoral", muscle_label: "Peitoral", role: "primary", is_primary: true, volume_percentage: 100 }),
    ]);
  });

  it("uses is_primary only as fallback and skips incoherent or role-less targets", () => {
    expect(normalizeExerciseTargets([
      { muscle_group: "Dorsal", is_primary: true },
      { muscle_group: "Biceps", role: "secondary", is_primary: false },
      { muscle_group: "Triceps", role: "primary", is_primary: false },
    ])).toEqual([
      expect.objectContaining({ muscle_slug: "dorsal", role: "primary" }),
      expect.objectContaining({ muscle_slug: "biceps", role: "secondary" }),
    ]);
  });
});
