import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const EDGE = "supabase/functions/ai-prescribe-workout/index.ts";
const source = readFileSync(EDGE, "utf8");

describe("ai-prescribe-workout compute budget", () => {
  it("does not format the full catalog into an unused prompt on the deterministic path", () => {
    expect(source).not.toMatch(
      /const\s+exerciseCatalogText\s*=\s*formatExerciseCatalog\(exerciseCatalog\)/,
    );
    expect(source).not.toMatch(/const\s+athleteContext\s*=/);
  });
});
