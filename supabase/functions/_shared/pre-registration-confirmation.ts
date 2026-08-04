const WEEKEND_RESPONSE_DAYS = new Set(["Fri", "Sat"]);

export function preRegistrationResponseDeadline(now = new Date()): string {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  }).format(now);

  if (WEEKEND_RESPONSE_DAYS.has(weekday)) {
    return "Vamos analisar o seu perfil e, se pudermos realmente te ajudar, você receberá um retorno nosso até segunda-feira.";
  }

  return "Vamos analisar o seu perfil e, se pudermos realmente te ajudar, você receberá um retorno nosso em até 48 horas.";
}
