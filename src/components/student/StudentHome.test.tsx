import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
    workoutCount: baseCycle.workouts.length,
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

describe("StudentHome progression highlight", () => {
  it("renders the progression title and body in the active workout hero", () => {
    renderHome({ activeWorkoutId: "workout-a" });

    expect(screen.getByText("O que muda agora")).toBeInTheDocument();
    expect(screen.getByText("Semanas 5-6")).toBeInTheDocument();
    expect(screen.getByText(/Esta quinzena fica mais intensa com Bi-set/)).toBeInTheDocument();
  });

  it("keeps the progression visible on rest days without offering to start a workout", () => {
    renderHome({ currentDayOfWeek: 4, activeWorkoutId: null });

    expect(screen.getByText("Dia de descanso")).toBeInTheDocument();
    expect(screen.getByText("O que muda agora")).toBeInTheDocument();
    expect(screen.getByText("Semanas 5-6")).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: /Treino em andamento/i }));
    expect(onNavigate).toHaveBeenCalledWith("treino", null);
  });

  it("preserves every navigation destination in an editorial index with accessible targets", () => {
    const onNavigate = vi.fn();
    renderHome({
      onNavigate,
      hasNutrition: true,
      hasCorrida: true,
      hasNatacao: true,
      hasCiclismo: true,
    });

    const index = screen.getByRole("navigation", { name: "Explorar áreas do app" });
    expect(index).toBeInTheDocument();
    const destinationList = screen.getByRole("list", { name: "Destinos do portal do aluno" });
    expect(destinationList).toBeInTheDocument();

    const expectedDestinations = [
      "Treino",
      "Estatísticas",
      "Calendário",
      "Histórico",
      "Integrações",
      "Dicas Nutricionais",
      "Corrida",
      "Natação",
      "Ciclismo",
    ];

    for (const label of expectedDestinations) {
      const item = within(destinationList).getByRole("button", { name: new RegExp(`^${label}:`, "i") });
      expect(item).toHaveClass("min-h-11");
    }

    fireEvent.click(within(destinationList).getByRole("button", { name: /^Dicas Nutricionais:/i }));
    expect(onNavigate).toHaveBeenCalledWith("nutricao");
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
    expect(screen.getByText(/Esta quinzena fica mais intensa com Bi-set/)).toBeInTheDocument();
  });

  it("normalizes textual RIR in the expanded banner details", () => {
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

    expect(screen.queryByText(/RIR alvo RIR 2/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/cerca de 2 repetições guardadas/).length).toBeGreaterThan(0);
  });
});
