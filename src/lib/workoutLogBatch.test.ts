import { describe, expect, it } from "vitest";
import {
  canonicalizeWorkoutLogBatchRows,
  workoutLogBatchPairError,
  type WorkoutLogBatchRow,
} from "./workoutLogBatch";

const STUDENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORKOUT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const row = (change: Partial<WorkoutLogBatchRow> = {}): WorkoutLogBatchRow => ({
  student_id: STUDENT_ID,
  workout_id: WORKOUT_ID,
  exercise_index: 0,
  set_number: 4,
  session_date: "2026-08-14",
  base_revision: 7,
  ...change,
});

function applyBehavioralModel(state: Map<string, { id: string; revision: number }>, rows: readonly unknown[]) {
  const batch = canonicalizeWorkoutLogBatchRows(rows);
  let mutations = 0;
  if (batch.error) return { error: batch.error, mutations };
  for (const item of batch.rows.filter(entry => entry.deleted === true)) {
    state.delete(`${item.workout_id}|${item.exercise_index}|${item.set_number}|${item.session_date}`);
    mutations += 1;
  }
  for (const item of batch.rows.filter(entry => entry.deleted !== true)) {
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
    const key = `${WORKOUT_ID}|0|4|2026-08-14`;
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

  it("canonicalizes UUID case and string integer spellings before preflight", () => {
    const result = canonicalizeWorkoutLogBatchRows([{
      ...row(),
      student_id: STUDENT_ID.toUpperCase(),
      workout_id: WORKOUT_ID.toUpperCase(),
      exercise_index: "04",
      set_number: "004",
    }]);

    expect(result.error).toBeNull();
    expect(result.rows[0]).toMatchObject({
      student_id: STUDENT_ID,
      workout_id: WORKOUT_ID,
      exercise_index: 4,
      set_number: 4,
      session_date: "2026-08-14",
    });
  });

  it("treats 4 and '04' as the same set identity and leaves state untouched", () => {
    const key = `${WORKOUT_ID}|0|4|2026-08-14`;
    const state = new Map([[key, { id: "server-row", revision: 7 }]]);
    const before = JSON.stringify([...state]);
    const result = applyBehavioralModel(state, [
      row({ deleted: true, id: "server-row" }),
      { ...row({ deleted: false }), set_number: "04", id: "stale-row" },
    ]);

    expect(result).toEqual({
      error: "replacement paired with tombstone must be a new insert",
      mutations: 0,
    });
    expect(JSON.stringify([...state])).toBe(before);
  });

  it("rejects equivalent exercise indexes before any mutation", () => {
    const state = new Map<string, { id: string; revision: number }>();
    const result = applyBehavioralModel(state, [
      row({ exercise_index: 4, base_revision: null }),
      { ...row({ base_revision: null }), exercise_index: "04" },
    ]);

    expect(result).toEqual({ error: "duplicate workout log identity in batch", mutations: 0 });
    expect(state.size).toBe(0);
  });

  it.each(["2026-02-30", "2026-08-14T00:00:00Z", "14/08/2026"])(
    "rejects noncanonical or impossible session date %s before any mutation",
    (sessionDate) => {
      const state = new Map<string, { id: string; revision: number }>();
      const result = applyBehavioralModel(state, [{ ...row(), session_date: sessionDate }]);

      expect(result).toEqual({ error: "invalid workout log identity in batch", mutations: 0 });
      expect(state.size).toBe(0);
    },
  );
});
