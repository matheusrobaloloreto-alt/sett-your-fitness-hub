import { Component, type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ catalog: vi.fn(), invoke: vi.fn() }));
vi.mock("@/hooks/usePlatformCatalog", () => ({ usePlatformCatalog: mocks.catalog }));
vi.mock("@/contexts/MasterContext", () => ({ useMaster: () => ({ setViewingCompany: vi.fn() }) }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    from: (table: string) => ({
      select: () => table === "companies" ? {
        order: async () => ({ data: [{ id: "synthetic-company", name: "Synthetic Company", tier: "basic", is_active: true }], error: null }),
      } : Promise.resolve({ data: [], error: null }),
    }),
  },
}));
import CompaniesManager from "./CompaniesManager";

class ReviewBoundary extends Component<{ children: ReactNode }, { message: string }> {
  state = { message: "" };
  static getDerivedStateFromError(error: Error) { return { message: error.message }; }
  render() { return this.state.message ? <p role="alert">{this.state.message}</p> : this.props.children; }
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

it.each(["pending", "error"])("keeps company management available without checkout when the catalog is %s", async status => {
  mocks.catalog.mockReturnValue({ data: undefined, status, isPending: status === "pending", isError: status === "error" });
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(<ReviewBoundary><CompaniesManager /></ReviewBoundary>);
  expect(await screen.findByText("Synthetic Company")).toBeVisible();
  expect(screen.queryByText(/slice/)).toBeNull();
  expect(screen.getByRole("button",{name:"Assinar"})).toBeDisabled();
  expect(screen.getByText(status==="error"?"Catálogo indisponível. Recarregue antes de criar uma assinatura.":"Carregando catálogo de assinaturas...")).toBeVisible();
  expect(mocks.invoke).not.toHaveBeenCalled();
});
