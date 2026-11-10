import { anamnesisStaffCorrectionTimes, intercycleProjection, mergeEffectiveAnamnesis, readCanonicalAnamnesis, readIntercycleAnswers, type AnamnesisScope } from "../effective-anamnesis.ts";
import { convertedLeadAnamnesis, preRegistrationToStudioAnamnesis, readConvertedLead } from "../lead-anamnesis.ts";
import { isIntercyclePainHandoffRequired } from "../intercycle-anamnesis.ts";
import { HttpError } from "../tenant-auth.ts";
import { hasNonRunningLegacyVolume, readSportSpecificWeeklyVolume } from "./cardio/weekly-volume.ts";
import { buildBnitoOrchestrationPlan, buildPrescriptionIntegration } from "./integration.ts";

export async function readEffectivePrescriptionAnamnesis(db: any, scope: AnamnesisScope) {
  try {
    const [canonical, rows] = await Promise.all([
      readCanonicalAnamnesis(db, scope),
      readIntercycleAnswers(db, scope),
    ]);
    const lead = canonical ? null : await readConvertedLead(db, scope);
    const base = canonical ?? (lead ? preRegistrationToStudioAnamnesis(convertedLeadAnamnesis(lead), scope) : null);
    const intercycle = intercycleProjection(scope, rows, base);
    return { anamnesis: mergeEffectiveAnamnesis(base, intercycle), intercycle, staffCorrections: anamnesisStaffCorrectionTimes(base) };
  } catch {
    throw new HttpError(503, "Não foi possível carregar a anamnese efetiva do aluno.");
  }
}

const strengthFields = {
  objective: "objective", days_per_week: "days_per_week_strength", equipment: "equipment",
  experience_months: "experience_months", is_endurance_athlete: "is_endurance_athlete",
  notes: "notes",
};
const cardioFields = {
  goal: "cardio_goal", days_per_week: "days_per_week_cardio", fcmax: "fcmax", fcrep: "fcrep",
  experience_months: "experience_months", equipment: "equipment", diet_type: "objective",
};
const nutritionFields = {
  age: "age", body_fat_percent: "body_fat_percent", objective: "objective", activity_level: "activity_level",
  is_endurance_athlete: "is_endurance_athlete", meals_per_day: "meals_per_day",
  budget: "budget_food", has_microwave: "has_kitchen",
  stress_score: "stress_score", sleep_quality: "sleep_quality", nutrition_context: "nutrition_context",
};

type PrescriptionPayload = Record<string, any>;
type ReadResult = Awaited<ReturnType<typeof readEffectivePrescriptionAnamnesis>>;

const supplied = (value: unknown) =>
  (typeof value === "string" && value.trim() !== "") || typeof value === "boolean"
  || (typeof value === "number" && Number.isFinite(value));

function combineConstraints(...values: unknown[]) {
  return [...new Set(values.flatMap(value => typeof value === "string"
    ? value.split(/\s*\|\s*/).map(item => item.trim()).filter(Boolean)
    : []))].join(" | ") || null;
}

const painRegions = ["tornozelo", "joelho", "quadril", "lombar", "ombro"];

function addEva(scores: Record<string, unknown>, location: string, eva: number) {
  const normalized = location.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const region = painRegions.find(candidate => normalized.includes(candidate)) ?? "interciclo";
  const requested = Number(scores[region]);
  scores[region] = Math.max(Number.isFinite(requested) ? requested : 0, eva);
}

export function preferredPrescriptionValue(payload: Record<string, unknown>, requested: unknown, persisted: unknown) {
  return supplied(persisted) && (payload.draft_only === true || !supplied(requested)) ? persisted : requested;
}

export function applyEffectivePrescriptionInput(
  payload: PrescriptionPayload,
  { anamnesis, intercycle }: ReadResult,
  modality: "strength" | "cardio" | "nutrition",
  { validationOnly = false } = {},
) {
  const legacyWithoutIntake = !anamnesis && !payload.draft_only;
  const answers = anamnesis ?? {};
  if (!validationOnly && modality === "strength" && isIntercyclePainHandoffRequired(intercycle?.update)) {
    throw new HttpError(409, "Dor acima de EVA 5 exige handoff do treinador antes da próxima prescrição.");
  }

  const activePain = [answers.current_pain, answers.staff_current_pain, payload.current_pain,
    legacyWithoutIntake ? payload.anamnese_context?.current_pain : null];
  const next: PrescriptionPayload = legacyWithoutIntake
    ? { ...payload }
    : { ...payload, anamnese_context: anamnesis, anamnese_id: answers.id ?? null };
  const fields = modality === "strength" ? strengthFields : modality === "cardio" ? cardioFields : nutritionFields;
  for (const [field, answer] of Object.entries(fields)) {
    next[field] = preferredPrescriptionValue(payload, payload[field], answers[answer]);
  }
  if (modality === "strength" || modality === "cardio") {
    next.injuries = combineConstraints(payload.injuries, answers.injuries);
  }
  if (modality === "strength") {
    next.restrictions = combineConstraints(payload.restrictions, next.injuries, ...activePain);
    if (intercycle?.equipmentNeedsReview && (payload.draft_only || !supplied(payload.equipment))) {
      next.equipment = "peso_corporal";
    }
    if (payload.running_days_context) {
      next.running_days_context = { ...payload.running_days_context,
        days_per_week: preferredPrescriptionValue(payload, payload.running_days_context.days_per_week, answers.days_per_week_cardio) };
    }
  }
  if (modality === "cardio") {
    next.injuries = combineConstraints(next.injuries, payload.restrictions);
    next.session_duration = preferredPrescriptionValue(payload, payload.session_duration,
      answers.endurance_session_duration_min ?? answers.session_duration_min);
    const sequence = payload.program_sequence?.sequence_number ?? payload.block_number;
    const firstBlock = Number(sequence) === 1;
    if (payload.sport === "natacao" || payload.sport === "ciclismo") {
      if (payload.draft_only || !supplied(payload.current_volume)) {
        const isInitial = firstBlock || (sequence == null && !payload.training_cycle_id);
        const volume = isInitial ? readSportSpecificWeeklyVolume(answers, payload.sport) : null;
        next.current_volume = volume?.value ?? null;
        next.current_volume_unit = volume?.unit ?? null;
      }
    } else if (hasNonRunningLegacyVolume(answers)) {
      if (payload.draft_only || !supplied(payload.current_volume)) {
        next.current_volume = null;
        next.current_volume_unit = null;
      }
    } else if ((supplied(payload.current_volume) || firstBlock) && supplied(answers.current_volume_weekly)
      && (payload.draft_only || !supplied(payload.current_volume))) {
      next.current_volume = answers.current_volume_weekly;
      next.current_volume_unit = supplied(answers.current_volume_unit) ? answers.current_volume_unit : payload.current_volume_unit;
    }
    next.restrictions = combineConstraints(payload.restrictions, ...activePain);
    const eva = { ...payload.eva };
    const currentPain = intercycle?.update;
    if (currentPain?.pain_present === true && typeof currentPain.pain_eva === "number") {
      addEva(eva, String(currentPain.pain_location ?? ""), currentPain.pain_eva);
    }
    for (const pain of activePain) {
      if (typeof pain !== "string") continue;
      for (const match of pain.matchAll(/\bEVA\s*[:=]?\s*(10|[0-9])\b/gi)) {
        addEva(eva, pain, Number(match[1]));
      }
    }
    if (Object.keys(eva).length) next.eva = eva;
  }
  if (modality === "nutrition") next.food_restrictions = combineConstraints(payload.food_restrictions, answers.food_restrictions);
  if (legacyWithoutIntake) return next;
  const assessment = payload.assessment_context;
  const integration = buildPrescriptionIntegration({
    anamnese: anamnesis,
    assessment,
    assessmentId: assessment?.id,
    assessmentCreatedAt: assessment?.created_at,
  });
  // Keep an independently signalled readiness restriction (e.g. recent check-in).
  if (integration.readiness.status === "pronto" && payload.prescription_integration?.readiness?.status === "cautela") {
    integration.readiness.status = "cautela";
    integration.readiness.reason = "Sinal adicional de cautela informado para esta geração.";
  }
  next.prescription_integration = integration;
  next.bnito_orchestration = buildBnitoOrchestrationPlan(integration);
  return next;
}
