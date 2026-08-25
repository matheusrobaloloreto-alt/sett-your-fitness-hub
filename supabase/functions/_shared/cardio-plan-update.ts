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
  complementary_strength: unknown[];
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

      return {
        ...rawSession,
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
        notes: text(rawSession.notes, "Observações", 5000),
      };
    });

    return {
      ...rawWeek,
      week_number: Number(weekNumber),
      focus,
      sessions,
      volume_hours: round1(totalMinutes / 60),
      volume_km: expectedSport === "natacao" || !hasDistance ? null : round1(totalDistance),
    };
  });

  return {
    plan_name: text(input.plan_name, "Nome do plano", 200),
    sport: expectedSport,
    goal: text(input.goal, "Objetivo", 1000),
    duration_weeks: weeks.length,
    model: text(input.model, "Modelo", 200),
    weeks,
    fc_zones: { ...input.fc_zones },
    safety_check: { ...input.safety_check },
    general_tips: text(input.general_tips, "Orientações gerais", 10000),
    warnings,
    complementary_strength: [...input.complementary_strength],
    nutrition_alert: text(input.nutrition_alert, "Alerta nutricional", 5000),
  };
}
