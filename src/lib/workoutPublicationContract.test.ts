import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const studio = readFileSync("src/pages/admin/PrescriptionStudio.tsx", "utf8");
const portal = readFileSync("src/pages/student/StudentPortal.tsx", "utf8");
const workout = readFileSync("src/pages/student/StudentWorkout.tsx", "utf8");

describe("workout publication and ordering contract", () => {
  it("materializes generated strength plans for the current cycle without a second click", () => {
    expect(studio).toContain("const shouldMaterializeStrength = Boolean(strengthPlan)");
    expect(studio).not.toContain('scheduleMode === "remaining" || !isCycleCurrent(cycle)');
  });

  it("loads and applies prescription sort_order in both student workout surfaces", () => {
    for (const source of [portal, workout]) {
      expect(source).toContain("sort_order");
      expect(source).toContain("orderWorkoutsByPrescription(");
    }
  });
});
