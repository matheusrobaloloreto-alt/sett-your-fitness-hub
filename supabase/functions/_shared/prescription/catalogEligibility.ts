import type { ExerciseCatalogEntry } from "./types.ts";

type CatalogEligibilityInput = Pick<
  ExerciseCatalogEntry,
  "id" | "name" | "muscle_group" | "targets"
>;

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Generation must fail closed for library rows that cannot be tied to any
 * muscle group. They remain available for curation/history, but cannot be
 * selected by either the deterministic engine or its emergency fallback.
 */
export function isPrescriptionCatalogEligible(
  exercise: Partial<CatalogEligibilityInput> | null | undefined,
) {
  if (!hasText(exercise?.id) || !hasText(exercise?.name)) return false;
  if (hasText(exercise?.muscle_group)) return true;
  return Array.isArray(exercise?.targets) &&
    exercise.targets.some((target) => hasText(target?.muscle_group));
}
