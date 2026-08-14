import { describe, expect, it, vi } from "vitest";
import {
  mergeWorkoutDraftLogs,
  readWorkoutUiDraft,
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
      { set1: { completed: false, weight: 20 }, set2: { completed: true, weight: 10 } },
      { set1: { completed: true, weight: 22 } },
    )).toEqual({
      set1: { completed: true, weight: 22 },
      set2: { completed: true, weight: 10 },
    });
  });

  it("ignores corrupt or incomplete drafts", () => {
    expect(readWorkoutUiDraft({ getItem: () => "{" }, "draft")).toBeNull();
    expect(readWorkoutUiDraft({ getItem: () => JSON.stringify({ cycleId: "cycle" }) }, "draft")).toBeNull();
  });
});
