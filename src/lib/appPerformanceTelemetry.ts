import { supabase } from "@/integrations/supabase/client";

const ROUTE_GROUPS = new Set(["student_workout", "trainer_whatsapp"] as const);
const METRICS = new Set(["shell_ready", "content_ready"] as const);
const NAVIGATION_TYPES = new Set(["navigate", "reload", "back_forward", "prerender"] as const);
const EFFECTIVE_TYPES = new Set(["slow-2g", "2g", "3g", "4g"] as const);

export interface PerformanceSampleInput {
  routeGroup: string;
  metric: string;
  durationMs: number;
  navigationType?: string | null;
  effectiveType?: string | null;
  viewportWidth?: number | null;
}

export interface PerformanceSamplePayload {
  route_group: "student_workout" | "trainer_whatsapp";
  metric: "shell_ready" | "content_ready";
  duration_ms: number;
  navigation_type: "navigate" | "reload" | "back_forward" | "prerender" | "unknown";
  effective_type: "slow-2g" | "2g" | "3g" | "4g" | "unknown";
  viewport_bucket: "xs" | "sm" | "md" | "lg" | "xl" | "unknown";
}

function viewportBucket(width?: number | null): PerformanceSamplePayload["viewport_bucket"] {
  if (!Number.isFinite(width) || Number(width) <= 0) return "unknown";
  if (Number(width) < 480) return "xs";
  if (Number(width) < 768) return "sm";
  if (Number(width) < 1024) return "md";
  if (Number(width) < 1440) return "lg";
  return "xl";
}

export function normalizePerformanceSample(
  input: PerformanceSampleInput,
): PerformanceSamplePayload | null {
  if (!ROUTE_GROUPS.has(input.routeGroup as never)) return null;
  if (!METRICS.has(input.metric as never)) return null;
  if (!Number.isFinite(input.durationMs) || input.durationMs < 0 || input.durationMs > 120_000) return null;

  return {
    route_group: input.routeGroup as PerformanceSamplePayload["route_group"],
    metric: input.metric as PerformanceSamplePayload["metric"],
    duration_ms: Math.round(input.durationMs),
    navigation_type: NAVIGATION_TYPES.has(input.navigationType as never)
      ? input.navigationType as PerformanceSamplePayload["navigation_type"]
      : "unknown",
    effective_type: EFFECTIVE_TYPES.has(input.effectiveType as never)
      ? input.effectiveType as PerformanceSamplePayload["effective_type"]
      : "unknown",
    viewport_bucket: viewportBucket(input.viewportWidth),
  };
}

type PerformanceSampleSender = (sample: PerformanceSamplePayload) => Promise<unknown>;

export function createPerformanceRecorder(send: PerformanceSampleSender) {
  const attempted = new Set<string>();

  return async (input: PerformanceSampleInput): Promise<boolean> => {
    const sample = normalizePerformanceSample(input);
    if (!sample) return false;
    const key = `${sample.route_group}:${sample.metric}`;
    if (attempted.has(key)) return false;
    attempted.add(key);

    try {
      await send(sample);
      return true;
    } catch {
      return false;
    }
  };
}

function browserContext(): Pick<PerformanceSampleInput, "navigationType" | "effectiveType" | "viewportWidth"> {
  const navigation = typeof performance !== "undefined"
    ? performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
    : undefined;
  const connection = typeof navigator !== "undefined"
    ? (navigator as Navigator & { connection?: { effectiveType?: string } }).connection
    : undefined;

  return {
    navigationType: navigation?.type,
    effectiveType: connection?.effectiveType,
    viewportWidth: typeof window !== "undefined" ? window.innerWidth : undefined,
  };
}

async function sendPerformanceSample(sample: PerformanceSamplePayload, companyId: string | null | undefined) {
  const { error } = await supabase.rpc("record_app_performance_sample" as never, {
    p_route_group: sample.route_group,
    p_metric: sample.metric,
    p_duration_ms: sample.duration_ms,
    p_navigation_type: sample.navigation_type,
    p_effective_type: sample.effective_type,
    p_viewport_bucket: sample.viewport_bucket,
    p_company_id: companyId ?? null,
  } as never);
  if (error) throw error;
}

export async function recordAppPerformanceSample(
  input: Omit<PerformanceSampleInput, "navigationType" | "effectiveType" | "viewportWidth"> & {
    companyId?: string | null;
  },
) {
  const { companyId, ...performanceInput } = input;
  const sample = normalizePerformanceSample({ ...performanceInput, ...browserContext() });
  if (!sample) return false;

  try {
    await sendPerformanceSample(sample, companyId);
    return true;
  } catch {
    return false;
  }
}
