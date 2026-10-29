import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import PublicCompanyInformation from "./PublicCompanyInformation";
afterEach(cleanup);
function open(path: string) { render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/empresa/:slug/:page" element={<PublicCompanyInformation />} /></Routes></MemoryRouter>); }
it("loads only the exact public company and links to supplied policies", async () => {
  rpc.mockResolvedValue({ data: { name: "Synthetic A", slug: "synthetic-a", brand: { terms_url: "https://example.org/terms" } }, error: null });
  open("/empresa/synthetic-a/termos");
  expect(await screen.findByRole("link", { name: /Consultar documento/ })).toHaveAttribute("href", "https://example.org/terms");
  expect(rpc).toHaveBeenCalledWith("get_public_company_information", { _slug: "synthetic-a" });
});
it("does not fabricate legal text or render dangerous configured links", async () => {
  rpc.mockResolvedValue({ data: { name: "Synthetic B", slug: "synthetic-b", brand: { privacy_url: "javascript:alert(1)" } }, error: null });
  open("/empresa/synthetic-b/privacidade");
  expect(await screen.findByText("Documento ainda não informado pela empresa.")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Consultar/ })).toBeNull();
});
it("renders only the approved structured document for the actual company context", async()=>{
 rpc.mockResolvedValue({data:{name:"Synthetic A",slug:"synthetic-a",brand:{},documents:{sobre:{title:"Nosso acompanhamento",sections:[{heading:"Equipe",body:"Conteúdo aprovado da empresa A."}],version:2}}},error:null});
 open("/empresa/synthetic-a/sobre");
 expect(await screen.findByText("Conteúdo aprovado da empresa A.")).toBeInTheDocument();
 expect(screen.getByRole("heading",{name:"Nosso acompanhamento"})).toBeInTheDocument();
});
