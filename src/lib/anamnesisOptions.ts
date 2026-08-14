export const SUPPORTED_TRAINING_MODALITIES = [
  "Nenhum",
  "Musculação / Funcional",
  "Corrida",
  "Natação",
  "Bike",
  "Triathlon",
] as const;

export const PRESCRIPTION_SERVICE_OPTIONS = [
  { value: "strength", label: "Musculação / treino de força" },
  { value: "running", label: "Corrida" },
  { value: "swimming", label: "Natação" },
  { value: "cycling", label: "Ciclismo" },
  { value: "triathlon", label: "Triathlon (corrida + natação + ciclismo)" },
  { value: "nutrition", label: "Dicas nutricionais" },
] as const;

export type SupportedTrainingModality = (typeof SUPPORTED_TRAINING_MODALITIES)[number];
export type PrescriptionService = (typeof PRESCRIPTION_SERVICE_OPTIONS)[number]["value"];
export type AnamnesisStepId =
  | "profile"
  | "services"
  | "experience"
  | "recovery"
  | "schedule"
  | "strength"
  | "running"
  | "swimming"
  | "cycling"
  | "health"
  | "clinical"
  | "nutrition"
  | "finish";

export interface TrainingAvailability {
  totalDays: number | null;
  strengthDays: number | null;
  cardioDays: number | null;
}

const WEEKDAYS = [
  { index: 0, aliases: ["segunda-feira", "segunda", "seg"] },
  { index: 1, aliases: ["terca-feira", "terca", "ter"] },
  { index: 2, aliases: ["quarta-feira", "quarta", "qua"] },
  { index: 3, aliases: ["quinta-feira", "quinta", "qui"] },
  { index: 4, aliases: ["sexta-feira", "sexta", "sex"] },
  { index: 5, aliases: ["sabado", "sab"] },
  { index: 6, aliases: ["domingo", "dom"] },
] as const;

const STRENGTH_TERMS = ["musculacao", "forca", "funcional", "academia", "crossfit"];
const CARDIO_TERMS = ["corrida", "correr", "natacao", "nadar", "bike", "ciclismo", "pedal", "triathlon"];

const normalizeScheduleText = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();

function weekdayIndexes(value: string) {
  const normalized = normalizeScheduleText(value);
  const found = new Set<number>();

  for (const weekday of WEEKDAYS) {
    if (weekday.aliases.some(alias => new RegExp(`(^|[^a-z])${alias}(?=$|[^a-z])`).test(normalized))) {
      found.add(weekday.index);
    }
  }

  for (const start of WEEKDAYS) {
    for (const end of WEEKDAYS) {
      if (end.index < start.index) continue;
      const startPattern = start.aliases.join("|");
      const endPattern = end.aliases.join("|");
      const rangePattern = new RegExp(`(?:${startPattern})\\s*(?:a|ate|-)\\s*(?:${endPattern})`);
      if (!rangePattern.test(normalized)) continue;
      for (let day = start.index; day <= end.index; day += 1) found.add(day);
    }
  }

  return found;
}

function modalityDays(schedule: string, terms: readonly string[]) {
  const days = new Set<number>();
  const segments = normalizeScheduleText(schedule).split(/[;\n|]+/).filter(Boolean);

  for (const segment of segments) {
    if (!terms.some(term => segment.includes(term))) continue;
    weekdayIndexes(segment).forEach(day => days.add(day));
  }

  return days.size || null;
}

function activeTrainingDays(schedule: string) {
  const segments = normalizeScheduleText(schedule).split(/[;\n|]+/).filter(Boolean);
  const days = new Set<number>();

  for (const segment of segments) {
    if (/descanso|folga|off/.test(segment)) continue;
    weekdayIndexes(segment).forEach(day => days.add(day));
  }

  return days.size || weekdayIndexes(schedule).size || null;
}

/**
 * Keeps the legacy frequency fields populated without asking the student to
 * repeat the same weekly-availability answer in a second input.
 */
export function deriveTrainingAvailability(schedule: string): TrainingAvailability {
  return {
    totalDays: activeTrainingDays(schedule),
    strengthDays: modalityDays(schedule, STRENGTH_TERMS),
    cardioDays: modalityDays(schedule, CARDIO_TERMS),
  };
}

export function resolvePrescriptionInterests(services: readonly string[]) {
  const selected = new Set(services);
  const triathlon = selected.has("triathlon");
  return {
    wantsStrength: selected.has("strength"),
    wantsRunning: selected.has("running") || triathlon,
    wantsSwimming: selected.has("swimming") || triathlon,
    wantsCycling: selected.has("cycling") || triathlon,
    wantsNutrition: selected.has("nutrition"),
  };
}

export function buildAnamnesisStepIds(services: readonly string[]): AnamnesisStepId[] {
  const { wantsStrength, wantsRunning, wantsSwimming, wantsCycling, wantsNutrition } =
    resolvePrescriptionInterests(services);
  return [
    "profile",
    "experience",
    "services",
    "recovery",
    "schedule",
    wantsStrength && "strength",
    wantsRunning && "running",
    wantsSwimming && "swimming",
    wantsCycling && "cycling",
    "health",
    "clinical",
    wantsNutrition && "nutrition",
    "finish",
  ].filter(Boolean) as AnamnesisStepId[];
}
