import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const prescribePath = resolve(process.cwd(), "supabase/functions/ai-prescribe-workout/index.ts");
const validatePath = resolve(process.cwd(), "supabase/functions/ai-validate-prescription/index.ts");

describe("fixed target-volume parity", () => {
  it("loads anatomical roles without company overrides in every Bnito loader", async () => {
    const sources = await Promise.all([
      readFile(prescribePath, "utf8"),
      readFile(validatePath, "utf8"),
      readFile(resolve(process.cwd(), "supabase/functions/ai-coach-pack/index.ts"), "utf8"),
    ]);
    for (const source of sources) {
      expect(source).toContain('"exercise_id, muscle_group_id, role, is_primary, volume_percentage"');
      expect(source).toContain("canonicalCatalogTargets");
      expect(source).not.toContain("override?.role");
      expect(source).not.toContain("override?.volume_percentage");
      expect(source).not.toContain("company_exercise_volumes");
    }
  });
});
