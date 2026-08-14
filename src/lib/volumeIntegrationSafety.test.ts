import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(resolve(process.cwd(), path), "utf8");

describe("volume integration safety contracts", () => {
  it("uses the tenant-scoped effective-target RPC in student and trainer views", async () => {
    const [studentView, trainerView, migration] = await Promise.all([
      read("src/components/student/VolumeInsights.tsx"),
      read("src/components/trainer/WorkoutAnalysis.tsx"),
      read("supabase/migrations/20260814233000_fix_multitarget_weekly_volume.sql"),
    ]);
    expect(studentView).toContain('rpc("get_effective_exercise_targets"');
    expect(studentView).not.toContain('.from("company_exercise_volumes")');
    expect(studentView).toContain("log?.completed === true");
    expect(trainerView).toContain('rpc("get_effective_exercise_targets"');
    expect(migration).toContain("auth.uid() is distinct from v_student_user_id");
    expect(migration).toContain("public.is_company_staff(auth.uid(), v_company_id)");
    expect(migration).toContain("el.is_global or el.company_id = v_company_id");
  });

  it("counts only completed logs inside the effective cycle window", async () => {
    const trainerView = await read("src/components/trainer/WorkoutAnalysis.tsx");
    expect(trainerView).toContain("effectiveCoverageWindow");
    expect(trainerView).toContain('.eq("completed", true)');
    expect(trainerView).toContain('.gte("session_date", coverage.start)');
    expect(trainerView).toContain("mg.executedSets / coveredWeeks");
    expect(trainerView).not.toContain("mg.executedSets / (parseInt(period) / 7)");
  });

  it("replaces muscle targets through one validated transactional RPC", async () => {
    const [adminView, migration] = await Promise.all([
      read("src/pages/admin/ExerciseLibrary.tsx"),
      read("supabase/migrations/20260814233000_fix_multitarget_weekly_volume.sql"),
    ]);
    expect(adminView).toContain("replaceExerciseMuscleTargets");
    expect(adminView).not.toContain('.from("exercise_muscle_targets").delete()');
    expect(migration).toContain("create or replace function public.replace_exercise_muscle_targets");
    expect(migration).toContain("target.is_primary is distinct from (target.role = 'primary')");
    expect(migration).toContain("delete from public.exercise_muscle_targets");
    expect(migration).toContain("insert into public.exercise_muscle_targets");
  });
});
