import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudentWorkout from "./StudentWorkout";

const { fromMock, getPublicUrlMock, invokeMock, routeParamsMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getPublicUrlMock: vi.fn(),
  invokeMock: vi.fn(),
  routeParamsMock: { studentId: "student-1" },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ studentId: routeParamsMock.studentId }),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: fromMock,
    storage: { from: () => ({ getPublicUrl: getPublicUrlMock }) },
    functions: { invoke: invokeMock },
  },
}));

const workoutRows = [
  {
    id: "workout-a",
    title: "Treino A",
    cycle_id: "cycle-1",
    description:
      "Foco da semana: controle na descida. Gerado pelo BN Prescription Engine v1. Revisar casos clínicos antes de liberar.",
    exercises: [
      {
        exercise_id: "ex-1",
        exercise_name: "Supino reto",
        muscle_group: "peito",
        method: "biset",
        group_id: "group-1",
        sets: "3",
        reps: "10",
        rest: "60s",
        notes: "Segure a escápula.",
      },
      {
        exercise_id: "ex-2",
        exercise_name: "Crucifixo",
        muscle_group: "peito",
        method: "biset",
        group_id: "group-1",
        sets: "3",
        reps: "12",
        rest: "90s",
        notes: "",
      },
      {
        exercise_id: "ex-3",
        exercise_name: "Prancha",
        muscle_group: "core",
        method: null,
        group_id: null,
        sets: "2",
        reps: "30s",
        rest: "45s",
        notes: "",
      },
    ],
  },
  {
    id: "workout-b",
    title: "Treino B",
    cycle_id: "cycle-1",
    description: "Gerado pelo BN Prescription Engine v1. Revisar casos clínicos antes de liberar.",
    exercises: [
      {
        exercise_id: "ex-4",
        exercise_name: "Agachamento",
        muscle_group: "pernas",
        method: null,
        group_id: null,
        sets: "3",
        reps: "8",
        rest: "90s",
        notes: "",
      },
    ],
  },
];

function makeQuery(result: unknown, terminal: "limit" | "single" | "in" | "order" = "limit") {
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.order = vi.fn(() => terminal === "order" ? Promise.resolve(result) : query);
  query.limit = vi.fn(() => terminal === "limit" ? Promise.resolve(result) : query);
  query.single = vi.fn(() => terminal === "single" ? Promise.resolve(result) : query);
  query.in = vi.fn(() => terminal === "in" ? Promise.resolve(result) : query);
  return query;
}

function mockStudentWorkoutData() {
  fromMock.mockImplementation((table: string) => {
    if (table === "students") {
      return makeQuery({ data: { full_name: "Aluno Teste" }, error: null }, "single");
    }
    if (table === "enrollments") {
      return makeQuery({
        data: [
          {
            id: "enrollment-1",
            start_date: "2026-08-01",
            end_date: "2026-09-30",
            training_start_date: "2026-08-01",
            plan_id: "plan-1",
            status: "active",
            plans: { name: "Plano BN" },
          },
        ],
        error: null,
      });
    }
    if (table === "training_cycles") {
      return makeQuery({
        data: [
          {
            id: "cycle-1",
            cycle_number: 1,
            start_date: "2026-08-01",
            end_date: "2026-09-30",
            status: "active",
            duration_weeks: 8,
          },
        ],
        error: null,
      }, "order");
    }
    if (table === "workouts") {
      return makeQuery({ data: workoutRows, error: null }, "in");
    }
    if (table === "exercise_library") {
      return makeQuery({ data: [], error: null }, "in");
    }
    throw new Error(`Unexpected table ${table}`);
  });
}

describe("StudentWorkout", () => {
  beforeEach(() => {
    routeParamsMock.studentId = "student-1";
    fromMock.mockReset();
    getPublicUrlMock.mockReset();
    invokeMock.mockReset();
    mockStudentWorkoutData();
  });

  it("removes internal prescription-engine notes from the student-facing workout description", async () => {
    render(<StudentWorkout />);

    expect(await screen.findByRole("heading", { name: "Treino A" })).toBeInTheDocument();
    expect(screen.getByText("Foco da semana: controle na descida.")).toBeInTheDocument();
    expect(screen.queryByText(/BN Prescription Engine/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/revisar casos clínicos/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Treino B" }));
    await waitFor(() => {
      expect(screen.getByText("Agachamento")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Gerado pelo BN Prescription Engine/i)).not.toBeInTheDocument();
  });

  it("renders recognized grouped methods in an accordion while leaving normal exercises visible", async () => {
    render(<StudentWorkout />);

    const groupTrigger = await screen.findByRole("button", { name: /Bloco 1.*Bi-set/i });
    expect(groupTrigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Supino reto")).toBeInTheDocument();
    expect(screen.getByText("Crucifixo")).toBeInTheDocument();
    expect(screen.getByText("Prancha")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Supino reto"));
    expect(screen.getByText(/Obs:/)).toBeInTheDocument();
    fireEvent.click(groupTrigger);
    expect(groupTrigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(groupTrigger);
    expect(groupTrigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Obs:/)).toBeInTheDocument();
  });

  it("starts the independent student and enrollment requests together", async () => {
    let resolveStudent!: (value: unknown) => void;
    let resolveEnrollment!: (value: unknown) => void;
    const studentResult = new Promise((resolve) => { resolveStudent = resolve; });
    const enrollmentResult = new Promise((resolve) => { resolveEnrollment = resolve; });

    fromMock.mockImplementation((table: string) => {
      if (table === "students") return makeQuery(studentResult, "single");
      if (table === "enrollments") return makeQuery(enrollmentResult);
      throw new Error(`Unexpected table ${table}`);
    });

    render(<StudentWorkout />);

    await waitFor(() => {
      expect(fromMock).toHaveBeenCalledWith("students");
      expect(fromMock).toHaveBeenCalledWith("enrollments");
    });

    resolveStudent({ data: { full_name: "Aluno Teste" }, error: null });
    resolveEnrollment({ data: [], error: null });
    expect(await screen.findByText("Aluno Teste")).toBeInTheDocument();
  });

  it("renders the workout before optional exercise-library video enrichment completes", async () => {
    let resolveLibrary!: (value: unknown) => void;
    const libraryResult = new Promise((resolve) => { resolveLibrary = resolve; });

    fromMock.mockImplementation((table: string) => {
      if (table === "students") {
        return makeQuery({ data: { full_name: "Aluno Teste" }, error: null }, "single");
      }
      if (table === "enrollments") {
        return makeQuery({
          data: [{
            id: "enrollment-1",
            start_date: "2026-08-01",
            end_date: "2026-09-30",
            training_start_date: "2026-08-01",
            status: "active",
            plans: { name: "Plano BN" },
          }],
          error: null,
        });
      }
      if (table === "training_cycles") {
        return makeQuery({
          data: [{
            id: "cycle-1",
            cycle_number: 1,
            start_date: "2026-08-01",
            end_date: "2026-09-30",
            status: "active",
            duration_weeks: 8,
          }],
          error: null,
        }, "order");
      }
      if (table === "workouts") return makeQuery({ data: workoutRows, error: null }, "in");
      if (table === "exercise_library") return makeQuery(libraryResult, "in");
      throw new Error(`Unexpected table ${table}`);
    });

    render(<StudentWorkout />);

    expect(await screen.findByRole("heading", { name: "Treino A" })).toBeInTheDocument();
    resolveLibrary({ data: [], error: null });
  });

  it("renders the student header while cycles and workouts are still loading", async () => {
    let resolveCycles!: (value: unknown) => void;
    const cyclesResult = new Promise((resolve) => { resolveCycles = resolve; });

    fromMock.mockImplementation((table: string) => {
      if (table === "students") {
        return makeQuery({ data: { full_name: "Aluno Teste" }, error: null }, "single");
      }
      if (table === "enrollments") {
        return makeQuery({
          data: [{
            id: "enrollment-1",
            start_date: "2026-08-01",
            end_date: "2026-09-30",
            training_start_date: "2026-08-01",
            status: "active",
            plans: { name: "Plano BN" },
          }],
          error: null,
        });
      }
      if (table === "training_cycles") return makeQuery(cyclesResult, "order");
      throw new Error(`Unexpected table ${table}`);
    });

    render(<StudentWorkout />);

    expect(await screen.findByRole("heading", { name: "MEU TREINO" })).toBeInTheDocument();
    expect(screen.getByText("Carregando ciclos e treinos…")).toBeInTheDocument();
    await act(async () => {
      resolveCycles({ data: [], error: null });
      await cyclesResult;
    });
  });

  it("never mixes a new student header with the previous student's workout", async () => {
    const view = render(<StudentWorkout />);
    expect(await screen.findByRole("heading", { name: "Treino A" })).toBeInTheDocument();

    let resolveNewCycles!: (value: unknown) => void;
    const newCyclesResult = new Promise((resolve) => { resolveNewCycles = resolve; });
    fromMock.mockImplementation((table: string) => {
      if (table === "students") {
        return makeQuery({ data: { full_name: "Novo Aluno" }, error: null }, "single");
      }
      if (table === "enrollments") {
        return makeQuery({
          data: [{
            id: "enrollment-2",
            start_date: "2026-08-01",
            end_date: "2026-09-30",
            training_start_date: "2026-08-01",
            status: "active",
            plans: { name: "Plano Novo" },
          }],
          error: null,
        });
      }
      if (table === "training_cycles") return makeQuery(newCyclesResult, "order");
      throw new Error(`Unexpected table ${table}`);
    });

    routeParamsMock.studentId = "student-2";
    view.rerender(<StudentWorkout />);

    expect(await screen.findByText("Novo Aluno")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Treino A" })).not.toBeInTheDocument();
    expect(screen.getByText("Carregando ciclos e treinos…")).toBeInTheDocument();
    await act(async () => {
      resolveNewCycles({ data: [], error: null });
      await newCyclesResult;
    });
  });
});
