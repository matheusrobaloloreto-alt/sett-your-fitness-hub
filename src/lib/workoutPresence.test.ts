import { describe, expect, it } from "vitest";
import { filterMaterializedWorkouts, getWorkoutExerciseCount, hasWorkoutExercises } from "./workoutPresence";

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
});
