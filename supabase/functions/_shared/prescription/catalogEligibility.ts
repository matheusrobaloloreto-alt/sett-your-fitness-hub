import type { ExerciseCatalogEntry } from "./types.ts";
import { canonicalMuscleSlug, normalizeExerciseCategories } from "../exerciseTaxonomy.ts";

type CatalogEligibilityInput = Pick<
  ExerciseCatalogEntry,
  "id" | "name" | "muscle_group" | "targets" | "categories"
>;

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

/** Canonical fail-closed contract shared by loader and both generation paths. */
export function isPrescriptionMuscleGroup(value: unknown) {
  return canonicalMuscleSlug(value) !== null;
}

/**
 * Generation must fail closed for library rows that cannot be tied to any
 * recognized classification. Categories can select preparation/mobility work
 * without inventing anatomical exposure; volume requires anatomical targets.
 */
export function isPrescriptionCatalogEligible(
  exercise: Partial<CatalogEligibilityInput> | null | undefined,
) {
  if (!hasText(exercise?.id) || !hasText(exercise?.name)) return false;
  if (isPrescriptionMuscleGroup(exercise?.muscle_group)) return true;
  if (normalizeExerciseCategories(exercise || {}).length > 0) return true;
  return Array.isArray(exercise?.targets) &&
    exercise.targets.some((target) => isPrescriptionMuscleGroup(target?.muscle_group));
}
