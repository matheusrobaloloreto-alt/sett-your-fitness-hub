import { describe, expect, it, vi } from "vitest";
import {
  mergeWorkoutDraftLogs,
  readWorkoutUiDraft,
  reconcileWorkoutLogResponse,
  removeAndRenumberWorkoutSet,
  resolveWorkoutResumeTarget,
  workoutUiDraftKey,
  writeWorkoutUiDraft,
  workoutLogTombstoneKey,
} from "./workoutDraft";

describe("workout draft persistence", () => {
  it("restores the exact workout, open exercise and added sets", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    vi.spyOn(Date, "now").mockReturnValue(1234);
    const key = workoutUiDraftKey("student-1", "2026-08-14");

    writeWorkoutUiDraft(storage, key, {
      cycleId: "cycle-3",
      workoutId: "workout-c",
      expandedExercise: 4,
      activeView: "treino",
      extraSets: { 4: 1 },
    });

    expect(readWorkoutUiDraft(storage, key)).toEqual({
      cycleId: "cycle-3",
      workoutId: "workout-c",
      expandedExercise: 4,
      activeView: "treino",
      extraSets: { 4: 1 },
      updatedAt: 1234,
    });
  });

  it("keeps the newer local value when the server still has the old set", () => {
    expect(mergeWorkoutDraftLogs(
      {
        set1: { completed: false, weight: 20, revision: 1 },
        set2: { completed: true, weight: 10, revision: 1 },
      },
      { set1: { completed: true, weight: 22, revision: 1, dirty: true } },
    )).toEqual({
      set1: { completed: true, weight: 22, revision: 1, dirty: true },
      set2: { completed: true, weight: 10, revision: 1 },
    });
  });

  it("keeps a newer server revision instead of replaying an old local backup", () => {
    expect(mergeWorkoutDraftLogs(
      { set1: { completed: true, weight: 30, revision: 3, updated_at: "2026-08-14T12:00:00Z" } },
      { set1: { completed: false, weight: 20, revision: 2, dirty: true, client_updated_at: "2026-08-14T13:00:00Z" } },
    )).toEqual({
      set1: { completed: true, weight: 30, revision: 3, updated_at: "2026-08-14T12:00:00Z" },
    });
  });

  it("rebases an edit made during a conflicting request and keeps it dirty for retry", () => {
    const sent = {
      id: "log-1",
      weight: 20,
      completed: true,
      revision: 1,
      client_updated_at: "2026-08-14T12:00:00Z",
      dirty: true,
    };
    const current = {
      ...sent,
      weight: 25,
      client_updated_at: "2026-08-14T12:00:02Z",
    };
    const server = {
      id: "log-1",
      weight: 30,
      completed: true,
      revision: 3,
      updated_at: "2026-08-14T12:00:01Z",
    };

    expect(reconcileWorkoutLogResponse(current, sent, server)).toEqual({
      ...server,
      ...current,
      revision: 3,
      updated_at: "2026-08-14T12:00:01Z",
      dirty: true,
    });
  });

  it("gives an active session precedence over an older draft from another workout", () => {
    expect(resolveWorkoutResumeTarget("workout-active", {
      cycleId: "cycle-old",
      workoutId: "workout-old",
      expandedExercise: 4,
      activeView: "treino",
      extraSets: { 4: 2 },
      updatedAt: 100,
    })).toEqual({
      source: "active_session",
      workoutId: "workout-active",
      cycleId: null,
      expandedExercise: null,
      extraSets: {},
    });
  });

  it("ignores corrupt or incomplete drafts", () => {
    expect(readWorkoutUiDraft({ getItem: () => "{" }, "draft")).toBeNull();
    expect(readWorkoutUiDraft({ getItem: () => JSON.stringify({ cycleId: "cycle" }) }, "draft")).toBeNull();
  });

  it("persists removal and renumbering as CAS tombstones plus clean inserts", () => {
    const logs = {
      "workout-1-0-1": { id: "one", workout_id: "workout-1", exercise_index: 0, set_number: 1, revision: 2, weight: 10 },
      "workout-1-0-4": { id: "four", workout_id: "workout-1", exercise_index: 0, set_number: 4, revision: 4, weight: 20 },
      "workout-1-0-5": { id: "five", workout_id: "workout-1", exercise_index: 0, set_number: 5, revision: 1, weight: 30 },
    };
    const next = removeAndRenumberWorkoutSet(logs, "workout-1", 0, 4, 5, "2026-08-14T12:00:00Z");
    expect(next[workoutLogTombstoneKey("workout-1-0-4")]).toMatchObject({ deleted: true, revision: 4 });
    expect(next[workoutLogTombstoneKey("workout-1-0-5")]).toMatchObject({ deleted: true, revision: 1 });
    expect(next["workout-1-0-4"]).toMatchObject({ set_number: 4, weight: 30, dirty: true, deleted: false });
    expect(next["workout-1-0-4"]).not.toHaveProperty("id");
    expect(next["workout-1-0-4"]).not.toHaveProperty("revision");
  });

  it("keeps a pending delete plus renumber transaction together after reload", () => {
    const server = {
      "workout-1-0-4": { id: "four", workout_id: "workout-1", exercise_index: 0, set_number: 4, revision: 4, weight: 20 },
      "workout-1-0-5": { id: "five", workout_id: "workout-1", exercise_index: 0, set_number: 5, revision: 1, weight: 30 },
    };
    const local = removeAndRenumberWorkoutSet(server, "workout-1", 0, 4, 5, "2026-08-14T12:00:00Z");
    const restored = mergeWorkoutDraftLogs(server, local);

    expect(restored[workoutLogTombstoneKey("workout-1-0-4")]).toMatchObject({ deleted: true, revision: 4 });
    expect(restored[workoutLogTombstoneKey("workout-1-0-5")]).toMatchObject({ deleted: true, revision: 1 });
    expect(restored["workout-1-0-4"]).toMatchObject({ weight: 30, set_number: 4, dirty: true });
  });
});
