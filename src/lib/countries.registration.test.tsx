import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import PublicRegistration from "../pages/PublicRegistration";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), toast: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("lets foreign residents select named countries and submits the internal value", async () => {
  mocks.invoke.mockImplementation(async (_name, { body }) => ({ data: body.action === "context" ? {
    company: { id: "company" }, mode: "fiscal",
    student: { full_name: "Synthetic student", country_code: "GB", birth_date: "1990-01-01", address: "Example Street", city: "London", state: "London", whatsapp: "+442079460000", email: "student@example.com" },
  } : { paymentToken: "checkout" } }));
  render(<MemoryRouter initialEntries={["/cadastro-fiscal/fixture"]}><Routes><Route path="/cadastro-fiscal/:token" element={<PublicRegistration />} /></Routes></MemoryRouter>);
  const country = await screen.findByRole("combobox", { name: "País de residência no exterior *" });
  expect(country).toHaveValue("GB");
  expect(screen.getByRole("option", { name: "Reino Unido" })).toHaveValue("GB");
  expect(screen.queryByText(/código do país|código ISO/i)).not.toBeInTheDocument();
  fireEvent.change(country, { target: { value: "JP" } });
  expect(country).toHaveValue("JP");
  fireEvent.click(screen.getByRole("button", { name: "Concluir cadastro e seguir para pagamento" }));
  await waitFor(() => expect(mocks.invoke.mock.calls.some(([, { body }]) => body.student?.country_code === "JP")).toBe(true));
});
