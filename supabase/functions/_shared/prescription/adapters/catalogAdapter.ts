// B3 — Catalog adapter (puro, Deno-safe): exercise_library + exercise_muscle_targets +
// exercise_metadata -> ExerciseCatalogEntry[]. NÃO inventa exercício; expõe gaps/warnings quando
// faltar dado essencial (em vez de preencher falso). NÃO altera loadExerciseCatalog da edge.
import type { ExerciseCatalogEntry, ExerciseTarget } from "../types.ts";
import { canonicalCatalogTargets } from "../catalogVolume.ts";
import type {
  CatalogAdapterResult,
  EdgeExerciseMetadataRow,
  EdgeExerciseRow,
  EdgeMuscleGroupRow,
  EdgeMuscleTargetRow,
} from "./types.ts";

function cleanArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}

export function buildExerciseCatalogFromEdgeRows(args: {
  exercises: EdgeExerciseRow[];
  targets?: EdgeMuscleTargetRow[];
  muscleGroups?: EdgeMuscleGroupRow[];
  metadata?: EdgeExerciseMetadataRow[];
}): CatalogAdapterResult {
  const exercises = Array.isArray(args.exercises) ? args.exercises : [];
  const targets = Array.isArray(args.targets) ? args.targets : [];
  const muscleGroups = Array.isArray(args.muscleGroups) ? args.muscleGroups : [];
  const metadata = Array.isArray(args.metadata) ? args.metadata : [];

  const warnings: string[] = [];
  const gaps: string[] = [];

  const groupName = new Map(muscleGroups.filter((g) => g?.id).map((g) => [g.id, g.name]));
  const targetsByExercise = new Map<string, ExerciseTarget[]>();
  for (const t of targets) {
    if (!t?.exercise_id) continue;
    const list = targetsByExercise.get(t.exercise_id) ?? [];
    list.push({
      muscle_group: (t.muscle_group_id && groupName.get(t.muscle_group_id)) || String(t.muscle_group_id ?? "desconhecido"),
      role: t.role ?? null,
      is_primary: t.is_primary,
      volume_percentage: t.volume_percentage ?? null,
    });
    targetsByExercise.set(t.exercise_id, list);
  }
  const metaByExercise = new Map(metadata.filter((m) => m?.exercise_id).map((m) => [m.exercise_id, m]));

  const catalog: ExerciseCatalogEntry[] = [];
  let dropped = 0;
  let noGroup = 0;
  let noSafety = 0;
  let withEquipment = 0;

  for (const row of exercises) {
    if (!row?.id || !row?.name) { dropped++; continue; } // não inventar: precisa de id + nome reais
    const meta = metaByExercise.get(row.id);
    const contraindications = cleanArray(meta?.contraindications);
    const pain_limitation_tags = cleanArray(meta?.pain_limitation_tags);
    if (!row.muscle_group) noGroup++;
    if (contraindications.length === 0 && pain_limitation_tags.length === 0) noSafety++;
    if (row.equipment) withEquipment++;

    catalog.push({
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      muscle_group: row.muscle_group ?? null,
      categories: cleanArray(row.categories),
      equipment: row.equipment ?? null,
      difficulty: row.difficulty ?? null,
      contraindications,
      regressions: cleanArray(meta?.regressions),
      progressions: cleanArray(meta?.progressions),
      equivalent_substitutes: cleanArray(meta?.equivalent_substitutes),
      pain_limitation_tags,
      targets: canonicalCatalogTargets(targetsByExercise.get(row.id) ?? []),
      movement_pattern: null, // schema atual não expõe; engine usa keywords/grupo como fallback
    });
  }

  if (dropped > 0) warnings.push(`${dropped} exercicio(s) sem id/name descartado(s) (nao inventar).`);
  if (catalog.length === 0) gaps.push("empty_catalog: o engine emitira blocker empty_exercise_library.");
  if (noGroup > 0) gaps.push(`no_muscle_group:${noGroup}`);
  if (noSafety > 0) {
    warnings.push(`no_safety_metadata:${noSafety} exercicio(s) sem contraindications/pain_limitation_tags (ban por dor/lesao degrada para keywords).`);
  }
  if (catalog.length > 0 && withEquipment === 0) {
    gaps.push("missing_field:equipment (loadExerciseCatalog atual nao seleciona equipment/difficulty — adapter gap).");
  }
  gaps.push("missing_field:movement_pattern (schema nao expoe; fallback por keywords/grupo).");

  return { catalog, warnings, gaps };
}
