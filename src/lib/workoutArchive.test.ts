import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  archiveWorkoutForStudent,
  buildWorkoutArchivePayload,
  buildWorkoutArchiveSuccessMessage,
  buildWorkoutRestoreSuccessMessage,
  restoreWorkoutForStudent,
} from "./workoutArchive";

const migration = () => readFileSync(resolve(process.cwd(), "supabase/migrations/20260908120000_archive_student_workouts.sql"), "utf8");

function rpcClient() {
  const rpc = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
  return { rpc, client: { rpc } };
}

describe("workoutArchive client contract", () => {
  it("builds a scoped, reversible archive payload without destructive flags", () => {
    expect(buildWorkoutArchivePayload({
      studentId: "student-1",
      cycleId: "cycle-1",
      workoutId: "workout-1",
      reason: "Duplicado na publicação",
    })).toEqual({
      p_student_id: "student-1",
      p_cycle_id: "cycle-1",
      p_workout_id: "workout-1",
      p_reason: "Duplicado na publicação",
    });
  });

  it("archives and restores only through tenant-checking RPCs", async () => {
    const archive = rpcClient();
    await archiveWorkoutForStudent(archive.client, {
      studentId: "student-1",
      cycleId: "cycle-1",
      workoutId: "workout-1",
      reason: "Duplicado",
    });
    expect(archive.rpc).toHaveBeenCalledWith("archive_student_workout", {
      p_student_id: "student-1",
      p_cycle_id: "cycle-1",
      p_workout_id: "workout-1",
      p_reason: "Duplicado",
    });

    const restore = rpcClient();
    await restoreWorkoutForStudent(restore.client, {
      studentId: "student-1",
      cycleId: "cycle-1",
      workoutId: "workout-1",
      reason: "Rollback",
    });
    expect(restore.rpc).toHaveBeenCalledWith("restore_student_workout", {
      p_student_id: "student-1",
      p_cycle_id: "cycle-1",
      p_workout_id: "workout-1",
      p_reason: "Rollback",
    });
  });

  it("uses discreet PT-BR confirmation copy", () => {
    expect(buildWorkoutArchiveSuccessMessage("Treino A")).toEqual({
      title: "Treino arquivado",
      description: "Treino A saiu das telas ativas. Logs e histórico foram preservados.",
    });
    expect(buildWorkoutRestoreSuccessMessage("Treino A")).toEqual({
      title: "Treino restaurado",
      description: "Treino A voltou para as telas ativas do aluno e do professor.",
    });
  });
});

describe("workout archive migration contract", () => {
  it("adds append-only audit rows and server-side tenant/id checks through explicit staff-student helpers", () => {
    const sql = migration();

    expect(sql).toContain("create table if not exists public.workout_archive_events");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("create or replace function public.archive_student_workout");
    expect(sql).toContain("create or replace function public.restore_student_workout");
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("public.can_manage_staff_student(cycle.company_id, p_student_id)");
    expect(sql).toContain("public.can_read_staff_student(workout_archive_events.company_id, workout_archive_events.student_id)");
    expect(sql).toContain("cycle.student_id = p_student_id");
    expect(sql).toContain("workout.cycle_id = p_cycle_id");
    expect(sql).toContain("workout.company_id = cycle.company_id");
  });

  it("does not delete workouts, cycles, enrollments, plans, logs or sessions", () => {
    const sql = migration().toLowerCase();

    expect(sql).not.toMatch(/\bdelete\s+from\s+public\.(workouts|training_cycles|enrollments|plans|workout_logs|workout_sessions)\b/);
    expect(sql).not.toMatch(/\bdrop\s+table\b/);
    expect(sql).not.toMatch(/\bupdate\s+public\.(training_cycles|enrollments|plans|workout_logs|workout_sessions)\b/);
    expect(sql).toContain("update public.workouts");
    expect(sql).toContain("superseded_at = now()");
    expect(sql).toContain("superseded_at = null");
    expect(sql).not.toContain("on delete cascade");
    expect(sql).toContain("if workout.superseded_at is null then");
    expect(sql).toContain("if workout.superseded_at is not null then");
  });
});
