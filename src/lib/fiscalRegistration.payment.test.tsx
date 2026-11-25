import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PublicPayment from "../pages/PublicPayment";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), toast: vi.fn(), fetch: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.fetch.mockReset();
  mocks.toast.mockReset();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.invoke.mockImplementation(async (_name, { body }) => ({ data: body.action === "context" ? {
    student: {
      full_name: "Synthetic payer", country_code: "GB", email: "payer@example.com",
      cpf: "AB1234", cep: "SW1A 1AA", whatsapp: "+442079460000",
      address: "1 Example Street", city: "London", state: "",
    },
    plans: [{ id: "plan", name: "Synthetic plan", price: 120, duration_weeks: 24 }],
  } : body.action === "set-billing-profile" ? { ok: true, billingCountryCode: body.billing.countryCode } : {} }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function choosePlan() {
  render(<MemoryRouter initialEntries={["/pay/fixture"]}><Routes><Route path="/pay/:token" element={<PublicPayment />} /></Routes></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: /Synthetic plan/ }));
  await screen.findByRole("button", { name: "Confirmar dados do pagador" });
}

it("collects foreign payer separately, never offers Pix or inline card, and handles capability failure", async () => {
  await choosePlan();
  expect(screen.getByRole("combobox", { name: "País de cobrança" })).toHaveValue("GB");
  expect(screen.getByRole("option", { name: "Reino Unido" })).toHaveValue("GB");
  expect(screen.getByRole("option", { name: "Japão" })).toHaveValue("JP");
  expect(screen.queryByText(/código ISO/i)).not.toBeInTheDocument();
  expect(screen.getByLabelText(/Telefone com/)).toHaveValue("+442079460000");
  expect(screen.queryByRole("button", { name: /Pagar com Pix/ })).not.toBeInTheDocument();
  expect(screen.queryByText("Número do cartão")).not.toBeInTheDocument();
  expect(screen.queryByText("CPF/CNPJ")).not.toBeInTheDocument();
  const pay = screen.getByRole("button", { name: /Preparar pagamento/ });
  expect(pay).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar dados do pagador" }));
  await waitFor(() => expect(pay).toBeEnabled());
  const save = mocks.invoke.mock.calls.find(([, { body }]) => body.action === "set-billing-profile")[1].body;
  expect(save).toMatchObject({ token: "fixture", billing: { countryCode: "GB", documentNumber: "AB1234", postalCode: "SW1A 1AA", phone: "+442079460000", city: "London", state: "" } });
  expect(save.billing).not.toHaveProperty("cpfCnpj");
  mocks.fetch.mockResolvedValueOnce(Response.json({ error: "Capability disabled", code: "FOREIGN_PAYERS_NOT_ENABLED" }, { status: 503 }));
  fireEvent.click(pay);
  await screen.findByRole("alert");
  expect(screen.getByRole("alert")).toHaveTextContent("Nenhum pagamento foi confirmado");
  expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({
    action: "create-foreign-card-payment", checkoutToken: "fixture", planId: "plan", billingType: "CREDIT_CARD", installmentCount: 1, currency: "BRL",
  });
  expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).not.toHaveProperty("creditCardHolderInfo");
  expect(screen.queryByText("PAGAMENTO CONFIRMADO!")).not.toBeInTheDocument();
  expect(mocks.invoke.mock.calls.some(([, { body }]) => body.eventType === "payment_completed")).toBe(false);
});

it("allows an explicit Brazilian payer and returning to exterior without altering the student contact", async () => {
  await choosePlan();
  fireEvent.change(screen.getByLabelText("Local de cobrança"), { target: { value: "BR" } });
  expect(screen.getByLabelText("CPF/CNPJ")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("CPF/CNPJ"), { target: { value: "12345678000190" } });
  expect(screen.getByLabelText("CPF/CNPJ")).toHaveValue("12345678000190");
  expect(screen.getByRole("button", { name: "Pagar com Pix via Asaas" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Local de cobrança"), { target: { value: "FOREIGN" } });
  expect(screen.getByRole("combobox", { name: "País de cobrança" })).toHaveValue("");
  fireEvent.change(screen.getByRole("combobox", { name: "País de cobrança" }), { target: { value: "JP" } });
  expect(screen.getByRole("combobox", { name: "País de cobrança" })).toHaveValue("JP");
  expect(screen.queryByRole("button", { name: /Pagar com Pix/ })).not.toBeInTheDocument();
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.invoke.mock.calls.some(([, { body }]) => body.student)).toBe(false);
});

it("renders a hosted Asaas invoice without treating it as paid", async () => {
  await choosePlan();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar dados do pagador" }));
  const pay = screen.getByRole("button", { name: /Preparar pagamento/ });
  await waitFor(() => expect(pay).toBeEnabled());
  // jsdom reports unsupported navigation; the fallback anchor remains inspectable.
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.fetch.mockResolvedValueOnce(Response.json({ paymentId: "pay_fixture", status: "PENDING", invoiceUrl: "https://sandbox.asaas.com/i/fixture" }));
  fireEvent.click(pay);
  expect(await screen.findByRole("link", { name: "Continuar no ambiente seguro do Asaas" })).toHaveAttribute("href", "https://sandbox.asaas.com/i/fixture");
  expect(pay).toBeDisabled();
  expect(screen.getByText(/Cobrança preparada, ainda não paga/)).toBeInTheDocument();
  expect(screen.queryByText("PAGAMENTO CONFIRMADO!")).not.toBeInTheDocument();
  expect(mocks.invoke.mock.calls.some(([, { body }]) => body.eventType === "payment_completed")).toBe(false);
});
