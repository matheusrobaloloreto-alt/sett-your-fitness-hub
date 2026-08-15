import { collectPages, requestJson } from "./http.ts";
import {
  dedupeMetrics,
  normalizeOuraDaily,
  normalizeOuraSleep,
  normalizeWhoopRecord,
  normalizeWhoopWorkout,
} from "./normalize.ts";
import type {
  ConnectableProvider,
  WearableMetricRow,
  WearableWorkoutRow,
} from "./types.ts";

export interface SyncDevice {
  id: string;
  student_id: string;
  company_id: string;
  provider: ConnectableProvider;
}

export interface SyncResult {
  metrics: WearableMetricRow[];
  workouts: WearableWorkoutRow[];
  watermarks: Record<string, string>;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function incrementalStart(watermark: string | null, fallbackDays = 35) {
  return watermark
    ? new Date(new Date(watermark).getTime() - 86_400_000)
    : new Date(Date.now() - fallbackDays * 86_400_000);
}

export async function syncOura(
  device: SyncDevice,
  token: string,
  watermark: string | null,
  heartbeat?: () => Promise<void>,
): Promise<SyncResult> {
  const start = incrementalStart(watermark).toISOString().slice(0, 10);
  const end = new Date().toISOString().slice(0, 10);
  const metrics: WearableMetricRow[] = [];
  const workouts: WearableWorkoutRow[] = [];
  for (
    const resource of [
      "daily_sleep",
      "daily_readiness",
      "daily_activity",
      "sleep",
    ] as const
  ) {
    const url = new URL(
      `https://api.ouraring.com/v2/usercollection/${resource}`,
    );
    url.searchParams.set("start_date", start);
    url.searchParams.set("end_date", end);
    const records = await collectPages<Record<string, unknown>>(
      url.toString(),
      "next_token",
      (pageUrl) => requestJson(pageUrl, { headers: auth(token) }),
      40,
      heartbeat,
    );
    for (const item of records) {
      metrics.push(
        ...(resource === "sleep"
          ? normalizeOuraSleep(device, item)
          : normalizeOuraDaily(device, resource, item)),
      );
    }
  }
  const workoutUrl = new URL(
    "https://api.ouraring.com/v2/usercollection/workout",
  );
  workoutUrl.searchParams.set("start_date", start);
  workoutUrl.searchParams.set("end_date", end);
  const workoutRecords = await collectPages<Record<string, any>>(
    workoutUrl.toString(),
    "next_token",
    (pageUrl) => requestJson(pageUrl, { headers: auth(token) }),
    40,
    heartbeat,
  );
  for (const item of workoutRecords) {
    const startedAt = String(item.start_datetime ?? "");
    const externalId = String(item.id ?? "");
    if (!startedAt || !externalId) continue;
    const endedAt = item.end_datetime ? String(item.end_datetime) : null;
    const duration = endedAt
      ? Math.round(
        (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60_000,
      )
      : null;
    workouts.push({
      student_id: device.student_id,
      company_id: device.company_id,
      device_id: device.id,
      started_at: startedAt,
      ended_at: endedAt,
      local_date: String(item.day ?? startedAt.slice(0, 10)),
      timezone_offset_minutes: null,
      activity_type: String(item.activity ?? item.label ?? "activity"),
      duration_min: Number.isFinite(duration) ? duration : null,
      distance_km: item.distance == null ? null : Number(item.distance) / 1000,
      calories: item.calories == null ? null : Number(item.calories),
      avg_heart_rate: null,
      max_heart_rate: null,
      elevation_gain_m: null,
      avg_pace: null,
      strain: null,
      source: "oura",
      external_id: externalId,
      metadata: {},
    });
  }
  return {
    metrics: dedupeMetrics(metrics),
    workouts,
    watermarks: { oura: new Date().toISOString() },
  };
}

export async function syncWhoop(
  device: SyncDevice,
  token: string,
  watermark: string | null,
  heartbeat?: () => Promise<void>,
): Promise<SyncResult> {
  const start = incrementalStart(watermark).toISOString();
  const metrics: WearableMetricRow[] = [];
  const workouts: WearableWorkoutRow[] = [];
  const byKind: Record<"cycle" | "recovery" | "sleep", Record<string, any>[]> =
    {
      cycle: [],
      recovery: [],
      sleep: [],
    };
  for (
    const [path, kind] of [["cycle", "cycle"], ["activity/sleep", "sleep"], [
      "recovery",
      "recovery",
    ]] as const
  ) {
    const url = new URL(`https://api.prod.whoop.com/developer/v2/${path}`);
    url.searchParams.set("limit", "25");
    url.searchParams.set("start", start);
    byKind[kind] = await collectPages<Record<string, any>>(
      url.toString(),
      "nextToken",
      (pageUrl) => requestJson(pageUrl, { headers: auth(token) }),
      40,
      heartbeat,
    );
  }
  const cycleTime = new Map(
    byKind.cycle.map((
      item,
    ) => [String(item.id), {
      start: item.start,
      timezone_offset: item.timezone_offset,
    }]),
  );
  const sleepTime = new Map(
    byKind.sleep.map((
      item,
    ) => [String(item.id), {
      start: item.start,
      timezone_offset: item.timezone_offset,
    }]),
  );
  for (const item of byKind.cycle) {
    metrics.push(...normalizeWhoopRecord(device, "cycle", item));
  }
  for (const item of byKind.sleep) {
    metrics.push(...normalizeWhoopRecord(device, "sleep", item));
  }
  for (const item of byKind.recovery) {
    const temporal = cycleTime.get(String(item.cycle_id)) ??
      sleepTime.get(String(item.sleep_id)) ?? {};
    metrics.push(...normalizeWhoopRecord(device, "recovery", item, temporal));
  }
  const workoutUrl = new URL(
    "https://api.prod.whoop.com/developer/v2/activity/workout",
  );
  workoutUrl.searchParams.set("limit", "25");
  workoutUrl.searchParams.set("start", start);
  const workoutRecords = await collectPages<Record<string, unknown>>(
    workoutUrl.toString(),
    "nextToken",
    (pageUrl) => requestJson(pageUrl, { headers: auth(token) }),
    40,
    heartbeat,
  );
  for (const item of workoutRecords) {
    const workout = normalizeWhoopWorkout(device, item);
    if (workout) workouts.push(workout);
  }
  return {
    metrics: dedupeMetrics(metrics),
    workouts,
    watermarks: { whoop: new Date().toISOString() },
  };
}
