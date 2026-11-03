import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { role: "trainer" as string | null, companyId: "company-a" as string | null,
    user: { id: "actor" }, session: { user: { id: "actor" } } },
  master: { viewingCompany: null as { id: string } | null, isViewingCompany: false },
  from: vi.fn(), read: vi.fn(), rpc: vi.fn(), invoke: vi.fn(), toast: vi.fn(), navigate: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
  writes: [] as Array<{ table: string; values: unknown; filters: Record<string, unknown> }>,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/contexts/MasterContext", () => ({ useMaster: () => mocks.master }));
vi.mock("@/hooks/useCompanyExperiencePolicy", async () => {
  const { DEFAULT_COMPANY_PRODUCT_SETTINGS } = await import('../../../supabase/functions/_shared/company-product-settings');
  return { useCompanyExperiencePolicy: () => ({ policy: DEFAULT_COMPANY_PRODUCT_SETTINGS.experience, error: null, isPending: false }) };
});
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
  useSearchParams: () => [new URLSearchParams()],
  useLocation: () => ({ pathname: "/trainer/portfolio" }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc, functions: { invoke: mocks.invoke } },
}));
vi.mock("@/components/BnitoFloatingAssistant", () => ({ BnitoContextButton: () => null }));
vi.mock("@/components/admin/StudentChatButton", () => ({ StudentChatButton: () => null }));
vi.mock("@/components/AthleticClubStar", () => ({ AthleticClubStar: () => null }));
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  return {
    Select: ({ children, value = "", onValueChange, disabled }: PropsWithChildren<{
      value?: string; onValueChange?: (value: string) => void; disabled?: boolean;
    }>) => {
      const trigger = React.Children.toArray(children).find(React.isValidElement) as
        React.ReactElement<{ "aria-label"?: string }> | undefined;
      return <select aria-label={trigger?.props["aria-label"]} value={value} disabled={disabled}
        onChange={(event) => onValueChange?.(event.target.value)}>
        <option value={value} hidden>{value}</option>{children}
      </select>;
    },
    SelectTrigger: () => null, SelectValue: () => null,
    SelectContent: ({ children }: PropsWithChildren) => <>{children}</>,
    SelectItem: ({ children, value, disabled }: PropsWithChildren<{ value: string; disabled?: boolean }>) =>
      <option value={value} disabled={disabled}>{children}</option>,
  };
});

import StudentsManager from "./StudentsManager";
import Portfolio from "./Portfolio";

function deferredRead() {
  let resolve!: (value: { data: unknown[]; error: null }) => void;
  const promise = new Promise<{ data: unknown[]; error: null }>((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture(company = "company-a") {
  return { id: "student-a", company_id: company, full_name: "Fixture Student", status: "active",
    assigned_trainer_id: "another-trainer", email: "fixture@example.invalid", user_id: "student-user",
    country_code: "PT", created_at: "2026-10-01T12:00:00Z" };
}

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  mocks.auth.role = "trainer";
  mocks.auth.companyId = "company-a";
  mocks.master = { viewingCompany: null, isViewingCompany: false };
  mocks.rows = [fixture()];
  mocks.writes = [];
  mocks.toast.mockReset();
  mocks.read.mockReset().mockImplementation((_table, _filters, result) => result);
  mocks.rpc.mockReset().mockImplementation(async (name: string) => ({
    data: name === "get_company_student_staff_directory" ? [
      { user_id: "actor", full_name: "Fixture Actor", roles: ["trainer"] },
      { user_id: "target-trainer", full_name: "Fixture Target", roles: ["trainer"] },
      { user_id: "admin-only", full_name: "Fixture Admin", roles: ["admin"] },
      { user_id: "coordinator-only", full_name: "Fixture Coordinator", roles: ["coordinator"] },
      { user_id: "master-only", full_name: "Fixture Master", roles: ["master"] },
    ] : [], error: null,
  }));
  mocks.from.mockReset().mockImplementation((table: string) => {
    const filters: Record<string, unknown> = {};
    let values: unknown;
    const query = {
      select: () => query, order: () => query, in: () => query,
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      update: (payload: unknown) => { values = payload; return query; },
      delete: () => { values = "delete"; return query; },
      then: (resolve: (result: object) => unknown) => {
        if (values !== undefined) mocks.writes.push({ table, values, filters: { ...filters } });
        const data = table === "students" ? mocks.rows.filter((row) =>
          Object.entries(filters).every(([key, value]) => row[key] === value))
          : table === "company_members" ? [{ user_id: "actor" }, { user_id: "target-trainer" }]
          : table === "user_roles" ? [{ user_id: "actor", role: "trainer" }]
          : table === "profiles" ? [{ user_id: "actor", full_name: "Fixture Actor" }, { user_id: "target-trainer", full_name: "Fixture Target" }]
          : [];
        return Promise.resolve(mocks.read(table, { ...filters }, { data, error: null })).then(resolve);
      },
    };
    return query;
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe.each([
  ["StudentsManager", StudentsManager], ["Portfolio", Portfolio],
] as const)("%s company staff management", (_name, Page) => {
  it.each(["trainer", "coordinator", "admin", "master"])(
    "lets %s edit a same-company student assigned to another trainer", async (role) => {
      mocks.auth.role = role;
      if (role === "master") mocks.master = { viewingCompany: { id: "company-a" }, isViewingCompany: true };
      render(<Page />);
      fireEvent.click(await screen.findByRole("button", { name: /Editar Fixture Student/ }));
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toBeInTheDocument();
      fireEvent.change(within(dialog).getAllByRole("textbox")[0], { target: { value: "Fixture Student edited" } });
      fireEvent.click(within(dialog).getByRole("button", { name: /Salvar/ }));
      await waitFor(() => expect(mocks.writes).toHaveLength(1));
      expect(mocks.writes[0]).toMatchObject({ table: "students", values: { full_name: "Fixture Student edited" }, filters: { id: "student-a", company_id: "company-a" } });
    },
  );

  it.each(["student", null])("does not give %s the staff edit controls", async (role) => {
    mocks.auth.role = role;
    render(<Page />);
    if (Page === StudentsManager) {
      await act(async () => {});
      expect(screen.queryByText("Fixture Student")).not.toBeInTheDocument();
      expect(mocks.from).not.toHaveBeenCalledWith("students");
      expect(mocks.rpc).not.toHaveBeenCalledWith("get_company_student_staff_directory", expect.anything());
    } else {
      // Portfolio's existing read contract is separate; both pages deny staff controls.
      await screen.findByText("Fixture Student");
    }
    expect(screen.queryByRole("combobox", { name: "Professor responsável por Fixture Student" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Excluir Fixture Student/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Editar Fixture Student/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Trocar professor de Fixture Student/ })).not.toBeInTheDocument();
  });

  it("keeps an open editor from writing after switching company", async () => {
    const nextCompany = deferredRead();
    mocks.read.mockImplementation((table, filters, result) => (
      table === "students" && filters.company_id === "company-b" ? nextCompany.promise : result
    ));
    const view = render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: /Editar Fixture Student/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    const originalSave = screen.getByRole("button", { name: /Salvar/ });
    expect(originalSave).toBeEnabled();
    mocks.auth.companyId = "company-b";
    view.rerender(<Page />);
    await waitFor(() => expect(mocks.read).toHaveBeenCalledWith(
      "students", expect.objectContaining({ company_id: "company-b" }), expect.anything(),
    ));
    if (Page === StudentsManager) {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(originalSave).not.toBeInTheDocument();
    } else {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    }
    expect(mocks.writes).toHaveLength(0);
    await act(async () => { nextCompany.resolve({ data: [], error: null }); });
    expect(screen.queryByText("Fixture Student")).not.toBeInTheDocument();
    expect(mocks.writes).toHaveLength(0);
  });

  it("does not load another company's students or master data without a selected company", async () => {
    mocks.rows = [fixture("company-b")];
    const view = render(<Page />);
    await waitFor(() => expect(mocks.from).toHaveBeenCalledWith("students"));
    expect(screen.queryByText("Fixture Student")).not.toBeInTheDocument();
    view.unmount();
    mocks.from.mockClear();
    mocks.auth.role = "master";
    render(<Page />);
    expect(mocks.from).not.toHaveBeenCalledWith("students");
  });
});

it("allows a trainer to open reassignment for another trainer's same-company student", async () => {
  render(<Portfolio />);
  fireEvent.click(await screen.findByRole("button", { name: "Trocar professor de Fixture Student" }));
  expect(await screen.findByRole("dialog")).toHaveTextContent("Trocar professor");
  expect(mocks.rpc.mock.calls.some(([name]) => name === "reassign_student_trainer")).toBe(false);
});

it.each([
  ["target-trainer", "Fixture Target"], ["admin-only", "Fixture Admin"],
  ["coordinator-only", "Fixture Coordinator"], ["master-only", "Fixture Master"],
])("submits Portfolio reassignment to %s with the original trainer CAS intact", async (targetId, targetName) => {
  render(<Portfolio />);
  fireEvent.click(await screen.findByRole("button", { name: "Trocar professor de Fixture Student" }));
  fireEvent.click(await screen.findByRole("button", { name: `${targetName} Professor` }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar troca" }));
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("reassign_student_trainer", {
    _student_id: "student-a", _trainer_id: targetId, _expected_trainer_id: "another-trainer",
  }));
  expect(mocks.rpc).toHaveBeenCalledWith("get_company_student_staff_directory", { _company_id: "company-a" });
  expect(mocks.from).not.toHaveBeenCalledWith("user_roles");
  expect(mocks.writes).toHaveLength(0);
});

it.each([
  ["target-trainer", "Fixture Target"], ["admin-only", "Fixture Admin"],
  ["coordinator-only", "Fixture Coordinator"], ["master-only", "Fixture Master"],
])("loads the staff directory and reassigns from StudentsManager to %s through CAS only", async (targetId, targetName) => {
  render(<StudentsManager />);
  const selector = await screen.findByRole("combobox", { name: "Professor responsável por Fixture Student" });
  expect(screen.getByRole("option", { name: targetName })).toBeInTheDocument();
  fireEvent.change(selector, { target: { value: targetId } });
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("reassign_student_trainer", {
    _student_id: "student-a", _trainer_id: targetId, _expected_trainer_id: "another-trainer",
  }));
  expect(mocks.rpc).toHaveBeenCalledWith("get_company_student_staff_directory", { _company_id: "company-a" });
  expect(mocks.from).not.toHaveBeenCalledWith("user_roles");
  expect(mocks.from).not.toHaveBeenCalledWith("company_members");
  expect(mocks.writes).toHaveLength(0);
});

it("keeps a failed directory closed instead of falling back to globally queried roles", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "directory denied" } });
  render(<StudentsManager />);
  await screen.findByRole("combobox", { name: "Professor responsável por Fixture Student" });
  expect(screen.queryByRole("option", { name: "Fixture Target" })).not.toBeInTheDocument();
  expect(mocks.from).not.toHaveBeenCalledWith("user_roles");
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar todos os dados de alunos, planos ou equipe.");
  expect(mocks.rpc).toHaveBeenCalledWith("get_company_student_staff_directory", { _company_id: "company-a" });
  expect(mocks.from).not.toHaveBeenCalledWith("company_members");
  expect(mocks.writes).toHaveLength(0);
});


describe('StudentsManager explicit access generation', () => {
  const ready = () => ({ ready: true, companyId: 'company-a', studentId: 'student-a', chatId: null,
    remoteJid: '351912345678@s.whatsapp.net', preflightToken: 'synthetic-preflight', stateFingerprint: 'snapshot', expiresAt: new Date(Date.now() + 120000).toISOString() });
  beforeEach(() => {
    mocks.rows = [{ ...fixture(), user_id: null, whatsapp: '+351912345678', phone: '+351912345678' }];
    mocks.invoke.mockReset();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });
  it('blocked read-only preflight never reaches credentials or clipboard', async () => {
    mocks.invoke.mockResolvedValue({ data: { error: 'whatsapp_student_phone_ambiguous' }, error: null });
    render(<StudentsManager />);
    fireEvent.click(await screen.findByRole('button', { name: 'Gerar login de Fixture Student' }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })));
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith('whatsapp-manager', expect.objectContaining({ body: expect.objectContaining({ action: 'preflight-student-login' }) }));
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });
  it('explicit generation uses the verified token and copies only acknowledged credentials', async () => {
    mocks.invoke.mockImplementation(async (name: string) => ({ data: name === 'whatsapp-manager' ? ready() : {
      ...ready(), email: 'fixture@example.invalid', password: 'synthetic-only', loginSendToken: 'synthetic-send', stateFingerprint: 'post-generation' }, error: null }));
    render(<StudentsManager />);
    expect(mocks.invoke).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Gerar login de Fixture Student' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    expect(mocks.invoke.mock.calls.map(([name]) => name)).toEqual(['whatsapp-manager', 'student-login-credentials']);
    expect(mocks.invoke.mock.calls[1][1].body).toMatchObject({ action: 'generate-login-credentials', student_id: 'student-a', company_id: 'company-a', preflight_token: 'synthetic-preflight' });
  });
  it('does not generate or copy from a missing generation acknowledgement', async () => {
    mocks.invoke.mockImplementation(async (name: string) => ({ data: name === 'whatsapp-manager' ? ready() : { email: 'fixture@example.invalid', password: 'synthetic-only' }, error: null }));
    render(<StudentsManager />);
    fireEvent.click(await screen.findByRole('button', { name: 'Gerar login de Fixture Student' }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })));
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });
  it('legacy divergent contact blocks generation before any backend request', async () => {
    mocks.rows[0].phone = '+351923456789';
    render(<StudentsManager />);
    fireEvent.click(await screen.findByRole('button', { name: 'Gerar login de Fixture Student' }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining('Contatos legados divergentes') })));
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});


it('batch access preflights each student and never generates from blocked preflight', async () => {
 mocks.rows = [{ ...fixture(), user_id: null, whatsapp: '+351912345678', phone: '+351912345678' }];
 mocks.invoke.mockReset().mockResolvedValue({ data: { error: 'synthetic blocked preflight' }, error: null });
 render(<StudentsManager />);
 fireEvent.click(await screen.findByRole('button', { name: 'Gerar 1 acessos' }));
 await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: '0 acesso(s) gerado(s), 1 falha(s)' })));
 expect(mocks.invoke.mock.calls.map(([name]) => name)).toEqual(['whatsapp-manager']);
});
