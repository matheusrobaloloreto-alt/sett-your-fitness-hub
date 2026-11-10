import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PanelStudentSearch } from "./PanelStudentSearch";

const db = vi.hoisted(() => ({
  from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: db }));

function mount(role: string, rows: { id: string; full_name: string; company_id: string }[]) {
  db.from.mockReturnValue(db);
  db.select.mockReturnValue(db);
  db.eq.mockReturnValue(db);
  db.order.mockReturnValue(db);
  db.range.mockResolvedValue({ data: rows, error: null });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<PanelStudentSearch companyId="company-a" userId="actor" role={role} />} />
          <Route path="/trainer/students/:id" element={<h1>Perfil do treinador</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return screen.getByRole("searchbox", { name: "Pesquisar alunos" });
}

describe("student search in the panel header", () => {
  it("loads names on demand, matches without accents and opens the profile with Enter", async () => {
    db.from.mockClear();
    const input = mount("trainer", [{ id: "student-a", full_name: "Taís Silva", company_id: "company-a" }]);
    fireEvent.change(input, { target: { value: "T" } });
    expect(db.from).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "tais" } });
    expect(await screen.findByRole("link", { name: "Taís Silva" })).toHaveAttribute("href", "/trainer/students/student-a");
    expect(db.select).toHaveBeenCalledWith("id, full_name, company_id");
    expect(db.eq).toHaveBeenCalledWith("company_id", "company-a");
    fireEvent.submit(screen.getByRole("search", { name: "Busca de alunos" }));
    expect(screen.getByRole("heading", { name: "Perfil do treinador" })).toBeVisible();
  });

  it("rejects a response containing a row from another company", async () => {
    const input = mount("admin", [{ id: "student-b", full_name: "Aluna externa", company_id: "company-b" }]);
    fireEvent.change(input, { target: { value: "externa" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível buscar os alunos.");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("refreshes the directory when the search is reopened", async () => {
    const input = mount("admin", [{ id: "old", full_name: "Ana Antiga", company_id: "company-a" }]);
    fireEvent.change(input, { target: { value: "ana" } });
    expect(await screen.findByRole("link", { name: "Ana Antiga" })).toBeVisible();
    fireEvent.blur(input);
    db.range.mockResolvedValue({ data: [{ id: "new", full_name: "Ana Nova", company_id: "company-a" }], error: null });
    fireEvent.focus(input);
    expect(await screen.findByRole("link", { name: "Ana Nova" })).toHaveAttribute("href", "/admin/students/new");
    expect(screen.queryByRole("link", { name: "Ana Antiga" })).toBeNull();
  });
});
