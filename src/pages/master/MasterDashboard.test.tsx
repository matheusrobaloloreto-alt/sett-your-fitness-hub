import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/MasterContext", () => ({
  useMaster: () => ({ viewingCompany: null, exitCompanyView: vi.fn() }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn((columns: string) => {
        const response = Promise.resolve({ data: [], error: null });
        return columns === "*"
          ? { order: vi.fn(() => response) }
          : response;
      }),
    })),
  },
}));

import MasterDashboard from "./MasterDashboard";

describe("MasterDashboard", () => {
  it("renders the BN Content navigation without crashing", async () => {
    render(
      <MemoryRouter>
        <MasterDashboard />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: /Abrir BN Content/i })).toBeInTheDocument();
    expect(await screen.findByText("Nenhuma empresa cadastrada.")).toBeInTheDocument();
  });
});
