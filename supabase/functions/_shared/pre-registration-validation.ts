import { HttpError } from "./tenant-auth.ts";
import { validateInviteAnamnesis } from "./public-anamnesis-validation.ts";

const INVESTMENT_RANGES = new Set(["200_300", "300_400", "400_500"]);
const CONTACT_PERIODS = new Set(["morning", "afternoon", "evening"]);
const ENVELOPE_KEYS = new Set([
  "action", "companyId", "slug", "fullName", "whatsapp", "budgetRange",
  "preferredContactPeriod", "whatsappConfirmed", "answers",
]);
const ANSWER_KEYS = new Set([
  "age", "gender", "weight_kg", "height_cm", "body_fat_percent", "objective",
  "activity_level", "experience_months", "modalities", "modality_other", "requested_services",
  "training_days", "available_days", "session_duration", "endurance_session_duration",
  "training_location", "available_equipment", "days_available", "days_strength", "days_cardio",
  "goals", "diseases", "injuries", "current_pain", "nutrition", "has_nutritionist",
  "profession", "sleep_hours", "restorative_sleep", "aware_of_trilogy", "feel_in_3_months",
  "biggest_obstacle", "extra_comments", "commits_communication", "interest_strength",
  "interest_running", "interest_swimming", "interest_cycling", "interest_nutrition", "sport_goal",
  "race_name", "race_date", "current_volume_weekly", "current_volume_unit", "fcmax", "fcrep",
  "perceived_recovery", "run_where", "run_best_time", "swim_pool", "swim_level", "swim_volume",
  "swim_best", "bike_type", "bike_volume", "bike_ftp", "bike_power", "fueling_strategy",
  "medical_conditions", "medications", "clin_cardiac", "clin_chest_pain", "clin_surgery",
  "clin_surgery_detail", "clin_pregnant", "clin_pregnant_detail", "clin_smoke", "clin_acute",
  "clin_other", "eva_tornozelo", "eva_joelho", "eva_quadril", "eva_lombar", "eva_ombro",
  "meals_per_day", "meal_t1", "meal_t2", "meal_t3", "meal_t4", "meal_t5", "meal_t6", "meal_t7",
  "meal_routine", "train_time", "train_fasted", "appetite_wake", "food_likes", "food_dislikes",
  "food_restrictions", "budget_food", "has_kitchen", "supplements", "hydration", "gi_sensitivities",
  "preferred_contact_channel", "preferred_contact_period", "shown_blocks", "custom_answers", "budget_range",
]);
const MAX_BODY_BYTES = 64 * 1024;
const MAX_DEPTH = 4;

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const digits = (value: unknown) => typeof value === "string" ? value.replace(/\D/g, "") : "";

function payloadDepth(value: unknown, depth = 0): number {
  if (!value || typeof value !== "object") return depth;
  const values = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  return values.reduce((max, entry) => Math.max(max, payloadDepth(entry, depth + 1)), depth + 1);
}

function normalizedString(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export interface ValidatedPreRegistration {
  fullName: string;
  phone: string;
  budgetRange: string;
  preferredContactPeriod: string;
  answers: Record<string, unknown>;
}

export function validatePreRegistrationSubmission(body: Record<string, unknown>): ValidatedPreRegistration {
  let serialized = "";
  try { serialized = JSON.stringify(body); } catch { throw new HttpError(422, "Pré-cadastro inválido."); }
  if (new TextEncoder().encode(serialized).length > MAX_BODY_BYTES || payloadDepth(body) > MAX_DEPTH) {
    throw new HttpError(422, "Pré-cadastro excede os limites permitidos.");
  }
  if (Object.keys(body).some(key => !ENVELOPE_KEYS.has(key))) {
    throw new HttpError(422, "Pré-cadastro contém campos desconhecidos.");
  }
  const incomingAnswers = body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
    ? body.answers as Record<string, unknown>
    : null;
  if (!incomingAnswers) throw new HttpError(422, "Pré-cadastro incompleto ou inválido.");
  const unknownAnswer = Object.keys(incomingAnswers).find(key => !ANSWER_KEYS.has(key));
  if (unknownAnswer) throw new HttpError(422, "Pré-cadastro contém respostas desconhecidas.");
  const answers = Object.fromEntries(Object.entries(incomingAnswers).filter(([key]) => ANSWER_KEYS.has(key)));
  const fullName = normalizedString(text(body.fullName));
  const phone = digits(body.whatsapp);
  const budgetRange = text(body.budgetRange);
  const preferredContactPeriod = text(body.preferredContactPeriod);
  const nameParts = fullName.split(" ").filter(Boolean);
  if (fullName.length < 3 || fullName.length > 120 || nameParts.length < 2
    || nameParts.some(part => !/\p{L}/u.test(part))) {
    throw new HttpError(422, "Informe seu nome completo.");
  }
  if (phone.length < 10 || phone.length > 15 || /^(\d)\1+$/.test(phone)) {
    throw new HttpError(422, "Informe um WhatsApp válido.");
  }
  if (!INVESTMENT_RANGES.has(budgetRange)) throw new HttpError(422, "Selecione a faixa de investimento.");
  if (!CONTACT_PERIODS.has(preferredContactPeriod)) throw new HttpError(422, "Selecione o melhor horário para contato.");
  if (!Array.isArray(answers.shown_blocks) || !Array.isArray(answers.available_equipment)) {
    throw new HttpError(422, "Pré-cadastro incompleto ou inválido: estrutura do formulário ausente.");
  }
  if (answers.preferred_contact_period !== preferredContactPeriod) {
    throw new HttpError(422, "O melhor horário para contato está inconsistente.");
  }
  if (answers.budget_range !== budgetRange) {
    throw new HttpError(422, "A faixa de investimento está inconsistente.");
  }
  const invalid = validateInviteAnamnesis(answers, []);
  if (invalid.length > 0) {
    throw new HttpError(422, `Pré-cadastro incompleto ou inválido: ${invalid.join(", ")}.`);
  }
  return { fullName, phone, budgetRange, preferredContactPeriod, answers };
}
