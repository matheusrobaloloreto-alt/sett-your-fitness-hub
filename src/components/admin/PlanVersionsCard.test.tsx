import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanVersionsCard } from "./PlanVersionsCard";

const { query } = vi.hoisted(() => ({ query: {
  select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(),
} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => query } }));
vi.mock("./SaveWorkoutToLibraryDialog", () => ({ SaveWorkoutToLibraryDialog: ({ open, initialWorkoutIndex }: { open: boolean; initialWorkoutIndex?: number }) => open ? <div role="status">Exportar {initialWorkoutIndex === undefined ? "plano" : `treino ${initialWorkoutIndex}`}</div> : null }));
const props = { companyId: "company-1", studentName: "Aluno de teste", createdBy: "trainer-1" };

beforeEach(() => {
  vi.clearAllMocks();
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.range.mockResolvedValue({ data: [
    { id: "version-1", edited: true, edit_summary: "Revisão manual", created_at: "2026-09-08T10:48:00Z", plan: { workouts: [{ title: "Treino A antigo", exercises: [{ exercise_name: "Exercício antigo", sets: 4, reps: "8-10", rest: "75s" }, {}] }] } },
    { id: "version-2", edited: false, created_at: "2026-09-07T10:48:00Z", plan: { workouts: [] } },
  ] });
});

describe("PlanVersionsCard", () => {
  it("starts collapsed with count visible and toggles the preserved history", async () => {
    render(<PlanVersionsCard {...props} studentId="student-1" />);
    const trigger = await screen.findByRole("button", { name: "Versões do plano 2" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Revisão manual/)).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("1 treino(s) · 2 exercício(s) — Revisão manual")).toBeVisible();
    expect(screen.getByText("como a IA gerou")).toBeVisible();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Revisão manual/)).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByText(/Revisão manual/)).toBeVisible();
  });

  it("starts collapsed again when switching students", async () => {
    const { rerender } = render(<PlanVersionsCard {...props} studentId="student-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Versões do plano 2" }));
    rerender(<PlanVersionsCard {...props} studentId="student-2" />);
    expect(await screen.findByRole("button", { name: "Versões do plano 2" })).toHaveAttribute("aria-expanded", "false");
  });

  it("does not show an empty history", async () => {
    query.range.mockResolvedValue({ data: [] });
    await act(async () => { render(<PlanVersionsCard {...props} studentId="student-empty" />); });
    expect(query.eq).toHaveBeenCalledWith("student_id", "student-empty");
    expect(screen.queryByRole("button", { name: /Versões do plano/ })).not.toBeInTheDocument();
  });

  it("opens the preserved version read-only and exports either scope without updating the plan", async () => {
    render(<PlanVersionsCard {...props} studentId="student-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Versões do plano 2" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Abrir versão" })[0]);
    expect(screen.getByRole("dialog")).toHaveTextContent("Somente leitura");
    expect(screen.getByRole("dialog")).toHaveTextContent("Exercício antigo");
    expect(screen.getByRole("dialog")).toHaveTextContent("8-10");
    fireEvent.click(screen.getByRole("button", { name: "Salvar somente Treino A antigo na biblioteca" }));
    expect(screen.getByText("Exportar treino 0")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar plano na biblioteca" }));
    expect(screen.getByText("Exportar plano")).toBeInTheDocument();
    expect(query.eq).toHaveBeenCalledWith("company_id", "company-1");
    expect(query.range).toHaveBeenCalledWith(0, 19);
  });

  it("does not query without company context", () => {
    render(<PlanVersionsCard {...props} companyId={null} studentId="student-1" />);
    expect(query.select).not.toHaveBeenCalled();
  });

  it("ignores late results after changing the student and closes the previous viewer", async () => {
    let finish: (value: unknown) => void = () => {};
    query.range.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const { rerender } = render(<PlanVersionsCard {...props} studentId="student-old" />);
    query.range.mockResolvedValueOnce({ data: [] });
    rerender(<PlanVersionsCard {...props} studentId="student-new" />);
    await act(async () => { finish({ data: [{ id: "late", plan: { workouts: [] } }] }); });
    expect(screen.queryByRole("button", { name: /Versões do plano/ })).not.toBeInTheDocument();
  });

  it("shows a recoverable load error instead of claiming the history is empty", async () => {
    query.range.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
    render(<PlanVersionsCard {...props} studentId="student-1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar o histórico");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("button", { name: "Versões do plano 2" })).toBeInTheDocument();
  });

  it("loads older pages without losing the first page", async () => {
    query.range.mockResolvedValueOnce({ data: Array.from({ length: 20 }, (_, index) => ({ id: `v-${index}`, created_at: "2026-09-01", plan: { workouts: [] } })) });
    query.range.mockResolvedValueOnce({ data: [{ id: "old-version", created_at: "2025-01-01", plan: { workouts: [] } }] });
    render(<PlanVersionsCard {...props} studentId="student-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Versões do plano 20" }));
    fireEvent.click(screen.getByRole("button", { name: "Carregar mais versões" }));
    expect(await screen.findByRole("button", { name: "Versões do plano 21" })).toBeInTheDocument();
    expect(query.range).toHaveBeenCalledWith(20, 39);
    expect(screen.getAllByRole("button", { name: "Abrir versão" })).toHaveLength(21);
  });
});
