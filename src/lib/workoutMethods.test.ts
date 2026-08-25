import { describe, expect, it } from "vitest";
import { GROUPING_METHODS, SINGLE_METHODS, WORKOUT_METHODS } from "./workoutMethods";

describe("workout method catalog", () => {
  it("keeps exactly the eleven implemented automatic methods in Studio/portal metadata", () => {
    expect([...GROUPING_METHODS, ...SINGLE_METHODS].sort()).toEqual([
      "biset", "triset", "superset", "giantset", "circuito",
      "dropset", "restpause", "cluster", "isometria", "pico_contracao", "pico_alongamento",
    ].sort());
  });

  it("uses semantically distinct minimum arity for grouping methods", () => {
    expect(WORKOUT_METHODS.biset.minItems).toBe(2);
    expect(WORKOUT_METHODS.superset.minItems).toBe(2);
    expect(WORKOUT_METHODS.triset.minItems).toBe(3);
    expect(WORKOUT_METHODS.circuito.minItems).toBe(3);
    expect(WORKOUT_METHODS.giantset.minItems).toBe(4);
    expect(WORKOUT_METHODS.giantset.label).toBe("Série gigante");
  });
});
