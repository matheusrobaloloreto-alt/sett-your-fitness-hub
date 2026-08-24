import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StudentHistory } from "./StudentHistory";

const workouts = [{ id: "workout-1", title: "Treino A" }];
const allLogs = [
  {
    workout_id: "workout-1",
    exercise_index: 0,
    set_number: 1,
    session_date: "2026-08-20",
    weight: 80,
    reps_done: 10,
  },
];
const sessions = [
  {
    id: "session-1",
    workout_id: "workout-1",
    session_date: "2026-08-20",
    duration_seconds: 3600,
  },
];

describe("StudentHistory workout feedback loop", () => {
  it("associates trainer replies to the concrete workout session", () => {
    render(
      <StudentHistory
        allLogs={allLogs}
        workouts={workouts}
        sessions={sessions}
        feedbacks={[
          {
            id: "feedback-1",
            workout_session_id: "session-1",
            notes: "Percepção: Bom\nSenti a lombar no fim.",
            trainer_reply: "No próximo treino vamos ajustar a carga.",
            trainer_replied_at: "2026-08-21T12:00:00Z",
            trainer_reply_author_name: "Bruna",
          },
        ]}
      />,
    );

    expect(screen.getByText("Resposta de Bruna")).toBeInTheDocument();
    expect(screen.getByText("No próximo treino vamos ajustar a carga.")).toBeInTheDocument();
  });

  it("shows a sober waiting state only when the session has submitted feedback", () => {
    render(
      <StudentHistory
        allLogs={allLogs}
        workouts={workouts}
        sessions={sessions}
        feedbacks={[
          {
            id: "feedback-1",
            workout_session_id: "session-1",
            notes: "Percepção: Difícil",
            trainer_reply: null,
            trainer_replied_at: null,
            trainer_reply_author_name: null,
          },
        ]}
      />,
    );

    expect(screen.getByText("Feedback enviado. Aguarde o retorno do treinador.")).toBeInTheDocument();
  });
});
