import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const edgeSource = readFileSync(
  `${process.cwd()}/supabase/functions/ai-validate-prescription/index.ts`,
  "utf8",
);

describe("workout save edge safety", () => {
  it("derives legacy exercise ids from active persisted workouts", () => {
    expect(edgeSource).toContain("loadTrustedLegacyExerciseIds");
    expect(edgeSource).toContain('.from("workouts")');
    expect(edgeSource).toContain('.eq("cycle_id", cycleId)');
    expect(edgeSource).toContain('.eq("company_id", companyId)');
    expect(edgeSource).toContain('.is("superseded_at", null)');
  });

  it("does not accept a client-declared legacy id list", () => {
    expect(edgeSource).not.toContain("planRecord.legacy_exercise_ids");
    expect(edgeSource).toContain("trustedLegacyExerciseIds,");
  });
});
