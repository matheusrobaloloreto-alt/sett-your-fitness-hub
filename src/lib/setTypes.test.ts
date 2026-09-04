import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SET_TYPES, normalizeSetType, sanitizeSetTypes, sanitizeWorkoutSetTypes } from "./setTypes";
import { sanitizeTemplateExercise } from "./sendWorkoutTemplate";

describe("set type W/N/F contract", () => {
  it("exposes only warm-up, normal and failure", () => {
    expect(SET_TYPES).toEqual(["warmup", "normal", "failure"]);
  });

  it("fails legacy D/drop closed to normal while preserving length", () => {
    expect(normalizeSetType("drop")).toBe("normal");
    expect(sanitizeSetTypes(["warmup", "DROP", "failure", "unexpected"]))
      .toEqual(["warmup", "normal", "failure", "normal"]);
  });

  it("sanitizes template and weekly serialization without removing Drop-set method", () => {
    expect(sanitizeTemplateExercise({
      method: "dropset",
      set_types: ["normal", "drop"],
      weekly_prescription: [{ method: "dropset", set_types: ["drop", "failure"] }],
    })).toMatchObject({
      method: "dropset",
      set_types: ["normal", "normal"],
      weekly_prescription: [{ method: "dropset", set_types: ["normal", "failure"] }],
    });
  });

  it("drops malformed non-array set type payloads instead of forwarding them", () => {
    const sanitized = sanitizeTemplateExercise({ method: "dropset", set_types: "drop" });
    expect(sanitized.method).toBe("dropset");
    expect(sanitized.set_types).toBeUndefined();
  });

  it("sanitizes the exact workout structure loaded and saved by WorkoutBuilder", () => {
    const workouts = sanitizeWorkoutSetTypes([{
      title: "Treino legado",
      exercises: [{
        set_types: ["drop", "failure"],
        weekly_prescription: [{ set_types: ["warmup", "drop"] }],
      }],
    }]);
    expect(workouts[0].exercises[0]).toMatchObject({
      set_types: ["normal", "failure"],
      weekly_prescription: [{ set_types: ["warmup", "normal"] }],
    });
  });

  it("wires the sanitizer into every WorkoutBuilder persistence boundary", () => {
    const source = readFileSync(`${process.cwd()}/src/pages/admin/WorkoutBuilder.tsx`, "utf8");
    expect(source).toContain("setWorkouts(ws.length ? sanitizeWorkoutSetTypes(ws)");
    expect(source).toContain("workouts: sanitizeWorkoutSetTypes(workouts) as any");
    expect(source).toContain("setWorkouts(sanitizeWorkoutSetTypes(data.map");
    expect(source).toContain("const persistedWorkouts = sanitizeWorkoutSetTypes(workouts).map");
    expect(source).not.toContain("exercises: workout.exercises as any");
  });
});
