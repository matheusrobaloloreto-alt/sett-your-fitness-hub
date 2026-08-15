import { describe, expect, it } from "vitest";
import { workoutLogBatchPairError, type WorkoutLogBatchRow } from "./workoutLogBatch";

const row = (change: Partial<WorkoutLogBatchRow> = {}): WorkoutLogBatchRow => ({
  student_id: "student-1",
  workout_id: "workout-1",
  exercise_index: 0,
  set_number: 4,
  session_date: "2026-08-14",
  base_revision: 7,
  ...change,
});

function applyBehavioralModel(state: Map<string, { id: string; revision: number }>, rows: WorkoutLogBatchRow[]) {
  const error = workoutLogBatchPairError(rows);
  let mutations = 0;
  if (error) return { error, mutations };
  for (const item of rows.filter(entry => entry.deleted === true)) {
    state.delete(`${item.workout_id}|${item.exercise_index}|${item.set_number}|${item.session_date}`);
    mutations += 1;
  }
  for (const item of rows.filter(entry => entry.deleted !== true)) {
    state.set(`${item.workout_id}|${item.exercise_index}|${item.set_number}|${item.session_date}`, {
      id: item.id ?? "new",
      revision: item.base_revision ?? 1,
    });
    mutations += 1;
  }
  return { error: null, mutations };
}

describe("workout log tombstone replacement preflight", () => {
  it("leaves state untouched when the replacement carries update identity", () => {
    const key = "workout-1|0|4|2026-08-14";
    const state = new Map([[key, { id: "server-row", revision: 7 }]]);
    const before = JSON.stringify([...state]);
    const result = applyBehavioralModel(state, [
      row({ deleted: true, id: "server-row" }),
      row({ deleted: false, id: "server-row", base_revision: 7, revision: 7 }),
    ]);

    expect(result).toEqual({
      error: "replacement paired with tombstone must be a new insert",
      mutations: 0,
    });
    expect(JSON.stringify([...state])).toBe(before);
  });

  it("accepts only a tombstone plus identity-free insert replacement", () => {
    expect(workoutLogBatchPairError([
      row({ deleted: true, id: "server-row" }),
      row({ deleted: false, base_revision: null, id: null, revision: null }),
    ])).toBeNull();
  });
});
