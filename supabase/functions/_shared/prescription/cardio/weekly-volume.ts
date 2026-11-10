type EnduranceSport = "natacao" | "ciclismo";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseWeeklyVolume(value: unknown, sport: EnduranceSport) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (sport === "natacao") {
    // The intake offers "2x40min" as a weekly swimming-volume answer.
    const sessions = /^(\d{1,2})\s*[x×]\s*(\d{1,3})\s*min$/i.exec(text);
    if (sessions) {
      const hours = Number(sessions[1]) * Number(sessions[2]) / 60;
      return hours <= 168 ? { value: hours, unit: "hours_week" as const } : null;
    }
  }

  const match = /^(\d{1,7}(?:[.,]\d{1,2})?)\s*(km|m|h|horas?)\s*(?:\/\s*sem(?:ana)?|por\s+semana)$/i.exec(text);
  if (!match) return null;

  const unit = match[2].toLowerCase();
  const amount = Number(match[1].replace(",", "."));
  if (unit.startsWith("h")) return amount <= 168 ? { value: amount, unit: "hours_week" as const } : null;
  if (unit === "m" && sport !== "natacao") return null;

  const km = unit === "m" ? amount / 1000 : amount;
  return km <= 10000 ? { value: km, unit: "km_week" as const } : null;
}

function declaredSport(anamnesis: Record<string, unknown>) {
  return typeof anamnesis.sport === "string"
    ? anamnesis.sport.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    : null;
}

export function hasNonRunningLegacyVolume(anamnesis: Record<string, unknown>) {
  const sport = declaredSport(anamnesis);
  return sport === "natacao" || sport === "ciclismo";
}

export function readSportSpecificWeeklyVolume(anamnesis: Record<string, unknown>, sport: EnduranceSport) {
  const field = sport === "natacao" ? "swim_volume" : "bike_volume";
  for (const source of [anamnesis, anamnesis.raw_answers, anamnesis.answers, anamnesis.responses, anamnesis.custom_answers]) {
    const answer = record(source)[field];
    const value = record(answer).value ?? answer;
    if (value != null && value !== "") return parseWeeklyVolume(value, sport);
  }

  const header = sport === "natacao" ? "NATAÇÃO: " : "CICLISMO: ";
  const sections = typeof anamnesis.notes === "string"
    ? anamnesis.notes.split(/\r?\n| \| /).filter(section => section.startsWith(header))
    : [];
  if (sections.length > 1) return null;
  const detail = sections[0]?.slice(header.length) ?? "";
  const volume = /(?:^|, )volume (.+?)(?=, (?:melhor tempo\/pace |FTP\/potência |tem medidor de potência)|$)/.exec(detail);
  if (volume) return parseWeeklyVolume(volume[1], sport);

  // Older staff records have one sport selector and one numeric volume.
  const sportName = declaredSport(anamnesis);
  const otherSport = sport === "natacao" ? "wants_cycling" : "wants_swimming";
  if (sportName !== sport || anamnesis.wants_running === true || anamnesis[otherSport] === true) return null;
  const legacy = anamnesis.current_volume_weekly;
  if (typeof legacy !== "number" && (typeof legacy !== "string" || !legacy.trim())) return null;
  const amount = Number(legacy);
  const unit = anamnesis.current_volume_unit;
  if (!Number.isFinite(amount) || amount < 0) return null;
  if (unit === "hours_week") return amount <= 168 ? { value: amount, unit } : null;
  if (unit == null || unit === "km_week") return amount <= 10000 ? { value: amount, unit: "km_week" as const } : null;
  return null;
}
