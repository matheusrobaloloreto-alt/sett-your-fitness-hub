import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const studio = readFileSync("src/pages/admin/PrescriptionStudio.tsx", "utf8");
const portal = readFileSync("src/pages/student/StudentPortal.tsx", "utf8");
const workout = readFileSync("src/pages/student/StudentWorkout.tsx", "utf8");

describe("workout publication and ordering contract", () => {
  it("generates private strength drafts and publishes only from the explicit student action", () => {
    const [generation, publication] = studio.split("async function publishToStudent");
    expect(generation).toContain("studio_strength_draft: true");
    expect(generation).toContain("draft_only: true");
    expect(generation).not.toContain("await publishStrengthDraftToStudent(");
    expect(publication).toContain("await publishStrengthDraftToStudent(");
  });

  it("loads and applies prescription sort_order in both student workout surfaces", () => {
    for (const source of [portal, workout]) {
      expect(source).toContain("sort_order");
      expect(source).toContain("orderWorkoutsByPrescription(");
    }
  });
});
