import { HttpError } from "./tenant-auth.ts";

export interface RequiredAnamnesisField {
  id: string;
  label: string;
  is_required: boolean;
  field_type?: string;
  options?: string[];
}

const ALLOWED_SERVICES = new Set(["strength", "running", "swimming", "cycling", "triathlon", "nutrition"]);
const ALLOWED_MODALITIES = new Set(["Nenhum", "Musculação / Funcional", "Corrida", "Natação", "Bike", "Triathlon"]);
const ALLOWED_SHOWN_BLOCKS = new Set([
  "dados", "objetivo", "treino", "saude", "clinica", "nutricao",
  "musculacao", "corrida", "natacao", "ciclismo",
]);
const YES_NO = new Set(["sim", "nao"]);
const GENDERS = new Set(["M", "F"]);
const CONTACT_CHANNELS = new Set(["whatsapp_message", "whatsapp_call"]);
const CONTACT_PERIODS = new Set(["morning", "afternoon", "evening"]);
const SESSION_DURATIONS = new Set(["até 30 minutos", "de 30 a 45 minutos", "de 45 a 60 minutos", "60 minutos ou +"]);
const TRAINING_LOCATIONS = new Set(["Academia de Rede", "Academia do Prédio", "Em casa", "Box de Crossfit/Studio"]);
const RUN_LOCATIONS = new Set(["rua", "esteira", "trilha", "pista"]);
const SWIM_LEVELS = new Set(["iniciante", "intermediario", "avancado"]);
const BIKE_TYPES = new Set(["speed", "gravel", "mtb", "indoor"]);
const VOLUME_UNITS = new Set(["km_week", "hours_week"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasText(value: unknown, maxLength = 2000) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isFiniteNumber(value: unknown, min: number, max: number, integer = false) {
  if (value === "" || value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value !== "number" && typeof value !== "string") return false;
  if (typeof value === "string" && !/^[-+]?\d+(?:\.\d+)?$/.test(value.trim())) return false;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max && (!integer || Number.isInteger(number));
}

function validOptionalNumber(value: unknown, min: number, max: number, integer = false) {
  return value === "" || value === null || value === undefined || isFiniteNumber(value, min, max, integer);
}

function validStringArray(value: unknown, allowed?: Set<string>, maxItems = 50) {
  return Array.isArray(value)
    && value.length <= maxItems
    && new Set(value).size === value.length
    && value.every(item => typeof item === "string"
      && item.trim().length > 0
      && item.length <= 200
      && (!allowed || allowed.has(item)));
}

function validDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validCustomAnswer(value: unknown, field: RequiredAnamnesisField) {
  if (!isPlainObject(value) || !hasText(value.label, 200) || value.label !== field.label) return false;
  const answer = value.value;
  const options = new Set((field.options ?? []).filter(option => typeof option === "string"));
  switch (field.field_type) {
    case "checkbox":
      return validStringArray(answer, options.size ? options : undefined) && (answer as unknown[]).length > 0;
    case "select":
    case "radio":
      return hasText(answer, 200) && (!options.size || options.has(answer as string));
    case "number":
      return isFiniteNumber(answer, -1_000_000, 1_000_000);
    case "date":
      return validDate(answer);
    default:
      return hasText(answer, 2000);
  }
}

export function validateInviteAnamnesis(body: Record<string, unknown>, customFields: RequiredAnamnesisField[]) {
  const invalid: string[] = [];
  const add = (label: string) => invalid.push(label);
  const requireText = (key: string, label: string, maxLength = 2000) => {
    if (!hasText(body[key], maxLength)) add(label);
  };
  const optionalText = (key: string, label: string, maxLength = 2000) => {
    const value = body[key];
    if (value !== null && value !== undefined && value !== "" && !hasText(value, maxLength)) add(label);
  };
  const requireBoolean = (key: string, label: string) => {
    if (typeof body[key] !== "boolean") add(label);
  };
  const optionalBoolean = (key: string, label: string) => {
    if (body[key] !== null && body[key] !== undefined && typeof body[key] !== "boolean") add(label);
  };
  const requireEnum = (key: string, label: string, allowed: Set<string>) => {
    if (typeof body[key] !== "string" || !allowed.has(body[key] as string)) add(label);
  };

  requireText("objective", "objetivo principal", 300);
  requireEnum("gender", "sexo", GENDERS);
  for (const [key, label, min, max, integer] of [
    ["age", "idade", 5, 100, true], ["weight_kg", "peso", 20, 350, false],
    ["height_cm", "altura", 80, 250, false], ["body_fat_percent", "percentual de gordura", 1, 75, false],
    ["experience_months", "tempo de experiência", 0, 1200, true], ["available_days", "dias disponíveis", 1, 7, true],
    ["days_available", "dias disponíveis", 1, 7, true], ["days_strength", "dias de musculação", 0, 7, true],
    ["days_cardio", "dias de esporte", 0, 7, true], ["current_volume_weekly", "volume esportivo atual", 0, 10000, false],
    ["fcmax", "frequência cardíaca máxima", 30, 250, true], ["fcrep", "frequência cardíaca de repouso", 20, 200, true],
    ["meals_per_day", "refeições por dia", 1, 12, true],
  ] as const) if (!validOptionalNumber(body[key], min, max, integer)) add(label);

  if (!validStringArray(body.modalities, ALLOWED_MODALITIES, 6) || (body.modalities as unknown[]).length === 0) {
    add("modalidades praticadas atualmente");
  }
  optionalText("modality_other", "outra modalidade", 120);
  if (!validStringArray(body.requested_services, ALLOWED_SERVICES, ALLOWED_SERVICES.size)
    || (body.requested_services as unknown[]).length === 0) add("modalidades para prescrição ou orientação");

  const requestedServices = validStringArray(body.requested_services, ALLOWED_SERVICES)
    ? body.requested_services as string[] : [];
  const selected = new Set(requestedServices);
  const triathlon = selected.has("triathlon");
  const strength = selected.has("strength");
  const running = selected.has("running") || triathlon;
  const swimming = selected.has("swimming") || triathlon;
  const cycling = selected.has("cycling") || triathlon;
  const nutrition = selected.has("nutrition");
  const endurance = running || swimming || cycling;

  for (const [key, label, max] of [
    ["activity_level", "nível de atividade", 80], ["training_history", "histórico de treino", 2000],
    ["goals", "metas", 1000], ["sport_goal", "meta esportiva", 300],
    ["run_best_time", "melhor tempo na corrida", 120], ["swim_pool", "piscina da natação", 120],
    ["swim_volume", "volume da natação", 120], ["swim_best", "melhor tempo na natação", 120],
    ["bike_volume", "volume do ciclismo", 120], ["bike_ftp", "potência no ciclismo", 80],
    ["fueling_strategy", "estratégia de alimentação esportiva", 500],
    ["medical_conditions", "condições médicas", 2000], ["nutrition", "alimentação atual", 4000],
    ["meal_routine", "rotina das refeições", 40], ["train_time", "horário de treino", 40],
    ["train_fasted", "treino em jejum", 40], ["appetite_wake", "apetite ao acordar", 40],
    ["food_likes", "alimentos preferidos", 2000], ["food_dislikes", "alimentos evitados", 2000],
    ["food_restrictions", "restrições alimentares", 2000], ["budget_food", "orçamento alimentar", 80],
    ["supplements", "suplementos", 1000], ["hydration", "hidratação", 200],
    ["gi_sensitivities", "sensibilidades digestivas", 1000], ["extra_comments", "comentários adicionais", 2000],
  ] as const) optionalText(key, label, max);
  for (let meal = 1; meal <= 7; meal += 1) optionalText(`meal_t${meal}`, `horário da ${meal}ª refeição`, 20);
  for (const [key, label] of [
    ["interest_strength", "interesse em musculação"], ["interest_running", "interesse em corrida"],
    ["interest_swimming", "interesse em natação"], ["interest_cycling", "interesse em ciclismo"],
    ["interest_nutrition", "interesse em nutrição"], ["authorizes_plan", "autorização do plano"],
  ]) optionalBoolean(key, label);

  requireText("profession", "profissão e rotina", 500);
  requireText("sleep_hours", "horas de sono", 80);
  requireBoolean("restorative_sleep", "sono reparador");
  if (!isFiniteNumber(body.perceived_recovery, 0, 10)) add("recuperação percebida hoje (0 a 10)");
  requireBoolean("aware_of_trilogy", "consciência sobre alimentação, treino e sono");
  requireText("training_days", "semana de treinos", 2000);

  if (strength) {
    requireEnum("session_duration", "tempo da sessão de musculação", SESSION_DURATIONS);
    requireEnum("training_location", "local da musculação", TRAINING_LOCATIONS);
  }
  if (endurance) {
    if (!hasText(body.sport_goal, 300) && !hasText(body.goals, 300)) add("meta esportiva");
    requireEnum("endurance_session_duration", "tempo da sessão esportiva", SESSION_DURATIONS);
  }
  if (running) requireEnum("run_where", "local da corrida", RUN_LOCATIONS);
  if (swimming) {
    requireText("swim_pool", "piscina da natação", 120);
    requireEnum("swim_level", "nível da natação", SWIM_LEVELS);
  }
  if (cycling) requireEnum("bike_type", "tipo de bicicleta", BIKE_TYPES);
  if (body.current_volume_unit !== undefined) requireEnum("current_volume_unit", "unidade do volume atual", VOLUME_UNITS);
  optionalBoolean("bike_power", "medidor de potência");

  for (const [key, label, max] of [
    ["diseases", "condições médicas relevantes", 2000], ["medications", "medicamentos de uso contínuo", 1000],
    ["injuries", "histórico de lesões", 2000], ["current_pain", "dor atual", 2000],
  ] as const) requireText(key, label, max);
  requireEnum("clin_cardiac", "problema cardíaco ou pressão alta", YES_NO);
  requireEnum("clin_chest_pain", "dor no peito ou tontura ao esforço", YES_NO);
  requireEnum("clin_surgery", "cirurgia recente", YES_NO);
  if (body.clin_surgery === "sim") requireText("clin_surgery_detail", "detalhes da cirurgia recente", 500);
  if (body.gender === "F") {
    requireEnum("clin_pregnant", "gestação ou pós-parto", new Set(["na", "gravida", "posparto"]));
    if (body.clin_pregnant === "gravida" || body.clin_pregnant === "posparto") {
      requireText("clin_pregnant_detail", "tempo de gestação ou pós-parto", 300);
    }
  }
  requireEnum("clin_smoke", "tabagismo", YES_NO);
  requireEnum("clin_acute", "febre ou doença aguda", YES_NO);
  optionalText("clin_other", "outra condição clínica", 2000);
  for (const [key, label] of [
    ["eva_tornozelo", "dor no tornozelo"], ["eva_joelho", "dor no joelho"],
    ["eva_quadril", "dor no quadril"], ["eva_lombar", "dor lombar"], ["eva_ombro", "dor no ombro"],
  ]) if (!isFiniteNumber(body[key], 0, 10)) add(`${label} (0 a 10)`);

  if (nutrition) {
    requireText("nutrition", "alimentação atual", 4000);
    requireBoolean("has_nutritionist", "acompanhamento com nutricionista");
  }
  optionalBoolean("has_kitchen", "acesso a cozinha");
  requireText("feel_in_3_months", "como quer se sentir em 3 meses", 1000);
  requireText("biggest_obstacle", "principal obstáculo", 1000);
  requireBoolean("commits_communication", "compromisso de comunicação");
  requireEnum("preferred_contact_channel", "forma preferida de contato", CONTACT_CHANNELS);
  requireEnum("preferred_contact_period", "melhor horário para contato", CONTACT_PERIODS);

  if (body.shown_blocks !== undefined
    && !validStringArray(body.shown_blocks, ALLOWED_SHOWN_BLOCKS, ALLOWED_SHOWN_BLOCKS.size)) add("blocos exibidos");
  if (!validStringArray(body.available_equipment ?? [], undefined, 50)) add("equipamentos disponíveis");

  const raceNamePresent = body.race_name !== undefined && body.race_name !== null && body.race_name !== "";
  const raceDatePresent = body.race_date !== undefined && body.race_date !== null && body.race_date !== "";
  if (raceNamePresent !== raceDatePresent) add("nome e data da prova");
  if (raceNamePresent && !hasText(body.race_name, 120)) add("nome da prova");
  if (raceDatePresent && !validDate(body.race_date)) add("data da prova");

  const customAnswers = isPlainObject(body.custom_answers) ? body.custom_answers : null;
  if (!customAnswers) add("respostas adicionais");
  const knownIds = new Set(customFields.map(field => field.id));
  if (customAnswers && Object.keys(customAnswers).some(key => !knownIds.has(key))) add("respostas adicionais");
  for (const field of customFields) {
    const answer = customAnswers?.[field.id];
    if (answer !== undefined && !validCustomAnswer(answer, field)) add(field.label);
    if (field.is_required && (answer === undefined || !validCustomAnswer(answer, field))) add(field.label);
  }

  return [...new Set(invalid)];
}

export async function consumeValidatedAnamnesisInvite<T>(
  body: Record<string, unknown>, customFields: RequiredAnamnesisField[], consume: () => Promise<T>,
) {
  const invalid = validateInviteAnamnesis(body, customFields);
  if (invalid.length > 0) throw new HttpError(422, `Anamnese incompleta ou inválida: ${invalid.join(", ")}.`);
  return await consume();
}
