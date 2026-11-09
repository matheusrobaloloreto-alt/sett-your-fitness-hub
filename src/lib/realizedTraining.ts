import { canonicalAnatomicalMuscleGroup } from "@/lib/anatomicalMuscleGroups";
import type { VolumeLogLike } from "@/lib/volumeStats";

export interface RealizedSession {
  id: string;
  status: string | null;
  workout_id: string | null;
  session_date: string | null;
  duplicate_of_session_id?: string | null;
  duration_seconds: number | null;
  total_volume: number | null;
  total_sets_completed?: number | null;
  exercises_summary?: unknown;
}

export interface RealizedLog extends Pick<VolumeLogLike, "completed" | "weight" | "reps_done" | "session_date"> {
  id: string;
  workout_id: string;
}

export const snapshotRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export const foreignSnapshot = (value: Record<string, unknown>, studentId: string, companyId: string) =>
  (value.student_id != null && value.student_id !== studentId) || (value.company_id != null && value.company_id !== companyId);

function nonnegative(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function summarizeRealizedTraining<T extends RealizedSession>({
  sessions, logs, studentId, companyId, start, end,
}: {
  sessions: readonly T[];
  logs: readonly RealizedLog[];
  studentId: string;
  companyId: string;
  start?: string;
  end: string;
}) {
  const inWindow = (date: string | null | undefined): date is string =>
    Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date) && (!start || date >= start) && date <= end);
  const inScope = [...new Map(sessions.filter(session => inWindow(session.session_date))
    .map(session => [session.id, session])).values()];
  const eligibleSessions = inScope.filter(session => !session.duplicate_of_session_id
    && ["completed", "abandoned", "in_progress"].includes(session.status ?? ""));
  const completed = eligibleSessions.filter(session => session.status === "completed");
  const workoutDay = (workout: string, date: string) => `${workout}:${date}`;
  // A completed snapshot with known load covers its workout/day. Interrupted
  // or reconciled sessions and unknown totals do not erase verified set logs.
  const reserved = new Set(completed.flatMap(session =>
    session.workout_id && nonnegative(session.total_volume) !== null
      ? [workoutDay(session.workout_id, session.session_date!)] : []));
  const uncoveredLogs = logs.filter(log => log.completed === true && inWindow(log.session_date)
    && !reserved.has(workoutDay(log.workout_id, log.session_date)));
  const uncoveredLogDays = new Set(uncoveredLogs.map(log => log.session_date));
  const seenLogs = new Set<string>();
  const days = new Map<string, { date: string; volume: number | null; sessions: number }>();
  const muscles = new Map<string, { sets: number; sessions: number }>();
  const addDay = (date: string, volume: number | null, sessions: number) => {
    const day = days.get(date) ?? { date, volume: null, sessions: 0 };
    if (volume !== null) day.volume = (day.volume ?? 0) + volume;
    day.sessions += sessions;
    days.set(date, day);
  };
  let incompleteLoad = false;
  let incompleteMuscles = false;
  for (const session of completed) {
    // With no workout identity, same-day uncovered logs may already represent
    // this total. Keep those identifiable logs and report partial coverage.
    const volume = !session.workout_id && uncoveredLogDays.has(session.session_date)
      ? null : nonnegative(session.total_volume);
    if (volume === null) incompleteLoad = true;
    addDay(session.session_date!, volume, 1);

    const byGroup = new Map<string, number>();
    let attributed = 0;
    const snapshot = session.exercises_summary;
    if (Array.isArray(snapshot)) {
      for (const item of snapshot) {
        const exercise = snapshotRecord(item);
        if (!exercise || foreignSnapshot(exercise, studentId, companyId)) continue;
        const group = canonicalAnatomicalMuscleGroup(exercise.muscleGroup);
        if (!group || !Array.isArray(exercise.sets)) continue;
        const sets = exercise.sets.filter(value => {
          const set = snapshotRecord(value);
          return set && !foreignSnapshot(set, studentId, companyId) &&
            nonnegative(set.weight) !== null && nonnegative(set.reps) !== null;
        }).length;
        if (sets) byGroup.set(group, (byGroup.get(group) ?? 0) + sets);
        attributed += sets;
      }
    }
    if ((!attributed && session.total_sets_completed !== 0)
      || (session.total_sets_completed != null && session.total_sets_completed !== attributed)) incompleteMuscles = true;
    for (const [group, sets] of byGroup) {
      const total = muscles.get(group) ?? { sets: 0, sessions: 0 };
      total.sets += sets;
      total.sessions += 1;
      muscles.set(group, total);
    }
  }

  let legacyLogs = 0;
  let overlappingLogs = 0;
  for (const log of logs) {
    if (log.completed !== true || !inWindow(log.session_date) || seenLogs.has(log.id)) continue;
    seenLogs.add(log.id);
    if (reserved.has(workoutDay(log.workout_id, log.session_date))) {
      overlappingLogs += 1;
      continue;
    }
    legacyLogs += 1;
    const weight = nonnegative(log.weight);
    const reps = nonnegative(log.reps_done);
    if (weight === null || reps === null) incompleteLoad = true;
    addDay(log.session_date, weight === null || reps === null ? null : weight * reps, 0);
  }

  const knownDays = [...days.values()].filter(day => day.volume !== null);
  return {
    sessions: eligibleSessions,
    completed,
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    totalVolume: knownDays.reduce((sum, day) => sum + (day.volume ?? 0), 0),
    knownDays: knownDays.length,
    muscles: [...muscles].map(([group, counts]) => ({ group, ...counts })),
    legacyLogs,
    overlappingLogs,
    incompleteLoad,
    incompleteMuscles: incompleteMuscles || legacyLogs > 0,
  };
}
