import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MonthlyPrescriptionsCard } from "./MonthlyPrescriptionsCard";

type QueryCall = { method: string; args: unknown[] };

const { calls, resultsByTable } = vi.hoisted(() => ({
  calls: [] as QueryCall[],
  resultsByTable: {} as Record<string, { data: unknown[]; error: null }>,
}));

function makeQuery(table: string) {
  const query = {
    select: vi.fn((...args: unknown[]) => {
      calls.push({ method: `${table}.select`, args });
      return query;
    }),
    gte: vi.fn((...args: unknown[]) => {
      calls.push({ method: `${table}.gte`, args });
      return query;
    }),
    order: vi.fn((...args: unknown[]) => {
      calls.push({ method: `${table}.order`, args });
      return query;
    }),
    limit: vi.fn((...args: unknown[]) => {
      calls.push({ method: `${table}.limit`, args });
      return query;
    }),
    eq: vi.fn((...args: unknown[]) => {
      calls.push({ method: `${table}.eq`, args });
      return query;
    }),
    in: vi.fn((...args: unknown[]) => {
      calls.push({ method: `${table}.in`, args });
      return query;
    }),
    then: (resolve: (value: { data: unknown[]; error: null }) => void) =>
      Promise.resolve(resultsByTable[table] || { data: [], error: null }).then(resolve),
  };
  return query;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => makeQuery(table),
  },
}));

beforeEach(() => {
  calls.length = 0;
  resultsByTable.prescription_bundles = {
    data: [
      {
        id: "bundle-strength-only",
        student_id: "student-1",
        created_at: "2026-09-09T12:00:00Z",
        status: "active",
        has_strength: true,
        has_cardio: true,
        has_swimming: true,
        has_cycling: true,
        has_nutrition: true,
        strength_plan_id: "strength-1",
        running_plan_id: null,
        nutrition_plan_id: null,
      },
      {
        id: "bundle-full",
        student_id: "student-2",
        created_at: "2026-09-08T12:00:00Z",
        status: "scheduled",
        has_strength: true,
        has_cardio: true,
        has_swimming: true,
        has_cycling: true,
        has_nutrition: true,
        strength_plan_id: "strength-2",
        running_plan_id: "run-2",
        nutrition_plan_id: "nutrition-2",
      },
    ],
    error: null,
  };
  resultsByTable.students = {
    data: [
      { id: "student-1", full_name: "Aluno Força" },
      { id: "student-2", full_name: "Aluno Completo" },
    ],
    error: null,
  };
  resultsByTable.prescription_bundle_items = {
    data: [
      { bundle_id: "bundle-strength-only", modality: "musculacao", entity_type: "ai_strength_plan", entity_id: "strength-1" },
      { bundle_id: "bundle-full", modality: "musculacao", entity_type: "ai_strength_plan", entity_id: "strength-2" },
      { bundle_id: "bundle-full", modality: "corrida", entity_type: "running_plan", entity_id: "run-2" },
      { bundle_id: "bundle-full", modality: "ciclismo", entity_type: "running_plan", entity_id: "bike-2" },
      { bundle_id: "bundle-full", modality: "nutricao", entity_type: "nutrition_plan", entity_id: "nutrition-2" },
    ],
    error: null,
  };
});

describe("MonthlyPrescriptionsCard", () => {
  it("loads only serving bundles and shows each badge only from its persisted bundle item", async () => {
    render(
      <MemoryRouter>
        <MonthlyPrescriptionsCard companyId="company-1" routePrefix="admin" />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Aluno Força")).toBeInTheDocument();
    expect(await screen.findByText("Aluno Completo")).toBeInTheDocument();

    const bundleSelect = calls.find((call) => call.method === "prescription_bundles.select");
    expect(bundleSelect?.args[0]).toContain("status");
    expect(bundleSelect?.args[0]).toContain("strength_plan_id");
    expect(bundleSelect?.args[0]).toContain("running_plan_id");
    expect(bundleSelect?.args[0]).toContain("nutrition_plan_id");
    expect(calls).toContainEqual({
      method: "prescription_bundles.in",
      args: ["status", ["active", "scheduled"]],
    });
    expect(calls).toContainEqual({
      method: "prescription_bundle_items.in",
      args: ["bundle_id", ["bundle-strength-only", "bundle-full"]],
    });
    expect(calls).toContainEqual({
      method: "prescription_bundle_items.eq",
      args: ["company_id", "company-1"],
    });

    const strengthOnlyRow = screen.getByText("Aluno Força").closest("button") as HTMLElement;
    expect(strengthOnlyRow).toHaveTextContent("Força");
    expect(strengthOnlyRow).not.toHaveTextContent("Cardio");
    expect(strengthOnlyRow).not.toHaveTextContent("Natação");
    expect(strengthOnlyRow).not.toHaveTextContent("Ciclismo");
    expect(strengthOnlyRow).not.toHaveTextContent("Nutrição");

    const fullRow = screen.getByText("Aluno Completo").closest("button") as HTMLElement;
    expect(fullRow).toHaveTextContent("Força");
    expect(fullRow).toHaveTextContent("Cardio");
    expect(fullRow).not.toHaveTextContent("Natação");
    expect(fullRow).toHaveTextContent("Ciclismo");
    expect(fullRow).toHaveTextContent("Nutrição");
  });
});
