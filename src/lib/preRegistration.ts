export type PreRegistrationAnswerEntry = {
  key: string;
  label: string;
  value: string;
};

export type PreRegistrationData = {
  answers: Record<string, unknown>;
  budgetRange: string | null;
  preferredContactPeriod: string | null;
  submittedAt: string | null;
  source: "lead" | "student_anamnesis";
};

export const PRE_REGISTRATION_ANSWER_LABELS: Record<string, string> = {
  age: "Idade",
  gender: "Sexo",
  weight_kg: "Peso atual",
  height_cm: "Altura",
  body_fat_percent: "% de gordura",
  objective: "Objetivo principal",
  activity_level: "Nível de atividade",
  experience_months: "Treina musculação há",
  modalities: "Modalidades praticadas/solicitadas",
  prescribed_modalities: "Prescrições solicitadas",
  training_days: "Semana de treinos",
  available_days: "Dias disponíveis",
  days_strength: "Dias de musculação",
  days_cardio: "Dias de cardio",
  days_available: "Dias disponíveis",
  session_duration: "Duração por sessão",
  session_duration_min: "Duração por sessão",
  training_location: "Local de treino",
  available_equipment: "Equipamentos disponíveis",
  equipment: "Equipamentos disponíveis",
  goals: "Metas com os treinos",
  diseases: "Doenças ou condições",
  injuries: "Lesões, dores e histórico clínico",
  current_pain: "Dor atual",
  sport_goal: "Objetivo/prova esportiva",
  cardio_goal: "Objetivo/prova esportiva",
  current_volume_weekly: "Volume atual",
  current_volume_unit: "Unidade do volume",
  fcmax: "FC máxima",
  fcrep: "FC de repouso",
  perceived_recovery: "Recuperação percebida",
  run_where: "Onde corre",
  run_best_time: "Melhor tempo recente",
  swim_pool: "Piscina",
  swim_level: "Nível na natação",
  swim_volume: "Volume de natação",
  swim_best: "Melhor tempo/pace na natação",
  bike_type: "Tipo de bike",
  bike_volume: "Volume de bike",
  bike_ftp: "FTP",
  bike_power: "Usa medidor de potência",
  fueling_strategy: "Estratégia de alimentação nos treinos",
  medical_conditions: "Condições médicas",
  medications: "Medicamentos",
  stress_score: "Estresse",
  sleep_quality: "Qualidade do sono",
  sleep_hours: "Horas de sono",
  clin_cardiac: "Problema cardíaco",
  clin_chest_pain: "Dor no peito",
  clin_surgery: "Cirurgia recente",
  clin_surgery_detail: "Detalhes da cirurgia",
  clin_pregnant: "Gestante/pós-parto",
  clin_pregnant_detail: "Detalhes gestacionais",
  clin_smoke: "Fuma",
  clin_acute: "Dor aguda",
  clin_other: "Outro ponto clínico",
  eva_tornozelo: "EVA tornozelo",
  eva_joelho: "EVA joelho",
  eva_quadril: "EVA quadril",
  eva_lombar: "EVA lombar",
  eva_ombro: "EVA ombro",
  nutrition: "Nutrição",
  nutrition_context: "Contexto nutricional",
  profession: "Profissão/rotina",
  restorative_sleep: "Sono reparador",
  aware_of_trilogy: "Conhece treino/sono/nutrição",
  meals_per_day: "Refeições por dia",
  meal_t1: "Refeição 1",
  meal_t2: "Refeição 2",
  meal_t3: "Refeição 3",
  meal_routine: "Rotina alimentar",
  train_time: "Horário de treino",
  train_fasted: "Treina em jejum",
  appetite_wake: "Apetite ao acordar",
  food_likes: "Alimentos que gosta",
  food_dislikes: "Alimentos que não gosta",
  food_restrictions: "Restrições alimentares",
  budget_food: "Orçamento alimentar",
  has_kitchen: "Tem cozinha/estrutura",
  supplements: "Suplementos",
  hydration: "Hidratação",
  gi_sensitivities: "Sensibilidade gastrointestinal",
  feel_in_3_months: "Como quer se sentir em 3 meses",
  biggest_obstacle: "Maior obstáculo",
  extra_comments: "Comentários extras",
  notes: "Observações integradas",
  authorizes_plan: "Autorizou uso das informações",
  commits_communication: "Compromisso de comunicação",
  budget_range: "Investimento mensal em saúde",
  preferred_contact_period: "Melhor horário para contato",
  interest_strength: "Interesse em musculação",
  interest_running: "Interesse em corrida",
  interest_swimming: "Interesse em natação",
  interest_cycling: "Interesse em ciclismo",
  interest_nutrition: "Interesse em nutrição",
  requested_services: "Prescrições solicitadas",
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

export function isPreRegistrationRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function labelizeKey(key: string) {
  return key
    .replace(/[._-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function preRegistrationAnswerLabel(key: string) {
  const last = key.split(".").pop() || key;
  return PRE_REGISTRATION_ANSWER_LABELS[key]
    || PRE_REGISTRATION_ANSWER_LABELS[last]
    || labelizeKey(last);
}

export function formatPreRegistrationValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "hours_week") return "h/sem";
    if (trimmed === "km_week") return "km/sem";
    if (trimmed === "M") return "Masculino";
    if (trimmed === "F") return "Feminino";
    if (trimmed.toLowerCase() === "sim") return "Sim";
    if (trimmed.toLowerCase() === "nao" || trimmed.toLowerCase() === "não") return "Não";
    if (trimmed.toLowerCase() === "nao_sei") return "Não sei";
    return PRE_REGISTRATION_BUDGET_LABELS[trimmed]
      || PRE_REGISTRATION_CONTACT_LABELS[trimmed]
      || trimmed;
  }
  if (Array.isArray(value)) {
    return value.map(formatPreRegistrationValue).filter(Boolean).join(", ");
  }
  if (isPreRegistrationRecord(value)) {
    return Object.entries(value)
      .map(([key, item]) => {
        const formatted = formatPreRegistrationValue(item);
        return formatted ? `${preRegistrationAnswerLabel(key)}: ${formatted}` : "";
      })
      .filter(Boolean)
      .join("; ");
  }
  return String(value);
}

function formatPreRegistrationAnswerValue(key: string, value: unknown) {
  const last = key.split(".").pop() || key;
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (last === "requested_services" && Array.isArray(value)) {
    const serviceLabels: Record<string, string> = {
      strength: "Musculação",
      running: "Corrida",
      swimming: "Natação",
      cycling: "Ciclismo",
      triathlon: "Triathlon",
      nutrition: "Nutrição",
    };
    return value
      .map((item) => serviceLabels[String(item).toLowerCase()] || formatPreRegistrationValue(item))
      .filter(Boolean)
      .join(", ");
  }
  const valueLabels: Record<string, Record<string, string>> = {
    objective: {
      emagrecimento: "Emagrecimento",
      hipertrofia: "Ganho de massa",
      performance: "Performance esportiva",
      saude: "Saúde e bem-estar",
    },
    activity_level: {
      sedentario: "Sedentário",
      leve: "Levemente ativo",
      moderado: "Moderadamente ativo",
      muito_ativo: "Muito ativo",
      extremo: "Extremamente ativo",
    },
    swim_pool: {
      nao: "Sem acesso regular",
      nao_sei: "Não sei",
    },
    swim_level: {
      iniciante: "Iniciante",
      intermediario: "Intermediário",
      avancado: "Avançado",
    },
  };
  if (valueLabels[last]?.[normalized]) return valueLabels[last][normalized];
  return formatPreRegistrationValue(value);
}

export function preRegistrationAnswerEntries(
  answers: Record<string, unknown> | null | undefined,
): PreRegistrationAnswerEntry[] {
  const walk = (value: Record<string, unknown>, parent = ""): PreRegistrationAnswerEntry[] => (
    Object.entries(value).flatMap(([key, raw]) => {
      const fullKey = parent ? `${parent}.${key}` : key;
      if (raw === null || raw === undefined || raw === "") return [];
      if (isPreRegistrationRecord(raw)) return walk(raw, fullKey);
      if (Array.isArray(raw) && raw.length === 0) return [];
      const formatted = formatPreRegistrationAnswerValue(fullKey, raw);
      return formatted
        ? [{ key: fullKey, label: preRegistrationAnswerLabel(fullKey), value: formatted }]
        : [];
    })
  );
  const seen = new Set<string>();
  return walk(answers || {}).filter((entry) => {
    const fingerprint = `${entry.label}\u0000${entry.value}`;
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

export function canonicalAnamnesisToPreRegistrationAnswers(
  anamnesis: Record<string, unknown> | null | undefined,
) {
  if (!anamnesis) return {};
  const answerKeys = [
    "age", "body_fat_percent", "objective", "activity_level", "prescribed_modalities",
    "training_modality", "days_per_week_strength", "days_per_week_cardio",
    "session_duration_min", "equipment", "experience_months", "sport", "fcmax", "fcrep",
    "current_volume_weekly", "current_volume_unit", "cardio_goal", "stress_score",
    "sleep_quality", "injuries", "food_restrictions", "nutrition_context", "budget_food",
    "meals_per_day", "has_kitchen", "notes",
  ];
  const aliases: Record<string, string> = {
    prescribed_modalities: "modalities",
    days_per_week_strength: "days_strength",
    days_per_week_cardio: "days_cardio",
    training_modality: "modalities",
    sport: "sport_goal",
  };
  return answerKeys.reduce<Record<string, unknown>>((result, key) => {
    const value = anamnesis[key];
    if (value === null || value === undefined || value === "") return result;
    const outputKey = aliases[key] || key;
    if (result[outputKey] === undefined) result[outputKey] = value;
    return result;
  }, {});
}

export function preRegistrationPhoneCandidates(phone: string | null | undefined) {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return [];
  const candidates = new Set([digits]);
  if (digits.startsWith("55") && digits.length >= 12) candidates.add(digits.slice(2));
  if (!digits.startsWith("55") && digits.length <= 11) candidates.add(`55${digits}`);
  return [...candidates];
}
