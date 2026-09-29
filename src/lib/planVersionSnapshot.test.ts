import { describe, expect, it } from "vitest";
import { historicalExerciseMetrics, historicalWeeks, readPlanVersionWorkouts } from "./planVersionSnapshot";

describe("historical plan snapshots", () => {
  it("clones complete legacy and weekly content without migrating or losing extra fields", () => {
    const plan = { revision_id: "old", workouts: [{ title: "Treino A", exercises: [{
      exercise_id: "legacy", sets: "3", reps: "8, 6, 4", rest: "75s", mfit_protocol: { scheme: "piramide" },
    }, { exercise_id: "weekly", weekly_ui_version: "individual-weeks-v1", weekly_prescription: [{
      week: 1, sets: 2, tempo: "3010", rest_seconds: 0, method: null, set_types: ["warmup", "failure"],
    }] }] }] };
    const original = JSON.stringify(plan);
    const result = readPlanVersionWorkouts(plan);
    expect(result.error).toBeNull();
    expect(result.workouts).toEqual(plan.workouts);
    result.workouts[0].exercises[1].weekly_ui_version = "changed";
    expect(JSON.stringify(plan)).toBe(original);
    expect(result.workouts[0].exercises[0]).not.toHaveProperty("weekly_prescription");
  });

  it.each([null, {}, { workouts: "not-an-array" }, { workouts: [null] }, { workouts: [{ exercises: [null] }] }])(
    "fails safely for malformed snapshots %j", (plan) => {
      expect(readPlanVersionWorkouts(plan)).toMatchObject({ workouts: [], error: expect.any(String) });
    },
  );

  it("shows only stored weeks and preserves zero rest and explicit straight sets", () => {
    const { workouts } = readPlanVersionWorkouts({ workouts: [{ exercises: [{ sets: "9", method: "dropset", weekly_prescription: [
      { week: 3, sets: 4, reps: "10", rest_seconds: 0, method: null, tempo: "2020", instruction: "Semana três", set_types: ["warmup", "normal", "failure", "failure"] },
      { week: 1, sets: 2 }, { week: "invalid" },
    ] }] }] });
    expect(historicalWeeks(workouts)).toEqual([1, 3]);
    expect(historicalExerciseMetrics(workouts[0].exercises[0], 3)).toMatchObject({ sets: "4", rest: "0s", method: "", tempo: "2020", notes: "Semana três" });
    expect(historicalExerciseMetrics(workouts[0].exercises[0], 2).missingWeek).toBe(true);
  });
});
