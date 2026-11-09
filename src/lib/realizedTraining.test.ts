import { describe, expect, it } from "vitest";
import { summarizeRealizedTraining, type RealizedLog, type RealizedSession } from "./realizedTraining";

const base = { studentId: "student", companyId: "tenant", start: "2026-11-02", end: "2026-11-08" };
const session = (id: string, fields: Partial<RealizedSession> = {}): RealizedSession => ({
  id, workout_id: "workout", status: "completed", session_date: base.end, duration_seconds: 120,
  total_volume: 1000, total_sets_completed: 1,
  exercises_summary: [{ name: "Historical", muscleGroup: "Peitoral", sets: [{ weight: 100, reps: 10 }] }],
  ...fields,
});
const log = (id: string, fields: Partial<RealizedLog> = {}): RealizedLog => ({
  id, workout_id: "legacy", session_date: base.start, weight: 50, reps_done: 10, completed: true, ...fields,
});

describe("shared realized training contract", () => {
  it("preserves confirmed series from interrupted or reconciled sessions without counting them as completions", () => {
    const result = summarizeRealizedTraining({
      ...base,
      sessions: [session("a"), session("a"), session("b", { status: "abandoned", workout_id: "abandoned" }),
        session("c", { status: "reconciled", workout_id: "superseded" }), session("d", { duplicate_of_session_id: "a" })],
      logs: [log("legacy"), log("legacy"), log("unfinished", { completed: false }),
        log("overlap", { workout_id: "workout", session_date: base.end, weight: 100 }),
        log("abandoned", { workout_id: "abandoned", session_date: base.end }),
        log("superseded", { workout_id: "superseded", session_date: base.end }),
        log("before", { session_date: "2026-11-01" }), log("future", { session_date: "2026-11-09" })],
    });
    expect(result).toMatchObject({
      totalVolume: 2500, legacyLogs: 3, overlappingLogs: 1, incompleteMuscles: true,
      days: [{ date: base.start, volume: 500, sessions: 0 }, { date: base.end, volume: 2000, sessions: 1 }],
      muscles: [{ group: "Peitoral", sets: 1, sessions: 1 }],
    });
    expect(result.sessions.map(row => row.id)).toEqual(["a", "b"]);
  });

  it("counts two distinct sessions on the same day and keeps an explicit zero", () => {
    const result = summarizeRealizedTraining({
      ...base,
      sessions: [session("a"), session("b", { total_volume: 0, total_sets_completed: 0, exercises_summary: [] })],
      logs: [log("overlap", { workout_id: "workout", session_date: base.end })],
    });
    expect(result.days).toEqual([{ date: base.end, volume: 1000, sessions: 2 }]);
    expect(result.incompleteLoad).toBe(false);
    expect(result.incompleteMuscles).toBe(false);
  });

  it("keeps twelve verified sets when session volume or workout identity is unavailable", () => {
    const result = summarizeRealizedTraining({ ...base, sessions: [
      session("unknown-volume", { total_volume: null }),
      session("unknown-workout", { workout_id: null }),
    ], logs: Array.from({ length: 12 }, (_, i) => log(String(i), {
      workout_id: "workout", session_date: base.end, weight: 20, reps_done: 10,
    })) });
    expect(result).toMatchObject({
      totalVolume: 2400, legacyLogs: 12, incompleteLoad: true,
      days: [{ date: base.end, volume: 2400, sessions: 2 }],
    });
  });

  it("distinguishes missing load from zero and refuses foreign nested muscle data", () => {
    const result = summarizeRealizedTraining({ ...base, logs: [log("zero", { weight: 0 })], sessions: [
      session("unknown", { total_volume: null, exercises_summary: [
        { company_id: "other", muscleGroup: "Peitoral", sets: [{ weight: 10, reps: 5 }] },
        { muscleGroup: "Peitoral", sets: [{ student_id: "other", weight: 10, reps: 5 }] },
      ] }),
    ] });
    expect(result).toMatchObject({
      incompleteLoad: true, incompleteMuscles: true, knownDays: 1, muscles: [],
      days: [{ date: base.start, volume: 0, sessions: 0 }, { date: base.end, volume: null, sessions: 1 }],
    });
  });
});
