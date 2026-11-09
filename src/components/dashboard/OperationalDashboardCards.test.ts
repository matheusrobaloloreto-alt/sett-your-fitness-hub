import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { openStudentChat } from "@/lib/studentChat";
import { AssessmentDashboardCard, AssignedDashboardInsights, OperationalContactCadenceCard, hasPublishedFirstTraining, isPublishedFirstCardioPlan, useAssignedDashboardStudents } from "./OperationalDashboardCards";
import { prescriptionDeadlineTone } from "@/pages/admin/AdminDashboard";

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, from } }));
vi.mock("@/lib/studentChat", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/studentChat")>(),
  openStudentChat: vi.fn().mockResolvedValue(undefined),
}));

describe("functional dashboard queues", () => {
  it("opens the selected student's WhatsApp conversation without preparing a message", () => {
    const scope = { companyId: "company-a", actorId: "staff-a", role: "admin" };
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(["dashboard-assessment-queue", scope], [
      { id: "student-a", full_name: "Ana" },
      { id: "student-b", full_name: "Bia" },
    ]);
    const page = (allowChat: boolean) => createElement(QueryClientProvider, { client },
      createElement(MemoryRouter, null,
        createElement(AssessmentDashboardCard, { scope, routePrefix: "admin", allowChat })));
    const view = render(page(false));
    expect(screen.queryByRole("button", { name: "Ver avaliação" })).toBeNull();
    view.rerender(page(true));
    fireEvent.click(screen.getAllByRole("button", { name: "Ver avaliação" })[1]);
    expect(openStudentChat).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      companyId: "company-a", studentId: "student-b", routePrefix: "admin", message: "",
    }));
  });

  it("keeps a projected cycle, failed bundle, or empty workout in first training", () => {
    const cycle = { id: "cycle", status: "pending" };
    expect(hasPublishedFirstTraining([cycle], new Set(["cycle"]), [])).toBe(false);
    expect(hasPublishedFirstTraining([cycle], new Set(), [{ training_cycle_id: null, status: "draft" }])).toBe(false);
    expect(hasPublishedFirstTraining([cycle], new Set(["cycle"]), [{ training_cycle_id: "cycle", status: "failed" }])).toBe(false);
    expect(hasPublishedFirstTraining([cycle], new Set(), [{ training_cycle_id: "cycle", status: "scheduled" }])).toBe(false);
  });

  it("recognizes a scheduled publication and a legacy completed workout", () => {
    const materialized = new Set(["cycle"]);
    expect(hasPublishedFirstTraining([{ id: "cycle", status: "pending" }], materialized, [{ training_cycle_id: "cycle", status: "scheduled" }])).toBe(true);
    expect(hasPublishedFirstTraining([{ id: "cycle", status: "completed" }], materialized, [])).toBe(true);
    for (const status of ["draft", "generating", "failed"]) {
      expect(hasPublishedFirstTraining([{ id: "cycle", status: "active" }], materialized, [{ training_cycle_id: "cycle", status }])).toBe(true);
    }
  });

  it("renders the server queues without recalculating either deadline in the browser", async () => {
    const scope = { companyId: "company-a", actorId: "staff-a", role: "admin" };
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    const range = vi.fn().mockResolvedValue({ error: null, data: [
      { chat_id: "waiting", student_name: "Aguardando resposta", unanswered: true, without_team_message: false },
      { chat_id: "follow-up", student_name: "Aguardando contato", unanswered: false, without_team_message: true },
      { chat_id: "closed-day", student_name: "Relógio pausado", first_unanswered_at: "2025-01-01T00:00:00Z",
        unanswered: false, without_team_message: false },
    ] });
    const order = vi.fn().mockReturnValue({ range });
    rpc.mockReturnValueOnce({ order });
    render(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null,
      createElement(OperationalContactCadenceCard, { scope, routePrefix: "admin" }))));
    expect((await screen.findByText("Sem resposta há 24h · 1")).parentElement).toHaveTextContent("Aguardando resposta");
    expect(rpc).toHaveBeenCalledWith("operational_contact_cadence_status", { _company_id: scope.companyId, _student_ids: undefined });
    expect(order).toHaveBeenCalledWith("chat_id");
    expect(range).toHaveBeenCalledWith(0, 499);
    expect(screen.getByText("Sem mensagem da equipe há 7 dias · 1").parentElement).toHaveTextContent("Aguardando contato");
    expect(screen.queryByText("Relógio pausado")).toBeNull();
  });

  it("keeps a generated cardio plan in the queue until its package is published", () => {
    const plan = { id: "cardio", bundle_id: null, weeks: [{ week: 1 }], status: "scheduled" };
    const bundle = { id: "bundle", running_plan_id: plan.id, status: "draft" };
    expect(isPublishedFirstCardioPlan(plan, [bundle])).toBe(false);
    expect(isPublishedFirstCardioPlan({ ...plan, status: "active" }, [bundle])).toBe(false);
    expect(isPublishedFirstCardioPlan(plan, [{ ...bundle, status: "scheduled" }])).toBe(true);
    expect(isPublishedFirstCardioPlan({ ...plan, status: "completed" }, [])).toBe(true);
    expect(isPublishedFirstCardioPlan({ ...plan, weeks: [] }, [{ ...bundle, status: "active" }])).toBe(false);
    const swimming = { ...plan, id: "swimming", bundle_id: bundle.id, status: "active" };
    expect(isPublishedFirstCardioPlan(swimming, [bundle])).toBe(false);
    expect(isPublishedFirstCardioPlan(swimming, [])).toBe(false);
    expect(isPublishedFirstCardioPlan(swimming, [{ ...bundle, status: "active" }])).toBe(true);
  });

  it("scopes Meus alunos to the current portfolio and excludes inactive registrations", async () => {
    const scope = { companyId: "company-a", actorId: "staff-a", role: "trainer" };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const direct = [{ id: "assigned", full_name: "Carteira" }];
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: direct, error: null }),
    };
    const enrollmentQuery = { ...query, in: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: [], error: null }) };
    from.mockClear().mockImplementation(table => table === "students" ? query : enrollmentQuery);
    const { result } = renderHook(() => useAssignedDashboardStudents(scope), {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    });
    await waitFor(() => expect(result.current.data).toEqual(direct));
    expect(from).toHaveBeenCalledExactlyOnceWith("students");
    expect(query.eq.mock.calls).toEqual([["company_id", "company-a"], ["assigned_trainer_id", "staff-a"]]);
    expect(query.neq).toHaveBeenCalledExactlyOnceWith("status", "inactive");
  });

  it("shows enrollment history separately and excludes a different company's plan", async () => {
    const scope = { companyId: "company-a", actorId: "staff-a", role: "trainer", studentIds: ["student-a"] };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const row = { plan_id: "plan-a", students: { company_id: "company-a" },
      plans: { name: "Plano local", company_id: "company-a" } };
    const makeQuery = (data: unknown[]) => ({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data, error: null }),
    });
    const enrollments = makeQuery([row, row, { ...row, plan_id: null, plans: null },
      { ...row, plan_id: "other", plans: { name: "Outro tenant", company_id: "company-b" } }]);
    from.mockImplementation(table => table === "enrollments" ? enrollments : makeQuery([]));
    render(createElement(QueryClientProvider, { client }, createElement(AssignedDashboardInsights, { scope })));
    expect(await screen.findByRole("heading", { name: "Histórico de matrículas por plano" })).toBeInTheDocument();
    expect(screen.getByText("Plano local · 2")).toBeInTheDocument();
    expect(screen.getByText("Sem plano · 1")).toBeInTheDocument();
    expect(screen.queryByText(/Outro tenant/)).toBeNull();
    expect(enrollments.eq.mock.calls).toEqual([["company_id", "company-a"], ["students.company_id", "company-a"]]);
    expect(enrollments.in).toHaveBeenCalledExactlyOnceWith("student_id", ["student-a"]);
  });

  it("distinguishes past, today's and future deadlines", () => {
    expect(prescriptionDeadlineTone(-1)).toContain("destructive");
    expect(prescriptionDeadlineTone(0)).toContain("amber");
    expect(prescriptionDeadlineTone(1)).toContain("emerald");
  });
});
