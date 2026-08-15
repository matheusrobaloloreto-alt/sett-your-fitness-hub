import type {
  ConnectableProvider,
  WearableMetricRow,
  WearableWorkoutRow,
} from "./types.ts";

interface DeviceIdentity {
  id: string;
  student_id: string;
  company_id: string;
  provider: ConnectableProvider;
}

function finite(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function timezoneOffsetMinutes(value: unknown) {
  const text = String(value ?? "");
  if (text === "Z") return 0;
  const match = text.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) return null;
  const total = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -total : total;
}

export function localDate(instant: unknown, offset: unknown) {
  const date = new Date(String(instant ?? ""));
  if (Number.isNaN(date.getTime())) return null;
  const minutes = timezoneOffsetMinutes(offset) ?? 0;
  return new Date(date.getTime() + minutes * 60_000).toISOString().slice(0, 10);
}

function metric(
  device: DeviceIdentity,
  date: string,
  recordedAt: string | null,
  offset: number | null,
  name: string,
  value: unknown,
  unit: string,
  state: string | null,
  externalId: string | null,
  metadata: Record<string, unknown> = {},
): WearableMetricRow {
  return {
    student_id: device.student_id,
    company_id: device.company_id,
    device_id: device.id,
    date,
    recorded_at: recordedAt,
    timezone_offset_minutes: offset,
    metric: name,
    value: state && state !== "SCORED" ? null : finite(value),
    unit,
    score_state: state,
    source: device.provider,
    external_id: externalId,
    metadata,
  };
}

export function normalizeWhoopRecord(
  device: DeviceIdentity,
  resource: "cycle" | "recovery" | "sleep",
  item: Record<string, any>,
  temporal: { start?: string; timezone_offset?: string } = {},
) {
  const providerOffset = item.timezone_offset ?? temporal.timezone_offset;
  const offset = timezoneOffsetMinutes(providerOffset);
  const recordedAt = String(
    item.start ?? temporal.start ?? item.updated_at ?? item.created_at ?? "",
  ) || null;
  const date = localDate(recordedAt, providerOffset) ??
    String(item.created_at ?? "").slice(0, 10);
  const state = String(item.score_state ?? "UNSCORABLE");
  const score = item.score ?? {};
  const external = String(item.id ?? item.cycle_id ?? item.sleep_id ?? "") ||
    null;
  if (!date) return [];
  if (resource === "cycle") {
    return [
      metric(
        device,
        date,
        recordedAt,
        offset,
        "strain",
        score.strain,
        "whoop_0_21",
        state,
        external,
      ),
      metric(
        device,
        date,
        recordedAt,
        offset,
        "average_heart_rate",
        score.average_heart_rate,
        "bpm",
        state,
        external,
      ),
    ];
  }
  if (resource === "recovery") {
    return [
      metric(
        device,
        date,
        recordedAt,
        offset,
        "recovery_score",
        score.recovery_score,
        "percent",
        state,
        external,
      ),
      metric(
        device,
        date,
        recordedAt,
        offset,
        "resting_heart_rate",
        score.resting_heart_rate,
        "bpm",
        state,
        external,
      ),
      metric(
        device,
        date,
        recordedAt,
        offset,
        "hrv_rmssd",
        score.hrv_rmssd_milli,
        "ms",
        state,
        external,
      ),
      metric(
        device,
        date,
        recordedAt,
        offset,
        "spo2",
        score.spo2_percentage,
        "percent",
        state,
        external,
      ),
    ];
  }
  return [
    metric(
      device,
      date,
      recordedAt,
      offset,
      "sleep_performance",
      score.sleep_performance_percentage,
      "percent",
      state,
      external,
      { nap: Boolean(item.nap) },
    ),
    metric(
      device,
      date,
      recordedAt,
      offset,
      "sleep_efficiency",
      score.sleep_efficiency_percentage,
      "percent",
      state,
      external,
      { nap: Boolean(item.nap) },
    ),
    metric(
      device,
      date,
      recordedAt,
      offset,
      "sleep_duration",
      finite(score.stage_summary?.total_in_bed_time_milli) === null
        ? null
        : Number(score.stage_summary.total_in_bed_time_milli) / 3_600_000,
      "hours",
      state,
      external,
      { nap: Boolean(item.nap) },
    ),
  ];
}

export function normalizeWhoopWorkout(
  device: DeviceIdentity,
  item: Record<string, any>,
): WearableWorkoutRow | null {
  const startedAt = String(item.start ?? "");
  const date = localDate(startedAt, item.timezone_offset);
  const externalId = String(item.id ?? "");
  if (!startedAt || !date || !externalId) return null;
  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(String(item.end ?? "")).getTime();
  const score = item.score_state === "SCORED" ? item.score ?? {} : {};
  return {
    student_id: device.student_id,
    company_id: device.company_id,
    device_id: device.id,
    started_at: startedAt,
    ended_at: item.end ? String(item.end) : null,
    local_date: date,
    timezone_offset_minutes: timezoneOffsetMinutes(item.timezone_offset),
    activity_type: String(item.sport_name ?? "activity"),
    duration_min: Number.isFinite(startMs) && Number.isFinite(endMs)
      ? Math.round((endMs - startMs) / 60_000)
      : null,
    distance_km: finite(score.distance_meter) === null
      ? null
      : Number(score.distance_meter) / 1000,
    calories: null,
    avg_heart_rate: finite(score.average_heart_rate),
    max_heart_rate: finite(score.max_heart_rate),
    elevation_gain_m: finite(score.altitude_gain_meter),
    avg_pace: null,
    strain: finite(score.strain),
    source: device.provider,
    external_id: externalId,
    metadata: { score_state: String(item.score_state ?? "UNSCORABLE") },
  };
}

export function normalizeOuraDaily(
  device: DeviceIdentity,
  resource: string,
  item: Record<string, any>,
) {
  const names: Record<string, string> = {
    daily_sleep: "sleep_score",
    daily_readiness: "readiness_score",
    daily_activity: "activity_score",
  };
  if (!item.day || !names[resource]) return [];
  return [
    metric(
      device,
      String(item.day),
      null,
      null,
      names[resource],
      item.score,
      "percent",
      item.score == null ? "UNSCORABLE" : "SCORED",
      String(item.id ?? item.day),
    ),
  ];
}

export function normalizeOuraSleep(
  device: DeviceIdentity,
  item: Record<string, any>,
) {
  const date = String(item.day ?? "");
  if (!date) return [];
  const id = String(item.id ?? date);
  return [
    metric(
      device,
      date,
      item.bedtime_end ? String(item.bedtime_end) : null,
      null,
      "resting_heart_rate",
      item.lowest_heart_rate,
      "bpm",
      item.lowest_heart_rate == null ? "UNSCORABLE" : "SCORED",
      id,
      { sleep_type: item.type ?? null },
    ),
    metric(
      device,
      date,
      item.bedtime_end ? String(item.bedtime_end) : null,
      null,
      "hrv_rmssd",
      item.average_hrv,
      "ms",
      item.average_hrv == null ? "UNSCORABLE" : "SCORED",
      id,
      { sleep_type: item.type ?? null },
    ),
    metric(
      device,
      date,
      item.bedtime_end ? String(item.bedtime_end) : null,
      null,
      "sleep_duration",
      finite(item.total_sleep_duration) === null
        ? null
        : Number(item.total_sleep_duration) / 3600,
      "hours",
      item.total_sleep_duration == null ? "UNSCORABLE" : "SCORED",
      id,
      { sleep_type: item.type ?? null },
    ),
  ];
}

export function dedupeMetrics<
  T extends {
    device_id: string;
    date: string;
    metric: string;
    score_state: string | null;
    value: number | null;
    recorded_at: string | null;
    metadata: Record<string, unknown>;
  },
>(rows: T[]) {
  const selected = new Map<string, T>();
  const rank = (candidate: T) => {
    const scored =
      candidate.score_state === "SCORED" && candidate.value !== null ? 100 : 0;
    const mainSleep = candidate.metadata.nap === false ||
        candidate.metadata.sleep_type === "long_sleep"
      ? 20
      : 0;
    const duration = candidate.metric === "sleep_duration"
      ? Number(candidate.value ?? 0)
      : 0;
    const recency = new Date(candidate.recorded_at ?? 0).getTime() / 1e15;
    return scored + mainSleep + duration +
      (Number.isFinite(recency) ? recency : 0);
  };
  for (const row of rows) {
    const key = `${row.device_id}:${row.date}:${row.metric}`;
    const current = selected.get(key);
    if (!current || rank(row) > rank(current)) selected.set(key, row);
  }
  return [...selected.values()];
}
