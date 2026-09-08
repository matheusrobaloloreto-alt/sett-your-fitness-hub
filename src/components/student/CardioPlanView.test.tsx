import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CardioPlanView } from "./CardioPlanView";

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: fromMock,
  },
}));

function makeQuery(result: unknown) {
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.lte = vi.fn(() => query);
  query.is = vi.fn(() => query);
  query.or = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.maybeSingle = vi.fn(() => Promise.resolve(result));
  return query;
}

describe("CardioPlanView", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("does not query or render a legacy cardio plan when the preferred current cycle was cleared", async () => {
    render(
      <CardioPlanView
        studentId="student-1"
        sport="corrida"
        suppressBecauseCurrentCycleCleared
      />,
    );

    expect(await screen.findByText("Nenhum plano de corrida ainda.")).toBeInTheDocument();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("keeps the normal cardio lookup enabled when the preferred current cycle is not cleared", async () => {
    fromMock.mockReturnValue(makeQuery({
      data: {
        plan_name: "Plano legado de corrida",
        sport: "corrida",
        duration_weeks: 4,
        weeks: [
          {
            week_number: 1,
            sessions: [
              { day: "Segunda", title: "Rodagem leve", total_min: 30, zone: "Z2" },
            ],
          },
        ],
      },
      error: null,
    }));

    render(
      <CardioPlanView
        studentId="student-1"
        sport="corrida"
        suppressBecauseCurrentCycleCleared={false}
      />,
    );

    await waitFor(() => expect(fromMock).toHaveBeenCalledWith("running_plans"));
    expect(await screen.findByText("Plano legado de corrida")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Semana 1/i }));
    expect(screen.getByText("Rodagem leve")).toBeInTheDocument();
  });
});
