import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260923113000_restore_global_template_exercises_and_guard_refs.sql",
);

describe("workout template library integrity migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("restores every official global exercise referenced by current templates", () => {
    for (const exerciseId of [
      "2ea75295-c1ce-495f-9d59-e2f5e94d72b2",
      "0db0d50d-5d72-4ade-97f2-3ec1c64218d8",
      "0c6d0470-cc1d-4388-aec3-c86ebf4ab0b9",
      "c582b327-3be8-457a-9540-d534d3811572",
      "a53b70fb-7cda-4018-8b55-68a6e9aa5d0a",
    ]) {
      expect(sql).toContain(exerciseId);
    }
    expect(sql).toMatch(/is_global\s*=\s*true/i);
    expect(sql).toMatch(/company_id\s*=\s*null/i);
  });

  it("repairs stale ids and installs write-time and delete-time guards", () => {
    expect(sql).toContain("b5c45c36-8d31-4a5a-bf6a-dad9a68eec20");
    expect(sql).toContain("22398d00-8120-4a29-b0f3-2e0cfa14441f");
    expect(sql).toContain("validate_workout_template_exercises");
    expect(sql).toContain("protect_referenced_exercise_library_row");
    expect(sql).toMatch(/exercise_library_row\.is_global\s+or\s+exercise_library_row\.company_id\s*=\s*new\.company_id/i);
    expect(sql).toContain("workout_template_exercise_not_visible");
    expect(sql).toContain("exercise_library_row_is_referenced");
  });

  it("fails the migration if any template reference remains invalid", () => {
    expect(sql).toContain("workout_template_integrity_postflight_failed");
  });
});
