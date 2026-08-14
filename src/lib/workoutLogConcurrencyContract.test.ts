import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("workout log optimistic concurrency", () => {
  it("saves through a revision-checked RPC instead of a blind upsert", () => {
    const portal = readFileSync("src/pages/student/StudentPortal.tsx", "utf8");
    const migration = readFileSync(
      "supabase/migrations/20260814203000_workout_log_revision_guard.sql",
      "utf8",
    );

    expect(portal).toContain('rpc("save_workout_logs_if_current"');
    expect(portal).not.toContain('.upsert(rows, { onConflict: "student_id,workout_id,exercise_index,set_number,session_date" })');
    expect(migration).toContain("where id = current_row.id and revision = expected_revision");
    expect(migration).toContain("current_row.revision <> expected_revision");
    expect(migration).toContain("jsonb_array_length(_rows) > 200");
    expect(migration).toContain("join public.training_cycles tc on tc.id = w.cycle_id");
    expect(migration).toContain("tc.student_id = s.id");
    expect(migration).toContain("tc.company_id = s.company_id");
    expect(migration).toContain("w.company_id = s.company_id");
    expect(migration).toContain("exercise_index out of range");
    expect(migration).toContain("set_number out of range");
    expect(migration).toContain("rpe out of range");
    expect(migration).toContain("session_date out of range");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("to authenticated");
  });
});
