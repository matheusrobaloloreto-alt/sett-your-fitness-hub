import { describe, expect, it } from "vitest";
import { isWorkoutLogAwaitingConfirmation, shouldSaveWorkoutLog, workoutLogForDate } from "./workoutLogRequest";

const today = "2026-09-28";
const saved = { id: "row-1", revision: 8, session_date: today, workout_id: "workout-1", weight: 20, reps_done: 0, completed: false };

describe("workout log request identity and pending values", () => {
  it("saves an existing dirty set when weight, reps and completion are cleared", () => {
    expect(shouldSaveWorkoutLog({ ...saved, weight: 0, dirty: true }, "workout-1", today)).toBe(true);
    expect(shouldSaveWorkoutLog({ ...saved, weight: null, dirty: true }, "workout-1", today)).toBe(true);
    expect(shouldSaveWorkoutLog(saved, "workout-1", today)).toBe(false);
  });

  it("does not insert an empty new set, but saves completed bodyweight sets and deletions", () => {
    const empty = { workout_id: "workout-1", weight: 0, reps_done: 0, dirty: true };
    expect(shouldSaveWorkoutLog(empty, "workout-1", today)).toBe(false);
    expect(shouldSaveWorkoutLog({ ...empty, completed: true }, "workout-1", today)).toBe(true);
    expect(shouldSaveWorkoutLog({ ...empty, deleted: true }, "workout-1", today)).toBe(true);
    expect(shouldSaveWorkoutLog({ ...empty, server_missing: true }, "workout-1", today)).toBe(false);
    expect(shouldSaveWorkoutLog({ ...empty, server_missing: true }, "workout-1", today, true)).toBe(true);
  });

  it("blocks silent completion on a missing server row until an explicit manual save", () => {
    const missing = { ...saved, id: undefined, revision: undefined, dirty: true, server_missing: true };
    expect(isWorkoutLogAwaitingConfirmation(missing, "workout-1", today)).toBe(true);
    expect(shouldSaveWorkoutLog(missing, "workout-1", today)).toBe(false);
    expect(shouldSaveWorkoutLog(missing, "workout-1", today, true)).toBe(true);
    expect(isWorkoutLogAwaitingConfirmation(missing, "workout-2", today)).toBe(false);
    expect(isWorkoutLogAwaitingConfirmation(missing, "workout-1", "2026-09-29")).toBe(false);
  });

  it("clears yesterday's server identity and binds the edit to today's date", () => {
    const yesterday = { ...saved, session_date: "2026-09-27", updated_at: "old", created_at: "old" };
    const next = workoutLogForDate(yesterday, today);
    expect(next).toMatchObject({ session_date: today, workout_id: saved.workout_id, weight: 20 });
    for (const field of ["id", "revision", "updated_at", "created_at"]) expect(next).not.toHaveProperty(field);
    expect(yesterday.id).toBe("row-1");
    expect(workoutLogForDate(saved, today)).toEqual(saved);
  });

  it("keeps other workouts and other dates out of a queued save", () => {
    expect(shouldSaveWorkoutLog({ ...saved, dirty: true }, "workout-2", today)).toBe(false);
    expect(shouldSaveWorkoutLog({ ...saved, dirty: true, session_date: "2026-09-27" }, "workout-1", today)).toBe(false);
    const newDay = { ...workoutLogForDate({ ...saved, session_date: "2026-09-27" }, today), weight: 30, dirty: true };
    expect(shouldSaveWorkoutLog(newDay, "workout-1", today)).toBe(true);
    expect(newDay.revision).toBeUndefined();
    expect(workoutLogForDate({ workout_id: "workout-1", dirty: true }, today).session_date).toBe(today);
  });
});
