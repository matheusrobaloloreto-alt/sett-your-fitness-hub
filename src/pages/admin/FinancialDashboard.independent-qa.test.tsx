import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FinancialProjectionEntry } from "@/lib/financialProjection";

const mocks = vi.hoisted(() => ({
  auth: { companyId: "company-a", role: "admin" },
  master: { viewingCompany: null as { id: string } | null, isViewingCompany: false },
  invoke: vi.fn(),
  from: vi.fn(),
  navigate: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/contexts/MasterContext", () => ({ useMaster: () => mocks.master }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from, functions: { invoke: mocks.invoke } },
}));
vi.mock("@/components/BnitoFloatingAssistant", () => ({ BnitoContextButton: () => null }));
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: PropsWithChildren) => <div>{children}</div>,
  BarChart: ({ data }: { data: unknown }) => <div data-testid="chart" data-values={JSON.stringify(data)} />,
  Bar: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, Cell: () => null,
}));
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: PropsWithChildren) => <div>{children}</div>,
  TabsList: ({ children }: PropsWithChildren) => <div>{children}</div>,
  TabsTrigger: ({ children }: PropsWithChildren) => <div>{children}</div>,
  TabsContent: ({ children, value }: PropsWithChildren<{ value: string }>) =>
    <div data-testid={"month-" + value}>{children}</div>,
}));

// These probes exercise financial lifecycle/state, not Radix portal rendering.
vi.mock("@/components/ui/select", () => ({
 Select: ({children}: PropsWithChildren) => <div>{children}</div>,
 SelectTrigger: ({children}: PropsWithChildren) => <div>{children}</div>,
 SelectContent: ({children}: PropsWithChildren) => <div>{children}</div>,
 SelectValue: () => null,
 SelectItem: ({children}: PropsWithChildren) => <span>{children}</span>,
}));
import FinancialDashboard from "./FinancialDashboard";

const today = "2026-09-09";
function localPayment(id = "local-parent", providerId: string | null = "pay_1", company = "company-a", value = 1380) {
  return {
    id, company_id: company, student_id: "student-" + company,
    value, installment_count: 6, billing_type: "CREDIT_CARD",
    created_at: today + "T12:00:00Z", due_date: today, status: "RECEIVED",
    asaas_payment_id: providerId, invoice_status: null, notes: null,
    students: { full_name: "Fixture " + company },
  };
}
type LocalPayment = ReturnType<typeof localPayment>;
let localRows: LocalPayment[] = [];
let readFailure: { table: string; head?: boolean; reject?: boolean } | null = null;

function entry(n: number, overrides: Partial<FinancialProjectionEntry> = {}): FinancialProjectionEntry {
  return {
    resolution: "provider_group", localPaymentIds: n === 1 ? ["local-parent"] : [],
    asaasPaymentId: "pay_" + n, installmentGroupId: "group-a", installmentNumber: n,
    billingType: "CREDIT_CARD", value: 230, dateCreated: today, dueDate: today, creditDate: today,
    estimatedCreditDate: null, status: "RECEIVED", invoiceStatus: null, ...overrides,
  };
}
function snapshot(entries = Array.from({ length: 6 }, (_, i) => entry(i + 1)), unresolved: object[] = [], companyId = "company-a") {
  return { data: { source: "asaas-readonly", companyId, generatedAt: today, entries, unresolved }, error: null };
}
function history() {
  return screen.getByText("HISTÓRICO DE PAGAMENTOS").closest(".rounded-lg") as HTMLElement;
}
function cashCard() {
  return screen.getByText(/^Caixa\s*[—-]/i, { selector: "p" }).closest(".rounded-lg") as HTMLElement;
}
async function loaded() {
  await screen.findByRole("heading", { name: "FINANCEIRO" });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-09T15:00:00Z"));
  mocks.auth = { companyId: "company-a", role: "admin" };
  mocks.master = { viewingCompany: null, isViewingCompany: false };
  mocks.invoke.mockReset();
  mocks.from.mockReset();
  mocks.toast.mockReset();
  localRows = [localPayment()];
  readFailure = null;
  mocks.invoke.mockImplementation(async (_name, args) =>
    args.body.action === "financial-installment-snapshot" ? snapshot() : { data: { invoiceId: "inv-fixture", status: "SCHEDULED" }, error: null });
  mocks.from.mockImplementation((table: string) => {
    let company: string | undefined;
    let head = false;
    const query = {
      select: (_columns: string, options?: { head?: boolean }) => { head = Boolean(options?.head); return query; },
      eq: (column: string, value: string) => { if (column === "company_id") company = value; return query; },
      in: () => query, order: () => query, limit: () => query, range: () => query,
      maybeSingle: async () => {
        if (readFailure?.table === table) {
          if (readFailure.reject) throw new TypeError('fixture offline');
          return { data: null, error: new Error('fixture denied') };
        }
        return { data: { cpf: "00000000000", cep: "00000000", address: "Fixture", country_code: "BR" }, error: null };
      },
      then: (resolve: (result: object) => unknown, reject?: (error: unknown) => unknown) => {
        if (readFailure?.table === table && (readFailure.head === undefined || readFailure.head === head)) {
          const error = new Error('fixture read denied');
          return (readFailure.reject ? Promise.reject(error) : Promise.resolve({ data: null, count: null, error })).then(resolve, reject);
        }
        const rows = localRows.filter((row) => !company || row.company_id === company);
        return Promise.resolve({ data: table === "payments" && !head ? rows : [], count: rows.length, error: null }).then(resolve, reject);
      },
    };
    return query;
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('independent FinanceSagan QA probes', () => {
 it('starts with unknown totals and publishes local PIX while the snapshot remains pending', async () => {
   const pending = deferred<ReturnType<typeof snapshot>>();
   mocks.invoke.mockReturnValue(pending.promise);
   localRows.push({...localPayment('pix',null,'company-a',75),billing_type:'PIX',students:{full_name:'Independent PIX'}});
   render(<FinancialDashboard/>);
   expect(screen.queryByText('R$ 0,00')).toBeNull();
   await loaded();
   expect(within(history()).getByText('Independent PIX')).toBeInTheDocument();
   expect(cashCard()).not.toHaveTextContent('R$ 0,00');
   expect(cashCard()).toHaveTextContent(/parcial/i);
   await act(async()=>{pending.resolve(snapshot());});
   expect(cashCard()).toHaveTextContent('R$ 1.455,00');
   expect(within(history()).getAllByText('R$ 230,00')).toHaveLength(6);
 });
 it.each(['unmount','role-change'])('cancels pending invoice preflight after %s', async change => {
   const view = render(<FinancialDashboard/>);
   await loaded();
   await waitFor(()=>expect(within(history()).getAllByText('R$ 230,00')).toHaveLength(6));
   const fiscal = deferred<{data:{cpf:string;cep:string;address:string;country_code:string};error:null}>();
   const from = mocks.from.getMockImplementation()!;
   mocks.from.mockImplementation((table: string) => {
     const query = from(table);
     if (table === 'students') query.maybeSingle = () => fiscal.promise;
     return query;
   });
   fireEvent.click(within(history()).getByRole('button',{name:/emitir nota/i}));
   if (change === 'unmount') view.unmount();
   else {mocks.auth.role = 'trainer'; view.rerender(<FinancialDashboard/>);}
   await act(async()=>{fiscal.resolve({data:{cpf:'00000000000',cep:'00000000',address:'Synthetic',country_code:'BR'},error:null});});
   expect(mocks.invoke.mock.calls.filter(([,args])=>args.body.action === 'create-invoice')).toHaveLength(0);
 });
 it('does not double-count local card parent and child against the provider installment set', async () => {
   localRows.push(localPayment('child','pay_2','company-a',230));
   mocks.invoke.mockResolvedValue(snapshot(Array.from({length:6},(_,i)=>entry(i+1,
     i === 1 ? {localPaymentIds:['child']} : {}))));
   render(<FinancialDashboard/>);
   await act(async()=>{await Promise.resolve();});
   await loaded();
   await waitFor(()=>expect(within(history()).getAllByText('R$ 230,00')).toHaveLength(6));
   expect(cashCard()).toHaveTextContent('R$ 1.380,00');
   expect(cashCard()).not.toHaveTextContent('R$ 1.610,00');
   expect(within(history()).getAllByRole('row')).toHaveLength(7);
 });
 it('does not carry a prior A sync busy lock onto newly selected B', async () => {
   const a = deferred<{data:{message:string;synced:number};error:null}>();
   const b = deferred<{data:{message:string;synced:number};error:null}>();
   localRows.push(localPayment('local-b','pay_b','company-b',90));
   mocks.invoke.mockImplementation((_name,args)=> args.body.action === 'sync-payments'
     ? (args.body.companyId === 'company-a' ? a.promise : b.promise)
     : Promise.resolve(args.body.companyId === 'company-b'
       ? snapshot([entry(1,{localPaymentIds:['local-b'],asaasPaymentId:'pay_b',value:90})],[],'company-b')
       : snapshot()));
   const view = render(<FinancialDashboard/>); await loaded();
   fireEvent.click(screen.getByRole('button',{name:'Sincronizar'}));
   mocks.auth.companyId = 'company-b'; view.rerender(<FinancialDashboard/>);
   await waitFor(()=>expect(within(history()).getByText('R$ 90,00')).toBeInTheDocument());
   // A's operation must not permanently lock B's controls.
   expect(screen.getByRole('button',{name:'Sincronizar'})).toBeEnabled();
   fireEvent.click(screen.getByRole('button',{name:'Sincronizar'}));
   await act(async()=>a.resolve({data:{message:'old A',synced:0},error:null}));
   expect(screen.getByRole('button',{name:/Sincronizando/})).toBeDisabled();
   expect(mocks.invoke.mock.calls.filter(([,args])=>args.body.action==='sync-payments').map(([,args])=>args.body.companyId)).toEqual(['company-a','company-b']);
   await act(async()=>b.resolve({data:{message:'current B',synced:0},error:null}));
   await waitFor(()=>expect(screen.getByRole('button',{name:'Sincronizar'})).toBeEnabled());
 });
 it('discards A after a delayed student-plan read completes under company B', async () => {
   const plans = deferred<{data:object[];error:null}>();
   const from = mocks.from.getMockImplementation()!;
   let heldReads = 0;
   mocks.from.mockImplementation((table: string) => {
     const query = from(table);
     if (table !== 'students') return query;
     const eq = query.eq;
     const then = query.then;
     let company = '';
     query.eq = (column:string,value:string) => {if(column === 'company_id')company=value;return eq(column,value);};
     query.then = (resolve:(value:object)=>unknown,reject:(error:unknown)=>unknown) => {
       if (company === 'company-a') {heldReads++;return plans.promise.then(resolve,reject);}
       return then(resolve,reject);
     };
     return query;
   });
   localRows.push(localPayment('local-b','pay_b','company-b',90));
   mocks.invoke.mockImplementation((_name,args)=>Promise.resolve(args.body.companyId === 'company-b'
     ? snapshot([entry(1,{localPaymentIds:['local-b'],asaasPaymentId:'pay_b',value:90})],[],'company-b') : snapshot()));
   const view=render(<FinancialDashboard/>);
   await waitFor(()=>expect(heldReads).toBe(1));
   mocks.auth.companyId='company-b';view.rerender(<FinancialDashboard/>);
   await waitFor(()=>expect(within(history()).getByText('R$ 90,00')).toBeInTheDocument());
   await act(async()=>{plans.resolve({data:[],error:null});});
   expect(cashCard()).toHaveTextContent('R$ 90,00');
   expect(within(history()).queryByText('Fixture company-a')).toBeNull();
 });

});

it('locks invoice synchronously during fiscal preflight and accepts only a confirmed request', async () => {
  const fiscal = deferred<{data:object;error:null}>();
  const original = mocks.from.getMockImplementation()!;
  mocks.from.mockImplementation((table: string) => {
    const query = original(table);
    if (table === 'students') query.maybeSingle = () => fiscal.promise;
    return query;
  });
  render(<FinancialDashboard />); await loaded();
  const button = within(history()).getByRole('button', {name:/emitir nota/i});
  act(() => { fireEvent.click(button); fireEvent.click(button); });
  expect(mocks.invoke.mock.calls.filter(([,args])=>args.body.action==='create-invoice')).toHaveLength(0);
  await act(async()=>fiscal.resolve({data:{cpf:'00000000000',cep:'00000000',address:'Fixture',country_code:'BR'},error:null}));
  await waitFor(()=>expect(mocks.invoke.mock.calls.filter(([,args])=>args.body.action==='create-invoice')).toHaveLength(1));
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({title:'Solicitação de NFS-e confirmada'}));
});
it.each([null, {}, {status:'SCHEDULED'}, {invoiceId:'inv'}, {invoiceId:'inv',status:'ERROR'}])('rejects malformed fiscal ACK %j without inventing scheduled state', async ack => {
  mocks.invoke.mockImplementation(async (_name,args)=>args.body.action==='financial-installment-snapshot'?snapshot():{data:ack,error:null});
  render(<FinancialDashboard />); await loaded();
  fireEvent.click(within(history()).getByRole('button',{name:/emitir nota/i}));
  await waitFor(()=>expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({title:'Solicitação fiscal não confirmada',variant:'destructive'})));
  expect(within(history()).queryByText('Agendada')).toBeNull();
  expect(mocks.toast.mock.calls.some(([arg])=>arg.title==='Solicitação de NFS-e confirmada')).toBe(false);
});
it.each([null, {}, {synced:-1}, {synced:'1'}])('rejects malformed sync ACK %j', async ack => {
  mocks.invoke.mockImplementation(async (_name,args)=>args.body.action==='financial-installment-snapshot'?snapshot():{data:ack,error:null});
  render(<FinancialDashboard />); await loaded();
  fireEvent.click(screen.getByRole('button',{name:'Sincronizar'}));
  await waitFor(()=>expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({title:'Erro ao sincronizar',variant:'destructive'})));
  expect(mocks.toast.mock.calls.some(([arg])=>arg.title==='Sincronização concluída')).toBe(false);
});
