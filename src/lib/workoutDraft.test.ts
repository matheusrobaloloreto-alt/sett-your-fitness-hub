import { describe, expect, it, vi } from "vitest";
import {
  mergeWorkoutDraftLogs,
  readWorkoutUiDraft,
  resolveWorkoutResumeTarget,
  workoutUiDraftKey,
  writeWorkoutUiDraft,
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
});
