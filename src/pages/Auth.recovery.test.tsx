import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import Auth from "./Auth";
import ResetPassword from "./ResetPassword";
import { PasswordRecoveryBoundary } from "@/components/PasswordRecoveryBoundary";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(), update: vi.fn(), getUser: vi.fn(), complete: vi.fn(),
  auth: { user: null as null | { id: string }, loading: false, passwordRecovery: false },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { updateUser: mocks.update, getUser: mocks.getUser },
  functions: { invoke: mocks.invoke },
} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ ...mocks.auth, completePasswordRecovery: mocks.complete }) }));
vi.mock("@/components/Logo", () => ({ Logo: () => <span>SETT</span> }));

describe("password recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/");
    mocks.auth = { user: null, loading: false, passwordRecovery: false };
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "student" } }, error: null });
    mocks.update.mockResolvedValue({ data: { user: { id: "student" } }, error: null });
  });

  it("exposes forgot password without requiring the forgotten password and sends a neutral confirmation", async () => {
    render(<MemoryRouter initialEntries={["/auth?as=student"]}><Auth /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "student@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Esqueci minha senha" }));
    expect(screen.queryByLabelText("Senha")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enviar link de recuperação" }));
    await screen.findByRole("status");
    expect(mocks.invoke).toHaveBeenCalledWith("student-recovery-whatsapp", {
      body: { email: "student@example.test" },
    });
    expect(screen.getByRole("status")).toHaveTextContent("Se este e-mail estiver cadastrado");
    expect(screen.getByRole("status")).toHaveTextContent("WhatsApp confirmado");
  });

  it("recovers from network errors and handles rate limits without a false sent message", async () => {
    mocks.invoke.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ error: { status: 429 } });
    render(<MemoryRouter initialEntries={["/auth?mode=recovery"]}><Auth /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "student@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar link de recuperação" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível enviar");
    fireEvent.click(screen.getByRole("button", { name: "Enviar link de recuperação" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Muitas tentativas"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not issue a second recovery request while the first is pending", async () => {
    let resolve: (value: unknown) => void = () => {};
    mocks.invoke.mockReturnValue(new Promise(done => { resolve = done; }));
    render(<MemoryRouter initialEntries={["/auth?mode=recovery"]}><Auth /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "student@example.test" } });
    const form = screen.getByLabelText("Email").closest("form")!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    resolve({ error: null });
    await screen.findByRole("status");
  });

  it("validates confirmation and changes the authenticated user's password", async () => {
    render(<MemoryRouter><ResetPassword /></MemoryRouter>);
    const password = await screen.findByLabelText("Nova senha");
    fireEvent.change(password, { target: { value: "NewPassword123!" } });
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: "Different123!" } });
    fireEvent.submit(password.closest("form")!);
    expect(screen.getByRole("alert")).toHaveTextContent("não conferem");
    expect(mocks.update).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: "NewPassword123!" } });
    fireEvent.submit(password.closest("form")!);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Senha atualizada"));
    expect(mocks.update).toHaveBeenCalledWith({ password: "NewPassword123!" });
    expect(mocks.complete).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText("Nova senha")).not.toBeInTheDocument();
  });

  it("rejects an expired link even if another account already has a session", async () => {
    window.history.replaceState({}, "", "/auth/reset-password#error_code=otp_expired&error=access_denied");
    render(<MemoryRouter><ResetPassword /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("expirou");
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Solicitar novo link" })).toHaveAttribute("href", "/auth?mode=recovery");
    expect(window.location.hash).toBe("");
  });

  it("requires a verified session instead of trusting the recovery route", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("missing session") });
    render(<MemoryRouter><ResetPassword /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("não é válido");
    expect(screen.queryByLabelText("Nova senha")).not.toBeInTheDocument();
  });

  it("does not claim success when updating the password fails", async () => {
    mocks.update.mockRejectedValue(new Error("offline"));
    render(<MemoryRouter><ResetPassword /></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText("Nova senha"), { target: { value: "NewPassword123!" } });
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: "NewPassword123!" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Verifique sua conexão");
    expect(screen.getByRole("button", { name: "Salvar nova senha" })).toBeEnabled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("keeps the recovery screen reachable when the callback falls back to the root", () => {
    mocks.auth.passwordRecovery = true;
    function LocationProbe() {
      const location = useLocation();
      return <output>{location.pathname}</output>;
    }
    render(<MemoryRouter initialEntries={["/"]}><PasswordRecoveryBoundary><LocationProbe /></PasswordRecoveryBoundary></MemoryRouter>);
    expect(screen.getByRole("status")).toHaveTextContent("/auth/reset-password");
  });
});
