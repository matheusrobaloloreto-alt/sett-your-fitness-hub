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

type PreparedExercise = {
  exercise: ExerciseCatalogEntry;
  text: string;
  metadata: string;
  equipment: string;
  muscleGroup: string;
};

type PreparedRestriction = {
  active: boolean;
  severity?: RestrictionRule["severity"];
  affectedRegions: string[];
  avoidKeywords: string[];
  preferKeywords: string[];
};

type PreparedRequest = {
  keywords: string[];
  equipment: string;
  requestedEquipment: string;
  level: string;
  preferredMuscleGroup: string;
  preferredPattern: string;
  restrictions: PreparedRestriction[];
};

const catalogIndexCache = new WeakMap<ExerciseCatalogEntry[], PreparedExercise[]>();

function prepareExercise(exercise: ExerciseCatalogEntry): PreparedExercise {
  return {
    exercise,
    text: normalizeText([
      exercise.name,
      exercise.description,
      exercise.muscle_group,
      exercise.difficulty,
      exercise.equipment,
      exercise.targets?.map((target) => `${target.muscle_group} ${target.role ?? ""}`).join(" "),
      exercise.pain_limitation_tags?.join(" "),
      exercise.movement_pattern,
    ].join(" ")),
    metadata: normalizeText([
      exercise.contraindications,
      exercise.pain_limitation_tags,
    ]),
    equipment: normalizeText([exercise.name, exercise.equipment].join(" ")),
    muscleGroup: normalizeText(exercise.muscle_group),
  };
}

function prepareCatalog(catalog: ExerciseCatalogEntry[]) {
  const cached = catalogIndexCache.get(catalog);
  if (cached) return cached;
  const prepared = catalog.map(prepareExercise);
  catalogIndexCache.set(catalog, prepared);
  return prepared;
}

function prepareRequest(request: ExercisePickRequest): PreparedRequest {
  return {
    keywords: request.keywords.map(normalizeText).filter(Boolean),
    equipment: normalizeText(request.equipment),
    requestedEquipment: normalizeRequestedEquipment(request.equipment),
    level: normalizeText(request.fitnessLevel),
    preferredMuscleGroup: normalizeText(request.preferredMuscleGroup),
    preferredPattern: normalizeText(request.preferredPattern),
    restrictions: (request.restrictions || []).map((rule) => ({
      active: rule.active,
      severity: rule.severity,
      affectedRegions: rule.affectedRegions.map(normalizeText),
      avoidKeywords: rule.avoidKeywords.map(normalizeText),
      preferKeywords: rule.preferKeywords.map(normalizeText),
    })),
  };
}

function equipmentText(exercise: ExerciseCatalogEntry) {
  return normalizeText([exercise.name, exercise.equipment].join(" "));
}

export function normalizeRequestedEquipment(requestedEquipment: unknown) {
  return normalizeText(requestedEquipment).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function hasFullEquipmentAccess(requestedEquipment: unknown) {
  const requested = normalizeRequestedEquipment(requestedEquipment);
  return /^(academia completa|todos? (os )?equipamentos?)$/.test(requested);
}

/**
 * Equipment is a hard constraint whenever the request names a limited setup.
 * An empty/legacy request remains permissive, while "academia completa" is
 * explicitly unrestricted. This prevents a strong keyword match from
 * prescribing a machine, cable or bar that the student cannot access.
 */
export function isEquipmentCompatible(exercise: ExerciseCatalogEntry, requestedEquipment: unknown) {
  const requested = normalizeRequestedEquipment(requestedEquipment);
  if (!requested || hasFullEquipmentAccess(requested)) return true;

  return isPreparedEquipmentCompatible(equipmentText(exercise), requested);
}

function isPreparedEquipmentCompatible(exerciseEquipment: string, requested: string) {
  if (!requested || hasFullEquipmentAccess(requested)) return true;
  const requirements = [
    { exercise: /(maquina|smith|guiad|leg press|cadeira extensora|mesa flexora|voador|pec deck)/, available: /(maquina|smith|guiad)/ },
    { exercise: /(cabo|polia|crossover|pulley)/, available: /(cabo|polia|crossover|pulley)/ },
    { exercise: /(barra|barbell)/, available: /(barra|barbell)/ },
    { exercise: /(halter|dumbbell)/, available: /(halter|dumbbell)/ },
    { exercise: /(elastico|mini band|band)/, available: /(elastico|mini band|band)/ },
    { exercise: /(kettlebell)/, available: /(kettlebell)/ },
    { exercise: /(medicine ball|med ball)/, available: /(medicine ball|med ball)/ },
    { exercise: /(trx|suspensao)/, available: /(trx|suspensao|funcional)/ },
  ];

  return requirements.every((requirement) =>
    !requirement.exercise.test(exerciseEquipment) || requirement.available.test(requested)
  );
}

function scorePreparedExercise(prepared: PreparedExercise, request: ExercisePickRequest, normalized: PreparedRequest) {
  const { exercise, text, metadata: meta } = prepared;
  let score = 0;

  for (const keyword of normalized.keywords) {
    if (text.includes(keyword)) score += 5;
    const pieces = keyword.split(/\s+/).filter(Boolean);
    score += pieces.filter((piece) => text.includes(piece)).length;
  }

  if (normalized.preferredMuscleGroup && prepared.muscleGroup.includes(normalized.preferredMuscleGroup)) score += 4;
  if (normalized.preferredPattern && text.includes(normalized.preferredPattern)) score += 4;
  if (normalized.equipment && text.includes(normalized.equipment)) score += 2;
  if (normalized.level.includes("inic") && /avanc|complex|olimp|snatch|clean|salto/.test(text)) score -= 5;
  if (request.usedIds?.has(exercise.id)) score -= 4;
  if (request.preferredExerciseIds?.has(exercise.id)) score += 12;

  for (const rule of normalized.restrictions) {
    if (!rule.active) continue;
    if (rule.preferKeywords.some((keyword) => text.includes(keyword))) score += rule.severity === "severa" ? 8 : 4;
    if (rule.avoidKeywords.some((keyword) => text.includes(keyword) || meta.includes(keyword))) score -= 9;
    if (rule.affectedRegions.some((region) => meta.includes(region))) score -= 6;
    if (rule.severity === "severa" && rule.avoidKeywords.some((keyword) => text.includes(keyword))) score -= 20;
  }

  return score;
}

export function scoreExercise(exercise: ExerciseCatalogEntry, request: ExercisePickRequest) {
  return scorePreparedExercise(prepareExercise(exercise), request, prepareRequest(request));
}

export function pickCatalogExercise(request: ExercisePickRequest): ExerciseCatalogEntry | null {
  if (!request.catalog.length) return null;
  const catalog = prepareCatalog(request.catalog);
  const normalized = prepareRequest(request);
  const isHardExcluded = (exercise: ExerciseCatalogEntry) => request.hardExcludedIds?.has(exercise.id);
  const equivalentIds = new Set<string>();
  for (const prepared of catalog) {
    if (normalized.keywords.some((keyword) => prepared.text.includes(keyword))) {
      for (const equivalentId of prepared.exercise.equivalent_substitutes || []) equivalentIds.add(equivalentId);
    }
  }
  for (const prepared of catalog) {
    const exercise = prepared.exercise;
    if (
      equivalentIds.has(exercise.id) &&
      isPreparedEquipmentCompatible(prepared.equipment, normalized.requestedEquipment) &&
      !isHardExcluded(exercise) &&
      !request.usedIds?.has(exercise.id) &&
      scorePreparedExercise(prepared, request, normalized) > 0
    ) return exercise;
  }

  let bestNotUsed: { exercise: ExerciseCatalogEntry; score: number } | null = null;
  let bestAcceptable: { exercise: ExerciseCatalogEntry; score: number } | null = null;
  for (const prepared of catalog) {
    const exercise = prepared.exercise;
    if (isHardExcluded(exercise) || !isPreparedEquipmentCompatible(prepared.equipment, normalized.requestedEquipment)) continue;
    const score = scorePreparedExercise(prepared, request, normalized);
    if (score <= 0) continue;
    if (!bestAcceptable || score > bestAcceptable.score) bestAcceptable = { exercise, score };
    if (!request.usedIds?.has(exercise.id) && (!bestNotUsed || score > bestNotUsed.score)) {
      bestNotUsed = { exercise, score };
    }
  }

  return bestNotUsed?.exercise || bestAcceptable?.exercise || null;
}

export function safeExerciseName(exercise: ExerciseCatalogEntry | null) {
  return exercise?.name || "";
}
