import { STAFF_LEAD_FIELD_TIMES } from "./effective-anamnesis.ts";
export type LeadAnamnesisBase = {
  answers: Record<string, unknown>;
  source: string;
  manualNotes?: string;
  budgetRange: string | null;
  preferredContactPeriod: string | null;
  submittedAt: string | null;
};

export const PRE_REGISTRATION_BUDGET_LABELS: Record<string, string> = {
  "200_300": "R$ 200 a R$ 300/mês",
  "300_400": "R$ 300 a R$ 400/mês",
  "400_500": "R$ 400 a R$ 500/mês",
};
export const PRE_REGISTRATION_CONTACT_LABELS: Record<string, string> = {
  morning: "Manhã",
  afternoon: "Tarde",
  evening: "Noite",
};

function formatLeadValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  const text = String(value ?? "").trim();
  return PRE_REGISTRATION_BUDGET_LABELS[text] ?? PRE_REGISTRATION_CONTACT_LABELS[text] ?? text;
}

export const CONVERTED_LEAD_COLUMNS = "id, pre_registration_answers, budget_range, preferred_contact_period, interest_notes, submitted_at, created_at";

export function convertedLeadAnamnesis(lead: Record<string, unknown>): LeadAnamnesisBase {
  const raw = lead.pre_registration_answers;
  const answers = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return {
    source: "lead",
    answers,
    budgetRange: (lead.budget_range || null) as string | null,
    preferredContactPeriod: (lead.preferred_contact_period || null) as string | null,
    submittedAt: (lead.submitted_at || lead.created_at || null) as string | null,
    manualNotes: String(lead.interest_notes || answers.notes || ""),
  };
}

export async function readConvertedLead(db: any, scope: { companyId: string; studentId: string }) {
  const { data, error } = await db.from("leads").select(CONVERTED_LEAD_COLUMNS)
    .eq("converted_to_student_id", scope.studentId).eq("company_id", scope.companyId)
    .order("submitted_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message || "Falha ao carregar pré-cadastro do aluno.");
  return data;
}

function studioNumberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function studioBool(value: unknown) {
  return value === true || value === "true" || value === "sim";
}

function studioArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

function studioClean(value: unknown, maxLength = 2000) {
  return String(value ?? "").replace(/[^\x20-\x7E\u00C0-\u017F\n\r\t]/g, "").slice(0, maxLength).trim();
}

function studioIncludesAny(values: string[], needles: string[]) {
  const source = values.join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return needles.some((needle) => source.includes(needle));
}

function studioDurationMinutes(value: unknown, directValue?: unknown) {
  const direct = studioNumberOrNull(directValue);
  if (direct && direct > 0) return direct;
  const label = String(value ?? "").toLowerCase();
  if (label.includes("30") && label.includes("45")) return 45;
  if (label.includes("45") && label.includes("60")) return 60;
  if (label.includes("60")) return 60;
  if (label.includes("45")) return 45;
  if (label.includes("30")) return 30;
  return null;
}

export function preRegistrationToStudioAnamnesis(
  data: LeadAnamnesisBase,
  context: { studentId: string; companyId: string | null },
  formatValue = formatLeadValue,
) {
  const staffFieldTimes = data.answers[STAFF_LEAD_FIELD_TIMES];
  const answers = staffFieldTimes || Object.hasOwn(data.answers, "__form")
    ? Object.fromEntries(Object.entries(data.answers).filter(([key]) => key !== STAFF_LEAD_FIELD_TIMES && key !== "__form"))
    : data.answers;
  const modalities = [
    ...studioArray(answers.modalities),
    ...studioArray(answers.requested_services),
    ...studioArray(answers.desired_services),
    ...studioArray(answers.prescribed_modalities),
  ];
  const strength = answers.interest_strength !== undefined
    ? studioBool(answers.interest_strength)
    : studioIncludesAny(modalities, ["musculacao", "musculação", "strength", "funcional", "crossfit"]);
  const running = answers.interest_running !== undefined
    ? studioBool(answers.interest_running)
    : studioIncludesAny(modalities, ["corrida", "running", "triathlon"]);
  const swimming = answers.interest_swimming !== undefined
    ? studioBool(answers.interest_swimming)
    : studioIncludesAny(modalities, ["natacao", "natação", "swimming", "triathlon"]);
  const cycling = answers.interest_cycling !== undefined
    ? studioBool(answers.interest_cycling)
    : studioIncludesAny(modalities, ["bike", "ciclismo", "cycling", "triathlon"]);
  const nutrition = answers.interest_nutrition === undefined
    ? studioIncludesAny(modalities, ["nutrition", "nutricao", "nutrição"])
    : studioBool(answers.interest_nutrition);
  const endurance = running || swimming || cycling;
  const equipment = [
    studioClean(answers.training_location, 160),
    studioArray(answers.available_equipment).join(", "),
  ].filter(Boolean).join(" | ");
  const clinical = [
    studioClean(answers.injuries),
    answers.diseases && `Doenças/remédios: ${studioClean(answers.diseases)}`,
    answers.medical_conditions && `Condições médicas: ${studioClean(answers.medical_conditions)}`,
    answers.medications && `Medicamentos: ${studioClean(answers.medications)}`,
  ].filter(Boolean).join(" | ");
  const cardioNotes = [
    running && `CORRIDA: ${[answers.run_where && studioClean(answers.run_where, 120), answers.run_best_time && `melhor tempo ${studioClean(answers.run_best_time, 120)}`].filter(Boolean).join(", ") || "detalhes não informados"}`,
    swimming && `NATAÇÃO: ${[answers.swim_pool && `piscina ${studioClean(answers.swim_pool, 80)}`, answers.swim_level && `nível ${studioClean(answers.swim_level, 80)}`, answers.swim_volume && `volume ${studioClean(answers.swim_volume, 120)}`].filter(Boolean).join(", ") || "detalhes não informados"}`,
    cycling && `CICLISMO: ${[answers.bike_type && studioClean(answers.bike_type, 80), answers.bike_volume && `volume ${studioClean(answers.bike_volume, 120)}`, answers.bike_ftp && `FTP/potência ${studioClean(answers.bike_ftp, 60)}`].filter(Boolean).join(", ") || "detalhes não informados"}`,
  ].filter(Boolean);
  const nutritionContext = [
    studioClean(answers.nutrition_context || answers.nutrition, 4000),
    answers.meal_routine && `Rotina alimentar: ${studioClean(answers.meal_routine, 1000)}`,
    answers.meal_schedule && `Horários: ${studioClean(answers.meal_schedule, 1000)}`,
    answers.train_time && `Horário de treino: ${studioClean(answers.train_time, 200)}`,
    answers.train_fasted !== undefined && `Treina em jejum: ${formatValue(answers.train_fasted)}`,
    answers.appetite_wake && `Apetite ao acordar: ${studioClean(answers.appetite_wake, 200)}`,
    answers.food_likes && `Gosta: ${studioClean(answers.food_likes, 1000)}`,
    answers.food_dislikes && `Não gosta: ${studioClean(answers.food_dislikes, 1000)}`,
    answers.supplements && `Suplementos: ${studioClean(answers.supplements, 1000)}`,
    answers.hydration && `Hidratação: ${studioClean(answers.hydration, 500)}`,
    answers.gi_sensitivities && `Sensibilidade GI: ${studioClean(answers.gi_sensitivities, 500)}`,
  ].filter(Boolean).join("\n");
  const notes = [
    "Fonte: pré-cadastro novo",
    data.manualNotes && `Notas do professor: ${studioClean(data.manualNotes, 4000)}`,
    answers.goals && `Metas: ${studioClean(answers.goals)}`,
    answers.training_days && `Semana de treinos: ${studioClean(answers.training_days)}`,
    answers.profession && `Profissão/rotina: ${studioClean(answers.profession)}`,
    answers.sleep_hours && `Horas de sono: ${studioClean(answers.sleep_hours, 80)}`,
    answers.feel_in_3_months && `Como quer se sentir em 3 meses: ${studioClean(answers.feel_in_3_months)}`,
    answers.biggest_obstacle && `Maior obstáculo: ${studioClean(answers.biggest_obstacle)}`,
    ...cardioNotes,
    data.budgetRange && `Investimento mensal em saúde: ${formatValue(data.budgetRange)}`,
    data.preferredContactPeriod && `Melhor horário para contato: ${formatValue(data.preferredContactPeriod)}`,
    answers.extra_comments && `Comentários: ${studioClean(answers.extra_comments)}`,
  ].filter(Boolean).join("\n");

  return {
    id: null,
    ...(staffFieldTimes ? { [STAFF_LEAD_FIELD_TIMES]: staffFieldTimes } : {}),
    student_id: context.studentId,
    company_id: context.companyId,
    source: `pre_registration_${data.source}`,
    submitted_at: data.submittedAt,
    updated_at: data.submittedAt,
    raw_answers: answers,
    answers,
    age: studioNumberOrNull(answers.age),
    body_fat_percent: studioNumberOrNull(answers.body_fat_percent),
    objective: studioClean(answers.objective || answers.goals, 300) || null,
    activity_level: studioClean(answers.activity_level, 120) || null,
    is_endurance_athlete: endurance || studioIncludesAny(modalities, ["triathlon"]),
    training_modality: studioClean(modalities.filter((item) => !/^nenhum$/i.test(item)).join(" + ") || "nenhum", 300),
    days_per_week_strength: strength
      ? (studioNumberOrNull(answers.days_strength ?? answers.days_per_week_strength) ?? studioNumberOrNull(answers.available_days ?? answers.days_available))
      : null,
    days_per_week_cardio: endurance
      ? (studioNumberOrNull(answers.days_cardio ?? answers.days_per_week_cardio) ?? studioNumberOrNull(answers.available_days ?? answers.days_available))
      : null,
    session_duration_min: strength
      ? studioDurationMinutes(answers.session_duration, answers.session_duration_min)
      : endurance
        ? studioDurationMinutes(answers.endurance_session_duration, answers.endurance_session_duration_min)
        : studioDurationMinutes(answers.session_duration, answers.session_duration_min),
    endurance_session_duration_min: endurance
      ? studioDurationMinutes(answers.endurance_session_duration, answers.endurance_session_duration_min)
      : null,
    equipment: studioClean(answers.equipment || equipment, 500) || null,
    experience_months: studioNumberOrNull(answers.experience_months),
    sport: running ? "corrida" : swimming ? "natacao" : cycling ? "ciclismo" : null,
    fcmax: studioNumberOrNull(answers.fcmax),
    fcrep: studioNumberOrNull(answers.fcrep),
    current_volume_weekly: studioNumberOrNull(answers.current_volume_weekly),
    current_volume_unit: answers.current_volume_unit === "hours_week" ? "hours_week" : "km_week",
    cardio_goal: studioClean(answers.cardio_goal || answers.sport_goal, 300) || null,
    stress_score: studioNumberOrNull(answers.stress_score),
    sleep_quality: studioNumberOrNull(answers.sleep_quality),
    injuries: clinical || null,
    current_pain: typeof answers.current_pain === "boolean" ? answers.current_pain : studioClean(answers.current_pain) || null,
    training_location: studioClean(answers.training_location, 160) || null,
    food_restrictions: studioClean(answers.food_restrictions || answers.food_preferences, 1000) || null,
    nutrition_context: nutritionContext || null,
    budget_food: studioClean(answers.budget_food || "moderado", 80) || null,
    meals_per_day: studioNumberOrNull(answers.meals_per_day),
    has_kitchen: answers.has_kitchen === undefined ? true : studioBool(answers.has_kitchen),
    has_nutritionist: studioBool(answers.has_nutritionist),
    wants_strength: strength,
    wants_running: running,
    wants_swimming: swimming,
    wants_cycling: cycling,
    wants_nutrition: nutrition,
    shown_blocks: [
      "pré-cadastro",
      "dados",
      "objetivo",
      "treino",
      "saude",
      nutrition && "nutricao",
      strength && "musculacao",
      running && "corrida",
      swimming && "natacao",
      cycling && "ciclismo",
    ].filter(Boolean),
    custom_answers: answers.custom_answers,
    notes,
  };
}
