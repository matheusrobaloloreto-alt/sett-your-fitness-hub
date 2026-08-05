import { describe, expect, it } from "vitest";
import {
  buildManualSessionSummary,
  manualSessionTrainerId,
  resolveManualPerformanceTrainerId,
  resolvePerformanceTrainerId,
  type TrainerAssignmentPeriod,
} from "./teamPerformance";

const at = new Date("2026-07-15T12:00:00.000Z");

const period = (overrides: Partial<TrainerAssignmentPeriod> = {}): TrainerAssignmentPeriod => ({
  student_id: "student-1",
  trainer_id: "trainer-history",
  assigned_at: "2026-06-01T00:00:00.000Z",
  unassigned_at: null,
  ...overrides,
});

describe("resolvePerformanceTrainerId", () => {
  it("keeps a valid historical trainer attribution", () => {
    expect(resolvePerformanceTrainerId({
      studentId: "student-1",
      at,
      history: [period()],
      currentTrainerId: "trainer-current",
      activeTrainerIds: new Set(["trainer-history", "trainer-current"]),
    })).toBe("trainer-history");
  });

  it("falls back to the current trainer when the historical account is inactive", () => {
    expect(resolvePerformanceTrainerId({
      studentId: "student-1",
      at,
      history: [period({ trainer_id: "legacy-account" })],
      currentTrainerId: "trainer-current",
      activeTrainerIds: new Set(["trainer-current"]),
    })).toBe("trainer-current");
  });

  it("uses the current trainer when no historical period covers the date", () => {
    expect(resolvePerformanceTrainerId({
      studentId: "student-1",
      at,
      history: [period({ unassigned_at: "2026-06-30T23:59:59.000Z" })],
      currentTrainerId: "trainer-current",
      activeTrainerIds: new Set(["trainer-current"]),
    })).toBe("trainer-current");
  });

  it("uses the most recent period when historical rows overlap", () => {
    expect(resolvePerformanceTrainerId({
      studentId: "student-1",
      at,
      history: [
        period({ trainer_id: "trainer-old" }),
        period({ trainer_id: "trainer-new", assigned_at: "2026-07-01T00:00:00.000Z" }),
      ],
      currentTrainerId: "trainer-current",
      activeTrainerIds: new Set(["trainer-old", "trainer-new", "trainer-current"]),
    })).toBe("trainer-new");
  });

  it("returns null rather than assigning performance to an invisible account", () => {
    expect(resolvePerformanceTrainerId({
      studentId: "student-1",
      at,
      history: [period({ trainer_id: "legacy-account" })],
      currentTrainerId: null,
      activeTrainerIds: new Set(["trainer-current"]),
    })).toBeNull();
  });
});

describe("manual workout attribution", () => {
  it("stores and reads the trainer selected in the performance card", () => {
    const summary = buildManualSessionSummary("trainer-selected");
    expect(manualSessionTrainerId(summary)).toBe("trainer-selected");
  });

  it("credits the selected trainer even when the student history points elsewhere", () => {
    expect(resolveManualPerformanceTrainerId({
      studentId: "student-1",
      at,
      history: [period({ trainer_id: "trainer-history" })],
      currentTrainerId: "trainer-history",
      activeTrainerIds: new Set(["trainer-selected", "trainer-history"]),
      exercisesSummary: buildManualSessionSummary("trainer-selected"),
    })).toBe("trainer-selected");
  });

  it("keeps the historical fallback for legacy manual entries", () => {
    expect(resolveManualPerformanceTrainerId({
      studentId: "student-1",
      at,
      history: [period({ trainer_id: "trainer-history" })],
      currentTrainerId: "trainer-current",
      activeTrainerIds: new Set(["trainer-history", "trainer-current"]),
      exercisesSummary: [],
    })).toBe("trainer-history");
  });
});
