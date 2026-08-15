export interface ContextMetric {
  date?: string | null;
  recorded_at?: string | null;
  value?: number | null;
  score_state?: string | null;
}

export interface WearablePromptContext {
  wearable_metrics?: ContextMetric[] | null;
  [key: string]: unknown;
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

/**
 * Sanitizes wearable metrics before the context is hashed, reported as loaded,
 * or serialized into an LLM prompt. This is intentionally a boundary helper so
 * stale/unscored/null provider values cannot leak through another prompt path.
 */
export function sanitizeWearablesForPrompt<T extends WearablePromptContext>(
  context: T,
  now = new Date(),
): T {
  const metrics = Array.isArray(context.wearable_metrics)
    ? context.wearable_metrics.filter((metric) =>
      isFreshScoredMetric(metric, now)
    )
    : [];
  return { ...context, wearable_metrics: metrics };
}
