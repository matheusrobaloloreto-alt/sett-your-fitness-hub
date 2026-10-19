import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WhatsAppSettings from "./WhatsAppSettings";

const mocks = vi.hoisted(() => ({
  auth: { role: "admin", companyId: "company-a" },
  master: { isViewingCompany: false, viewingCompany: null as { id: string } | null },
  getSession: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/contexts/MasterContext", () => ({
  useMaster: () => mocks.master,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

let replies: Record<string, unknown>;
let requests: string[];
let httpStatus: Record<string, number>;
beforeEach(() => {
  mocks.auth.role = "admin";
  mocks.master = { isViewingCompany: false, viewingCompany: null };
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: "fixture-session" } } });
  replies = {
    "check-status": { status: "disconnected" },
    "fetch-bot-settings": { enabled: false, source: "typebot" },
  };
  requests = [];
  httpStatus = {};
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    const { action } = JSON.parse(init.body);
    requests.push(action);
    const body = await replies[action];
    if (body instanceof Error) throw body;
    return { ok: !httpStatus[action], status: httpStatus[action] || 200, json: async () => body };
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function expectNoMutations() {
  expect(requests.every(action => ["check-status", "fetch-bot-settings", "provider-diagnostics"].includes(action))).toBe(true);
}

function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>(done => { resolve = done; });
  return { promise, resolve };
}

describe("WhatsAppSettings uncertain provider state", () => {
  it.each([
    new Error("network failed https://private.invalid/token/secret 5511999999999"),
    null,
    {},
    { status: "unexpected" },
  ])("does not claim disconnection on an unavailable or malformed status: %j", async reply => {
    replies["check-status"] = reply;
    render(<WhatsAppSettings />);
    expect(await screen.findByText("Estado desconhecido")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/não foi possível verificar/i);
    expect(screen.queryByText("Desconectado", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Conectar WhatsApp" })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("private.invalid");
    expectNoMutations();
  });

  it.each([
    ["whatsapp_provider_unauthorized", /autorização/i],
    ["whatsapp_provider_busy", /ocupado|limite/i],
    ["whatsapp_provider_failure", /provedor/i],
  ])("shows a safe explanation for HTTP 200 issue %s", async (code, message) => {
    replies["check-status"] = { status: "disconnected", code, details: "secret raw provider body" };
    render(<WhatsAppSettings />);
    expect(await screen.findByText("Estado desconhecido")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("alert")).toHaveTextContent(code);
    expect(screen.queryByRole("button", { name: "Conectar WhatsApp" })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("secret raw provider body");
    expectNoMutations();
  });

  it("keeps known provider codes on non-2xx responses without showing raw errors", async () => {
    httpStatus["check-status"] = 503;
    replies["check-status"] = { code: "whatsapp_provider_failure", error: "Bearer secret 5511999999999" };
    render(<WhatsAppSettings />);
    expect(await screen.findByRole("alert")).toHaveTextContent("whatsapp_provider_failure");
    expect(document.body).not.toHaveTextContent("Bearer secret");
  });

  it("can verify status manually after a failed request", async () => {
    replies["check-status"] = new Error("offline");
    render(<WhatsAppSettings />);
    await screen.findByText("Estado desconhecido");
    replies["check-status"] = { status: "connected", phone: null };
    fireEvent.click(screen.getByRole("button", { name: "Verificar conexão" }));
    expect(await screen.findByText("Conectado", { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expectNoMutations();
  });

  it("preserves a confirmed disconnected response", async () => {
    render(<WhatsAppSettings />);
    expect(await screen.findByText("Desconectado", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Conectar WhatsApp" })).toBeEnabled();
  });

  it.each(["whatsapp_instance_missing", "whatsapp_instance_not_connected"])(
    "offers manual connection for known instance state %s without automatic actions", async code => {
      replies["check-status"] = { status: "disconnected", code };
      render(<WhatsAppSettings />);
      expect(await screen.findByText("Desconectado", { exact: true })).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(code);
      expect(screen.getByRole("button", { name: "Conectar WhatsApp" })).toBeEnabled();
      expectNoMutations();
      replies["init-connection"] = { status: "waiting_qr", qrcode: "fixture-qr" };
      fireEvent.click(screen.getByRole("button", { name: "Conectar WhatsApp" }));
      expect(await screen.findByText("Aguardando leitura")).toBeInTheDocument();
      expect(requests.filter(action => action === "init-connection")).toHaveLength(1);
      expect(requests).not.toContain("restart-connection");
      expect(requests).not.toContain("disconnect");
    },
  );

  it.each([401, 503])("does not offer connection on HTTP %s even with an instance-missing code", async status => {
    httpStatus["check-status"] = status;
    replies["check-status"] = { status: "disconnected", code: "whatsapp_instance_missing" };
    render(<WhatsAppSettings />);
    expect(await screen.findByText("Estado desconhecido")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Conectar WhatsApp" })).not.toBeInTheDocument();
    expectNoMutations();
  });

  it("stops QR polling after an uncertain response without refreshing or restarting", async () => {
    render(<WhatsAppSettings />);
    await screen.findByText("Desconectado", { exact: true });
    vi.useFakeTimers();
    replies["init-connection"] = { status: "waiting_qr", qrcode: "fixture-qr" };
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Conectar WhatsApp" })); });
    replies["check-status"] = { status: "disconnected", code: "whatsapp_provider_failure" };
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(screen.getByText("Estado desconhecido")).toBeInTheDocument();
    const count = requests.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(requests).toHaveLength(count);
    expect(requests).not.toContain("refresh-qr");
    expect(requests).not.toContain("restart-connection");
    expect(requests).not.toContain("disconnect");
  });

  it("does not surface unknown issue codes or raw messages", async () => {
    replies["check-status"] = { status: "disconnected", code: "private-token-5511999999999", error: "Bearer fixture-secret" };
    render(<WhatsAppSettings />);
    expect(await screen.findByText("Estado desconhecido")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("private-token");
    expect(document.body).not.toHaveTextContent("fixture-secret");
  });

  it.each([new Error("offline"), null, {}, { enabled: false, source: "none" }, { error: "provider failed" }])(
    "does not claim no external bot when the lookup is unverified: %j", async reply => {
      replies["fetch-bot-settings"] = reply;
      render(<WhatsAppSettings />);
      expect(await screen.findByText("Automação externa não verificada")).toBeInTheDocument();
      expect(screen.queryByText("Nenhuma automação externa detectada")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Desativar automação externa" })).not.toBeInTheDocument();
      replies["fetch-bot-settings"] = { enabled: false, source: "settings" };
      fireEvent.click(screen.getByRole("button", { name: "Verificar novamente" }));
      expect(await screen.findByText("Nenhuma automação externa detectada")).toBeInTheDocument();
      expectNoMutations();
    },
  );

  it("does not leave the view loading when the session expires", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    render(<WhatsAppSettings />);
    expect(await screen.findByText("Estado desconhecido")).toBeInTheDocument();
    expect(await screen.findByText("Automação externa não verificada")).toBeInTheDocument();
    expect(requests).toEqual([]);
  });

  it("loads diagnostics only on admin request and displays only approved host and endpoint fields", async () => {
    replies["provider-diagnostics"] = {
      evolution: { configured: true, host: "provider.example.com", configuredBaseHasPath: true, candidates: [
        { candidate: "configured", fetchInstances: { status: 404, classification: "not_found" }, connectionState: { status: 404, classification: "not_found" } },
        { candidate: "origin", fetchInstances: { status: 200, classification: "ok" }, connectionState: { status: 401, classification: "unauthorized" } },
      ] },
      zapi: { configured: false, classification: "not_configured" },
      phone: "5511999999999", token: "fixture-secret", instanceId: "private-instance",
    };
    render(<WhatsAppSettings />);
    await screen.findByText("Desconectado", { exact: true });
    expect(requests).not.toContain("provider-diagnostics");
    fireEvent.click(screen.getByRole("button", { name: "Diagnóstico do provedor" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("provider.example.com"));
    expect(screen.getByRole("status")).toHaveTextContent(/fetchInstances.*404/);
    expect(screen.getByRole("status")).toHaveTextContent(/connectionState.*401/);
    for (const sensitive of ["5511999999999", "fixture-secret", "private-instance"]) expect(document.body).not.toHaveTextContent(sensitive);
    expect(requests.filter(action => action === "provider-diagnostics")).toHaveLength(1);
    expectNoMutations();
  });

  it("redacts unexpected diagnostic fields and untrusted host/classification strings", async () => {
    replies["provider-diagnostics"] = { evolution: { configured: true, host: "https://user:secret@provider.invalid/path", candidates: [
      { candidate: "configured", fetchInstances: { status: "5511999999999", classification: "Bearer fixture-secret" } },
    ] } };
    render(<WhatsAppSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Diagnóstico do provedor" }));
    await waitFor(() => expect(requests).toContain("provider-diagnostics"));
    await screen.findByRole("status");
    expect(document.body).not.toHaveTextContent("fixture-secret");
    expect(document.body).not.toHaveTextContent("user:secret");
    expect(document.body).not.toHaveTextContent("5511999999999");
  });

  it("does not offer diagnostics to a trainer", async () => {
    mocks.auth.role = "trainer";
    render(<WhatsAppSettings />);
    await screen.findByText("Desconectado", { exact: true });
    expect(screen.queryByRole("button", { name: "Diagnóstico do provedor" })).not.toBeInTheDocument();
  });

  it("keeps diagnostic request failures sanitized and does not change the connection", async () => {
    httpStatus["provider-diagnostics"] = 503;
    replies["provider-diagnostics"] = { error: "https://user:secret@provider.invalid/5511999999999" };
    render(<WhatsAppSettings />);
    await screen.findByText("Desconectado", { exact: true });
    fireEvent.click(screen.getByRole("button", { name: "Diagnóstico do provedor" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/não foi possível consultar/i);
    expect(screen.getByText("Desconectado", { exact: true })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("user:secret");
    expectNoMutations();
  });

  it.each(["success", "failure"])("ignores a previous company's diagnostic %s while the current request is pending", async outcome => {
    mocks.auth.role = "master";
    mocks.master = { isViewingCompany: true, viewingCompany: { id: "company-a" } };
    const oldRequest = deferred();
    const currentRequest = deferred();
    replies["provider-diagnostics"] = oldRequest.promise;
    const view = render(<WhatsAppSettings />);
    const button = () => screen.getByRole("button", { name: "Diagnóstico do provedor" });
    fireEvent.click(button());
    await waitFor(() => expect(requests.filter(action => action === "provider-diagnostics")).toHaveLength(1));
    expect(button()).toBeDisabled();

    mocks.master = { isViewingCompany: true, viewingCompany: { id: "company-b" } };
    await act(async () => { view.rerender(<WhatsAppSettings />); });
    expect(button()).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    replies["provider-diagnostics"] = currentRequest.promise;
    fireEvent.click(button());
    await waitFor(() => expect(requests.filter(action => action === "provider-diagnostics")).toHaveLength(2));

    await act(async () => {
      oldRequest.resolve(outcome === "failure" ? new Error("old request failed") : {
        evolution: { configured: true, host: "old.example.com", candidates: [] },
      });
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(button()).toBeDisabled();

    await act(async () => {
      currentRequest.resolve({ evolution: { configured: true, host: "current.example.com", candidates: [] } });
    });
    expect(screen.getByRole("status")).toHaveTextContent("current.example.com");
    expect(screen.getByRole("status")).not.toHaveTextContent("old.example.com");
    expect(button()).toBeEnabled();
    expectNoMutations();

    mocks.master = { isViewingCompany: true, viewingCompany: { id: "company-a" } };
    await act(async () => { view.rerender(<WhatsAppSettings />); });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
