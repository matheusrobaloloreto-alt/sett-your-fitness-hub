import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { role: "trainer" as string | null, companyId: "company-a" as string | null,
    user: { id: "actor" }, session: { user: { id: "actor" } } },
  master: { viewingCompany: null as { id: string } | null, isViewingCompany: false },
  from: vi.fn(), rpc: vi.fn(), invoke: vi.fn(), toast: vi.fn(), navigate: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
  writes: [] as Array<{ table: string; values: unknown; filters: Record<string, unknown> }>,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/contexts/MasterContext", () => ({ useMaster: () => mocks.master }));
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
        return Promise.resolve({ data, error: null }).then(resolve);
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
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
      await waitFor(() => expect(mocks.writes).toHaveLength(1));
      expect(mocks.writes[0]).toMatchObject({ table: "students", filters: { id: "student-a", company_id: "company-a" } });
    },
  );

  it.each(["student", null])("does not give %s the staff edit controls", async (role) => {
    mocks.auth.role = role;
    render(<Page />);
    await screen.findByText("Fixture Student");
    expect(screen.queryByRole("button", { name: /Editar Fixture Student/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Trocar professor de Fixture Student/ })).not.toBeInTheDocument();
  });

  it("keeps an open editor from writing after switching company", async () => {
    const view = render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: /Editar Fixture Student/ }));
    await screen.findByRole("dialog");
    mocks.auth.companyId = "company-b";
    view.rerender(<Page />);
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() => expect(mocks.from).toHaveBeenCalled());
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
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Erro ao carregar equipe", description: "directory denied" }));
});
