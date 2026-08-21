import { describe, expect, it } from "vitest";
import { planAdvancedMethods } from "../../../supabase/functions/_shared/prescription/advancedMethods.ts";

describe("advanced training methods", () => {
  it("emits a real antagonist superset, distinct from a biset", () => {
    const planned = planAdvancedMethods([
      { exercise_id: "press", exercise_name: "Supino Maquina", muscle_group: "peitoral", phase: "forca_especifica" },
      { exercise_id: "row", exercise_name: "Remada Baixa", muscle_group: "costas", phase: "forca_especifica" },
      { exercise_id: "curl", exercise_name: "Rosca Direta", muscle_group: "biceps", phase: "forca_especifica" },
    ], {
      mesocycle: "intensificacao",
      microcycle: "choque",
      level: "intermediario",
      week: 5,
      sessionKey: "a",
    });

    expect(planned[0].method).toBe("superset");
    expect(planned[1].method).toBe("superset");
    expect(planned[0].group_id).toBe(planned[1].group_id);
    expect(planned[0].method).not.toBe("biset");
  });

  it("does not invent an antagonist superset when muscle groups are missing or incompatible", () => {
    const planned = planAdvancedMethods([
      { exercise_id: "face", exercise_name: "Face Pull", muscle_group: "ombros", phase: "forca_especifica" },
      { exercise_id: "lat", exercise_name: "Puxada Frente", muscle_group: "costas", phase: "forca_especifica" },
    ], {
      mesocycle: "intensificacao",
      microcycle: "choque",
      level: "intermediario",
      week: 5,
      sessionKey: "b",
    });

    expect(planned.some((exercise) => exercise.method === "superset")).toBe(false);
  });
});
