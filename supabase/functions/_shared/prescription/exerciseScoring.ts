import { normalizeText } from "./presets.ts";
import type { ExerciseCatalogEntry, RestrictionRule } from "./types.ts";

export interface ExercisePickRequest {
  catalog: ExerciseCatalogEntry[];
  keywords: string[];
  usedIds?: Set<string>;
  hardExcludedIds?: Set<string>;
  restrictions?: RestrictionRule[];
  equipment?: unknown;
  fitnessLevel?: unknown;
  preferredMuscleGroup?: string;
  preferredPattern?: string;
  preferredExerciseIds?: Set<string>;
}

function exerciseText(exercise: ExerciseCatalogEntry) {
  return normalizeText([
    exercise.name,
    exercise.description,
    exercise.muscle_group,
    exercise.difficulty,
    exercise.equipment,
    exercise.targets?.map((target) => `${target.muscle_group} ${target.role ?? ""}`).join(" "),
    exercise.pain_limitation_tags?.join(" "),
    exercise.movement_pattern,
  ].join(" "));
}

function metadataText(exercise: ExerciseCatalogEntry) {
  return normalizeText([
    exercise.contraindications,
    exercise.pain_limitation_tags,
  ]);
}

export function scoreExercise(exercise: ExerciseCatalogEntry, request: ExercisePickRequest) {
  const text = exerciseText(exercise);
  const meta = metadataText(exercise);
  const keywords = request.keywords.map(normalizeText).filter(Boolean);
  const equipment = normalizeText(request.equipment);
  const level = normalizeText(request.fitnessLevel);
  let score = 0;

  for (const keyword of keywords) {
    if (text.includes(keyword)) score += 5;
    const pieces = keyword.split(/\s+/).filter(Boolean);
    score += pieces.filter((piece) => text.includes(piece)).length;
  }

  if (request.preferredMuscleGroup && normalizeText(exercise.muscle_group).includes(normalizeText(request.preferredMuscleGroup))) score += 4;
  if (request.preferredPattern && text.includes(normalizeText(request.preferredPattern))) score += 4;
  if (equipment && text.includes(equipment)) score += 2;
  if (level.includes("inic") && /avanc|complex|olimp|snatch|clean|salto/.test(text)) score -= 5;
  if (request.usedIds?.has(exercise.id)) score -= 4;
  if (request.preferredExerciseIds?.has(exercise.id)) score += 12;

  for (const rule of request.restrictions || []) {
    if (!rule.active) continue;
    if (rule.preferKeywords.some((keyword) => text.includes(normalizeText(keyword)))) score += rule.severity === "severa" ? 8 : 4;
    if (rule.avoidKeywords.some((keyword) => text.includes(normalizeText(keyword)) || meta.includes(normalizeText(keyword)))) score -= 9;
    if (rule.affectedRegions.some((region) => meta.includes(normalizeText(region)))) score -= 6;
    if (rule.severity === "severa" && rule.avoidKeywords.some((keyword) => text.includes(normalizeText(keyword)))) score -= 20;
  }

  return score;
}

export function pickCatalogExercise(request: ExercisePickRequest): ExerciseCatalogEntry | null {
  if (!request.catalog.length) return null;
  const isHardExcluded = (exercise: ExerciseCatalogEntry) => request.hardExcludedIds?.has(exercise.id);
  const equivalentIds = new Set(
    request.catalog
      .filter((exercise) => request.keywords.some((keyword) => exerciseText(exercise).includes(normalizeText(keyword))))
      .flatMap((exercise) => exercise.equivalent_substitutes || []),
  );
  const equivalent = request.catalog.find((exercise) =>
    equivalentIds.has(exercise.id) &&
    !isHardExcluded(exercise) &&
    !request.usedIds?.has(exercise.id) &&
    scoreExercise(exercise, request) > 0
  );
  if (equivalent) return equivalent;

  const ranked = request.catalog
    .filter((exercise) => !isHardExcluded(exercise))
    .map((exercise) => ({ exercise, score: scoreExercise(exercise, request) }))
    .sort((a, b) => b.score - a.score);

  const notUsed = ranked.find((item) => item.score > 0 && !request.usedIds?.has(item.exercise.id));
  if (notUsed) return notUsed.exercise;
  const acceptable = ranked.find((item) => item.score > 0);
  if (acceptable) return acceptable.exercise;
  return null;
}

export function safeExerciseName(exercise: ExerciseCatalogEntry | null) {
  return exercise?.name || "";
}
