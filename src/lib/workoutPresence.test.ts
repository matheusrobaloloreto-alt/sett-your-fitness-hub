import { describe, expect, it } from "vitest";
import { filterMaterializedWorkouts, getWorkoutExerciseCount, hasWorkoutExercises, orderWorkoutsByPrescription } from "./workoutPresence";

describe("workoutPresence", () => {
  it("treats only workouts with exercise arrays containing items as materialized", () => {
    const workouts = [
      { id: "empty", exercises: [] },
      { id: "missing" },
      { id: "invalid", exercises: { exercise_id: "x" } },
      { id: "real", exercises: [{ exercise_id: "x" }] },
    ];

    expect(hasWorkoutExercises(workouts[0])).toBe(false);
    expect(getWorkoutExerciseCount(workouts[3])).toBe(1);
    expect(filterMaterializedWorkouts(workouts).map((workout) => workout.id)).toEqual(["real"]);
  });

  it("keeps prescription order even when workout titles sort differently", () => {
    const workouts = [
      { id: "later", title: "Treino A", sort_order: 4 },
      { id: "first", title: "Treino Z", sort_order: 1 },
    ];

    expect(orderWorkoutsByPrescription(workouts).map((workout) => workout.id)).toEqual(["first", "later"]);
  });

  it("preserves database order for legacy rows without sort_order", () => {
    const workouts = [
      { id: "z", title: "Treino Z", sort_order: null },
      { id: "a", title: "Treino A" },
    ];

    expect(orderWorkoutsByPrescription(workouts).map((workout) => workout.id)).toEqual(["z", "a"]);
  });
});
