import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import PublicPayment from "./PublicPayment";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), toast: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("retires a canceled Pix QR and stops polling without recording a completed payment", async () => {
  mocks.invoke.mockImplementation(async (_name, { body }) => ({
    data: body.action === "context" ? {
      student: { full_name: "Aluno sintético", country_code: "BR" },
      plans: [{ id: "plan", name: "Plano sintético", price: 120, duration_weeks: 24, description: null }],
    } : {},
  }));
  const fetchAsaas = vi.fn(async (_url, init: RequestInit) => {
    const { action, paymentId } = JSON.parse(String(init.body));
    switch (action) {
      case "create-payment":
        return Response.json({ paymentId: "pay_fixture", status: "PENDING" });
      case "get-pix-qrcode":
        return Response.json({ encodedImage: "cGl4", payload: "pix-fixture" });
      case "get-payment-status":
        expect(paymentId).toBe("pay_fixture");
        return Response.json({ status: "DELETED" });
      default:
        throw new Error("Unexpected checkout action");
    }
  });
  vi.stubGlobal("fetch", fetchAsaas);
  render(<MemoryRouter initialEntries={["/pay/fixture"]}>
    <Routes><Route path="/pay/:token" element={<PublicPayment />} /></Routes>
  </MemoryRouter>);

  fireEvent.click(await screen.findByRole("button", { name: /Plano sintético/ }));
  const payWithPix = await screen.findByRole("button", { name: "Pagar com Pix via Asaas" });
  let poll: (() => Promise<void>) | undefined;
  const setInterval = window.setInterval.bind(window);
  const clearInterval = vi.spyOn(window, "clearInterval");
  const pollInterval = 12345;
  vi.spyOn(window, "setInterval").mockImplementation((callback, delay, ...args) => {
    if (delay !== 10_000) return setInterval(callback, delay, ...args);
    poll = callback as () => Promise<void>;
    return pollInterval;
  });
  await act(async () => { fireEvent.click(payWithPix); });
  expect(screen.getByAltText("QR Code Pix")).toBeInTheDocument();
  expect(poll).toBeDefined();

  await act(async () => { await poll?.(); });
  expect(screen.queryByAltText("QR Code Pix")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Pagar com Pix via Asaas" })).toBeEnabled();
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Cobrança Pix cancelada" }));
  expect(mocks.invoke.mock.calls.some(([, { body }]) => body.eventType === "payment_completed")).toBe(false);

  expect(clearInterval).toHaveBeenCalledWith(pollInterval);
  expect(fetchAsaas).toHaveBeenCalledTimes(3);
});
