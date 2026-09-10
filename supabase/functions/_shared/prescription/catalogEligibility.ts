import type { ExerciseCatalogEntry } from "./types.ts";

type CatalogEligibilityInput = Pick<
  ExerciseCatalogEntry,
  "id" | "name" | "muscle_group" | "targets"
>;

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

const PRESCRIPTION_MUSCLE_GROUP_PLACEHOLDERS = new Set([
  "geral",
  "general",
  "outro",
  "outros",
  "other",
  "others",
  "desconhecido",
  "unknown",
  "nao informado",
  "not informed",
]);

function normalizeGroup(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Canonical fail-closed contract shared by loader and both generation paths. */
export function isPrescriptionMuscleGroup(value: unknown) {
  const normalized = normalizeGroup(value);
  return normalized.length > 0 && !PRESCRIPTION_MUSCLE_GROUP_PLACEHOLDERS.has(normalized);
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
  if (isPrescriptionMuscleGroup(exercise?.muscle_group)) return true;
  return Array.isArray(exercise?.targets) &&
    exercise.targets.some((target) => isPrescriptionMuscleGroup(target?.muscle_group));
}
