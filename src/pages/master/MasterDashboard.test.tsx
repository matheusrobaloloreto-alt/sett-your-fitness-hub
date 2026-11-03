import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const readState = vi.hoisted(() => ({ failed: false, pending: false }));
afterEach(() => { cleanup(); readState.failed = false; readState.pending = false; });
vi.mock("@/lib/platformSettingsClient", () => ({ fetchPublicPlatformCatalog: vi.fn().mockResolvedValue(null) }));

vi.mock("@/contexts/MasterContext", () => ({
  useMaster: () => ({ viewingCompany: null, exitCompanyView: vi.fn() }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn((columns: string) => {
        const response = readState.pending ? new Promise(() => {}) : Promise.resolve({ data: [], error: readState.failed ? { message: "read_failed" } : null });
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

it("does not present failed master reads as an empty company portfolio", async () => {
  readState.failed = true;
  render(<MemoryRouter><MasterDashboard /></MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível consultar');
  expect(screen.queryByText('Nenhuma empresa cadastrada.')).toBeNull();
  expect(screen.getAllByText('Indisponível').length).toBeGreaterThan(0);
});
it("keeps master counters unknown while reads are pending", () => {
  readState.pending = true;
  render(<MemoryRouter><MasterDashboard /></MemoryRouter>);
  expect(screen.getAllByText('Carregando…').length).toBe(5);
  expect(screen.queryByText('Nenhuma empresa cadastrada.')).toBeNull();
});
