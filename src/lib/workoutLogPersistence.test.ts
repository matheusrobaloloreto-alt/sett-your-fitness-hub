import { describe, expect, it, vi } from "vitest";
import { createWorkoutLogSaveQueue, saveWorkoutLogBatchIfCurrent } from "./workoutLogPersistence";

const rows = [{ workout_id: "workout-1", exercise_index: 0, set_number: 1 }];

describe("workout log persistence boundary", () => {
  it("serializes autosave and finish-save so they cannot race on the same revision", async () => {
    const queue = createWorkoutLogSaveQueue();
    const order: string[] = [];
    let releaseAutosave!: () => void;
    const autosaveGate = new Promise<void>((resolve) => { releaseAutosave = resolve; });

    const autosave = queue.run(async () => {
      order.push("autosave:start");
      await autosaveGate;
      order.push("autosave:end");
      return "autosave";
    });
    const finishSave = queue.run(async () => {
      order.push("finish:start");
      order.push("finish:end");
      return "finish";
    });

    await vi.waitFor(() => expect(order).toEqual(["autosave:start"]));

    releaseAutosave();
    await expect(Promise.all([autosave, finishSave])).resolves.toEqual(["autosave", "finish"]);
    expect(order).toEqual(["autosave:start", "autosave:end", "finish:start", "finish:end"]);
  });

  it("continues the queue after a failed save", async () => {
    const queue = createWorkoutLogSaveQueue();

    await expect(queue.run(async () => { throw new Error("offline"); })).rejects.toThrow("offline");
    await expect(queue.run(async () => "recovered")).resolves.toBe("recovered");
  });

  it("settles rejected network requests so the save button can leave its pending state", async () => {
    const save = vi.fn().mockRejectedValue(new Error("network disconnected"));
    await expect(saveWorkoutLogBatchIfCurrent({ rows, save, wait: async () => undefined }))
      .resolves.toMatchObject({ ok: false, reason: "rpc_error" });
    expect(save).toHaveBeenCalledTimes(3);
  });
  it("returns rpc_error after bounded retries instead of allowing completion", async () => {
    const save = vi.fn().mockResolvedValue({ data: null, error: new Error("offline") });

    const result = await saveWorkoutLogBatchIfCurrent({ rows, save, wait: async () => undefined });

    expect(result).toMatchObject({ ok: false, reason: "rpc_error" });
    expect(save).toHaveBeenCalledTimes(3);
  });

  it.each(["22P02", "42501", "P0001", "PGRST301"])("does not retry permanent %s failures", async (code) => {
    const error = { code, message: "invalid payload or denied" };
    const save = vi.fn().mockResolvedValue({ data: null, error });
    const wait = vi.fn();
    await expect(saveWorkoutLogBatchIfCurrent({ rows, save, wait }))
      .resolves.toEqual({ ok: false, reason: "rpc_error", error });
    expect(save).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it.each(["40001", "40P01", "55P03", "57014"])("retries transient %s failures", async (code) => {
    const data = { saved: [{ ...rows[0], revision: 2 }], conflicts: [] };
    const save = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code } })
      .mockResolvedValueOnce({ data, error: null });
    await expect(saveWorkoutLogBatchIfCurrent({ rows, save, wait: async () => undefined }))
      .resolves.toEqual({ ok: true, reason: "saved", data });
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("confirms an idempotent replay after the commit response is lost", async () => {
    const savedRow = { ...rows[0], weight: 8, reps_done: 8, rpe: 9.5, revision: 5 };
    const data = { saved: [savedRow], conflicts: [] };
    const save = vi.fn()
      .mockRejectedValueOnce(new TypeError("response lost after commit"))
      .mockResolvedValueOnce({ data, error: null });
    await expect(saveWorkoutLogBatchIfCurrent({ rows, save, wait: async () => undefined }))
      .resolves.toEqual({ ok: true, reason: "saved", data });
    expect(save).toHaveBeenCalledTimes(2);
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
