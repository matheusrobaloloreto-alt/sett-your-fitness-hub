import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { role: "trainer" as string | null, companyId: "company-a" as string | null, session: { user: { id: "actor" } } },
  master: { viewingCompany: null as { id: string } | null, isViewingCompany: false },
  from: vi.fn(), rpc: vi.fn(), toast: vi.fn(), navigate: vi.fn(), studentCompany: "company-a",
  studentTrainer: "profile-trainer",
  reassignError: null as { message: string; code: string } | null,
  enrollments: [] as Array<{ id: string; student_id: string; plan_id: string; trainer_id: string; status: string; start_date: string; end_date: string }>,
  writes: [] as string[],
  studentFilters: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/contexts/MasterContext", () => ({ useMaster: () => mocks.master }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/useExerciseVolumeTargets", () => ({ useExerciseVolumeTargets: () => [] }));
vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "student-a" }), useNavigate: () => mocks.navigate,
  useLocation: () => ({ pathname: "/admin/students/student-a", search: "?tab=program", state: null }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
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
vi.mock("@/lib/preRegistrationData", () => ({ loadStudentPreRegistration: async () => null, updateStudentPreRegistration: vi.fn() }));
vi.mock("@/components/BnitoFloatingAssistant", () => ({ BnitoContextButton: () => null }));
vi.mock("@/components/AthleticClubStar", () => ({ AthleticClubStar: () => null }));
vi.mock("@/components/admin/PlanVersionsCard", () => ({ PlanVersionsCard: () => null }));
vi.mock("@/components/admin/AssessmentCompareCard", () => ({ AssessmentCompareCard: () => null }));
vi.mock("@/components/admin/PreRegistrationDetails", () => ({ PreRegistrationDetails: () => null }));
vi.mock("@/components/admin/ManualPrescriptionPanel", () => ({ ManualPrescriptionPanel: () => null }));
vi.mock("@/components/admin/StudentGoalsManager", () => ({ StudentGoalsManager: () => null }));
vi.mock("@/components/admin/StudentTimeline", () => ({ StudentTimeline: () => null }));
vi.mock("@/components/admin/StudentFilesPanel", () => ({ StudentFilesPanel: () => null }));
vi.mock("@/components/admin/WeeklyContactToggle", () => ({ WeeklyContactToggle: () => null }));
vi.mock("@/components/admin/IntercycleAnamnesisControls", () => ({ IntercycleAnamnesisControls: () => null, IntercycleAnamnesisTimeline: () => null }));
vi.mock("@/components/ProgressPhotosPanel", () => ({ ProgressPhotosPanel: () => null }));

import StudentDetail from "./StudentDetail";

beforeEach(() => {
  mocks.auth.role = "trainer";
  mocks.auth.companyId = "company-a";
  mocks.master = { viewingCompany: null, isViewingCompany: false };
  mocks.studentCompany = "company-a";
  mocks.studentTrainer = "profile-trainer";
  mocks.reassignError = null;
  mocks.enrollments = [
    { id: "enrollment-a", student_id: "student-a", plan_id: "plan-a", trainer_id: "other-trainer",
      status: "active", start_date: "2026-10-01", end_date: "2026-11-11" },
    { id: "enrollment-completed", student_id: "student-a", plan_id: "plan-completed", trainer_id: "historic-trainer",
      status: "completed", start_date: "2026-07-01", end_date: "2026-08-11" },
    { id: "enrollment-inactive", student_id: "student-a", plan_id: "plan-inactive", trainer_id: "historic-trainer",
      status: "inactive", start_date: "2026-08-01", end_date: "2026-09-11" },
  ];
  mocks.writes = [];
  mocks.toast.mockReset();
  mocks.rpc.mockReset().mockImplementation(async (name: string, args: Record<string, string>) => {
    if (name === "get_company_student_staff_directory") return { data: [
      { user_id: "actor", full_name: "Fixture Actor", roles: ["trainer"] },
      { user_id: "target-trainer", full_name: "Fixture Target", roles: ["trainer"] },
      { user_id: "admin-only", full_name: "Fixture Admin", roles: ["admin"] },
      { user_id: "coordinator-only", full_name: "Fixture Coordinator", roles: ["coordinator"] },
      { user_id: "master-only", full_name: "Fixture Master", roles: ["master"] },
    ], error: null };
    if (name === "reassign_student_trainer") {
      if (mocks.reassignError) return { data: null, error: mocks.reassignError };
      mocks.studentTrainer = args._trainer_id;
      mocks.enrollments = mocks.enrollments.map((enrollment) => enrollment.status === "active"
        ? { ...enrollment, trainer_id: args._trainer_id } : enrollment);
      return { data: [], error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
  mocks.studentFilters = [];
  mocks.from.mockReset().mockImplementation((table: string) => {
    const filters: Record<string, unknown> = {};
    const query = {
      select: () => query, order: () => query, in: () => query,
      update: () => { mocks.writes.push(table); return query; },
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      single: async () => {
        mocks.studentFilters.push({ ...filters });
        const companyMatches = !filters.company_id || filters.company_id === mocks.studentCompany;
        return { data: companyMatches ? {
          id: "student-a", company_id: mocks.studentCompany, full_name: "Fixture Student", status: "active",
          assigned_trainer_id: mocks.studentTrainer, country_code: "BR",
        } : null, error: null };
      },
      then: (resolve: (result: object) => unknown) => {
        const data = table === "enrollments" ? mocks.enrollments
          : table === "plans" ? [
            { id: "plan-a", name: "Fixture Plan", duration_weeks: 6, plan_kind: "paid" },
            { id: "plan-completed", name: "Historic Completed", duration_weeks: 6, plan_kind: "paid" },
            { id: "plan-inactive", name: "Historic Inactive", duration_weeks: 6, plan_kind: "paid" },
          ] : table === "profiles" ? [{ user_id: "historic-trainer", full_name: "Historic Trainer" }]
          : table === "user_roles" ? [{ user_id: "actor", role: "trainer" }]
          : [];
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return query;
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("StudentDetail staff company scope", () => {
  it.each(["trainer", "coordinator", "admin"])("allows %s to manage another trainer's enrollment within the company", async (role) => {
    mocks.auth.role = role;
    render(<StudentDetail />);
    expect(await screen.findByRole("button", { name: "Excluir matrícula Fixture Plan" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Status da matrícula Fixture Plan" })).toBeInTheDocument();
    expect(mocks.studentFilters).toEqual([{ id: "student-a", company_id: "company-a" }]);
  });

  it("preserves direct master student URLs without a selected company", async () => {
    mocks.auth.role = "master";
    mocks.auth.companyId = null;
    mocks.studentCompany = "company-b";
    render(<StudentDetail />);
    expect(await screen.findByRole("heading", { name: "FIXTURE STUDENT" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluir matrícula Fixture Plan" })).toBeInTheDocument();
    expect(mocks.studentFilters).toEqual([{ id: "student-a" }]);
    expect(mocks.rpc).toHaveBeenCalledWith("get_company_student_staff_directory", { _company_id: "company-b" });
  });

  it("binds a master's selected company and denies a direct URL from another tenant", async () => {
    mocks.auth.role = "master";
    mocks.master = { viewingCompany: { id: "company-a" }, isViewingCompany: true };
    mocks.studentCompany = "company-b";
    render(<StudentDetail />);
    expect(await screen.findByText("Aluno não encontrado")).toBeInTheDocument();
    expect(mocks.studentFilters).toEqual([{ id: "student-a", company_id: "company-a" }]);
    expect(mocks.from).not.toHaveBeenCalledWith("enrollments");
  });

  it("denies nonmaster cross-company URLs and missing company context", async () => {
    mocks.studentCompany = "company-b";
    const view = render(<StudentDetail />);
    await screen.findByText("Aluno não encontrado");
    expect(mocks.studentFilters).toEqual([{ id: "student-a", company_id: "company-a" }]);
    view.unmount();
    mocks.auth.companyId = null;
    mocks.from.mockClear();
    render(<StudentDetail />);
    await screen.findByText("Aluno não encontrado");
    expect(mocks.from).not.toHaveBeenCalledWith("students");
  });

  it.each(["student", null])("keeps %s from gaining staff enrollment controls", async (role) => {
    mocks.auth.role = role;
    render(<StudentDetail />);
    await screen.findByRole("heading", { name: "FIXTURE STUDENT" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Excluir matrícula Fixture Plan" })).not.toBeInTheDocument());
  });

  it.each([
    ["target-trainer", "Fixture Target"], ["admin-only", "Fixture Admin"],
    ["coordinator-only", "Fixture Coordinator"], ["master-only", "Fixture Master"],
  ])("uses the staff directory and student-level CAS for %s without rewriting historical enrollment refs", async (targetId, targetName) => {
    const historicalBefore = mocks.enrollments.filter((enrollment) => enrollment.status !== "active");
    render(<StudentDetail />);
    await waitFor(() => expect(within(screen.getByRole("combobox", { name: "Professor da matrícula Fixture Plan" }))
      .getByRole("option", { name: targetName })).toBeInTheDocument());
    const activeSelector = screen.getByRole("combobox", { name: "Professor da matrícula Fixture Plan" });
    fireEvent.change(activeSelector, { target: { value: targetId } });
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("reassign_student_trainer", {
      _student_id: "student-a", _trainer_id: targetId, _expected_trainer_id: "profile-trainer",
    }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Professor da matrícula Fixture Plan" })).toHaveValue(targetId));
    expect(mocks.enrollments.filter((enrollment) => enrollment.status !== "active")).toEqual(historicalBefore);
    for (const name of ["Historic Completed", "Historic Inactive"]) {
      const historic = screen.getByRole("combobox", { name: `Professor da matrícula ${name}` });
      expect(historic).toBeDisabled();
      expect(historic).toHaveValue("historic-trainer");
    }
    expect(mocks.rpc).toHaveBeenCalledWith("get_company_student_staff_directory", { _company_id: "company-a" });
    expect(mocks.from).not.toHaveBeenCalledWith("user_roles");
    expect(mocks.from).not.toHaveBeenCalledWith("company_members");
    expect(mocks.writes).toEqual([]);
  });

  it("blocks historical selectors and surfaces stale-assignment errors without a REST fallback", async () => {
    mocks.reassignError = { message: "Student assignment changed; reload before reassigning", code: "40001" };
    render(<StudentDetail />);
    await waitFor(() => expect(within(screen.getByRole("combobox", { name: "Professor da matrícula Fixture Plan" }))
      .getByRole("option", { name: "Fixture Target" })).toBeInTheDocument());
    const historic = await screen.findByRole("combobox", { name: "Professor da matrícula Historic Completed" });
    expect(historic).toBeDisabled();
    fireEvent.change(historic, { target: { value: "target-trainer" } });
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "reassign_student_trainer")).toHaveLength(0);
    fireEvent.change(screen.getByRole("combobox", { name: "Professor da matrícula Fixture Plan" }), { target: { value: "target-trainer" } });
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: mocks.reassignError!.message, variant: "destructive" })));
    expect(mocks.studentTrainer).toBe("profile-trainer");
    expect(mocks.enrollments[0].trainer_id).toBe("other-trainer");
    expect(mocks.writes).toEqual([]);
  });
});
