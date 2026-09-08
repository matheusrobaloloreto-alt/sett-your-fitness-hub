import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanVersionsCard } from "./PlanVersionsCard";

const { query } = vi.hoisted(() => ({ query: {
  select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(),
} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => query } }));

beforeEach(() => {
  vi.clearAllMocks();
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockResolvedValue({ data: [
    { id: "version-1", edited: true, edit_summary: "Revisão manual", created_at: "2026-09-08T10:48:00Z", plan: { workouts: [{ exercises: [{}, {}] }] } },
    { id: "version-2", edited: false, created_at: "2026-09-07T10:48:00Z", plan: { workouts: [] } },
  ] });
});

describe("PlanVersionsCard", () => {
  it("starts collapsed with count visible and toggles the preserved history", async () => {
    render(<PlanVersionsCard studentId="student-1" />);
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
    const { rerender } = render(<PlanVersionsCard studentId="student-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Versões do plano 2" }));
    rerender(<PlanVersionsCard studentId="student-2" />);
    expect(await screen.findByRole("button", { name: "Versões do plano 2" })).toHaveAttribute("aria-expanded", "false");
  });

  it("does not show an empty history", async () => {
    query.limit.mockResolvedValue({ data: [] });
    await act(async () => { render(<PlanVersionsCard studentId="student-empty" />); });
    expect(query.eq).toHaveBeenCalledWith("student_id", "student-empty");
    expect(screen.queryByRole("button", { name: /Versões do plano/ })).not.toBeInTheDocument();
  });
});
