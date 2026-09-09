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
  mocks.invoke.mockImplementation(async (_name, args) =>
    args.body.action === "financial-installment-snapshot" ? snapshot() : { data: { status: "SCHEDULED" }, error: null });
  mocks.from.mockImplementation((table: string) => {
    let company: string | undefined;
    let head = false;
    const query = {
      select: (_columns: string, options?: { head?: boolean }) => { head = Boolean(options?.head); return query; },
      eq: (column: string, value: string) => { if (column === "company_id") company = value; return query; },
      in: () => query, order: () => query, limit: () => query, range: () => query,
      maybeSingle: async () => ({ data: { cpf: "00000000000", cep: "00000000", address: "Fixture", country_code: "BR" }, error: null }),
      then: (resolve: (result: object) => unknown, reject?: (error: unknown) => unknown) => {
        const rows = localRows.filter((row) => !company || row.company_id === company);
        return Promise.resolve({ data: table === "payments" && !head ? rows : [], count: rows.length, error: null }).then(resolve, reject);
      },
    };
    return query;
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("FinancialDashboard authoritative installment snapshot", () => {
  it("renders six provider installments once, excluding the legacy parent total", async () => {
    render(<FinancialDashboard />);
    await loaded();
    const table = within(history());
    expect(table.getAllByText("R$ 230,00")).toHaveLength(6);
    expect(table.queryByText("R$ 1.380,00")).not.toBeInTheDocument();
    expect(cashCard()).toHaveTextContent("R$ 1.380,00");
    expect(mocks.invoke).toHaveBeenCalledWith("asaas-integration", {
      body: { action: "financial-installment-snapshot", companyId: "company-a" },
    });
  });

  it("preserves civil dates and labels the first installment as an installment", async () => {
    render(<FinancialDashboard />);
    await loaded();
    const rows = within(history()).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(6);
    for (const row of rows) expect(row).toHaveTextContent("09/09/2026");
    expect(rows[0]).toHaveTextContent(/parcela\s*1/i);
    expect(rows[0]).not.toHaveTextContent("À vista");
  });

  it("counts one installment group as one sale for average ticket", async () => {
    render(<FinancialDashboard />);
    await loaded();
    const ticket = screen.getByText("Ticket Médio").closest(".rounded-lg") as HTMLElement;
    expect(ticket).toHaveTextContent("R$ 1.380,00");
    expect(ticket).not.toHaveTextContent("R$ 230,00");
  });

  it("keeps provider-only installments disabled and invoices the exact locally matched child", async () => {
    localRows.push(localPayment("local-child", "pay_2", "company-a", 230));
    mocks.invoke.mockImplementation(async (_name, args) => args.body.action === "financial-installment-snapshot"
      ? snapshot(Array.from({ length: 6 }, (_, i) => entry(i + 1, i === 1 ? { localPaymentIds: ["local-child"] } : {})))
      : { data: { status: "SCHEDULED" }, error: null });
    render(<FinancialDashboard />);
    await loaded();
    const rows = within(history()).getAllByRole("row").slice(1);
    expect(within(rows[2]).getByRole("button", { name: /indisponível/i })).toBeDisabled();
    expect(rows[2]).toHaveTextContent(/linha local/i);
    fireEvent.click(within(rows[1]).getByRole("button", { name: /emitir nota/i }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("asaas-integration", {
      body: { action: "create-invoice", paymentId: "pay_2" },
    }));
    expect(mocks.invoke.mock.calls.filter(([, args]) => args.body.action === "create-invoice")).toHaveLength(1);
  });

  it("never falls back to the local total when the provider is unavailable", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error("fixture unavailable") });
    render(<FinancialDashboard />);
    await loaded();
    expect(screen.getAllByText(/não ficou disponível|indisponível/i).length).toBeGreaterThan(0);
    expect(within(history()).queryByText("R$ 1.380,00")).not.toBeInTheDocument();
    expect(cashCard()).not.toHaveTextContent("R$ 1.380,00");
    expect(within(cashCard()).queryByText("R$ 0,00")).not.toBeInTheDocument();
    expect(within(history()).queryByText("Nenhum pagamento encontrado")).not.toBeInTheDocument();
    expect(within(history()).queryByText("0 pagamentos encontrados")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("chart")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /emitir nota/i })).not.toBeInTheDocument();
    for (const name of [/^Pendentes(?:\s|$)/, /^Atrasados(?:\s|$)/]) {
      const card = screen.getByText(name, { selector: "p" }).closest(".rounded-lg") as HTMLElement;
      expect(within(card).queryByText("0")).not.toBeInTheDocument();
      expect(card).not.toHaveTextContent(/R\$\s*0,00/);
      expect(card).toHaveTextContent(/indisponível|conciliação|parcial/i);
    }
    expect(screen.queryAllByText("Nenhum recebimento previsto")).toHaveLength(0);
    const cashByStudent = screen.getByText(/^CAIXA.*DETALHE POR ALUNO$/i).closest(".rounded-lg") as HTMLElement;
    expect(cashByStudent).toHaveTextContent(/indisponível|conciliação|parcial/i);
  });

  it("excludes unresolved card amounts and disables fiscal actions", async () => {
    mocks.invoke.mockResolvedValue(snapshot([], [{
      resolution: "unresolved_local", reason: "provider_group_unavailable",
      localPaymentId: "local-parent", asaasPaymentId: "pay_1", billingType: "CREDIT_CARD",
      localValue: 1380, localStatus: "RECEIVED", dueDate: today,
    }]));
    render(<FinancialDashboard />);
    await loaded();
    expect(screen.getByText(/1 pagamento\(s\).*pendentes/i)).toBeInTheDocument();
    expect(cashCard()).not.toHaveTextContent("R$ 1.380,00");
    expect(within(history()).queryByText("R$ 1.380,00")).not.toBeInTheDocument();
    expect(within(history()).getByRole("button", { name: /indisponível/i })).toBeDisabled();
  });

  it("retains all 18 missing-provider-ID cards as unresolved alongside authoritative installments", async () => {
    const missing = Array.from({ length: 18 }, (_, i) => localPayment("missing-" + i, null));
    localRows.push(...missing);
    mocks.invoke.mockResolvedValue(snapshot(undefined, missing.map((row) => ({
      resolution: "unresolved_local", reason: "missing_asaas_payment_id",
      localPaymentId: row.id, asaasPaymentId: null, billingType: "CREDIT_CARD",
      localValue: row.value, localStatus: row.status, dueDate: today,
    }))));
    render(<FinancialDashboard />);
    await loaded();
    expect(screen.getByText(/18 pagamento\(s\).*pendentes/i)).toBeInTheDocument();
    expect(screen.getByText("Financeiro parcialmente conciliado")).toBeInTheDocument();
    expect(cashCard()).toHaveTextContent("R$ 1.380,00");
    let rowCount = 0;
    let resolvedCount = 0;
    let unresolvedCount = 0;
    for (let page = 1; page <= 2; page++) {
      const table = within(history());
      const rows = table.getAllByRole("row").slice(1);
      rowCount += rows.length;
      resolvedCount += table.queryAllByText("R$ 230,00").length;
      expect(table.queryByText("R$ 1.380,00")).not.toBeInTheDocument();
      for (const row of rows.filter((item) => !within(item).queryByText("R$ 230,00"))) {
        unresolvedCount++;
        expect(within(row).getByRole("button", { name: /indisponível/i })).toBeDisabled();
      }
      if (page === 1) {
        const pagination = table.getByText("Página 1 de 2").parentElement as HTMLElement;
        fireEvent.click(within(pagination).getAllByRole("button")[1]);
        expect(table.getByText("Página 2 de 2")).toBeInTheDocument();
      }
    }
    expect(rowCount).toBe(24);
    expect(resolvedCount).toBe(6);
    expect(unresolvedCount).toBe(18);
  });

  it("includes CONFIRMED future installments in forecast but not received cash", async () => {
    mocks.invoke.mockResolvedValue(snapshot([entry(1), entry(2, {
      status: "CONFIRMED", dueDate: "2026-10-09", creditDate: null, estimatedCreditDate: "2026-10-15",
    })]));
    render(<FinancialDashboard />);
    await loaded();
    expect(cashCard()).toHaveTextContent("R$ 230,00");
    expect(cashCard()).not.toHaveTextContent("R$ 460,00");
    expect(screen.getByTestId("month-2026-10")).toHaveTextContent("R$ 230,00");
    const charts = screen.getAllByTestId("chart").map((node) => JSON.parse(node.getAttribute("data-values") || "[]"));
    expect(charts.some((rows: { month: string; value: number }[]) =>
      rows.some((row) => row.month === "out/26" && row.value === 230))).toBe(true);
  });

  it("reloads the selected master company and never requests an unscoped snapshot", async () => {
    mocks.auth.role = "master";
    mocks.master = { viewingCompany: { id: "company-a" }, isViewingCompany: true };
    localRows.push(localPayment("local-b", "pay_b", "company-b", 90));
    mocks.invoke.mockImplementation(async (_name, args) => snapshot([
      entry(1, args.body.companyId === "company-b"
        ? { localPaymentIds: ["local-b"], asaasPaymentId: "pay_b", value: 90 }
        : {}),
    ], [], args.body.companyId));
    const view = render(<FinancialDashboard />);
    await loaded();
    mocks.master = { viewingCompany: { id: "company-b" }, isViewingCompany: true };
    view.rerender(<FinancialDashboard />);
    await waitFor(() => expect(within(history()).getByText("R$ 90,00")).toBeInTheDocument());
    expect(within(history()).queryByText("R$ 230,00")).not.toBeInTheDocument();
    expect(mocks.invoke.mock.calls.filter(([, args]) => args.body.action === "financial-installment-snapshot")
      .map(([, args]) => args.body.companyId)).toEqual(["company-a", "company-b"]);
  });

  it("does not let an older company response overwrite the newly selected tenant", async () => {
    mocks.auth.role = "master";
    mocks.master = { viewingCompany: { id: "company-a" }, isViewingCompany: true };
    localRows.push(localPayment("local-b", "pay_b", "company-b", 90));
    const old = deferred<ReturnType<typeof snapshot>>();
    mocks.invoke.mockImplementation((_name, args) => args.body.companyId === "company-a" ? old.promise
      : Promise.resolve(snapshot([entry(1, { localPaymentIds: ["local-b"], asaasPaymentId: "pay_b", value: 90 })], [], "company-b")));
    const view = render(<FinancialDashboard />);
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    mocks.master = { viewingCompany: { id: "company-b" }, isViewingCompany: true };
    view.rerender(<FinancialDashboard />);
    await waitFor(() => expect(within(history()).getByText("R$ 90,00")).toBeInTheDocument());
    await act(async () => { old.resolve(snapshot([entry(1)])); });
    expect(within(history()).getByText("R$ 90,00")).toBeInTheDocument();
    expect(within(history()).queryByText("Fixture company-a")).not.toBeInTheDocument();
  });
});
