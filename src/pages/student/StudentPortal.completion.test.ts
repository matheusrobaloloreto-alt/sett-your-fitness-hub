import { describe, expect, it, vi } from "vitest";
import { runStudentPortalWorkoutCompletion } from "./StudentPortal";

const completedSession = {
  id: "session-1",
  workoutId: "workout-1",
  completedAt: "2026-09-10T12:00:00.000Z",
  durationSeconds: 900,
  totalVolume: 0,
  totalSetsCompleted: 0,
  totalSetsPrescribed: 3,
  exercisesSummary: [],
};

describe("StudentPortal workout completion", () => {
  it("does not finish or celebrate when saving logs fails", async () => {
    const finishSession = vi.fn().mockResolvedValue(completedSession);
    const onCompleted = vi.fn();

    const result = await runStudentPortalWorkoutCompletion({
      saveCurrentLogs: async () => ({ ok: false, reason: "rpc_error" as const }),
      finishSession,
      onCompleted,
    });

    expect(result).toEqual({ status: "save_failed", reason: "rpc_error" });
    expect(finishSession).not.toHaveBeenCalled();
    expect(onCompleted).not.toHaveBeenCalled();
  });

  it("publishes the completed session immediately after both persistence steps succeed", async () => {
    const finishSession = vi.fn().mockResolvedValue(completedSession);
    const onCompleted = vi.fn();

    const result = await runStudentPortalWorkoutCompletion({
      saveCurrentLogs: async () => ({ ok: true, reason: "no_changes" as const }),
      finishSession,
      onCompleted,
    });

    expect(result).toEqual({ status: "completed", session: completedSession });
    expect(finishSession).toHaveBeenCalledTimes(1);
    expect(onCompleted).toHaveBeenCalledWith(completedSession);
  });
});
