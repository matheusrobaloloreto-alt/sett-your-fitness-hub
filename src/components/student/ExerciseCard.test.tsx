import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { STUDENT_EFFORT_HELP_TEXT } from "@/lib/weeklyStrengthPeriodization";
import { ExerciseCard } from "./ExerciseCard";

describe("ExerciseCard student effort language", () => {
  it("shows repetitions remaining in plain language without the RIR acronym", () => {
    render(
      <ExerciseCard
        exercise={{
          exercise_id: "exercise-1",
          exercise_name: "Agachamento",
          muscle_group: "Quadríceps",
          video_url: null,
          video_path: null,
          sets: "3",
          reps: "10",
          rest: "60s",
          notes: "Pare com RIR 2 se a técnica piorar.",
          rir: "RIR 2",
          weekly_instruction: "Na última série, mantenha RIR 2-3.",
        }}
        index={0}
        workoutId="workout-1"
        isExpanded
        onToggle={vi.fn()}
        onVideoPlay={vi.fn()}
        logs={{}}
        previousLogs={{}}
        onUpdateLog={vi.fn()}
        exerciseHistory={[]}
        isSessionActive={false}
        activeRest={null}
        onSetComplete={vi.fn()}
        onRestComplete={vi.fn()}
        totalSets={3}
        onAddSet={vi.fn()}
        onRemoveSet={vi.fn()}
      />,
    );

    expect(screen.getByText("Repetições que ainda conseguiria fazer: 2")).toBeInTheDocument();
    expect(screen.getByText(STUDENT_EFFORT_HELP_TEXT)).toBeInTheDocument();
    expect(screen.getByText("Obs:").parentElement).toHaveTextContent("Obs: Pare com Repetições restantes: 2 se a técnica piorar.");
    expect(screen.getByText("Na última série, mantenha Repetições restantes: 2-3.")).toBeInTheDocument();
    expect(screen.queryByText(/\bRIR\b/i)).not.toBeInTheDocument();
  });
});
