import { describe, expect, it } from "vitest";
import {
  assertCyclePrescriptionMutationSucceeded,
  assertCyclePrescriptionPreviewMatches,
  cyclePrescriptionContentCount,
  isCyclePrescriptionArchiveActionStale,
} from "./cyclePrescriptionArchiveUi";

describe("cyclePrescriptionArchiveUi", () => {
  it("accepts a matching preview and counts all active prescription surfaces", () => {
    const preview = assertCyclePrescriptionPreviewMatches({
      ok: true,
      student_id: "student-1",
      cycle_id: "cycle-1",
      content_signature: "signature-v1",
      active_workout_ids: ["workout-1"],
      active_workouts: 1,
      active_bundles: 1,
      active_strength_plans: 1,
      active_running_plans: 2,
    }, {
      studentId: "student-1",
      cycleId: "cycle-1",
    });

    expect(cyclePrescriptionContentCount(preview)).toBe(5);
    expect(preview.content_signature).toBe("signature-v1");
  });

  it("rejects stale preview payloads before a dialog can be opened", () => {
    expect(() => assertCyclePrescriptionPreviewMatches({
      ok: true,
      student_id: "other-student",
      cycle_id: "cycle-1",
      content_signature: "signature-v1",
      active_workouts: 1,
    }, {
      studentId: "student-1",
      cycleId: "cycle-1",
    })).toThrow("outro aluno");

    expect(() => assertCyclePrescriptionPreviewMatches({
      ok: true,
      student_id: "student-1",
      cycle_id: "other-cycle",
      content_signature: "signature-v1",
      active_workouts: 1,
    }, {
      studentId: "student-1",
      cycleId: "cycle-1",
    })).toThrow("outro ciclo");
  });

  it("rejects non-confirmed mutations before showing success", () => {
    expect(() => assertCyclePrescriptionMutationSucceeded(null, {
      studentId: "student-1",
      cycleId: "cycle-1",
    })).toThrow("não confirmou");

    expect(() => assertCyclePrescriptionMutationSucceeded({
      ok: true,
      student_id: "student-1",
      cycle_id: "other-cycle",
    }, {
      studentId: "student-1",
      cycleId: "cycle-1",
    })).toThrow("outro ciclo");
  });

  it("marks a pending action stale when the profile route changes", () => {
    expect(isCyclePrescriptionArchiveActionStale({
      studentId: "student-1",
      cycle: { id: "cycle-1" },
    }, "student-2")).toBe(true);

    expect(isCyclePrescriptionArchiveActionStale({
      studentId: "student-1",
      cycle: { id: "cycle-1" },
    }, "student-1")).toBe(false);
  });
});
