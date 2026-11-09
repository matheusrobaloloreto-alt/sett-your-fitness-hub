import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(resolve(process.cwd(), path), "utf8");

describe("volume integration safety contracts", () => {
  it("resolves current prescription targets through the tenant-scoped RPC", async () => {
    const [trainerView, migration] = await Promise.all([
      read("src/components/trainer/WorkoutAnalysis.tsx"),
      read("supabase/migrations/20260914130000_fix_fixed_muscle_volume.sql"),
    ]);
    expect(trainerView).toContain('rpc("get_effective_exercise_targets"');
    expect(migration).toContain("auth.uid() is distinct from v_student_user_id");
    expect(migration).toContain("public.is_company_staff(auth.uid(), v_company_id)");
    expect(migration).not.toContain("select 1 from public.company_members cm");
    expect(migration).toContain("el.is_global or el.company_id = v_company_id");
  });

  it("shares historical execution evidence while keeping the planned calculation separate", async () => {
    const [staff, cycleVolume, insights, stats, metrics] = await Promise.all([
      read("src/components/trainer/WorkoutAnalysis.tsx"),
      read("src/components/trainer/StudentVolumePanel.tsx"),
      read("src/components/student/VolumeInsights.tsx"),
      read("src/components/student/StatsCharts.tsx"),
      read("src/lib/realizedTraining.ts"),
    ]);
    for (const surface of [staff, cycleVolume, insights, stats]) {
      expect(surface).toContain("summarizeRealizedTraining(");
    }
    for (const surface of [insights, stats]) {
      expect(surface).not.toContain("useExerciseVolumeTargets");
      expect(surface).not.toContain("fractionalSetsByMuscleGroup");
    }
    expect(staff).toContain("effectiveCoverageWindow");
    expect(staff).toContain("mg.executedSets / coveredWeeks");
    expect(metrics).toContain("log.completed !== true");
    expect(metrics).toContain("session.exercises_summary");
    expect(metrics).toContain("canonicalAnatomicalMuscleGroup(exercise.muscleGroup)");
  });

  it("replaces muscle targets through one validated transactional RPC", async () => {
    const [adminView, migration] = await Promise.all([
      read("src/pages/admin/ExerciseLibrary.tsx"),
      read("supabase/migrations/20260914124000_exercise_taxonomy_contract.sql"),
    ]);
    expect(adminView).toContain("replaceExerciseMuscleTargets");
    expect(adminView).not.toContain('.from("exercise_muscle_targets").delete()');
    expect(migration).toContain("create or replace function public.replace_exercise_muscle_targets");
    expect(migration).toContain("target.is_primary is distinct from (target.role = 'primary')");
    expect(migration).toContain("delete from public.exercise_muscle_targets");
    expect(migration).toContain("insert into public.exercise_muscle_targets");
  });

  it("aplica a allowlist anatômica em aluno, professor e prescritor", async () => {
    const [stats, radar, trainer, profile, builder] = await Promise.all([
      read("src/lib/volumeStats.ts"),
      read("src/components/student/MuscleRadar.tsx"),
      read("src/components/trainer/WorkoutAnalysis.tsx"),
      read("src/pages/admin/StudentDetail.tsx"),
      read("src/pages/admin/WorkoutBuilder.tsx"),
    ]);
    for (const source of [stats, radar, builder]) {
      expect(source).toContain("canonicalAnatomicalMuscleGroup");
    }
    expect(trainer).toContain("calculateWeeklyMuscleVolume");
    expect(profile).toContain("calculateWeeklyMuscleVolume");
    expect(profile).toContain("useExerciseVolumeTargets");
    expect(builder).toContain("anatomicalBnitoVolumeReview");
  });
});
