import { describe, expect, it } from "vitest";
import {
  currentWorkoutRevisionRows,
  saveCycleWorkoutRevision,
} from "@/lib/workoutRevision";

const cycleId = "40000000-0000-4000-8000-000000000001";

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
  });
});
