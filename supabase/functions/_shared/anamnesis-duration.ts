function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseDurationMinutes(value: unknown, directValue?: unknown) {
  const direct = numberOrNull(directValue);
  if (direct) return direct;
  const label = String(value ?? "").toLowerCase();
  if (label.includes("30") && label.includes("45")) return 45;
  if (label.includes("45") && label.includes("60")) return 60;
  if (label.includes("60")) return 60;
  if (label.includes("45")) return 45;
  if (label.includes("30")) return 30;
  return null;
}

export function resolveAnamnesisDurations(
  body: Record<string, unknown>,
  interests: { strength: boolean; endurance: boolean },
) {
  const strengthMinutes = parseDurationMinutes(body.session_duration, body.session_duration_min);
  const enduranceMinutes = parseDurationMinutes(
    body.endurance_session_duration,
    body.endurance_session_duration_min,
  );
  return {
    // Compatibilidade: formulários exclusivamente de endurance continuam
    // preenchendo o campo legado, mas nunca substituem a duração da força.
    session_duration_min: interests.strength
      ? strengthMinutes
      : interests.endurance
        ? enduranceMinutes
        : strengthMinutes,
    endurance_session_duration_min: interests.endurance ? enduranceMinutes : null,
  };
}
