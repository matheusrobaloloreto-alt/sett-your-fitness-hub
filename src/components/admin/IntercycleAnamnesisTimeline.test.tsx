import { act, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ reads: new Map<string, Promise<unknown>>() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      let studentId: string;
      const query = {
        select: () => query,
        eq: (column: string, value: string) => {
          if (column === "student_id") studentId = value;
          return query;
        },
        order: () => fixture.reads.get(studentId),
      };
      return query;
    },
  },
}));
vi.mock("@/hooks/usePublishedInstrument", () => ({ usePublishedInstrument: () => null }));

import { IntercycleAnamnesisTimeline } from "./IntercycleAnamnesisControls";

it("keeps late historical answers out of the next student's profile and distinguishes a read error", async () => {
  let resolvePrevious!: (result: unknown) => void;
  fixture.reads.set("previous", new Promise(resolve => { resolvePrevious = resolve; }));
  fixture.reads.set("next", Promise.resolve({ data: null, error: { message: "denied" } }));
  const view = render(<IntercycleAnamnesisTimeline studentId="previous" companyId="tenant" />);
  expect(screen.getByRole("status")).toHaveTextContent("Carregando");
  view.rerender(<IntercycleAnamnesisTimeline studentId="next" companyId="tenant" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar");
  await act(async () => resolvePrevious({ data: [{ id: "old-response", additional_information: "Previous response" }] }));
  expect(screen.queryByText(/Previous response/)).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toBeInTheDocument();
});
