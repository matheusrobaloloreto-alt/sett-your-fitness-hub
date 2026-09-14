import { describe, expect, it } from "vitest";
import { collectTrainedDaysForWeek, upsertCompletedWorkoutSession } from "./studentWeek";

describe("student weekly training markers", () => {
  it("marks today's locally completed workout before the remote autosave returns", () => {
    const now = new Date("2026-08-31T12:00:00-03:00");
    const days = collectTrainedDaysForWeek({
      now,
      persistedLogs: [],
      localLogs: [{ session_date: "2026-08-31", completed: true }],
      localSessionDate: "2026-08-31",
    });
    expect([...days]).toEqual([1]);
  });

  it("ignores incomplete local rows and logs outside the current week", () => {
    const now = new Date("2026-08-31T12:00:00-03:00");
    const days = collectTrainedDaysForWeek({
      now,
      persistedLogs: [{ session_date: "2026-08-30", completed: true }],
      localLogs: [{ session_date: "2026-08-31", completed: false }],
      localSessionDate: "2026-08-31",
    });
    expect(days.size).toBe(0);
  });

  it("marks a completed workout session even when no set was explicitly checked", () => {
    const now = new Date("2026-08-31T12:00:00-03:00");
    const days = collectTrainedDaysForWeek({
      now,
      persistedLogs: [],
      completedSessions: [{ session_date: "2026-08-31", completed_at: "2026-08-31T13:00:00-03:00", status: "completed" }],
    });

    expect([...days]).toEqual([1]);
  });

  it("does not mark an abandoned session even when it has completed_at", () => {
    const now = new Date("2026-08-31T12:00:00-03:00");
    const days = collectTrainedDaysForWeek({
      now,
      persistedLogs: [],
      completedSessions: [{ session_date: "2026-08-31", completed_at: "2026-08-31T13:00:00-03:00", status: "abandoned" }],
    });

    expect(days.size).toBe(0);
  });
});

describe("completed workout session cache", () => {
  it("replaces the finished session immediately with a completed marker", () => {
    const rows = upsertCompletedWorkoutSession(
      [{ id: "session-1", status: "in_progress" }, { id: "session-2", status: "completed" }],
      {
        id: "session-1",
        workoutId: "workout-1",
        completedAt: "2026-09-10T12:00:00.000Z",
        durationSeconds: 900,
        totalVolume: 0,
        totalSetsCompleted: 0,
        totalSetsPrescribed: 3,
      },
      "2026-09-10",
    );

    expect(rows).toEqual([
      {
        id: "session-1",
        workout_id: "workout-1",
        session_date: "2026-09-10",
        completed_at: "2026-09-10T12:00:00.000Z",
        duration_seconds: 900,
        total_volume: 0,
        total_sets_completed: 0,
        total_sets_prescribed: 3,
        status: "completed",
      },
      { id: "session-2", status: "completed" },
    ]);
  });
});
