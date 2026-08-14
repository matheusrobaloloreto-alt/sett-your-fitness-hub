const NEXT_MONDAY_RESPONSE_DAYS = new Set(["Fri", "Sat", "Sun"]);

export function preRegistrationResponseDeadline(now = new Date()): string {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  }).format(now);

  if (NEXT_MONDAY_RESPONSE_DAYS.has(weekday)) {
    return "Você vai ouvir da gente já na segunda-feira.";
  }

  return "Você vai ouvir da gente ainda hoje.";
}
