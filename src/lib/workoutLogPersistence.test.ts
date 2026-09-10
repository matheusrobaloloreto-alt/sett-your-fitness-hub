import { describe, expect, it, vi } from "vitest";
import { saveWorkoutLogBatchIfCurrent } from "./workoutLogPersistence";

const rows = [{ workout_id: "workout-1", exercise_index: 0, set_number: 1 }];

describe("workout log persistence boundary", () => {
  it("returns rpc_error after bounded retries instead of allowing completion", async () => {
    const save = vi.fn().mockResolvedValue({ data: null, error: new Error("offline") });

    const result = await saveWorkoutLogBatchIfCurrent({ rows, save, wait: async () => undefined });

    expect(result).toMatchObject({ ok: false, reason: "rpc_error" });
    expect(save).toHaveBeenCalledTimes(3);
  });

  it("returns conflict when compare-and-swap rejects any row", async () => {
    const data = { saved: [], conflicts: [{ workout_id: "workout-1", revision: 2 }] };

    const result = await saveWorkoutLogBatchIfCurrent({
      rows,
      save: async () => ({ data, error: null }),
      wait: async () => undefined,
    });

    expect(result).toEqual({ ok: false, reason: "conflict", data });
  });

  it("returns saved or no_changes only when persistence is safe", async () => {
    const data = { saved: [{ workout_id: "workout-1", revision: 1 }], conflicts: [] };
    const save = vi.fn().mockResolvedValue({ data, error: null });

    await expect(saveWorkoutLogBatchIfCurrent({ rows, save })).resolves.toEqual({ ok: true, reason: "saved", data });
    await expect(saveWorkoutLogBatchIfCurrent({ rows: [], save })).resolves.toEqual({ ok: true, reason: "no_changes", data: null });
    expect(save).toHaveBeenCalledTimes(1);
  });
});
