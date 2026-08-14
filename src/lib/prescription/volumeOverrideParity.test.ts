import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const prescribePath = resolve(process.cwd(), "supabase/functions/ai-prescribe-workout/index.ts");
const validatePath = resolve(process.cwd(), "supabase/functions/ai-validate-prescription/index.ts");

describe("company exercise-volume override parity", () => {
  it("loads and applies both role and percentage in prescribe and validate", async () => {
    const [prescribe, validate] = await Promise.all([
      readFile(prescribePath, "utf8"),
      readFile(validatePath, "utf8"),
    ]);
    for (const source of [prescribe, validate]) {
      expect(source).toContain('"exercise_id, muscle_group_id, role, volume_percentage"');
      expect(source).toContain("override?.role");
      expect(source).toContain("override?.volume_percentage");
      expect(source).toContain("company_exercise_volumes");
    }
  });
});
