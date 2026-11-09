import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { openStudentChat } from "@/lib/studentChat";
import { AssessmentDashboardCard, OperationalContactCadenceCard, WorkoutFeedbackDashboardCard, hasPublishedFirstTraining, isPublishedFirstCardioPlan, useAssignedDashboardStudents } from "./OperationalDashboardCards";
import { prescriptionDeadlineTone } from "@/pages/admin/AdminDashboard";

const { rpc, from, invoke } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, from, functions: { invoke } } }));
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
      expect(hasPublishedFirstTraining([{ id: "cycle", status: "active", delivery_status: "sent" }], materialized, [{ training_cycle_id: "cycle", status }])).toBe(true);
    }
  });

  it("counts only a published digital first prescription and keeps offline evidence separate", () => {
    const cycle = { id: "cycle", status: "active" };
    const workouts = new Set([cycle.id]);
    expect(hasPublishedFirstTraining([], workouts, [])).toBe(false);
    expect(hasPublishedFirstTraining([{ ...cycle, prescribed_offline_at: "2026-11-09" }], workouts, [])).toBe(false);
    expect(hasPublishedFirstTraining([{ ...cycle, prescription_cleared_at: "2026-11-09" }], workouts, [])).toBe(false);
    const linked = { id: "draft", training_cycle_id: cycle.id, status: "draft" };
    expect(hasPublishedFirstTraining([cycle], workouts, [linked])).toBe(false);
    expect(hasPublishedFirstTraining([{ ...cycle, bundle_id: "draft" }], workouts,
      [linked, { ...linked, id: "other", status: "active" }])).toBe(false);
    expect(hasPublishedFirstTraining([{ ...cycle, bundle_id: "draft" }], workouts,
      [{ ...linked, status: "scheduled" }])).toBe(true);
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
    expect(await screen.findByText("Aguardando resposta")).toBeVisible();
    expect(screen.getByText("Aguardando contato")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Sem resposta há 24h" }));
    expect(screen.getByText("Aguardando resposta")).toBeVisible();
    expect(screen.queryByText("Aguardando contato")).toBeNull();
    expect(rpc).toHaveBeenCalledWith("operational_contact_cadence_status", { _company_id: scope.companyId, _student_ids: undefined });
    expect(order).toHaveBeenCalledWith("chat_id");
    expect(range).toHaveBeenCalledWith(0, 499);
    fireEvent.click(screen.getByRole("button", { name: "Sem mensagem há 7 dias" }));
    expect(screen.getByText("Aguardando contato")).toBeVisible();
    expect(screen.queryByText("Aguardando resposta")).toBeNull();
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

  it("keeps unlinked and adjustment feedback pending and opens only the verified reply target", async () => {
    const scope = { companyId: "company-a", actorId: "staff-a", role: "admin" };
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    const rows = ["adjustment", "unlinked"].map(id => ({
      id, student_id: id + "-student", workout_title: "Treino", created_at: "2026-11-09", pain_areas: [], students: { full_name: id },
    }));
    client.setQueryData(["dashboard-workout-feedback", scope], rows);
    client.setQueryData(["dashboard-workout-feedback-origins", scope, rows.map(row => row.id)], [
      { feedback_id: "adjustment", has_original: true, needs_adjustment: true, reviewed_at: null, reaction_attempted_at: null },
    ]);
    invoke.mockResolvedValueOnce({ data: { chatId: "exact-chat", studentId: "adjustment-student" }, error: null });
    const request = vi.fn((event: Event) => event.preventDefault());
    window.addEventListener("sett:open-whatsapp-chat", request, { once: true });
    render(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null,
      createElement(WorkoutFeedbackDashboardCard, { scope, routePrefix: "admin", allowStudentNavigation: true, allowWhatsApp: true }))));
    expect(screen.getByText(/Sem mensagem original vinculada/)).toBeVisible();
    expect(screen.getByText(/Ajuste pendente/)).toBeVisible();
    expect(screen.getByRole("button", { name: "OK" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect((request.mock.calls[0][0] as CustomEvent).detail).toEqual({
      companyId: "company-a", chatId: "exact-chat", studentId: "adjustment-student", dashboardFeedbackId: "adjustment",
    });
    expect(invoke).toHaveBeenCalledExactlyOnceWith("whatsapp-manager", {
      body: { action: "workout-feedback-origin", companyId: "company-a", dashboardFeedbackId: "adjustment" },
    });
  });

  it("distinguishes past, today's and future deadlines", () => {
    expect(prescriptionDeadlineTone(-1)).toContain("destructive");
    expect(prescriptionDeadlineTone(0)).toContain("amber");
    expect(prescriptionDeadlineTone(1)).toContain("emerald");
  });
});
