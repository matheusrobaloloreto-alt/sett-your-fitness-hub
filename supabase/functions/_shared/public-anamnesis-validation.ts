import { HttpError } from "./tenant-auth.ts";

export interface RequiredAnamnesisField {
  id: string;
  label: string;
  is_required: boolean;
}

const ALLOWED_SERVICES = new Set([
  "strength",
  "running",
  "swimming",
  "cycling",
  "triathlon",
  "nutrition",
]);
const YES_NO = new Set(["sim", "nao"]);
const CONTACT_CHANNELS = new Set(["whatsapp_message", "whatsapp_call"]);
const CONTACT_PERIODS = new Set(["morning", "afternoon", "evening"]);

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function isBoolean(value: unknown) {
  return typeof value === "boolean";
}

function validScore(value: unknown) {
  if (value === "" || value === null || value === undefined) return false;
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 10;
}

function hasCustomAnswer(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const answer = (value as Record<string, unknown>).value;
  if (Array.isArray(answer)) return answer.length > 0;
  return hasText(answer) || typeof answer === "number" || typeof answer === "boolean";
}

export function validateInviteAnamnesis(
  body: Record<string, unknown>,
  customFields: RequiredAnamnesisField[],
) {
  const missing: string[] = [];
  const requireText = (key: string, label: string) => {
    if (!hasText(body[key])) missing.push(label);
  };
  const requireBoolean = (key: string, label: string) => {
    if (!isBoolean(body[key])) missing.push(label);
  };
  const requireYesNo = (key: string, label: string) => {
    if (!YES_NO.has(String(body[key] ?? ""))) missing.push(label);
  };

  requireText("objective", "objetivo principal");
  requireText("gender", "sexo");
  if (!Array.isArray(body.modalities) || body.modalities.length === 0) {
    missing.push("modalidades praticadas atualmente");
  }

  const requestedServices = Array.isArray(body.requested_services)
    ? body.requested_services.filter((value): value is string => typeof value === "string")
    : [];
  if (requestedServices.length === 0 || requestedServices.some(value => !ALLOWED_SERVICES.has(value))) {
    missing.push("modalidades para prescrição ou orientação");
  }
  const selected = new Set(requestedServices);
  const triathlon = selected.has("triathlon");
  const strength = selected.has("strength");
  const running = selected.has("running") || triathlon;
  const swimming = selected.has("swimming") || triathlon;
  const cycling = selected.has("cycling") || triathlon;
  const nutrition = selected.has("nutrition");
  const endurance = running || swimming || cycling;

  requireText("profession", "profissão e rotina");
  requireText("sleep_hours", "horas de sono");
  requireBoolean("restorative_sleep", "sono reparador");
  if (!validScore(body.perceived_recovery)) missing.push("recuperação percebida hoje (0 a 10)");
  requireBoolean("aware_of_trilogy", "consciência sobre alimentação, treino e sono");
  requireText("training_days", "semana de treinos");

  if (strength) {
    requireText("session_duration", "tempo da sessão de musculação");
    requireText("training_location", "local da musculação");
  }
  if (endurance) {
    if (!hasText(body.sport_goal) && !hasText(body.goals)) missing.push("meta esportiva");
    requireText("endurance_session_duration", "tempo da sessão esportiva");
  }
  if (running) requireText("run_where", "local da corrida");
  if (swimming) {
    requireText("swim_pool", "piscina da natação");
    requireText("swim_level", "nível da natação");
  }
  if (cycling) requireText("bike_type", "tipo de bicicleta");

  requireText("diseases", "condições médicas relevantes");
  requireText("medications", "medicamentos de uso contínuo");
  requireText("injuries", "histórico de lesões");
  requireText("current_pain", "dor atual");
  requireYesNo("clin_cardiac", "problema cardíaco ou pressão alta");
  requireYesNo("clin_chest_pain", "dor no peito ou tontura ao esforço");
  requireYesNo("clin_surgery", "cirurgia recente");
  if (body.clin_surgery === "sim") requireText("clin_surgery_detail", "detalhes da cirurgia recente");
  if (body.gender === "F") {
    if (!new Set(["na", "gravida", "posparto"]).has(String(body.clin_pregnant ?? ""))) {
      missing.push("gestação ou pós-parto");
    }
    if (body.clin_pregnant === "gravida" || body.clin_pregnant === "posparto") {
      requireText("clin_pregnant_detail", "tempo de gestação ou pós-parto");
    }
  }
  requireYesNo("clin_smoke", "tabagismo");
  requireYesNo("clin_acute", "febre ou doença aguda");
  for (const [key, label] of [
    ["eva_tornozelo", "dor no tornozelo"],
    ["eva_joelho", "dor no joelho"],
    ["eva_quadril", "dor no quadril"],
    ["eva_lombar", "dor lombar"],
    ["eva_ombro", "dor no ombro"],
  ]) {
    if (!validScore(body[key])) missing.push(`${label} (0 a 10)`);
  }

  if (nutrition) {
    requireText("nutrition", "alimentação atual");
    requireBoolean("has_nutritionist", "acompanhamento com nutricionista");
  }
  requireText("feel_in_3_months", "como quer se sentir em 3 meses");
  requireText("biggest_obstacle", "principal obstáculo");
  requireBoolean("commits_communication", "compromisso de comunicação");
  if (!CONTACT_CHANNELS.has(String(body.preferred_contact_channel ?? ""))) {
    missing.push("forma preferida de contato");
  }
  if (!CONTACT_PERIODS.has(String(body.preferred_contact_period ?? ""))) {
    missing.push("melhor horário para contato");
  }

  const customAnswers = body.custom_answers && typeof body.custom_answers === "object" && !Array.isArray(body.custom_answers)
    ? body.custom_answers as Record<string, unknown>
    : {};
  for (const field of customFields.filter(field => field.is_required)) {
    if (!hasCustomAnswer(customAnswers[field.id])) missing.push(field.label);
  }

  return [...new Set(missing)];
}

export async function consumeValidatedAnamnesisInvite<T>(
  body: Record<string, unknown>,
  customFields: RequiredAnamnesisField[],
  consume: () => Promise<T>,
) {
  const missing = validateInviteAnamnesis(body, customFields);
  if (missing.length > 0) {
    throw new HttpError(422, `Anamnese incompleta: ${missing.join(", ")}.`);
  }
  return await consume();
}
