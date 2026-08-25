export type EditableCardioSport = "corrida" | "natacao" | "ciclismo";

type JsonObject = Record<string, unknown>;

export type NormalizedCardioPlanUpdate = {
  plan_name: string;
  sport: EditableCardioSport;
  goal: string;
  duration_weeks: number;
  model: string;
  weeks: Array<JsonObject & { sessions: JsonObject[]; volume_hours: number; volume_km: number | null }>;
  fc_zones: JsonObject;
  safety_check: JsonObject;
  general_tips: string;
  warnings: string[];
  complementary_strength: string[];
  nutrition_alert: string;
};

export class CardioPlanValidationError extends Error {}

const MAX_PLAN_BYTES = 1_048_576;

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, field: string, maxLength: number): string {
  if (value == null) return "";
  if (typeof value !== "string") throw new CardioPlanValidationError(`${field} precisa ser texto.`);
  if (value.length > maxLength) throw new CardioPlanValidationError(`${field} excede o limite permitido.`);
  return value.trim();
}

function numberInRange(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new CardioPlanValidationError(`${field} precisa ser numérico e ficar entre ${min} e ${max}.`);
  }
  return value;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function optionalNumberInRange(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number | undefined {
  return value == null ? undefined : numberInRange(value, field, min, max);
}

function normalizeFcZones(value: JsonObject): JsonObject {
  const normalized: JsonObject = {};
  for (const key of ["fcmax", "fcrep", "fc_reserva"] as const) {
    const numeric = optionalNumberInRange(value[key], key, 0, 400);
    if (numeric != null) normalized[key] = numeric;
  }
  if (value.estimated != null) {
    if (typeof value.estimated !== "boolean") {
      throw new CardioPlanValidationError("FC estimada precisa ser booleana.");
    }
    normalized.estimated = value.estimated;
  }
  for (const zone of ["z1", "z2", "z3", "z4", "z5"] as const) {
    const rawZone = value[zone];
    if (rawZone == null) continue;
    if (!isObject(rawZone)) throw new CardioPlanValidationError(`${zone.toUpperCase()} inválida.`);
    const min = numberInRange(rawZone.min, `${zone.toUpperCase()} mínima`, 0, 400);
    const max = numberInRange(rawZone.max, `${zone.toUpperCase()} máxima`, 0, 400);
    if (min > max) throw new CardioPlanValidationError(`${zone.toUpperCase()} mínima acima da máxima.`);
    normalized[zone] = { min, max };
  }
  return normalized;
}

function normalizeSafetyCheck(value: JsonObject): JsonObject {
  const normalized: JsonObject = {};
  for (const key of ["tsb_status", "eva_status"] as const) {
    if (value[key] == null) continue;
    const status = text(value[key], key, 40);
    if (!["ok", "atencao", "linha_vermelha"].includes(status)) {
      throw new CardioPlanValidationError(`${key} inválido.`);
    }
    normalized[key] = status;
  }
  if (value.restrictions != null) {
    if (!Array.isArray(value.restrictions) || value.restrictions.length > 50) {
      throw new CardioPlanValidationError("Restrições de segurança inválidas.");
    }
    normalized.restrictions = value.restrictions.map((restriction, index) =>
      text(restriction, `Restrição ${index + 1}`, 1000)
    );
  }
  return normalized;
}

export function normalizeCardioPlanUpdate(
  input: unknown,
  expectedSport: EditableCardioSport,
): NormalizedCardioPlanUpdate {
  if (!isObject(input)) throw new CardioPlanValidationError("Plano inválido.");
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > MAX_PLAN_BYTES) {
    throw new CardioPlanValidationError("Plano excede o limite de 1 MB.");
  }
  if (input.sport !== expectedSport) {
    throw new CardioPlanValidationError("A modalidade de um plano existente não pode ser alterada.");
  }
  if (!Array.isArray(input.weeks) || input.weeks.length < 1 || input.weeks.length > 52) {
    throw new CardioPlanValidationError("O plano precisa conter entre 1 e 52 semanas.");
  }
  if (!isObject(input.fc_zones) || !isObject(input.safety_check)) {
    throw new CardioPlanValidationError("Zonas de FC ou verificação de segurança inválidas.");
  }
  if (!Array.isArray(input.warnings) || input.warnings.length > 50) {
    throw new CardioPlanValidationError("Alertas inválidos ou acima do limite.");
  }
  const warnings = input.warnings.map((warning, index) => text(warning, `Alerta ${index + 1}`, 1000));
  if (!Array.isArray(input.complementary_strength) || input.complementary_strength.length > 50) {
    throw new CardioPlanValidationError("Força complementar inválida ou acima do limite.");
  }
  const complementaryStrength = input.complementary_strength.map((exercise, index) =>
    text(exercise, `Força complementar ${index + 1}`, 1000)
  );

  const seenWeekNumbers = new Set<number>();
  const weeks = input.weeks.map((rawWeek, weekIndex) => {
    if (!isObject(rawWeek) || !Array.isArray(rawWeek.sessions)
      || rawWeek.sessions.length < 1 || rawWeek.sessions.length > 14) {
      throw new CardioPlanValidationError("Cada semana precisa conter entre 1 e 14 sessões.");
    }
    const weekNumber = rawWeek.week_number == null ? weekIndex + 1 : rawWeek.week_number;
    if (!Number.isInteger(weekNumber) || Number(weekNumber) < 1 || Number(weekNumber) > 52
      || seenWeekNumbers.has(Number(weekNumber))) {
      throw new CardioPlanValidationError("Número de semana inválido ou duplicado.");
    }
    seenWeekNumbers.add(Number(weekNumber));
    const focus = text(rawWeek.focus, `Foco da semana ${weekIndex + 1}`, 1000);

    let totalMinutes = 0;
    let totalDistance = 0;
    let hasDistance = false;
    const sessions = rawWeek.sessions.map((rawSession, sessionIndex) => {
      if (!isObject(rawSession)) throw new CardioPlanValidationError("Sessão inválida.");
      const day = text(rawSession.day, `Dia da sessão ${sessionIndex + 1}`, 80);
      const title = text(rawSession.title, `Título da sessão ${sessionIndex + 1}`, 200);
      if (!day || !title) throw new CardioPlanValidationError("Sessão sem dia ou título.");
      const warmup = numberInRange(rawSession.warmup_min, "Aquecimento", 0, 1440);
      const main = numberInRange(rawSession.main_min, "Parte principal", 0, 1440);
      const cooldown = numberInRange(rawSession.cooldown_min, "Volta à calma", 0, 1440);
      const sessionTotal = warmup + main + cooldown;
      if (sessionTotal > 1440) throw new CardioPlanValidationError("Duração da sessão fora do limite.");

      let distance: number | null = null;
      if (rawSession.distance_km != null && rawSession.distance_km !== "") {
        distance = numberInRange(rawSession.distance_km, "Distância", 0, 1000);
        totalDistance += distance;
        hasDistance = true;
      }
      totalMinutes += sessionTotal;

      const tssEstimated = optionalNumberInRange(rawSession.tss_estimado, "TSS da sessão", 0, 100_000);

      return {
        day,
        title,
        type: text(rawSession.type, "Tipo da sessão", 100),
        sport: expectedSport,
        warmup_min: warmup,
        main_min: main,
        cooldown_min: cooldown,
        total_min: sessionTotal,
        distance_km: distance,
        zone: text(rawSession.zone, "Zona", 40),
        fc_target: text(rawSession.fc_target, "Alvo de FC", 120),
        intervals: rawSession.intervals == null ? null : text(rawSession.intervals, "Intervalos", 2000),
        ...(tssEstimated == null ? {} : { tss_estimado: tssEstimated }),
        notes: text(rawSession.notes, "Observações", 5000),
      };
    });

    const tssTotal = optionalNumberInRange(rawWeek.tss_total_estimado, "TSS da semana", 0, 1_400_000);

    return {
      week_number: Number(weekNumber),
      type: text(rawWeek.type, `Tipo da semana ${weekIndex + 1}`, 100),
      focus,
      sessions,
      volume_hours: round1(totalMinutes / 60),
      volume_km: expectedSport === "natacao" || !hasDistance ? null : round1(totalDistance),
      ...(tssTotal == null ? {} : { tss_total_estimado: tssTotal }),
    };
  });

  return {
    plan_name: text(input.plan_name, "Nome do plano", 200),
    sport: expectedSport,
    goal: text(input.goal, "Objetivo", 1000),
    duration_weeks: weeks.length,
    model: text(input.model, "Modelo", 200),
    weeks,
    fc_zones: normalizeFcZones(input.fc_zones),
    safety_check: normalizeSafetyCheck(input.safety_check),
    general_tips: text(input.general_tips, "Orientações gerais", 10000),
    warnings,
    complementary_strength: complementaryStrength,
    nutrition_alert: text(input.nutrition_alert, "Alerta nutricional", 5000),
  };
}
