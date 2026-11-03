import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { role: "trainer" as string | null, companyId: "company-a" as string | null, session: { user: { id: "actor" } } },
  master: { viewingCompany: null as { id: string } | null, isViewingCompany: false },
  from: vi.fn(), rpc: vi.fn(), invoke: vi.fn(), openChat: vi.fn(), toast: vi.fn(), navigate: vi.fn(), studentCompany: "company-a",
  search: "?tab=program&draft=keep&returnTo=%2Fadmin%2Fstudents",
  studentTrainer: "profile-trainer",
  studentCountry: "BR" as string | null,
  studentPhone: "48999990001",
  studentWhatsApp: "48999990001",
  functional: [] as Array<Record<string, unknown>>,
  cycles: [] as Array<Record<string, unknown>>,
  cycleReadError: false,
  invalidPlanCalls: [] as unknown[],
  reassignError: null as { message: string; code: string } | null,
  enrollments: [] as Array<{ id: string; student_id: string; plan_id: string | null; trainer_id: string; status: string; start_date: string; end_date: string }>,
  writes: [] as string[],
  studentFilters: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/lib/businessDate", () => ({ businessDateYmd: () => "2026-10-29" }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/contexts/MasterContext", () => ({ useMaster: () => mocks.master }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/useExerciseVolumeTargets", () => ({ useExerciseVolumeTargets: () => [] }));
vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "student-a" }), useNavigate: () => mocks.navigate,
  useLocation: () => ({ pathname: "/admin/students/student-a", search: mocks.search, state: null }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc, functions: { invoke: mocks.invoke } } }));
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

vi.mock('@/components/admin/StudentWorkoutFeedbackCard', () => ({ StudentWorkoutFeedbackCard: () => null }));
vi.mock('@/components/trainer/WorkoutAnalysis', () => ({ WorkoutAnalysis: () => null }));
vi.mock('@/components/trainer/TrainerWeeklyBar', () => ({ TrainerWeeklyBar: () => null }));
vi.mock('@/components/trainer/StudentVolumePanel', () => ({ StudentVolumePanel: () => null }));
vi.mock('@/lib/studentChat', async original => ({ ...await original<typeof import('@/lib/studentChat')>(), openStudentChat: mocks.openChat }));
import StudentDetail from "./StudentDetail";

beforeEach(() => {
  mocks.search = "?tab=program&draft=keep&returnTo=%2Fadmin%2Fstudents";
  mocks.functional = [];
  mocks.auth.role = "trainer";
  mocks.auth.companyId = "company-a";
  mocks.master = { viewingCompany: null, isViewingCompany: false };
  mocks.studentCompany = "company-a";
  mocks.studentTrainer = "profile-trainer";
  mocks.studentCountry = "BR";
  mocks.studentPhone = "48999990001"; mocks.studentWhatsApp = "48999990001";
  mocks.openChat.mockReset().mockResolvedValue(undefined);
  mocks.invoke.mockReset().mockImplementation(async (name: string) => name === "student-login-credentials" ? { data: { email: "student@example.invalid", password: "synthetic-only" }, error: null } : { data: { error: "whatsapp_student_phone_ambiguous" }, error: null });
  mocks.reassignError = null;
  mocks.cycles = []; mocks.cycleReadError = false;
  mocks.enrollments = [
    { id: "enrollment-a", student_id: "student-a", plan_id: "plan-a", trainer_id: "other-trainer",
      status: "active", start_date: "2026-10-01", end_date: "2026-11-11" },
    { id: "enrollment-completed", student_id: "student-a", plan_id: "plan-completed", trainer_id: "historic-trainer",
      status: "completed", start_date: "2026-07-01", end_date: "2026-08-11" },
    { id: "enrollment-inactive", student_id: "student-a", plan_id: "plan-inactive", trainer_id: "historic-trainer",
      status: "inactive", start_date: "2026-08-01", end_date: "2026-09-11" },
  ];
  mocks.enrollments = mocks.enrollments.map(row => ({ ...row, company_id: "company-a" }));
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
  mocks.invalidPlanCalls = [];
  mocks.studentFilters = [];
  mocks.from.mockReset().mockImplementation((table: string) => {
    const filters: Record<string, unknown> = {};
    const query = {
      select: () => query, order: () => query, in: (key: string, values: unknown[]) => { filters[key] = values; if(table === "plans" && values.includes(null)) mocks.invalidPlanCalls.push(values); return query; }, is: () => query, not: () => query,
      update: () => { mocks.writes.push(table); return query; },
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => {
        mocks.studentFilters.push({ ...filters });
        const companyMatches = !filters.company_id || filters.company_id === mocks.studentCompany;
        return { data: companyMatches ? {
          id: "student-a", company_id: mocks.studentCompany, full_name: "Fixture Student", status: "active",
          assigned_trainer_id: mocks.studentTrainer, country_code: mocks.studentCountry,
          email: "student@example.invalid", phone: mocks.studentPhone, whatsapp: mocks.studentWhatsApp, updated_at: "2026-10-29T10:00:00Z",
        } : null, error: null };
      },
      then: (resolve: (result: object) => unknown) => {
        const data = table === "functional_assessments" ? mocks.functional : table === "training_cycles" ? mocks.cycles : table === "enrollments" ? mocks.enrollments
          : table === "plans" ? [
            { id: "plan-a", name: "Fixture Plan", duration_weeks: 6, plan_kind: "paid" },
            { id: "plan-completed", name: "Historic Completed", duration_weeks: 6, plan_kind: "paid" },
            { id: "plan-inactive", name: "Historic Inactive", duration_weeks: 6, plan_kind: "paid" },
          ] : table === "profiles" ? [{ user_id: "historic-trainer", full_name: "Historic Trainer" }]
          : table === "user_roles" ? [{ user_id: "actor", role: "trainer" }]
          : [];
        if (table === "plans" && Array.isArray(filters.id) && filters.id.includes(null)) return Promise.resolve({data:null,error:{message:"invalid input syntax for uuid: null"}}).then(resolve);
        return Promise.resolve({ data, error: table === "training_cycles" && mocks.cycleReadError ? { message: "Synthetic cycle read failure" } : null }).then(resolve);
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


it('shows pending contracted slots and preserves superseded offline history with original labels', async () => {
  mocks.enrollments[0].end_date = '2027-04-25';
  mocks.cycles = [
    { id: 'offline-history', enrollment_id: 'enrollment-a', student_id: 'student-a', company_id: 'company-a', cycle_number: 18, start_date: '2025-01-01', end_date: '2025-02-11', status: 'superseded', prescribed_offline_at: '2025-01-01T10:00:00Z' },
    { id: 'pending-now', enrollment_id: 'enrollment-a', student_id: 'student-a', company_id: 'company-a', cycle_number: 31, start_date: '2026-10-01', end_date: '2026-11-11', status: 'pending' },
    { id: 'pending-later', enrollment_id: 'enrollment-a', student_id: 'student-a', company_id: 'company-a', cycle_number: 45, start_date: '2027-04-01', end_date: '2027-04-25', status: 'pending' },
  ];
  render(<StudentDetail />);
  await screen.findByRole('heading', { name: 'FIXTURE STUDENT' });
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Análise' }), { button: 0, ctrlKey: false });
  const history = await screen.findByRole('region', { name: 'Histórico anterior e fora da vigência' });
  expect(within(history).getByText(/CICLO 18/)).toBeInTheDocument();
  expect(within(history).getByText('Prescrito fora do app')).toBeInTheDocument();
  const current = screen.getByRole('region', { name: 'Vigência contratual — ciclos persistidos' });
  expect(within(current).getByText(/CICLO 31/)).toBeInTheDocument();
  expect(within(current).getByText(/CICLO 45/)).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Cobertura contratual Fixture Plan' })).toHaveTextContent('25/04/2027');
  expect(mocks.writes).toEqual([]);
});

it('shows an explicit coverage read error instead of claiming an empty schedule', async () => {
  mocks.cycleReadError = true;
  render(<StudentDetail />);
  await screen.findByRole('heading', { name: 'FIXTURE STUDENT' });
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Análise' }), { button: 0, ctrlKey: false });
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível confirmar a cobertura');
  expect(mocks.writes).toEqual([]);
});

it('opening access conversation preflights identity and never generates credentials on a blocked read', async () => {
 render(<StudentDetail />);
 fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Visão geral' }), { button: 0, ctrlKey: false });
 fireEvent.click(await screen.findByRole('button', { name: /ACESSO DO APP/ }));
 fireEvent.click(await screen.findByRole('button', { name: 'Abrir conversa' }));
 await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('whatsapp-manager', expect.objectContaining({ body: expect.objectContaining({ action: 'preflight-student-login' }) })));
 expect(mocks.invoke.mock.calls.some(([name]) => name === 'student-login-credentials')).toBe(false);
 expect(mocks.openChat).not.toHaveBeenCalled();
});

it('shows legacy contact ambiguity explicitly without selecting a hidden number', async () => {
 mocks.studentPhone = '48988880002';
 render(<StudentDetail />);
 fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Visão geral' }), { button: 0, ctrlKey: false });
 fireEvent.click(await screen.findByRole('button', { name: /ACESSO DO APP/ }));
 expect(await screen.findByText(/Contatos legados divergentes/)).toBeInTheDocument();
 expect(mocks.invoke).not.toHaveBeenCalled();
});


async function openAccessPanel() {
 fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Visão geral' }), { button: 0, ctrlKey: false });
 fireEvent.click(await screen.findByRole('button', { name: /ACESSO DO APP/ }));
}
const accessAck = () => ({ ready: true, companyId: 'company-a', studentId: 'student-a', chatId: null,
 remoteJid: '5548999990001@s.whatsapp.net', preflightToken: 'synthetic-preflight', stateFingerprint: 'snapshot', expiresAt: new Date(Date.now() + 120000).toISOString() });
it('opening an access panel and a verified empty conversation never generates or resets', async () => {
 mocks.invoke.mockResolvedValue({ data: accessAck(), error: null });
 render(<StudentDetail />); await openAccessPanel();
 expect(mocks.invoke).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button', { name: 'Abrir conversa' }));
 await waitFor(() => expect(mocks.openChat).toHaveBeenCalledWith(expect.objectContaining({ message: '', verifiedLoginAccess: expect.objectContaining({ studentId: 'student-a' }) })));
 expect(mocks.invoke.mock.calls.map(([name]) => name)).toEqual(['whatsapp-manager']);
});
it('explicit generation then copy revalidates the post-generation snapshot without a second reset', async () => {
 mocks.invoke.mockImplementation(async (name: string) => ({ data: name === 'whatsapp-manager' ? { ...accessAck(), stateFingerprint: mocks.invoke.mock.calls.length > 2 ? 'after' : 'snapshot' } : { ...accessAck(), stateFingerprint: 'after', email: 'student@example.invalid', password: 'synthetic-only', loginSendToken: 'send-proof' }, error: null }));
 Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
 render(<StudentDetail />); await openAccessPanel();
 fireEvent.click(screen.getByRole('button', { name: 'Gerar/redefinir acesso' }));
 await screen.findByText('synthetic-only');
 fireEvent.click(screen.getByRole('button', { name: 'Copiar login' }));
 await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
 expect(mocks.invoke.mock.calls.map(([name]) => name)).toEqual(['whatsapp-manager', 'student-login-credentials', 'whatsapp-manager']);
});
it('changed snapshot blocks cached credentials from a conversation and never resets silently', async () => {
 mocks.invoke.mockImplementation(async (name: string) => ({ data: name === 'whatsapp-manager' ? accessAck() : { ...accessAck(), stateFingerprint: 'after', email: 'student@example.invalid', password: 'synthetic-only', loginSendToken: 'send-proof' }, error: null }));
 render(<StudentDetail />); await openAccessPanel();
 fireEvent.click(screen.getByRole('button', { name: 'Gerar/redefinir acesso' }));
 await screen.findByText('synthetic-only');
 fireEvent.click(screen.getByRole('button', { name: 'Abrir conversa' }));
 await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining('cadastro, contato ou validade') })));
 expect(mocks.openChat).not.toHaveBeenCalled();
 expect(mocks.invoke.mock.calls.filter(([name]) => name === 'student-login-credentials')).toHaveLength(1);
});
it('requires explicit confirmed reconciliation and submits the original snapshot atomically', async () => {
 mocks.studentPhone = '48988880002';
 const originalRpc = mocks.rpc.getMockImplementation()!;
 mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => name === 'update_student_contact' ? { data: { id: 'student-a', company_id: 'company-a', updated_at: '2026-10-29T12:00:00Z', phone: '5548999990001', whatsapp: '5548999990001', country_code: 'BR', ...(args._profile_patch as object) }, error: null } : originalRpc(name, args));
 mocks.invoke.mockResolvedValue({ data: { success: true }, error: null });
 render(<StudentDetail />);
 fireEvent.click(await screen.findByRole('button', { name: 'Editar aluno' }));
 const dialog = await screen.findByRole('dialog');
 fireEvent.click(within(dialog).getByRole('checkbox', { name: /Conferi a identidade/ }));
 fireEvent.click(within(dialog).getByRole('button', { name: /Salvar/ }));
 await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Dados atualizados!' })));
 expect(mocks.rpc).toHaveBeenCalledWith('update_student_contact', expect.objectContaining({ _student_id: 'student-a', _company_id: 'company-a', _expected_phone: '48988880002', _expected_whatsapp: '48999990001', _expected_updated_at: '2026-10-29T10:00:00Z', _confirmed_contact: true, _profile_patch: expect.objectContaining({ full_name: 'Fixture Student' }) }));
 expect(mocks.writes).toEqual([]);
});
it.each([null, { id: 'other', company_id: 'company-a', updated_at: '2026-10-29T12:00:00Z' }])('never claims profile success without a matching ACK %j', async ack => {
 const originalRpc = mocks.rpc.getMockImplementation()!;
 mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => name === 'update_student_contact' ? { data: ack, error: null } : originalRpc(name, args));
 render(<StudentDetail />);
 fireEvent.click(await screen.findByRole('button', { name: 'Editar aluno' }));
 fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Salvar/ }));
 await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Erro ao salvar', description: expect.stringContaining('não confirmou') })));
 expect(mocks.invoke).not.toHaveBeenCalled();
 expect(screen.getByRole('dialog')).toBeInTheDocument();
});


it('CAS conflict preserves the edit draft and never invokes downstream synchronization', async () => {
 const originalRpc = mocks.rpc.getMockImplementation()!;
 mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => name === 'update_student_contact' ? { data: null, error: { code: 'PT409', message: 'synthetic contact changed: reload' } } : originalRpc(name, args));
 render(<StudentDetail />);
 fireEvent.click(await screen.findByRole('button', { name: 'Editar aluno' }));
 fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Salvar/ }));
 await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Erro ao salvar', description: expect.stringContaining('Recarregue o aluno') })));
 expect(screen.getByRole('dialog')).toBeInTheDocument();
 expect(mocks.invoke).not.toHaveBeenCalled();
 expect(mocks.writes).toEqual([]);
});


it('changing the visible contact cannot save without identity confirmation', async () => {
 render(<StudentDetail />);
 fireEvent.click(await screen.findByRole('button', { name: 'Editar aluno' }));
 const dialog = await screen.findByRole('dialog');
 fireEvent.change(within(dialog).getByLabelText('WhatsApp'), { target: { value: '48988880002' } });
 fireEvent.click(within(dialog).getByRole('button', { name: /Salvar/ }));
 await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Confirme o contato' })));
 expect(mocks.rpc.mock.calls.some(([name]) => name === 'update_student_contact')).toBe(false);
 expect(mocks.invoke).not.toHaveBeenCalled();
});
it('metadata edit does not silently reconcile legacy divergence', async () => {
 mocks.studentPhone = '48988880002';
 const originalRpc = mocks.rpc.getMockImplementation()!;
 mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => name === 'update_student_contact' ? { data: null, error: { message: 'synthetic stop after capture' } } : originalRpc(name, args));
 render(<StudentDetail />);
 fireEvent.click(await screen.findByRole('button', { name: 'Editar aluno' }));
 fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Salvar/ }));
 await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('update_student_contact', expect.objectContaining({ _confirmed_contact: false, _contact: '48999990001', _expected_phone: '48988880002' })));
 expect(mocks.invoke).not.toHaveBeenCalled();
});


it.each(['554899990001', '5548999990001'])('accepts BR9 semantic contact ACK %s only when both stored mirrors agree', async stored => {
 mocks.studentPhone = '48988880002';
 const originalRpc = mocks.rpc.getMockImplementation()!;
 mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => name === 'update_student_contact' ? { data: { id: 'student-a', company_id: 'company-a', updated_at: '2026-10-29T12:00:00Z', phone: stored, whatsapp: stored, country_code: 'BR', ...(args._profile_patch as object) }, error: null } : originalRpc(name, args));
 mocks.invoke.mockResolvedValue({ data: { success: true }, error: null });
 render(<StudentDetail />);
 fireEvent.click(await screen.findByRole('button', { name: 'Editar aluno' }));
 const dialog = await screen.findByRole('dialog');
 fireEvent.click(within(dialog).getByRole('checkbox', { name: /Conferi a identidade/ }));
 fireEvent.click(within(dialog).getByRole('button', { name: /Salvar/ }));
 await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Dados atualizados!' })));
 expect(mocks.rpc).toHaveBeenCalledWith('update_student_contact', expect.objectContaining({ _contact: '(48) 99999-0001', _confirmed_contact: true }));
});


it.each([{ phone: '5548999990001', whatsapp: '554899990001' }, { phone: '5548988880002', whatsapp: '5548988880002' }])('rejects a BR9 ACK without identical mirrors or matching recipient %j', async returned => {
 mocks.studentPhone = '48988880002';
 const originalRpc = mocks.rpc.getMockImplementation()!;
 mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => name === 'update_student_contact' ? { data: { id: 'student-a', company_id: 'company-a', updated_at: '2026-10-29T12:00:00Z', ...returned, country_code: 'BR', ...(args._profile_patch as object) }, error: null } : originalRpc(name, args));
 render(<StudentDetail />);
 fireEvent.click(await screen.findByRole('button', { name: 'Editar aluno' }));
 const dialog = await screen.findByRole('dialog');
 fireEvent.click(within(dialog).getByRole('checkbox', { name: /Conferi a identidade/ }));
 fireEvent.click(within(dialog).getByRole('button', { name: /Salvar/ }));
 await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Erro ao salvar', description: expect.stringContaining('não confirmou') })));
 expect(mocks.invoke).not.toHaveBeenCalled();
});


it('reopens a persisted full Brazilian WhatsApp without truncating or changing it on metadata save', async () => {
 mocks.studentPhone = '5548999990001'; mocks.studentWhatsApp = '5548999990001';
 const originalRpc = mocks.rpc.getMockImplementation()!;
 mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => name === 'update_student_contact' ? { data: null, error: { code: 'PT409', message: 'contact_version_conflict' } } : originalRpc(name, args));
 render(<StudentDetail />);
 fireEvent.click(await screen.findByRole('button', { name: 'Editar aluno' }));
 const dialog = await screen.findByRole('dialog');
 expect(within(dialog).getByLabelText('WhatsApp')).toHaveValue('+5548999990001');
 expect(within(dialog).queryByRole('checkbox', { name: /Conferi a identidade/ })).not.toBeInTheDocument();
 fireEvent.click(within(dialog).getByRole('button', { name: /Salvar/ }));
 await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('update_student_contact', expect.objectContaining({ _contact: '5548999990001', _confirmed_contact: false })));
 await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining('Recarregue o aluno') })));
});


it('distinguishes an acknowledged profile save from an unconfirmed billing synchronization', async () => {
 const originalRpc = mocks.rpc.getMockImplementation()!;
 mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => name === 'update_student_contact' ? { data: { id: 'student-a', company_id: 'company-a', updated_at: '2026-10-29T12:00:00Z', phone: '48999990001', whatsapp: '48999990001', country_code: 'BR', ...(args._profile_patch as object) }, error: null } : originalRpc(name, args));
 mocks.invoke.mockResolvedValue({ data: { error: 'synthetic provider unavailable' }, error: null });
 render(<StudentDetail />);
 fireEvent.click(await screen.findByRole('button', { name: 'Editar aluno' }));
 fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Salvar/ }));
 await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Erro ao salvar', description: expect.stringContaining('Cadastro salvo; sincronização de cobrança não confirmada.') })));
 expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Dados atualizados!' }));
});


it.each([false, true])('preserves legacy NULL country unless contact confirmation explicitly uses labeled BR (%s)', async confirm => {
 mocks.studentCountry = null;
 const originalRpc = mocks.rpc.getMockImplementation()!;
 mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => name === 'update_student_contact' ? { data: null, error: { code: 'PT409', message: 'contact_version_conflict' } } : originalRpc(name, args));
 render(<StudentDetail />);
 fireEvent.click(await screen.findByRole('button', { name: 'Editar aluno' }));
 const dialog = await screen.findByRole('dialog');
 const confirmation = within(dialog).getByRole('checkbox', { name: /País desta confirmação: Brasil/ });
 if (confirm) fireEvent.click(confirmation);
 fireEvent.click(within(dialog).getByRole('button', { name: /Salvar/ }));
 await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('update_student_contact', expect.objectContaining({ _country_code: confirm ? 'BR' : null, _confirmed_contact: confirm })));
});


it('shows a persisted full thirteen-digit BR contact correctly in the header and edit prefill', async () => {
 mocks.studentPhone = '5511981234567'; mocks.studentWhatsApp = '5511981234567';
 render(<StudentDetail />);
 expect(await screen.findByText('(11) 98123-4567')).toBeInTheDocument();
 expect(screen.queryByText('(55) 11981-2345')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button', { name: 'Editar aluno' }));
 const dialog = await screen.findByRole('dialog');
 expect(within(dialog).getByLabelText('WhatsApp')).toHaveValue('+5511981234567');
 expect(within(dialog).queryByRole('checkbox', { name: /Conferi a identidade/ })).not.toBeInTheDocument();
});

it('persists tab navigation in the URL while preserving other parameters', async () => {
 render(<StudentDetail />);
 fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Avaliação' }), { button: 0, ctrlKey: false });
 expect(mocks.navigate).toHaveBeenCalledWith(expect.objectContaining({ search: '?tab=evaluations&draft=keep&returnTo=%2Fadmin%2Fstudents' }), expect.objectContaining({ replace: false }));
});

it('follows back/forward URL changes without stale tab state', async () => {
 mocks.search = '?tab=analytics&draft=keep';
 const view = render(<StudentDetail />);
 await waitFor(() => expect(screen.getByRole('tab', { name: 'Análise' })).toHaveAttribute('data-state', 'active'));
 mocks.search = '?draft=keep';
 view.rerender(<StudentDetail />);
 await waitFor(() => expect(screen.getByRole('tab', { name: 'Visão geral' })).toHaveAttribute('data-state', 'active'));
 mocks.search = '?tab=program&draft=keep&returnTo=%2Fadmin%2Fstudents';
});

it('labels functional records separately from manual evaluations without clinical inference', async () => {
 mocks.functional = [{ id: 'functional-1', assessment_date: '2026-10-29', created_at: '2026-10-29', status: 'completed' }];
 render(<StudentDetail />);
 fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Avaliação' }), { button: 0, ctrlKey: false });
 expect(await screen.findByText(/Avaliação funcional · 29\/10\/2026/)).toBeInTheDocument();
 expect(screen.getByText(/Registros manuais/)).toBeInTheDocument();
 expect(screen.getByText(/arquivos não representam achados clínicos estruturados/)).toBeInTheDocument();
 expect(screen.queryByText(/student_evaluations|functional_assessments/)).not.toBeInTheDocument();
 expect(mocks.writes).toEqual([]);
});

it('loads an existing enrollment with no catalog plan instead of losing the entire schedule',async()=>{
 mocks.enrollments=mocks.enrollments.map(e=>({...e,plan_id:null}));
 render(<StudentDetail/>);
 expect((await screen.findAllByRole('button',{name:'Excluir matrícula Plano desconhecido'})).length).toBeGreaterThan(0);
 expect(mocks.invalidPlanCalls).toEqual([]);
});
