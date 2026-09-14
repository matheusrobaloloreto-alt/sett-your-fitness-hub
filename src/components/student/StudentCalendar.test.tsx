import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudentCalendar } from "./StudentCalendar";
import { WeeklyBar } from "./WeeklyBar";
import { collectTrainedDaysForWeek } from "@/lib/studentWeek";

describe("calendar and home training consistency", () => {
  afterEach(() => vi.useRealTimers());

  it("shows a completed historical session without set logs on both displays", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T12:00:00"));
    const sessions = [{ id: "session-1", workout_id: "old-revision", session_date: "2026-09-14", status: "completed", completed_at: "2026-09-14T12:00:00Z" }];
    const days = collectTrainedDaysForWeek({ now: new Date(), persistedLogs: [], completedSessions: sessions });
    render(<>
      <WeeklyBar trainedDays={days} currentDayOfWeek={1} />
      <StudentCalendar workouts={[]} trainedDays={days} currentDayOfWeek={1} onSelectWorkout={vi.fn()} workoutSessions={sessions} />
    </>);
    expect(screen.getByLabelText("Seg: treino registrado")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "2026-09-14: treino registrado" }));
    expect(screen.getByText("Treino anterior")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ir para o treino" })).not.toBeInTheDocument();
  });

  it("does not mark saved but unchecked sets or abandoned sessions as trained", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T12:00:00"));
    render(<StudentCalendar workouts={[]} trainedDays={new Set()} currentDayOfWeek={1} onSelectWorkout={vi.fn()}
      allLogs={[{ workout_id: "w1", exercise_index: 0, set_number: 1, weight: 20, reps_done: 10, session_date: "2026-09-14", completed: false }]}
      workoutSessions={[{ id: "s1", workout_id: "w1", session_date: "2026-09-14", completed_at: "2026-09-14T12:00:00Z", status: "abandoned" }]} />);
    expect(screen.getByRole("button", { name: "2026-09-14: sem treino registrado" })).toBeInTheDocument();
  });
});
