import { describe, expect, it, vi } from "vitest";
import { fetchExerciseRelations } from "../../../supabase/functions/_shared/prescription/catalogRows";

function paginatedBackend(rows: Array<{ exercise_id: string; muscle_group_id: string }>, failAt?: number) {
  const ranges: number[][] = [];
  const from = vi.fn(() => {
    let ids: string[] = [];
    const query = {
      select: () => query,
      in: (_column: string, values: string[]) => { ids = values; return query; },
      eq: () => query,
      order: () => query,
      range: async (start: number, end: number) => {
        ranges.push([start, end]);
        if (start === failAt) return { data: null, error: { message: "backend unavailable" } };
        return { data: rows.filter((row) => ids.includes(row.exercise_id)).slice(start, end + 1), error: null };
      },
    };
    return query;
  });
  return { from, ranges };
}

describe("complete catalog relation loading", () => {
  it("keeps targets beyond the PostgREST row limit and across exercise batches", async () => {
    const rows = Array.from({ length: 81 }, (_, exercise) => Array.from({ length: 16 }, (_, group) => ({
      exercise_id: `e-${exercise}`, muscle_group_id: `g-${group}`,
    }))).flat();
    const backend = paginatedBackend(rows);
    const result = await fetchExerciseRelations({
      supabase: backend, table: "exercise_muscle_targets", columns: "*",
      exerciseIds: Array.from({ length: 81 }, (_, index) => `e-${index}`),
    });
    expect(result.error).toBeNull();
    expect(result.data).toEqual(rows);
    expect(backend.ranges).toEqual([[0, 499], [500, 999], [1000, 1499], [0, 499]]);
  });

  it("surfaces a failed later page instead of treating partial targets as complete", async () => {
    const rows = Array.from({ length: 600 }, (_, group) => ({ exercise_id: "e", muscle_group_id: `g-${group}` }));
    const backend = paginatedBackend(rows, 500);
    const result = await fetchExerciseRelations({ supabase: backend, table: "exercise_muscle_targets", columns: "*", exerciseIds: ["e"] });
    expect(result.error).toEqual({ message: "backend unavailable" });
    expect(result.data).toHaveLength(500);
  });

  it("does not query relations without visible exercise IDs", async () => {
    const backend = paginatedBackend([]);
    expect(await fetchExerciseRelations({ supabase: backend, table: "exercise_muscle_targets", columns: "*", exerciseIds: [] }))
      .toEqual({ data: [], error: null });
    expect(backend.from).not.toHaveBeenCalled();
  });
});
