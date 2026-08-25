import { describe, expect, it } from "vitest";
import { resolveWorkoutSelectionAfterReload } from "@/lib/studentWorkoutReload";

describe("student workout reload", () => {
  const workouts = [
    { id: "workout-a", day_of_week: 1 },
    { id: "workout-b", day_of_week: 3 },
  ];

  it("keeps Treino B selected when a background reload returns the same cycle", () => {
    expect(resolveWorkoutSelectionAfterReload("workout-b", workouts, 1)).toBe("workout-b");
  });

  it("falls back to today's workout only when the previous selection no longer exists", () => {
    expect(resolveWorkoutSelectionAfterReload("removed", workouts, 1)).toBe("workout-a");
  });

  it("falls back to the first workout when there is no selection or workout for today", () => {
    expect(resolveWorkoutSelectionAfterReload(null, workouts, 5)).toBe("workout-a");
  });
});
