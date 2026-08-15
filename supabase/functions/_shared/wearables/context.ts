export interface ContextMetric {
  date?: string | null;
  recorded_at?: string | null;
  value?: number | null;
  score_state?: string | null;
}

export function isFreshScoredMetric(
  metric: ContextMetric,
  now = new Date(),
  maxAgeHours = 48,
) {
  if (
    metric.score_state !== "SCORED" || metric.value === null ||
    metric.value === undefined || !Number.isFinite(Number(metric.value))
  ) return false;
  const timestamp = metric.recorded_at ||
    (metric.date ? `${metric.date}T12:00:00Z` : "");
  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time)) return false;
  const age = now.getTime() - time;
  return age >= 0 && age <= maxAgeHours * 60 * 60 * 1000;
}
