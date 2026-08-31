import { describe, expect, it } from "vitest";
import { collectTrainedDaysForWeek } from "./studentWeek";

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
});
