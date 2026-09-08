import { describe, expect, it } from "vitest";
import {
  buildWorkoutOrderUnits,
  findWorkoutOrderUnitIndexByExerciseIndex,
  moveWorkoutOrderUnit,
  moveWorkoutOrderUnitByExerciseIndex,
} from "@/lib/workoutOrder";

const ex = (name: string, extra: Record<string, unknown> = {}) => ({
  exercise_name: name,
  exercise_order: 0,
  sets: 3,
  reps: "10",
  rest_seconds: 60,
  cues: "",
  ...extra,
});

const names = (items: Array<{ exercise_name: string }>) => items.map((item) => item.exercise_name);

describe("workout order helper", () => {
  it("moves an ungrouped exercise to the end", () => {
    const result = moveWorkoutOrderUnit([ex("A"), ex("B"), ex("C")], 0, 3);
    expect(names(result)).toEqual(["B", "C", "A"]);
    expect(result.map((item) => item.exercise_order)).toEqual([1, 2, 3]);
  });

  it("moves a grouped block to the end without losing method metadata or internal order", () => {
    const result = moveWorkoutOrderUnit([
      ex("A"),
      ex("B1", { group_id: "g1", method: "biset", method_seconds: null, rest_seconds: 45 }),
      ex("B2", { group_id: "g1", method: "biset", method_seconds: null, rest_seconds: 90 }),
      ex("C"),
    ], 1, 4);

    expect(names(result)).toEqual(["A", "C", "B1", "B2"]);
    expect(result.slice(2).map((item) => item.group_id)).toEqual(["g1", "g1"]);
    expect(result.slice(2).map((item) => item.method)).toEqual(["biset", "biset"]);
    expect(result.slice(2).map((item) => item.rest_seconds)).toEqual([45, 90]);
  });

  it("moves a grouped block to the beginning", () => {
    const result = moveWorkoutOrderUnit([
      ex("A"),
      ex("B1", { group_id: "g1", method: "triset" }),
      ex("B2", { group_id: "g1", method: "triset" }),
      ex("B3", { group_id: "g1", method: "triset" }),
      ex("C"),
    ], 1, 0);

    expect(names(result)).toEqual(["B1", "B2", "B3", "A", "C"]);
  });

  it("moves a grouped block into the middle with multiple blocks intact", () => {
    const result = moveWorkoutOrderUnit([
      ex("A1", { group_id: "ga", method: "superset" }),
      ex("A2", { group_id: "ga", method: "superset" }),
      ex("B"),
      ex("C1", { group_id: "gc", method: "circuito" }),
      ex("C2", { group_id: "gc", method: "circuito" }),
      ex("C3", { group_id: "gc", method: "circuito" }),
      ex("D"),
    ], 0, 2);

    expect(names(result)).toEqual(["B", "A1", "A2", "C1", "C2", "C3", "D"]);
    expect(result.filter((item) => item.group_id === "ga")).toHaveLength(2);
    expect(result.filter((item) => item.group_id === "gc")).toHaveLength(3);
  });

  it("treats no-op drops as idempotent apart from normalized exercise_order", () => {
    const original = [
      ex("A", { exercise_order: 9 }),
      ex("B1", { exercise_order: 3, group_id: "g1", method: "giantset" }),
      ex("B2", { exercise_order: 4, group_id: "g1", method: "giantset" }),
      ex("B3", { exercise_order: 5, group_id: "g1", method: "giantset" }),
      ex("B4", { exercise_order: 6, group_id: "g1", method: "giantset" }),
    ];
    const result = moveWorkoutOrderUnit(original, 1, 1);
    expect(names(result)).toEqual(names(original));
    expect(result.map((item) => item.exercise_order)).toEqual([1, 2, 3, 4, 5]);
  });

  it("moves arrows by block, not by isolated group member", () => {
    const result = moveWorkoutOrderUnitByExerciseIndex([
      ex("A"),
      ex("B1", { group_id: "g1", method: "biset" }),
      ex("B2", { group_id: "g1", method: "biset" }),
      ex("C"),
    ], 2, "down");

    expect(names(result)).toEqual(["A", "C", "B1", "B2"]);
    expect(result[2].group_id).toBe("g1");
    expect(result[3].group_id).toBe("g1");
  });

  it("builds ordered units for drag/drop handles and destination indicators", () => {
    const units = buildWorkoutOrderUnits([
      ex("A"),
      ex("B1", { group_id: "g1", method: "biset" }),
      ex("B2", { group_id: "g1", method: "biset" }),
      ex("C", { method: "dropset", group_id: null }),
    ]);

    expect(units.map((unit) => [unit.type, unit.startIndex, unit.endIndex, unit.items.length])).toEqual([
      ["exercise", 0, 0, 1],
      ["group", 1, 2, 2],
      ["exercise", 3, 3, 1],
    ]);
    expect(findWorkoutOrderUnitIndexByExerciseIndex(units.flatMap((unit) => unit.items), 2)).toBe(1);
  });
});
