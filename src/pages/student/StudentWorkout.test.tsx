import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudentWorkout from "./StudentWorkout";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { selectPrescriptionEnrollment } from "@/lib/prescriptionSchedule";

const { fromMock, getPublicUrlMock, invokeMock, routeParamsMock, actorMock, policyRpcMock } = vi.hoisted(() => ({
  actorMock: { user: { id: "staff-user" }, role: "admin" as string, companyId: "company-1", loading: false },
  policyRpcMock: vi.fn(),
  fromMock: vi.fn(),
  getPublicUrlMock: vi.fn(),
  invokeMock: vi.fn(),
  routeParamsMock: { studentId: "student-1" },
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => actorMock }));

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
    rpc: policyRpcMock,
    storage: { from: () => ({ getPublicUrl: getPublicUrlMock }) },
    functions: { invoke: invokeMock },
  },
}));

const workoutRows = [
  {
    id: "workout-a",
    title: "Treino A",
    cycle_id: "cycle-1",
    company_id: "company-1",
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
    company_id: "company-1",
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

function makeQuery(result: unknown, terminal: "limit" | "single" | "maybeSingle" | "in" | "order" = "limit") {
  const query: Record<string, unknown> = {};
  let exactCount = false;
  const finish = () => Promise.resolve(result).then(value => {
    const response = value as { data?: unknown[]; count?: number | null } | null;
    return exactCount && response && Array.isArray(response.data) && !Object.prototype.hasOwnProperty.call(response, "count")
      ? { ...response, count: response.data.length } : value;
  });
  query.select = vi.fn((_columns: string, options?: { count?: string }) => { exactCount = options?.count === "exact"; return query; });
  query.eq = vi.fn(() => query);
  query.is = vi.fn(() => query);
  query.or = vi.fn(() => query);
  query.order = vi.fn(() => terminal === "order" ? finish() : query);
  query.limit = vi.fn(() => terminal === "limit" ? finish() : query);
  query.single = vi.fn(() => terminal === "single" ? finish() : query);
  query.maybeSingle = vi.fn(() => terminal === "maybeSingle" ? finish() : query);
  query.in = vi.fn(() => terminal === "in" ? finish() : query);
  return query;
}

let queryClient: QueryClient;
function renderWorkout() {
  return render(<StudentWorkout />, { wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider> });
}
function studentRecord(full_name = "Aluno Teste") {
  return { id: routeParamsMock.studentId, user_id: `user-${routeParamsMock.studentId}`, full_name, company_id: "company-1", status: "active" };
}

function mockStudentWorkoutData() {
  fromMock.mockImplementation((table: string) => {
    if (table === "students") {
      return makeQuery({ data: studentRecord(), error: null }, "single");
    }
    if (table === "enrollments") {
      return makeQuery({
        data: [
          {
            id: "enrollment-1",
            company_id: "company-1",
            student_id: routeParamsMock.studentId,
            start_date: "2026-08-01",
            end_date: "2026-09-30",
            training_start_date: "2026-08-01",
            plan_id: "plan-1",
            status: "active",
            carried_over_cycle_id: null,
            plans: { name: "Plano BN", duration_days: 60, cycle_duration_days: 60 },
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
            enrollment_id: "enrollment-1",
            student_id: "student-1",
            company_id: "company-1",
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
    // These visibility scenarios describe a live Aug–Sep enrollment. Keep Date
    // deterministic without freezing the async timers used by loading tests.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-10T12:00:00-03:00"));
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    actorMock.user = { id: "staff-user" }; actorMock.role = "admin"; actorMock.companyId = "company-1"; actorMock.loading = false;
    policyRpcMock.mockReset().mockResolvedValue({ data: { company_id: "company-1", expired_workout_behavior: "keep_until_replaced", version: 1 }, error: null });
    routeParamsMock.studentId = "student-1";
    fromMock.mockReset();
    getPublicUrlMock.mockReset();
    invokeMock.mockReset();
    mockStudentWorkoutData();
  });

  afterEach(() => { cleanup(); queryClient.clear(); vi.useRealTimers(); });

  it("removes internal prescription-engine notes from the student-facing workout description", async () => {
    renderWorkout();

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

  it.each([null, "prescribed1"])("uses library YouTube metadata while preserving prescribed video %s without resolving a provider", async prescribedId => {
    const original = fromMock.getMockImplementation()!;
    let resolveLibrary!: (value: unknown) => void;
    const libraryResult = new Promise(resolve => { resolveLibrary = resolve; });
    fromMock.mockImplementation((table: string) => {
      if (table === "workouts") return makeQuery({ data: [{ ...workoutRows[0], exercises: [{ ...workoutRows[0].exercises[2], youtube_video_id: prescribedId }] }], error: null }, "in");
      if (table === "exercise_library") return makeQuery(libraryResult, "in");
      return original(table);
    });
    renderWorkout();
    expect(await screen.findByRole("heading", { name: "Treino A" })).toBeInTheDocument();
    await act(async () => {
      resolveLibrary({ data: [{ id: "ex-3", youtube_video_id: "library0001", video_url: null, video_path: null }], error: null });
      await libraryResult;
    });
    fireEvent.click(await screen.findByRole("button", { name: "Ver demonstração de Prancha" }));
    const frame = await screen.findByTitle("Demonstração do exercício");
    expect(new URL(frame.getAttribute("src")!).pathname).toBe(`/embed/${prescribedId ?? "library0001"}`);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("distinguishes commercial enrollment eligibility from prescription continuity", () => {
    const enrollment = { id: "enrollment-1", student_id: "student-1", company_id: "company-1",
      start_date: "2026-08-01", end_date: "2026-09-30", training_start_date: "2026-08-01", status: "active" };
    expect(selectPrescriptionEnrollment([enrollment], { today: new Date(), expectedStudentId: "student-1", expectedCompanyId: "company-1" })?.id).toBe("enrollment-1");
    vi.setSystemTime(new Date("2026-11-03T12:00:00-03:00"));
    expect(selectPrescriptionEnrollment([enrollment], { today: new Date(), expectedStudentId: "student-1", expectedCompanyId: "company-1" })).toBeNull();
    // Commercial expiry does not decide prescription continuity. The standalone
    // route must be assessed against strict keep/hide policy before asserting
    // whether a previously published workout should be visible here.
  });

  it("renders recognized grouped methods in an accordion while leaving normal exercises visible", async () => {
    renderWorkout();

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

    renderWorkout();

    await waitFor(() => {
      expect(fromMock).toHaveBeenCalledWith("students");
      expect(fromMock).toHaveBeenCalledWith("enrollments");
    });

    resolveStudent({ data: studentRecord(), error: null });
    resolveEnrollment({ data: [], error: null });
    expect(await screen.findByText("Aluno Teste")).toBeInTheDocument();
  });

  it("renders the workout before optional exercise-library video enrichment completes", async () => {
    let resolveLibrary!: (value: unknown) => void;
    const libraryResult = new Promise((resolve) => { resolveLibrary = resolve; });

    fromMock.mockImplementation((table: string) => {
      if (table === "students") {
        return makeQuery({ data: studentRecord(), error: null }, "single");
      }
      if (table === "enrollments") {
        return makeQuery({
          data: [{
            id: "enrollment-1",
            company_id: "company-1",
            student_id: routeParamsMock.studentId,
            start_date: "2026-08-01",
            end_date: "2026-09-30",
            training_start_date: "2026-08-01",
            status: "active",
            carried_over_cycle_id: null,
            plans: { name: "Plano BN", duration_days: 60, cycle_duration_days: 60 },
          }],
          error: null,
        });
      }
      if (table === "training_cycles") {
        return makeQuery({
          data: [{
            id: "cycle-1",
            enrollment_id: "enrollment-1",
            student_id: "student-1",
            company_id: "company-1",
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

    renderWorkout();

    expect(await screen.findByRole("heading", { name: "Treino A" })).toBeInTheDocument();
    await act(async () => { resolveLibrary({ data: [], error: null }); await libraryResult; });
  });

  it("renders the student header while cycles and workouts are still loading", async () => {
    let resolveCycles!: (value: unknown) => void;
    const cyclesResult = new Promise((resolve) => { resolveCycles = resolve; });

    fromMock.mockImplementation((table: string) => {
      if (table === "students") {
        return makeQuery({ data: studentRecord(), error: null }, "single");
      }
      if (table === "enrollments") {
        return makeQuery({
          data: [{
            id: "enrollment-1",
            company_id: "company-1",
            student_id: routeParamsMock.studentId,
            start_date: "2026-08-01",
            end_date: "2026-09-30",
            training_start_date: "2026-08-01",
            status: "active",
            carried_over_cycle_id: null,
            plans: { name: "Plano BN", duration_days: 60, cycle_duration_days: 60 },
          }],
          error: null,
        });
      }
      if (table === "training_cycles") return makeQuery(cyclesResult, "order");
      throw new Error(`Unexpected table ${table}`);
    });

    renderWorkout();

    expect(await screen.findByRole("heading", { name: "MEU TREINO" })).toBeInTheDocument();
    expect(screen.getByText("Carregando ciclos e treinos…")).toBeInTheDocument();
    await act(async () => {
      resolveCycles({ data: [], error: null });
      await cyclesResult;
    });
  });

  it("never mixes a new student header with the previous student's workout", async () => {
    const view = renderWorkout();
    expect(await screen.findByRole("heading", { name: "Treino A" })).toBeInTheDocument();

    let resolveNewCycles!: (value: unknown) => void;
    const newCyclesResult = new Promise((resolve) => { resolveNewCycles = resolve; });
    fromMock.mockImplementation((table: string) => {
      if (table === "students") {
        return makeQuery({ data: studentRecord("Novo Aluno"), error: null }, "single");
      }
      if (table === "enrollments") {
        return makeQuery({
          data: [{
            id: "enrollment-2",
            company_id: "company-1",
            student_id: routeParamsMock.studentId,
            start_date: "2026-08-01",
            end_date: "2026-09-30",
            training_start_date: "2026-08-01",
            status: "active",
            carried_over_cycle_id: null,
            plans: { name: "Plano Novo", duration_days: 60, cycle_duration_days: 60 },
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

  it("keeps the carried-over workout only until the renewed enrollment has its own publication", async () => {
    let state: "waiting" | "published" | "next-empty" | "cleared" = "waiting";
    const oldCycle = {
      id: "cycle-old",
      enrollment_id: "enrollment-old",
      student_id: "student-1",
      company_id: "company-1",
      cycle_number: 7,
      start_date: "2026-07-13",
      end_date: "2026-08-23",
      status: "completed",
      duration_weeks: 6,
      delivery_status: "viewed",
      prescription_cleared_at: null,
    };
    const newCycle = () => ({
      id: state === "next-empty" ? "cycle-new-empty" : "cycle-new",
      enrollment_id: "enrollment-new",
      student_id: "student-1",
      company_id: "company-1",
      cycle_number: state === "next-empty" ? 2 : 1,
      start_date: state === "next-empty" ? "2026-09-09" : "2026-08-01",
      end_date: state === "next-empty" ? "2026-10-20" : "2026-09-08",
      status: state === "next-empty" ? "active" : state === "published" ? "active" : "completed",
      duration_weeks: 6,
      delivery_status: state === "published" ? "sent" : "pending",
      prescription_cleared_at: state === "cleared" ? "2026-09-09T12:00:00Z" : null,
    });
    const workout = (cycleId: string, title: string) => ({
      id: `workout-${cycleId}`,
      title,
      cycle_id: cycleId,
      company_id: "company-1",
      description: null,
      sort_order: 0,
      exercises: [{
        exercise_id: "ex-qa",
        exercise_name: "Agachamento de teste",
        muscle_group: "pernas",
        sets: "3",
        reps: "10",
        rest: "60s",
        notes: "",
      }],
    });
    let trainingCycleCalls = 0;
    const installMock = () => {
      trainingCycleCalls = 0;
      fromMock.mockImplementation((table: string) => {
        if (table === "students") {
          return makeQuery({ data: studentRecord(), error: null }, "single");
        }
        if (table === "enrollments") {
          return makeQuery({
            data: [{
              id: "enrollment-new",
              company_id: "company-1",
              student_id: routeParamsMock.studentId,
              start_date: "2026-08-01",
              end_date: "2026-11-03",
              training_start_date: "2026-08-01",
              plan_id: "plan-1",
              status: "active",
              created_at: "2026-08-01T00:00:00Z",
              carried_over_cycle_id: "cycle-old",
              plans: { name: "Plano BN", duration_days: 95, cycle_duration_days: 42 },
            }],
            error: null,
          });
        }
        if (table === "training_cycles") {
          trainingCycleCalls += 1;
          if (trainingCycleCalls === 1) {
            const currentCycles = state === "next-empty"
              ? [{
                  id: "cycle-new-published-expired",
                  enrollment_id: "enrollment-new",
                  student_id: "student-1",
                  company_id: "company-1",
                  cycle_number: 1,
                  start_date: "2026-08-01",
                  end_date: "2026-09-08",
                  status: "completed",
                  duration_weeks: 6,
                  delivery_status: "viewed",
                  prescription_cleared_at: null,
                }, newCycle()]
              : [newCycle()];
            return makeQuery({ data: currentCycles, error: null }, "order");
          }
          return makeQuery({ data: oldCycle, error: null }, "maybeSingle");
        }
        if (table === "workouts") {
          const rows = [
            workout("cycle-old", "Treino anterior publicado"),
            ...(state === "published" ? [workout("cycle-new", "Treino novo publicado")] : []),
            ...(state === "next-empty" ? [workout("cycle-new-published-expired", "Treino novo publicado")] : []),
          ];
          return makeQuery({ data: rows, error: null }, "in");
        }
        if (table === "exercise_library") return makeQuery({ data: [], error: null }, "in");
        throw new Error(`Unexpected table ${table}`);
      });
    };

    installMock();
    renderWorkout();

    expect(await screen.findByRole("heading", { name: "Treino anterior publicado" })).toBeInTheDocument();

    state = "published";
    installMock();
    cleanup();
    renderWorkout();
    expect(await screen.findByRole("heading", { name: "Treino novo publicado" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Treino anterior publicado" })).not.toBeInTheDocument();

    state = "next-empty";
    installMock();
    cleanup();
    renderWorkout();
    expect(await screen.findByRole("heading", { name: "Treino novo publicado" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Treino anterior publicado" })).not.toBeInTheDocument();

    state = "cleared";
    installMock();
    cleanup();
    renderWorkout();
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Treino anterior publicado" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Treino novo publicado" })).not.toBeInTheDocument();
    });
  });
  function continuityFixture(options: { expiredEnrollment?: boolean; nextEmpty?: boolean; blocked?: string; count?: number } = {}) {
    vi.setSystemTime(new Date("2026-11-03T12:00:00-03:00"));
    const enrollment = { id: "enrollment-1", student_id: "student-1", company_id: "company-1", start_date: "2026-09-01",
      end_date: options.expiredEnrollment ? "2026-10-26" : "2026-12-01", training_start_date: "2026-09-01", status: options.blocked === "cancelled" ? "cancelled" : "awaiting_renewal",
      carried_over_cycle_id: null, plans: { name: "Plano BN", duration_days: 92, cycle_duration_days: 42 } };
    const cycle = { id: "cycle-1", enrollment_id: "enrollment-1", student_id: options.blocked === "foreign" ? "foreign-student" : "student-1", company_id: "company-1",
      cycle_number: 1, start_date: "2026-09-15", end_date: "2026-10-26", status: options.blocked === "superseded" ? "superseded" : "completed", duration_weeks: 6,
      superseded_at: options.blocked === "superseded" ? "2026-10-30" : null,
      prescription_cleared_at: options.blocked === "cleared" ? "2026-10-30" : null };
    fromMock.mockImplementation((table: string) => {
      if (table === "students") return makeQuery({ data: studentRecord(), error: null }, "single");
      if (table === "enrollments") return makeQuery({ data: [enrollment], error: null, count: options.count ?? 1 });
      if (table === "training_cycles") return makeQuery({ data: [cycle, ...(options.nextEmpty ? [{ ...cycle, id: "next-empty", cycle_number: 2, start_date: "2026-10-27", end_date: "2026-12-07", status: "active" }] : [])], error: null }, "order");
      if (table === "workouts") return makeQuery({ data: [workoutRows[0]], error: null }, "in");
      if (table === "exercise_library") return makeQuery({ data: [], error: null }, "in");
      throw new Error(`Unexpected table ${table}`);
    });
  }

  it.each(["keep_until_replaced", "hide_on_expiry", "error"])("gates an expired enrollment with the real strict policy reader: %s", async mode => {
    continuityFixture({ expiredEnrollment: true });
    policyRpcMock.mockResolvedValue(mode === "error" ? { data: null, error: { code: "42501" } } : { data: { company_id: "company-1", expired_workout_behavior: mode, version: 1 }, error: null });
    renderWorkout();
    await waitFor(() => expect(policyRpcMock).toHaveBeenCalledWith("get_company_workout_expiry_policy", { _company_id: "company-1" }));
    if (mode === "keep_until_replaced") expect(await screen.findByRole("heading", { name: "Treino A" })).toBeInTheDocument();
    else {
      await screen.findByText(mode === "error" ? /Não foi possível confirmar a disponibilidade/ : /Aguardando nova prescrição/);
      expect(screen.queryByRole("heading", { name: "Treino A" })).not.toBeInTheDocument();
    }
  });

  it("keeps the last published workout when the next current stage is empty", async () => {
    continuityFixture({ nextEmpty: true }); renderWorkout();
    expect(await screen.findByRole("heading", { name: "Treino A" })).toBeInTheDocument();
    expect(screen.getByText(/Mantido até substituição/)).toBeInTheDocument();
  });

  it.each(["cleared", "superseded", "cancelled", "foreign"])("does not revive or expose a %s prescription", async blocked => {
    continuityFixture({ blocked }); renderWorkout();
    await screen.findByText("Aluno Teste");
    await waitFor(() => expect(screen.queryByText("Carregando ciclos e treinos…")).not.toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Treino A" })).not.toBeInTheDocument();
  });

  it("never falls back to an older contract when enrollment history is truncated", async () => {
    continuityFixture({ count: 300 }); renderWorkout();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Não foi possível carregar/);
    expect(screen.queryByRole("heading", { name: "Treino A" })).not.toBeInTheDocument();
  });

  it.each(["hide_on_expiry", "error"])("does not present an expired cycle as current under %s but preserves explicit consultation", async mode => {
    continuityFixture();
    policyRpcMock.mockResolvedValue(mode === "error" ? { data: null, error: { code: "42501" } } : { data: { company_id: "company-1", expired_workout_behavior: mode, version: 1 }, error: null });
    renderWorkout();
    await screen.findByText(mode === "error" ? /Não foi possível confirmar a disponibilidade/ : /Aguardando nova prescrição/);
    expect(screen.queryByRole("heading", { name: "Treino A" })).not.toBeInTheDocument();
    const invokes = invokeMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Consultar histórico" }));
    expect(await screen.findByRole("heading", { name: "Treino A" })).toBeInTheDocument();
    expect(screen.getByText(/Histórico — somente consulta/)).toBeInTheDocument();
    expect(screen.queryByText("Atual")).not.toBeInTheDocument();
    expect(invokeMock.mock.calls.length).toBe(invokes);
    expect(policyRpcMock.mock.calls.some(([name]) => name === "start_workout_session")).toBe(false);
  });

  it("waits for confirmed keep instead of displaying an expired workout while policy is loading", async () => {
    continuityFixture({ expiredEnrollment: true });
    let release!: (value: unknown) => void;
    policyRpcMock.mockReturnValue(new Promise(resolve => { release = resolve; }));
    renderWorkout();
    await screen.findByText("Confirmando a disponibilidade do treino…");
    expect(screen.queryByRole("heading", { name: "Treino A" })).not.toBeInTheDocument();
    await act(async () => { release({ data: { company_id: "company-1", expired_workout_behavior: "keep_until_replaced", version: 1 }, error: null }); });
    expect(await screen.findByRole("heading", { name: "Treino A" })).toBeInTheDocument();
    expect(queryClient.getQueryCache().getAll().some(query => query.queryKey.includes("staff-user"))).toBe(true);
    expect(queryClient.getQueryCache().getAll().some(query => query.queryKey.includes("user-student-1"))).toBe(false);
  });

  it("keeps a genuinely current prescription visible even when policy cannot be read", async () => {
    policyRpcMock.mockResolvedValue({ data: null, error: { code: "42501" } }); renderWorkout();
    expect(await screen.findByRole("heading", { name: "Treino A" })).toBeInTheDocument();
    expect(screen.queryByText(/Não foi possível confirmar a disponibilidade/)).not.toBeInTheDocument();
  });

  it.each(["owner", "master"])("reads the target policy using the real %s actor", async kind => {
    continuityFixture({ expiredEnrollment: true });
    actorMock.role = kind === "owner" ? "student" : "master";
    actorMock.user = { id: kind === "owner" ? "user-student-1" : "master-real-user" };
    if (kind === "master") actorMock.companyId = "master-home-company";
    renderWorkout();
    expect(await screen.findByRole("heading", { name: "Treino A" })).toBeInTheDocument();
    expect(policyRpcMock).toHaveBeenCalledWith("get_company_workout_expiry_policy", { _company_id: "company-1" });
    expect(queryClient.getQueryCache().getAll().some(query => query.queryKey.includes(actorMock.user.id))).toBe(true);
  });

  it.each(["student", "admin"])("rejects a foreign %s actor before exposing the header or reading policy", async role => {
    actorMock.role = role; actorMock.user = { id: "foreign-user" };
    if (role === "admin") actorMock.companyId = "foreign-company";
    renderWorkout();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Não foi possível carregar/);
    expect(screen.queryByText("Aluno Teste")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Treino A" })).not.toBeInTheDocument();
    expect(policyRpcMock).not.toHaveBeenCalled();
  });

  it("invalidates the loader when the actor changes even for the same student and tenant", async () => {
    const view = renderWorkout(); await screen.findByRole("heading", { name: "Treino A" });
    const original = fromMock.getMockImplementation()!;
    fromMock.mockImplementation((table: string) => table === "students" ? makeQuery({ data: studentRecord("Contexto do novo usuário"), error: null }, "single") : original(table));
    actorMock.user = { id: "another-real-staff-user" }; view.rerender(<StudentWorkout />);
    expect(await screen.findByText("Contexto do novo usuário")).toBeInTheDocument();
    expect(screen.queryByText("Aluno Teste")).not.toBeInTheDocument();
    expect(fromMock.mock.calls.filter(([table]) => table === "students")).toHaveLength(2);
  });

  it("does not accept an old actor's late keep response after the next actor confirmed hide", async () => {
    continuityFixture({ expiredEnrollment: true }); let release!: (value: unknown) => void; let calls = 0;
    policyRpcMock.mockImplementation((name: string) => name !== "get_company_workout_expiry_policy" ? Promise.resolve({ data: null, error: null }) : ++calls === 1 ? new Promise(resolve => { release = resolve; })
      : Promise.resolve({ data: { company_id: "company-1", expired_workout_behavior: "hide_on_expiry", version: 1 }, error: null }));
    const view = renderWorkout(); await screen.findByText("Confirmando a disponibilidade do treino…");
    actorMock.user = { id: "new-real-staff-user" }; view.rerender(<StudentWorkout />);
    await screen.findByText("Aguardando nova prescrição.");
    await act(async () => { release({ data: { company_id: "company-1", expired_workout_behavior: "keep_until_replaced", version: 1 }, error: null }); });
    expect(screen.queryByRole("heading", { name: "Treino A" })).not.toBeInTheDocument();
    expect(screen.getByText("Aguardando nova prescrição.")).toBeInTheDocument();
  });

  it("rejects foreign workout rows returned despite an owned cycle query", async () => {
    continuityFixture(); const original = fromMock.getMockImplementation()!;
    fromMock.mockImplementation((table: string) => table === "workouts" ? makeQuery({ data: [{ ...workoutRows[0], company_id: "foreign-company" }], error: null }, "in") : original(table));
    renderWorkout();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Não foi possível carregar/);
    expect(screen.queryByRole("heading", { name: "Treino A" })).not.toBeInTheDocument();
  });

  it("does not publish late tenant A data after tenant B has loaded", async () => {
    let release!: (value: unknown) => void;
    const delayed = new Promise(resolve => { release = resolve; });
    const original = fromMock.getMockImplementation()!;
    fromMock.mockImplementation((table: string) => table === "students" ? makeQuery(delayed, "single") : original(table));
    const view = renderWorkout();
    await waitFor(() => expect(fromMock).toHaveBeenCalledWith("students"));
    actorMock.user = { id: "staff-company-2" }; actorMock.companyId = "company-2"; routeParamsMock.studentId = "student-2";
    policyRpcMock.mockImplementation((name: string, args: { _company_id: string }) => Promise.resolve({ data: name === "get_company_workout_expiry_policy" ? { company_id: args._company_id, expired_workout_behavior: "keep_until_replaced", version: 1 } : null, error: null }));
    fromMock.mockImplementation((table: string) => {
      if (table === "students") return makeQuery({ data: { ...studentRecord("Aluno B"), company_id: "company-2" }, error: null }, "single");
      if (table === "enrollments") return makeQuery({ data: [{ id: "enrollment-2", student_id: "student-2", company_id: "company-2", status: "active", start_date: "2026-08-01", end_date: "2026-09-30", plans: { duration_days: 61, cycle_duration_days: 61 } }], error: null });
      if (table === "training_cycles") return makeQuery({ data: [{ id: "cycle-2", enrollment_id: "enrollment-2", student_id: "student-2", company_id: "company-2", status: "active", start_date: "2026-08-01", end_date: "2026-09-30", cycle_number: 1 }], error: null }, "order");
      if (table === "workouts") return makeQuery({ data: [{ ...workoutRows[0], id: "workout-company-2", title: "Treino B confirmado", cycle_id: "cycle-2", company_id: "company-2" }], error: null }, "in");
      if (table === "exercise_library") return makeQuery({ data: [], error: null }, "in");
      throw new Error(`Unexpected table ${table}`);
    });
    view.rerender(<StudentWorkout />);
    expect(await screen.findByRole("heading", { name: "Treino B confirmado" })).toBeInTheDocument();
    await act(async () => { release({ data: { id: "student-1", user_id: "user-student-1", company_id: "company-1", full_name: "Aluno A atrasado", status: "active" }, error: null }); await delayed; });
    expect(screen.getByText("Aluno B")).toBeInTheDocument();
    expect(screen.queryByText("Aluno A atrasado")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Treino A" })).not.toBeInTheDocument();
  });

  it("does not turn an ambiguous publication into an automatic historical fallback", async () => {
    continuityFixture(); const original = fromMock.getMockImplementation()!;
    fromMock.mockImplementation((table: string) => table === "training_cycles" ? makeQuery({ data: [1, 2].map(n => ({ id: `ambiguous-${n}`, enrollment_id: "enrollment-1", student_id: "student-1", company_id: "company-1", cycle_number: n, start_date: "2026-09-15", end_date: "2026-10-26", status: "completed" })), error: null }, "order") : table === "workouts" ? makeQuery({ data: [1, 2].map(n => ({ ...workoutRows[0], id: `workout-${n}`, cycle_id: `ambiguous-${n}` })), error: null }, "in") : original(table));
    renderWorkout();
    await screen.findByText("Aluno Teste");
    await waitFor(() => expect(screen.queryByText("Carregando ciclos e treinos…")).not.toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Treino A" })).not.toBeInTheDocument();
  });

  it.each([null, undefined])("does not infer complete enrollment history from an unknown count (%s)", async count => {
    continuityFixture(); const original = fromMock.getMockImplementation()!;
    fromMock.mockImplementation((table: string) => table === "enrollments" ? makeQuery({ data: [{ id: "enrollment-1", student_id: "student-1", company_id: "company-1", status: "active", start_date: "2026-09-01", end_date: "2026-12-01" }], error: null, count }) : original(table));
    renderWorkout();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Não foi possível carregar/);
    expect(screen.queryByRole("heading", { name: "Treino A" })).not.toBeInTheDocument();
  });

  it("supports an authenticated owner without staff company membership", async () => {
    actorMock.role = "student"; actorMock.user = { id: "user-student-1" }; actorMock.companyId = null as unknown as string;
    renderWorkout();
    expect(await screen.findByRole("heading", { name: "Treino A" })).toBeInTheDocument();
  });

});
