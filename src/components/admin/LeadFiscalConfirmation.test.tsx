import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultOperations } from '@/lib/companyOperations';
// Legacy lead lifecycle tests isolate the newly integrated policy reader; its
// save/readback/query behavior has separate OperationsDesigner integration tests.
vi.mock("@/hooks/useCompanyFeatures", () => ({ useCompanyFeatures: () => ({ loading: false, hasRegistration: true }) }));
vi.mock("@/components/admin/operations/OperationsConsumers", () => ({
  useCompanyOperations: () => ({ data: { version: 0, settings: defaultOperations() }, error: null }),
}));
import RegistrationManager from "@/pages/admin/RegistrationManager";

const db = vi.hoisted(() => ({
  students: [] as Array<Record<string, unknown>>,
  leads: [] as Array<Record<string, unknown>>,
  auxiliary: {} as Record<string, Array<Record<string, unknown>>>,
  reads: [] as Array<{
    table: string;
    studentIds: unknown[];
    range: [number, number] | null;
    orders: Array<{ column: string; ascending: boolean }>;
  }>,
  readError: null as { table: string; studentId: string; message: string; from?: number } | null,
  companyId: "company-1",
  draft: vi.fn(),
  gate: vi.fn(),
  rpc: vi.fn(),
  invoke: vi.fn(),
  directWrite: vi.fn(),
  openChat: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ companyId: db.companyId, role: "admin", user: null }) }));
vi.mock("@/contexts/MasterContext", () => ({ useMaster: () => ({ viewingCompany: null, isViewingCompany: false }) }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/components/AthleticClubStar", () => ({ AthleticClubStar: () => null }));
vi.mock("@/lib/studentChat", () => ({ createPlansLink: vi.fn(), openStudentChat: db.openChat, draftCompanyEventMessage: db.draft }));
vi.mock("sonner", () => ({ toast: db.toast }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: db.rpc,
    functions: { invoke: db.invoke },
    from(table: string) {
      let rows = table === "students" ? [...db.students] : table === "leads" ? [...db.leads] : [...(db.auxiliary[table] || [])];
      if (table === "companies") rows = [{ id: db.companyId, slug: "fixture-company" }];
      let studentIds: unknown[] = [];
      let range: [number, number] | null = null;
      let limit: number | null = null;
      const orders: Array<{ column: string; ascending: boolean }> = [];
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => { rows = rows.filter((row) => row[column] === value); return query; },
        is: (column: string, value: unknown) => { rows = rows.filter((row) => (row[column] ?? null) === value); return query; },
        in: (column: string, values: unknown[]) => {
          if (column === "student_id") studentIds = [...values];
          rows = rows.filter((row) => values.includes(row[column]));
          return query;
        },
        order: (column: string, options: { ascending: boolean }) => { orders.push({ column, ascending: options.ascending }); return query; },
        limit: (count: number) => { limit = count; return query; },
        range: (from: number, to: number) => { range = [from, to]; return query; },
        update: db.directWrite,
        delete: db.directWrite,
        maybeSingle: async () => ({ data: rows[0] || null, error: null }),
        then: (resolve: (value: unknown) => unknown) => {
          db.reads.push({ table, studentIds, range, orders });
          const failure = db.readError;
          if (failure?.table === table && studentIds.includes(failure.studentId)
            && (failure.from === undefined || failure.from === range?.[0])) {
            return Promise.resolve({ data: null, error: { message: failure.message } }).then(resolve);
          }
          rows.sort((a, b) => {
            for (const { column, ascending } of orders) {
              const comparison = String(a[column] ?? "").localeCompare(String(b[column] ?? ""));
              if (comparison) return ascending ? comparison : -comparison;
            }
            return 0;
          });
          if (range) rows = rows.slice(range[0], range[1] + 1);
          if (limit !== null) rows = rows.slice(0, limit);
          return Promise.resolve({ data: rows.map((row) => ({ ...row })), error: null }).then(resolve);
        },
      };
      return query;
    },
  },
}));

function profile(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    company_id: "company-1",
    full_name: `Perfil ${id}`,
    phone: null,
    status: "interested",
    sales_stage: "interested",
    stage: "interested",
    created_at: "2025-01-01T10:00:00Z",
    updated_at: "2025-01-01T10:00:00Z",
    pre_registration_answers: { objective: "saude" },
    ...overrides,
  };
}

function card(name: string) {
  const region = screen.getByRole("region", { name: "Esteira de fechamento com rolagem horizontal" });
  const element = within(region).getByText(name).closest("[draggable]");
  if (!element) throw new Error(`Cartão ausente: ${name}`);
  return within(element as HTMLElement);
}

async function loaded(name: string) {
  await waitFor(() => expect(card(name).getByText(name)).toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
  db.companyId = 'company-1';
  db.gate.mockResolvedValue(undefined);
  db.draft.mockResolvedValue('Mensagem fiscal em rascunho');
  db.invoke.mockResolvedValue({ data: { token: '33333333-3333-4333-8333-333333333333', studentId: 'converted-student', phoneDigits: '14155552671', messageSent: false }, error: null });
  db.students = [];
  db.leads = [];
  db.auxiliary = {};
  db.reads = [];
  db.readError = null;
  db.rpc.mockImplementation(async (_name, args) => {
    const rows = args._entity_type === "lead" ? db.leads : db.students;
    const row = rows.find((item) => item.id === args._record_id && item.company_id === args._company_id);
    if (!row) return { data: null, error: { message: "Perfil não encontrado." } };
    row[args._entity_type === "lead" ? "stage" : "sales_stage"] = args._target_stage;
    return { data: { id: row.id, stage: args._target_stage }, error: null };
  });
});


vi.mock('@/lib/companyOperationsStore', () => ({ assertCompanyOperationalTransition: db.gate }));
vi.mock('@/lib/companyCommercialSettings', async original => {
  const module = await original<typeof import('@/lib/companyCommercialSettings')>();
  return { ...module, fetchCompanyCommercialSettings: async () => ({ settings: module.DEFAULT_COMPANY_COMMERCIAL_SETTINGS }) };
});
import { LeadFiscalConfirmation } from './LeadFiscalConfirmation';
afterEach(cleanup);
function seed(phone = '14155552671') { db.leads = [profile('lead-fixture', { full_name: 'Lead sintético', stage: 'contacted', phone })]; }
async function openConfirmation() {
  await loaded('Lead sintético');
  fireEvent.click(card('Lead sintético').getByRole('button', { name: 'Enviar cadastro fiscal' }));
  return screen.findByRole('dialog', { name: 'Confirmar telefone do Lead' });
}
function choose(country: string, format: string) {
  const select = screen.getByRole('combobox', { name: 'País do telefone' });
  const option = within(select).getByRole('option', { name: country ? new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(country.toUpperCase()) : 'Selecione o país' }) as HTMLOptionElement;
  fireEvent.change(select, { target: { value: option.value } });
  fireEvent.change(screen.getByLabelText('Formato do telefone'), { target: { value: format } });
}
it.each([
  ['BR','national','11999999999',true], ['BR','national','1133334444',true],
  ['BR','e164','5511999999999',true], ['BR','e164','551133334444',true],
  ['US','e164','14155552671',true], ['US','national','14155552671',false],
  ['','e164','14155552671',false],
  ['BR','','11999999999',false], ['BR','e164','11999999999',false],
  ['BR','national','5511999999999',false], ['US','e164','1234567',false],
  ['US','e164','12345678',true], ['US','e164','123456789012345',true],
  ['US','e164','1234567890123456',false], ['US','e164','014155552671',false],
])('validates explicit %s/%s for %s before enabling conversion (%s)', (country, format, phone, valid) => {
  render(<LeadFiscalConfirmation name="Lead sintético" phone={phone} onClose={vi.fn()} onConfirm={vi.fn()} />);
  choose(country, format);
  expect(screen.getByRole('button', { name: 'Preparar cadastro' }).hasAttribute('disabled')).toBe(!valid);
  expect(db.invoke).not.toHaveBeenCalled();
});
it('never guesses country or converts on open/select; sends explicit US e164 body and preserves unsent draft', async () => {
  seed(); render(<RegistrationManager />); const dialog = await openConfirmation();
  expect(within(dialog).getByText(/14155552671/)).toBeInTheDocument();
  expect(screen.getByLabelText('País do telefone')).toHaveValue(''); expect(screen.getByLabelText('Formato do telefone')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Preparar cadastro' })).toBeDisabled(); expect(db.invoke).not.toHaveBeenCalled();
  choose('US','e164'); expect(db.invoke).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Preparar cadastro' }));
  await screen.findByRole('dialog', { name: 'Cadastro fiscal preparado' });
  expect(db.invoke).toHaveBeenCalledExactlyOnceWith('public-registration', { body: { action: 'convert-lead', leadId: 'lead-fixture', phoneCountry: 'US', phoneFormat: 'e164', confirmedPhone: '14155552671' } });
  expect(screen.getByText(/Nada foi enviado/)).toBeInTheDocument(); expect(screen.getByText('Mensagem fiscal em rascunho')).toBeInTheDocument();
  expect(db.openChat).not.toHaveBeenCalled(); expect(db.directWrite).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Abrir conversa sem enviar' }));
  await waitFor(() => expect(db.openChat).toHaveBeenCalledWith(expect.objectContaining({ phone: '14155552671', message: '' })));
});
it('passes BR national explicitly and only adds 55 to the prepared draft contact after confirmation', async () => {
  db.invoke.mockResolvedValue({ data: { token: '33333333-3333-4333-8333-333333333333', studentId: 'converted-student', phoneDigits: '5511999999999', messageSent: false }, error: null });
  seed('11999999999'); render(<RegistrationManager />); await openConfirmation(); choose('BR','national');
  fireEvent.click(screen.getByRole('button', { name: 'Preparar cadastro' })); await screen.findByRole('dialog', { name: 'Cadastro fiscal preparado' });
  expect(db.invoke).toHaveBeenCalledWith('public-registration', { body: { action: 'convert-lead', leadId: 'lead-fixture', phoneCountry: 'BR', phoneFormat: 'national', confirmedPhone: '5511999999999' } });
  fireEvent.click(screen.getByRole('button', { name: 'Abrir conversa sem enviar' }));
  await waitFor(() => expect(db.openChat).toHaveBeenCalledWith(expect.objectContaining({ phone: '5511999999999', message: '' })));
});
it.each(['Cancelar','Close'])('closing with %s never converts and reopening requires new choices', async button => {
  seed(); render(<RegistrationManager />); await openConfirmation(); choose('US','e164');
  fireEvent.click(screen.getByRole('button', { name: button }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(db.invoke).not.toHaveBeenCalled(); await openConfirmation();
  expect(screen.getByLabelText('País do telefone')).toHaveValue(''); expect(screen.getByRole('button', { name: 'Preparar cadastro' })).toBeDisabled();
});
it('guards repeat clicks and does not attach a pending conversion after company A → B → A', async () => {
  let finish!: (value: unknown) => void; db.invoke.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  seed(); const view = render(<RegistrationManager />); await openConfirmation(); choose('US','e164');
  const button = screen.getByRole('button', { name: 'Preparar cadastro' }); fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(1));
  db.companyId = 'company-2'; view.rerender(<RegistrationManager />);
  db.companyId = 'company-1'; view.rerender(<RegistrationManager />);
  await act(async () => { finish({ data: { token: 'token', studentId: 'converted-student', phoneDigits: '14155552671' }, error: null }); });
  expect(screen.queryByRole('dialog', { name: 'Cadastro fiscal preparado' })).not.toBeInTheDocument(); expect(db.draft).not.toHaveBeenCalled(); expect(db.openChat).not.toHaveBeenCalled();
});
it('discards an in-flight message draft on unmount and never auto-opens chat', async () => {
  let finish!: (value: string) => void; db.draft.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  seed(); const view = render(<RegistrationManager />); await openConfirmation(); choose('US','e164');
  fireEvent.click(screen.getByRole('button', { name: 'Preparar cadastro' })); await waitFor(() => expect(db.draft).toHaveBeenCalled());
  view.unmount(); await act(async () => { finish('Mensagem antiga'); });
  expect(db.toast.success).not.toHaveBeenCalled(); expect(db.openChat).not.toHaveBeenCalled();
});
it('keeps a failed conversion open for explicit retry without preparing a draft', async () => {
  db.invoke.mockResolvedValue({ data: { error: 'Telefone divergente' }, error: null });
  seed(); render(<RegistrationManager />); await openConfirmation(); choose('US','e164'); fireEvent.click(screen.getByRole('button', { name: 'Preparar cadastro' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Telefone divergente'); expect(screen.getByRole('button', { name: 'Preparar cadastro' })).toBeEnabled(); expect(db.draft).not.toHaveBeenCalled();
});
it('preserves the existing Student create-link path without the Lead confirmation', async () => {
  db.students = [profile('existing-student', { full_name: 'Aluno sintético', status: 'pending', sales_stage: 'fiscal_registration_pending', phone: '11999999999' })];
  render(<RegistrationManager />); await loaded('Aluno sintético');
  fireEvent.click(card('Aluno sintético').getByRole('button', { name: 'Reenviar cadastro' }));
  await screen.findByRole('dialog', { name: 'Cadastro fiscal preparado' });
  expect(db.invoke).toHaveBeenCalledExactlyOnceWith('public-registration', { body: { action: 'create-link', studentId: 'existing-student' } });
  expect(screen.queryByRole('dialog', { name: 'Confirmar telefone do Lead' })).not.toBeInTheDocument(); expect(db.openChat).not.toHaveBeenCalled();
});

it('offers localized country names with stable codes and an empty default instead of an ISO text field', () => {
  render(<LeadFiscalConfirmation name="Lead sintético" phone="14155552671" onClose={vi.fn()} onConfirm={vi.fn()} />);
  const select = screen.getByRole('combobox', { name: 'País do telefone' });
  expect(select).toHaveValue(''); expect(screen.queryByRole('textbox', { name: 'País do telefone' })).not.toBeInTheDocument();
  expect(within(select).getByRole('option', { name: 'Brasil' })).toHaveValue('BR');
  expect(within(select).getByRole('option', { name: 'Estados Unidos' })).toHaveValue('US');
  expect(within(select).getByRole('option', { name: 'Portugal' })).toHaveValue('PT');
  const values = Array.from((select as HTMLSelectElement).options).map(option => option.value).filter(Boolean);
  expect(values).toHaveLength(249); expect(new Set(values).size).toBe(249); expect(values).not.toContain('ZZ');
  expect(screen.getByRole('option', { name: 'Número com DDD' })).toHaveValue('national');
  expect(screen.getByRole('option', { name: 'Número com código do país' })).toHaveValue('e164');
  expect(screen.getByRole('button', { name: 'Preparar cadastro' })).toBeDisabled(); expect(db.invoke).not.toHaveBeenCalled();
});

it.each(['5511999999999', undefined])('blocks a mismatched or absent server recipient (%s) before drafting', async phoneDigits => {
  db.invoke.mockResolvedValue({ data: { token: '33333333-3333-4333-8333-333333333333', studentId: 'converted-student', phoneDigits, messageSent: false }, error: null });
  seed(); render(<RegistrationManager />); await openConfirmation(); choose('US', 'e164');
  fireEvent.click(screen.getByRole('button', { name: 'Preparar cadastro' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('O telefone confirmado diverge');
  expect(db.invoke).toHaveBeenCalledExactlyOnceWith('public-registration', { body: { action: 'convert-lead', leadId: 'lead-fixture', phoneCountry: 'US', phoneFormat: 'e164', confirmedPhone: '14155552671' } });
  expect(db.draft).not.toHaveBeenCalled(); expect(db.openChat).not.toHaveBeenCalled(); expect(db.toast.success).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog', { name: 'Cadastro fiscal preparado' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Preparar cadastro' })).toBeEnabled();
});
