import { describe, expect, it, vi } from "vitest";
import { buildExerciseTargetPayload, replaceExerciseMuscleTargets } from "./exerciseTargetConfig";

describe("buildExerciseTargetPayload", () => {
  it("keeps role and is_primary coherent for primary and secondary targets", () => {
    expect(buildExerciseTargetPayload(["chest"], ["chest", "triceps"])).toEqual([
      { muscle_group_id: "chest", role: "primary", is_primary: true, volume_percentage: 100 },
      { muscle_group_id: "triceps", role: "secondary", is_primary: false, volume_percentage: 50 },
    ]);
  });

  it("fails closed without a primary target", () => {
    expect(() => buildExerciseTargetPayload([], ["triceps"])).toThrow(/primário/);
  });
});

describe("replaceExerciseMuscleTargets", () => {
  it("uses the atomic RPC and surfaces failure without a fallback delete", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "transaction rolled back" } });
    await expect(replaceExerciseMuscleTargets({ rpc }, "exercise-1", [
      { muscle_group_id: "chest", role: "primary", is_primary: true, volume_percentage: 100 },
    ])).rejects.toThrow("transaction rolled back");
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0][0]).toBe("replace_exercise_muscle_targets");
  });
});
