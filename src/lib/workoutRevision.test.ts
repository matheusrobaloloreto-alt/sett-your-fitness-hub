import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  currentWorkoutRevisionRows,
  saveCycleWorkoutRevision,
  WorkoutRevisionConflictError,
} from "@/lib/workoutRevision";

const cycleId = "40000000-0000-4000-8000-000000000001";
const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("workout revisions", () => {
  it("keeps historical rows out of the prescription currently shown and edited", () => {
    const rows = [
      { id: "old", superseded_at: "2026-09-03T10:00:00.000Z" },
      { id: "current", superseded_at: null },
      { id: "legacy-current" },
    ];

    expect(currentWorkoutRevisionRows(rows).map((row) => row.id)).toEqual([
      "current",
      "legacy-current",
    ]);
  });

  it("fails when the database does not confirm the complete atomic revision", async () => {
    const db = {
      rpc: async () => ({
        data: { cycle_id: cycleId, workouts_created: 1, workout_ids: ["one"] },
        error: null,
      }),
    };

    await expect(saveCycleWorkoutRevision(db, {
      cycleId,
      expectedRows: [],
      workouts: [
        { title: "Treino A", description: "", exercises: [] },
        { title: "Treino B", description: "", exercises: [] },
      ],
    })).rejects.toThrow("não confirmou todos os treinos");
  });

  it("exposes revision conflicts as a typed recoverable error", async () => {
    const db = {
      rpc: async () => ({ data: null, error: { message: "workout_revision_changed" } }),
    };

    await expect(saveCycleWorkoutRevision(db, {
      cycleId,
      expectedRows: [],
      workouts: [{ title: "Treino A", exercises: [] }],
    })).rejects.toBeInstanceOf(WorkoutRevisionConflictError);
  });

  it("exposes revision conflicts even when PostgREST carries the marker outside message", async () => {
    const db = {
      rpc: async () => ({
        data: null,
        error: {
          code: "P0001",
          message: "Erro ao executar a função",
          details: "workout_revision_changed",
        },
      }),
    };

    await expect(saveCycleWorkoutRevision(db, {
      cycleId,
      expectedRows: [{ id: "previous-a", updated_at: "2026-09-03T09:00:00.000Z" }],
      workouts: [{ title: "Treino A", exercises: [] }],
    })).rejects.toBeInstanceOf(WorkoutRevisionConflictError);
  });

  it("sends the exact snapshot and returns only a fully confirmed revision", async () => {
    let received: Record<string, unknown> | null = null;
    const db = {
      rpc: async (_name: string, payload: Record<string, unknown>) => {
        received = payload;
        return {
          data: {
            cycle_id: cycleId,
            revision_id: "50000000-0000-4000-8000-000000000001",
            workouts_created: 2,
            workout_ids: ["one", "two"],
            workout_rows: [
              { id: "one", updated_at: "2026-09-03T09:02:00.000Z" },
              { id: "two", updated_at: "2026-09-03T09:02:01.000Z" },
            ],
          },
          error: null,
        };
      },
    };

    const result = await saveCycleWorkoutRevision(db, {
      cycleId,
      expectedRows: [
        { id: "previous-a", updated_at: "2026-09-03T09:00:00.000Z" },
        { id: "previous-b", updated_at: "2026-09-03T09:01:00.000Z" },
      ],
      workouts: [
        { title: "Treino A", description: "Base", day_of_week: 1, exercises: [{ exercise_id: "a" }] },
        { title: "Treino B", description: "Força", day_of_week: 3, exercises: [{ exercise_id: "b" }] },
      ],
    });

    expect(received).toEqual({
      p_cycle_id: cycleId,
      p_expected_rows: [
        { id: "previous-a", updated_at: "2026-09-03T09:00:00.000Z" },
        { id: "previous-b", updated_at: "2026-09-03T09:01:00.000Z" },
      ],
      p_workouts: [
        { title: "Treino A", description: "Base", day_of_week: 1, exercises: [{ exercise_id: "a" }] },
        { title: "Treino B", description: "Força", day_of_week: 3, exercises: [{ exercise_id: "b" }] },
      ],
    });
    expect(result.workoutIds).toEqual(["one", "two"]);
    expect(result.workoutRows).toEqual([
      { id: "one", updated_at: "2026-09-03T09:02:00.000Z" },
      { id: "two", updated_at: "2026-09-03T09:02:01.000Z" },
    ]);
  });

  it("keeps the legacy id-only RPC response compatible while marking timestamps unavailable", async () => {
    const db = {
      rpc: async () => ({
        data: {
          cycle_id: cycleId,
          revision_id: "50000000-0000-4000-8000-000000000001",
          workouts_created: 1,
          workout_ids: ["one"],
        },
        error: null,
      }),
    };

    await expect(saveCycleWorkoutRevision(db, {
      cycleId,
      expectedRows: [],
      workouts: [{ title: "Treino A", exercises: [] }],
    })).resolves.toMatchObject({
      workoutIds: ["one"],
      workoutRows: [{ id: "one", updated_at: "" }],
    });
  });

  it("keeps the WorkoutBuilder state on the confirmed revision snapshot after saving", () => {
    const builder = source("src/pages/admin/WorkoutBuilder.tsx");
    expect(builder).toContain("const [workoutRevisionSnapshot, setWorkoutRevisionSnapshot]");
    expect(builder).toContain("setWorkoutRevisionSnapshot(workoutRevisionRows(loaded))");
    expect(builder).toContain("expectedRows: workoutRevisionSnapshot");
    expect(builder).toContain("confirmedWorkouts = await fetchExistingWorkouts()");
    expect(builder).toContain("updated_at: saved.workoutRows[index]?.updated_at || undefined");
    expect(builder).toContain("setWorkoutRevisionSnapshot(workoutRevisionRows(nextWorkouts))");
    expect(builder).toContain("O que está salvo agora");
    expect(builder).toContain("O seu rascunho nesta tela");
    expect(builder).not.toContain('title: "Existe uma versão mais recente"');
  });

  it("has a database contract that returns ids and timestamps for the next CAS snapshot", () => {
    const migration = source("supabase/migrations/20260914104500_return_workout_revision_rows.sql");
    expect(migration).toContain("v_workout_rows jsonb");
    expect(migration).toContain("returning id, updated_at into v_workout_id, v_workout_updated_at");
    expect(migration).toContain("'workout_rows', v_workout_rows");
    expect(migration).toContain("raise exception 'workout_revision_changed'");
    expect(migration).toContain("superseded_at = now()");
  });
});
