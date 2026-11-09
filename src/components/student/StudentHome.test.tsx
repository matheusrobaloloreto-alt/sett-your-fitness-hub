import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PeriodizationBanner } from "./PeriodizationBanner";
import { StudentHome } from "./StudentHome";

const baseCycle = {
  id: "cycle-1",
  cycle_number: 1,
  start_date: "2026-07-06",
  end_date: "2026-08-17",
  status: "active",
  objective: "Hipertrofia",
  duration_weeks: 6,
  workouts: [
    {
      id: "workout-a",
      title: "Treino A",
      day_of_week: 1,
      weekly_context: {
        week: 5,
        block: "intensificacao",
        rir: "RIR 2",
        tempo: "2010",
        methods: ["biset"],
        instruction: "Execute o par em sequência, sem correr a técnica.",
      },
    },
  ],
};

function renderHome(overrides: Partial<Parameters<typeof StudentHome>[0]> = {}) {
  const props = {
    studentName: "Aluno Teste",
    enrollmentInfo: null,
    overallProgress: 0,
    selectedCycle: baseCycle,
    cycleProgress: 50,
    weeklySessionCount: 0,
    trainedDays: new Set<number>(),
    currentDayOfWeek: 1,
    totalSessions: 0,
    weeklyGoal: 3,
    streak: 0,
    onNavigate: vi.fn(),
    ...overrides,
  };
  return render(<StudentHome {...props} />);
}

describe("StudentHome", () => {
  afterEach(() => vi.useRealTimers());
  it("renders the progression title and body in the active workout hero", () => {
    renderHome({ activeWorkoutId: "workout-a" });

    expect(screen.getByText("O que muda agora")).toBeInTheDocument();
    expect(screen.getByText("Semana 5")).toBeInTheDocument();
    expect(screen.getByText(/Esta semana fica mais intensa com Bi-set/)).toBeInTheDocument();
  });

  it("keeps the progression visible on rest days without offering to start a workout", () => {
    renderHome({ currentDayOfWeek: 4, activeWorkoutId: null });

    expect(screen.getByText("Dia de descanso")).toBeInTheDocument();
    expect(screen.getByText("O que muda agora")).toBeInTheDocument();
    expect(screen.getByText("Semana 6")).toBeInTheDocument();
    expect(screen.queryByText("Iniciar treino")).not.toBeInTheDocument();
  });

  it("does not fall back to today's workout when the active session points to a stale workout id", () => {
    renderHome({
      activeWorkoutId: "stale-active",
      currentDayOfWeek: 1,
    });

    expect(screen.getByText("Treino em andamento")).toBeInTheDocument();
    expect(screen.getByText("Retomar treino em andamento")).toBeInTheDocument();
    expect(screen.queryByText("Treino de hoje")).not.toBeInTheDocument();
    expect(screen.queryByText("Iniciar treino")).not.toBeInTheDocument();
  });

  it("opens the workout tab without a stale workout id", () => {
    const onNavigate = vi.fn();
    renderHome({
      activeWorkoutId: "stale-active",
      currentDayOfWeek: 1,
      onNavigate,
    });

    fireEvent.click(screen.getByRole("button", { name: "Ver treinos do ciclo" }));
    expect(onNavigate).toHaveBeenCalledWith("treino", null);
  });

  it("opens today's workout from the primary action", () => {
    const onNavigate = vi.fn();
    renderHome({ onNavigate });

    fireEvent.click(screen.getByRole("button", { name: "Abrir treino" }));

    expect(onNavigate).toHaveBeenCalledWith("treino", "workout-a");
  });

  it("shows the calendar week and the elapsed weeks of a dated cycle", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 6, 14, 12));
    renderHome({ cycleProgress: 19 });

    expect(screen.getByRole("heading", { name: "Ciclo 1 · Semana 2" })).toBeInTheDocument();
    expect(screen.getByText("1 de 6 semanas")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Progresso do ciclo" })).toHaveAttribute("aria-valuenow", "19");
  });

  it("does not invent a current week before the cycle starts", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 6, 5, 12));
    renderHome({ cycleProgress: 0 });

    expect(screen.getByRole("heading", { name: "Ciclo 1" })).toBeInTheDocument();
    expect(screen.getByText("Início em 06/07")).toBeInTheDocument();
    expect(screen.queryByText(/de 6 semanas/)).not.toBeInTheDocument();
  });

  it("shows the weekly count, goal, streak and goal editor", () => {
    const editGoal = vi.fn();
    renderHome({
      weeklySessionCount: 2,
      trainedDays: new Set([1, 3]),
      streak: 4,
      goalEditor: <button onClick={editGoal}>Editar meta</button>,
    });

    expect(screen.getByRole("heading", { name: "Meta semanal" })).toBeInTheDocument();
    expect(screen.getByText("2 de 3 treinos")).toBeInTheDocument();
    expect(screen.getByText("4 semanas seguidas")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Editar meta" }));
    expect(editGoal).toHaveBeenCalledOnce();
  });

  it("keeps only the three tracking destinations ahead of the ranking", () => {
    const onNavigate = vi.fn();
    renderHome({ onNavigate, leaderboard: <section aria-label="Ranking mensal" /> });

    const tracking = screen.getByRole("navigation", { name: "Acompanhamento" });
    const buttons = within(tracking).getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveAccessibleName(/^Calendário/);
    expect(buttons[1]).toHaveAccessibleName(/^Estatísticas/);
    expect(buttons[2]).toHaveAccessibleName(/^Integrações/);
    expect(screen.queryByText("Explorar")).not.toBeInTheDocument();
    const ranking = screen.getByRole("region", { name: "Ranking mensal" });
    expect(tracking.compareDocumentPosition(ranking) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    buttons.forEach((button) => fireEvent.click(button));
    expect(onNavigate.mock.calls).toEqual([["calendario"], ["stats"], ["integracoes"]]);
  });
});

describe("PeriodizationBanner progression highlight", () => {
  it("renders the progression title in the collapsed banner", () => {
    render(
      <PeriodizationBanner
        objective="Hipertrofia"
        durationWeeks={6}
        startDate="2026-07-06"
        endDate="2026-08-17"
        prescribedWeek={{
          week: 5,
          block: "intensificacao",
          rir: "RIR 2",
          tempo: "2010",
          methods: ["biset"],
          instruction: "Execute o par em sequência, sem correr a técnica.",
        }}
      />,
    );

    expect(screen.getByText("O que muda agora")).toBeInTheDocument();
    expect(screen.getByText(/Esta semana fica mais intensa com Bi-set/)).toBeInTheDocument();
  });

  it("explains effort without exposing the RIR acronym in expanded student details", () => {
    render(
      <PeriodizationBanner
        objective="Hipertrofia"
        durationWeeks={6}
        startDate="2026-07-06"
        endDate="2026-08-17"
        prescribedWeek={{
          week: 5,
          block: "intensificacao",
          rir: "RIR 2",
          tempo: "2010",
          methods: ["biset"],
          instruction: "Execute o par em sequência, sem correr a técnica.",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button"));

    expect(screen.queryByText(/\bRIR\b/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Repetições que ainda conseguiria fazer: 2/)).toBeInTheDocument();
  });
});
