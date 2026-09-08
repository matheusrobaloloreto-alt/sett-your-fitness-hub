import { describe, expect, it } from "vitest";
import {
  resolveManualPrescriptionTargetCycle,
  routeBasePathForRole,
  studentProfileReturnPath,
  workoutBuilderUrl,
  type ManualPrescriptionCycle,
} from "./manualPrescriptionNavigation";

const cycle = (overrides: Partial<ManualPrescriptionCycle>): ManualPrescriptionCycle => ({
  id: "cycle-current-empty",
  cycle_number: 1,
  start_date: "2026-09-01",
  end_date: "2026-10-12",
  has_workout: false,
  ...overrides,
});

describe("manual prescription navigation", () => {
  it("routes every staff role to WorkoutBuilder with the student profile as returnTo", () => {
    expect(routeBasePathForRole("admin")).toBe("/admin");
    expect(routeBasePathForRole("master")).toBe("/admin");
    expect(routeBasePathForRole("coordinator")).toBe("/coordinator");
    expect(routeBasePathForRole("trainer")).toBe("/trainer");
    expect(studentProfileReturnPath("trainer", "student-1")).toBe("/trainer/students/student-1");
    expect(workoutBuilderUrl({ role: "coordinator", studentId: "student-1", cycleId: "cycle-1" })).toBe(
      "/coordinator/workout/cycle-1?returnTo=%2Fcoordinator%2Fstudents%2Fstudent-1",
    );
  });

  it("opens the requested empty cycle so the builder starts a manual draft without creating cycles on profile view", () => {
    const selected = cycle({ id: "cycle-future-empty", cycle_number: 2, start_date: "2026-10-01" });
    const visible = cycle({ id: "cycle-current-with-workout", has_workout: true });

    expect(resolveManualPrescriptionTargetCycle(selected, visible, "2026-09-08")).toBe(selected);
  });

  it("redirects historical edits with materialized workouts to the cycle currently visible to the student", () => {
    const selected = cycle({ id: "cycle-old-with-workout", cycle_number: 1, start_date: "2026-08-01", has_workout: true });
    const visible = cycle({ id: "cycle-visible-with-workout", cycle_number: 2, start_date: "2026-09-01", has_workouts: true });

    expect(resolveManualPrescriptionTargetCycle(selected, visible, "2026-09-08")).toBe(visible);
  });
});
