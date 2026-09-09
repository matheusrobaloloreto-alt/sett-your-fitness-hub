import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Clock, AlertCircle, Percent, FileText, Loader2, CheckCircle, Wallet, TrendingUp, RefreshCw, ArrowUpRight, ArrowDownRight, ChevronLeft, ChevronRight, Search, Download } from "lucide-react";
import { format, subMonths, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { BnitoContextButton } from "@/components/BnitoFloatingAssistant";
import { useNavigate } from "react-router-dom";
import { isBrazilianCountry } from "@/lib/fiscalRegistration";
import {
  billingMonthKey,
  cashMonthKey,
  financialMonthKey,
  isCashAvailableEntry,
  isPaidFinancialEntry,
  isProjectedCashEntry,
  parseFinancialDate,
  projectedCashMonthKey,
  unresolvedCreditCardCount,
  type FinancialProjectionEntry,
  type FinancialProjectionSnapshot,
} from "@/lib/financialProjection";

interface FinancialStats {
  monthRevenueBilling: number;
  monthRevenueCash: number;
  pendingCount: number;
  pendingValue: number;
  overdueCount: number;
  overdueValue: number;
  conversionRate: number;
  prevMonthBilling: number;
  prevMonthCash: number;
  prevTicketMedio: number;
  unreconciledCreditCardCount: number;
}

interface RecentPayment {
  id: string;
  student_id: string | null;
  value: number;
  billing_type: string | null;
  status: string | null;
  created_at: string;
  due_date: string | null;
  asaas_payment_id: string | null;
  invoice_status: string | null;
  installment_count: number;
  notes: string | null;
  students: { full_name: string } | null;
  invoice_action_available?: boolean;
  payment_row_note?: string;
  installment_label?: string;
}

interface CashDetail {
  name: string;
  value: number;
  detail: string;
  projected?: boolean;
}

const PAGE_SIZE = 20;

export default function FinancialDashboard() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { companyId, role } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id : null) : companyId;
  const rolePrefix = role === "coordinator" ? "/coordinator" : role === "trainer" ? "/trainer" : "/admin";
  const [financialStats, setFinancialStats] = useState<FinancialStats>({
    monthRevenueBilling: 0, monthRevenueCash: 0, pendingCount: 0, pendingValue: 0, overdueCount: 0, overdueValue: 0, conversionRate: 0, prevMonthBilling: 0, prevMonthCash: 0, prevTicketMedio: 0, unreconciledCreditCardCount: 0,
  });
  const [monthlyBilling, setMonthlyBilling] = useState<{ month: string; value: number }[]>([]);
  const [monthlyCash, setMonthlyCash] = useState<{ month: string; value: number }[]>([]);
  const [allPayments, setAllPayments] = useState<RecentPayment[]>([]);
  const [paymentMethodChart, setPaymentMethodChart] = useState<{ name: string; value: number }[]>([]);
  const [revenueByPlan, setRevenueByPlan] = useState<{ name: string; value: number }[]>([]);
  const [ticketMedio, setTicketMedio] = useState(0);
  const [cashByStudentByMonth, setCashByStudentByMonth] = useState<Record<string, CashDetail[]>>({});
  const [cashMonthTabs, setCashMonthTabs] = useState<string[]>([]);
  const [financialProjectionUnavailable, setFinancialProjectionUnavailable] = useState(false);
  const [hasUnavailableCreditCards, setHasUnavailableCreditCards] = useState(false);
  const [issuingInvoice, setIssuingInvoice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const loadRequestId = useRef(0);

  // Filters
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterMethod, setFilterMethod] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => { loadData(); }, [effectiveCompanyId]);

  const loadData = async () => {
    const requestId = ++loadRequestId.current;
    const isStale = () => requestId !== loadRequestId.current;
    setLoading(true);
    const now = new Date();
    const currentMonthKey = format(now, "yyyy-MM");
    const prevMonthKey = format(subMonths(now, 1), "yyyy-MM");

    let paymentsQuery = supabase.from("payments").select("id, value, installment_count, billing_type, created_at, due_date, status, asaas_payment_id, invoice_status, notes, student_id, students(full_name)");
    let totalQuery = supabase.from("payments").select("*", { count: "exact", head: true });
    let confirmedQuery = supabase.from("payments").select("*", { count: "exact", head: true }).in("status", ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"]);
    if (effectiveCompanyId) {
      paymentsQuery = paymentsQuery.eq("company_id", effectiveCompanyId);
      totalQuery = totalQuery.eq("company_id", effectiveCompanyId);
      confirmedQuery = confirmedQuery.eq("company_id", effectiveCompanyId);
    }
    const [
      { data: paymentsAll },
      { count: totalPayments },
      { count: confirmedCount },
      projectionResult,
    ] = await Promise.all([
      paymentsQuery,
      totalQuery,
      confirmedQuery,
      effectiveCompanyId
        ? supabase.functions.invoke("asaas-integration", {
          body: { action: "financial-installment-snapshot", companyId: effectiveCompanyId },
        }).catch((error) => ({ data: null, error }))
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (isStale()) return;

    const all = (paymentsAll || []) as any[];
    const billingStatuses = ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"];
    const cashStatuses = ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"];

    const projection = projectionResult.error ? null : projectionResult.data as FinancialProjectionSnapshot | null;
    if (isStale()) return;
    setFinancialProjectionUnavailable(Boolean(projectionResult.error));
    const reconciledEntries = projection?.entries || [];
    const localCreditCardPayments = all.filter((p) => p.billing_type === "CREDIT_CARD");
    const unavailableCreditCards = Boolean(projectionResult.error && localCreditCardPayments.length > 0);
    const unreconciledCards = projectionResult.error
      ? localCreditCardPayments.length
      : unresolvedCreditCardCount(projection?.unresolved || []);
    setHasUnavailableCreditCards(unavailableCreditCards);
    const localById = new Map(all.map((payment) => [payment.id, payment]));
    const anchorLocalForEntry = (entry: FinancialProjectionEntry) =>
      entry.localPaymentIds.map((id) => localById.get(id)).find(Boolean)
      || reconciledEntries
        .filter((candidate) => candidate.installmentGroupId && candidate.installmentGroupId === entry.installmentGroupId)
        .flatMap((candidate) => candidate.localPaymentIds.map((id) => localById.get(id)).filter(Boolean))[0]
      || null;
    const billingEntries = reconciledEntries.filter(isPaidFinancialEntry);
    const cashEntries = reconciledEntries.filter(isCashAvailableEntry);
    const projectedCashEntries = reconciledEntries.filter(isProjectedCashEntry);
    const nonCardBillingPayments = all.filter((p) => billingStatuses.includes(p.status) && p.billing_type !== "CREDIT_CARD");
    const cashPayments = all.filter((p) => cashStatuses.includes(p.status));
    const nonCardPayments = all.filter((p) => p.billing_type !== "CREDIT_CARD");
    const pendingEntries = reconciledEntries.filter((entry) => entry.status === "PENDING");
    const overdueEntries = reconciledEntries.filter((entry) => entry.status === "OVERDUE");
    const pendingList = nonCardPayments.filter((p) => p.status === "PENDING");
    const overdueList = nonCardPayments.filter((p) => p.status === "OVERDUE");

    // Faturamento do mês atual e anterior
    const monthBilling = billingEntries
      .filter((entry) => billingMonthKey(entry) === currentMonthKey)
      .reduce((sum, entry) => sum + Number(entry.value), 0)
      + nonCardBillingPayments
        .filter((p) => financialMonthKey(p.created_at) === currentMonthKey)
        .reduce((sum, p) => sum + Number(p.value), 0);
    const prevMonthBilling = billingEntries
      .filter((entry) => billingMonthKey(entry) === prevMonthKey)
      .reduce((sum, entry) => sum + Number(entry.value), 0)
      + nonCardBillingPayments
        .filter((p) => financialMonthKey(p.created_at) === prevMonthKey)
        .reduce((sum, p) => sum + Number(p.value), 0);

    // Build cash per month
    let monthCash = 0;
    let prevMonthCash = 0;
    const cashMonthStudentMap: Record<string, Record<string, { value: number; detail: string; projected?: boolean }>> = {};

    const addCashDetail = (monthKey: string | null, value: number, studentName: string, detail: string, projected = false) => {
      if (!monthKey) return;
      if (!projected && monthKey === currentMonthKey) monthCash += value;
      if (!projected && monthKey === prevMonthKey) prevMonthCash += value;

      if (!cashMonthStudentMap[monthKey]) cashMonthStudentMap[monthKey] = {};
      if (!cashMonthStudentMap[monthKey][studentName]) cashMonthStudentMap[monthKey][studentName] = { value: 0, detail: "", projected };
      cashMonthStudentMap[monthKey][studentName].value += value;
      cashMonthStudentMap[monthKey][studentName].detail = detail;
      cashMonthStudentMap[monthKey][studentName].projected = cashMonthStudentMap[monthKey][studentName].projected || projected;
    };

    cashEntries.forEach((entry) => {
      const local = anchorLocalForEntry(entry);
      addCashDetail(
        cashMonthKey(entry),
        Number(entry.value),
        local?.students?.full_name || "Sem aluno",
        entry.installmentGroupId && entry.installmentNumber
          ? `Cartão parcela ${entry.installmentNumber}`
          : "Cartão recebido",
      );
    });
    projectedCashEntries.forEach((entry) => {
      const local = anchorLocalForEntry(entry);
      addCashDetail(
        projectedCashMonthKey(entry),
        Number(entry.value),
        local?.students?.full_name || "Sem aluno",
        entry.installmentGroupId && entry.installmentNumber
          ? `Previsão cartão parcela ${entry.installmentNumber}`
          : "Previsão cartão",
        true,
      );
    });
    cashPayments.filter((p) => p.billing_type !== "CREDIT_CARD").forEach((p) => {
      addCashDetail(
        financialMonthKey(p.due_date || p.created_at),
        Number(p.value),
        p.students?.full_name || "Sem aluno",
        p.billing_type === "PIX" ? "PIX à vista" : "À vista",
      );
    });

    const futureTabs: string[] = [];
    for (let i = 0; i <= 12; i++) {
      futureTabs.push(format(addMonths(now, i), "yyyy-MM"));
    }
    if (isStale()) return;
    setCashMonthTabs(futureTabs);

    const detailByMonth: Record<string, CashDetail[]> = {};
    futureTabs.forEach((mk) => {
      const map = cashMonthStudentMap[mk] || {};
      detailByMonth[mk] = Object.entries(map)
        .map(([name, { value, detail, projected }]) => ({ name, value: Math.round(value * 100) / 100, detail, projected }))
        .sort((a, b) => b.value - a.value);
    });
    if (isStale()) return;
    setCashByStudentByMonth(detailByMonth);

    // Stats
    const pendingCount = pendingEntries.length + pendingList.length;
    const pendingValue = pendingEntries.reduce((s, entry) => s + Number(entry.value), 0)
      + pendingList.reduce((s, p) => s + Number(p.value), 0);
    const overdueCount = overdueEntries.length + overdueList.length;
    const overdueValue = overdueEntries.reduce((s, entry) => s + Number(entry.value), 0)
      + overdueList.reduce((s, p) => s + Number(p.value), 0);
    const conversionRate = totalPayments && totalPayments > 0
      ? Math.round(((confirmedCount || 0) / totalPayments) * 100) : 0;

    // Ticket médio atual e anterior
    const billingSaleKey = (entry: FinancialProjectionEntry) => entry.installmentGroupId || entry.asaasPaymentId;
    const monthBillingCount = new Set(
      billingEntries
        .filter((entry) => billingMonthKey(entry) === currentMonthKey)
        .map(billingSaleKey),
    ).size
      + nonCardBillingPayments.filter((p) => financialMonthKey(p.created_at) === currentMonthKey).length;
    const prevMonthBillingCount = new Set(
      billingEntries
        .filter((entry) => billingMonthKey(entry) === prevMonthKey)
        .map(billingSaleKey),
    ).size
      + nonCardBillingPayments.filter((p) => financialMonthKey(p.created_at) === prevMonthKey).length;
    const currentTicket = monthBillingCount > 0 ? monthBilling / monthBillingCount : 0;
    const prevTicket = prevMonthBillingCount > 0 ? prevMonthBilling / prevMonthBillingCount : 0;
    if (isStale()) return;
    setTicketMedio(currentTicket);

    if (isStale()) return;
    setFinancialStats({
      monthRevenueBilling: monthBilling, monthRevenueCash: monthCash,
      pendingCount, pendingValue, overdueCount, overdueValue, conversionRate,
      prevMonthBilling, prevMonthCash, prevTicketMedio: prevTicket,
      unreconciledCreditCardCount: unreconciledCards,
    });

    // Charts
    const billingMap: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      billingMap[format(subMonths(now, i), "yyyy-MM")] = 0;
    }
    billingEntries.forEach((entry) => {
      const k = billingMonthKey(entry);
      if (k && billingMap[k] !== undefined) billingMap[k] += Number(entry.value);
    });
    nonCardBillingPayments.forEach((p) => {
      const k = financialMonthKey(p.created_at);
      if (k && billingMap[k] !== undefined) billingMap[k] += Number(p.value);
    });

    const cashChartMap: Record<string, number> = {};
    for (let i = 5; i >= -12; i--) {
      const k = format(i > 0 ? subMonths(now, i) : addMonths(now, -i), "yyyy-MM");
      cashChartMap[k] = 0;
    }
    cashEntries.forEach((entry) => {
      const k = cashMonthKey(entry);
      if (k && cashChartMap[k] !== undefined) cashChartMap[k] += Number(entry.value);
    });
    projectedCashEntries.forEach((entry) => {
      const k = projectedCashMonthKey(entry);
      if (k && cashChartMap[k] !== undefined) cashChartMap[k] += Number(entry.value);
    });
    cashPayments.filter((p) => p.billing_type !== "CREDIT_CARD").forEach((p) => {
      const k = financialMonthKey(p.due_date || p.created_at);
      if (k && cashChartMap[k] !== undefined) cashChartMap[k] += Number(p.value);
    });

    const fmtChart = (map: Record<string, number>) =>
      Object.entries(map).map(([key, value]) => {
        const [y, m] = key.split("-").map(Number);
        return {
          month: format(new Date(y, m - 1, 15), "MMM/yy", { locale: ptBR }),
          value: Math.round(value * 100) / 100,
        };
      });

    if (isStale()) return;
    setMonthlyBilling(fmtChart(billingMap));
    setMonthlyCash(fmtChart(cashChartMap));

    // Payment methods
    const methodMap: Record<string, number> = {};
    billingEntries.forEach((entry) => {
      const label = entry.billingType === "CREDIT_CARD" ? "Cartão" : entry.billingType === "PIX" ? "PIX" : entry.billingType || "Outro";
      methodMap[label] = (methodMap[label] || 0) + Number(entry.value);
    });
    nonCardBillingPayments.forEach((p) => {
      const label = p.billing_type === "CREDIT_CARD" ? "Cartão" : p.billing_type === "PIX" ? "PIX" : p.billing_type;
      methodMap[label] = (methodMap[label] || 0) + Number(p.value);
    });
    if (isStale()) return;
    setPaymentMethodChart(Object.entries(methodMap).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 })));

    // Revenue by Plan
    const planMap: Record<string, number> = {};
    const { data: studentsWithPlans } = await supabase
      .from("students")
      .select("id, selected_plan_id, plans(name)");
    if (isStale()) return;
    const studentPlanMap: Record<string, string> = {};
    (studentsWithPlans || []).forEach((s: any) => {
      if (s.selected_plan_id && s.plans?.name) {
        studentPlanMap[s.id] = s.plans.name;
      }
    });
    billingEntries.forEach((entry) => {
      const local = all.find((p) => entry.localPaymentIds.includes(p.id));
      const planName = local?.student_id ? studentPlanMap[local.student_id] || "Sem plano" : "Sem plano";
      planMap[planName] = (planMap[planName] || 0) + Number(entry.value);
    });
    nonCardBillingPayments.forEach((p) => {
      const planName = studentPlanMap[p.student_id] || "Sem plano";
      planMap[planName] = (planMap[planName] || 0) + Number(p.value);
    });
    if (isStale()) return;
    setRevenueByPlan(Object.entries(planMap).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value));

    // All payments sorted
    const providerDisplayRows: RecentPayment[] = reconciledEntries.map((entry) => {
      const local = anchorLocalForEntry(entry);
      const exactLocal = entry.localPaymentIds.map((id) => localById.get(id)).find(Boolean);
      return {
        id: `provider:${entry.asaasPaymentId}`,
        student_id: local?.student_id || null,
        value: Number(entry.value),
        billing_type: entry.billingType,
        status: entry.status,
        created_at: entry.dueDate || entry.creditDate || new Date().toISOString(),
        due_date: entry.dueDate,
        asaas_payment_id: entry.asaasPaymentId,
        invoice_status: entry.invoiceStatus,
        installment_count: entry.installmentNumber || 1,
        notes: null,
        students: local?.students || null,
        invoice_action_available: Boolean(exactLocal),
        payment_row_note: exactLocal ? undefined : "Parcela existe no Asaas, mas ainda não existe como linha local.",
        installment_label: entry.installmentGroupId && entry.installmentNumber
          ? `Parcela ${entry.installmentNumber}`
          : "À vista",
      };
    });
    const unresolvedRows: RecentPayment[] = (projection?.unresolved || []).map((item) => {
      const local = localById.get(item.localPaymentId);
      return {
        id: `unresolved:${item.localPaymentId}`,
        student_id: local?.student_id || null,
        value: 0,
        billing_type: item.billingType,
        status: item.localStatus,
        created_at: item.dueDate || local?.created_at || new Date().toISOString(),
        due_date: item.dueDate,
        asaas_payment_id: item.asaasPaymentId,
        invoice_status: null,
        installment_count: local?.installment_count || 1,
        notes: null,
        students: local?.students || null,
        invoice_action_available: false,
        payment_row_note: "Cartão pendente de conciliação; valor fora dos indicadores.",
        installment_label: "Pendente",
      };
    });
    const unavailableCardRows: RecentPayment[] = projectionResult.error ? localCreditCardPayments.map((local) => ({
      id: `unavailable:${local.id}`,
      student_id: local.student_id || null,
      value: 0,
      billing_type: local.billing_type,
      status: local.status,
      created_at: local.due_date || local.created_at || new Date().toISOString(),
      due_date: local.due_date,
      asaas_payment_id: local.asaas_payment_id,
      invoice_status: null,
      installment_count: local.installment_count || 1,
      notes: null,
      students: local.students || null,
      invoice_action_available: false,
      payment_row_note: "Cartão pendente de conciliação; valor fora dos indicadores.",
      installment_label: "Pendente",
    })) : [];
    const nonCardRows = all.filter((payment) => payment.billing_type !== "CREDIT_CARD") as RecentPayment[];
    const sorted = [...providerDisplayRows, ...unresolvedRows, ...unavailableCardRows, ...nonCardRows]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (isStale()) return;
    setAllPayments(sorted as RecentPayment[]);
    setCurrentPage(1);
    setLoading(false);
  };

  const handleIssueInvoice = async (asaasPaymentId: string) => {
    // P3 — valida o cadastro antes de emitir sem exigir documentos brasileiros de residentes estrangeiros.
    const pay: any = allPayments.find((p) => p.asaas_payment_id === asaasPaymentId);
    if (pay && pay.invoice_action_available === false) {
      toast({
        title: "Nota indisponível nesta linha",
        description: pay.payment_row_note || "Esta parcela ainda não possui linha local exata para emissão.",
        variant: "destructive",
      });
      return;
    }
    if (pay?.student_id) {
      let s: any = null;
      try {
        const { data } = await supabase.from("students").select("cpf, cep, address, country_code").eq("id", pay.student_id).maybeSingle();
        s = data;
      } catch { s = null; }
      if (s) {
        if (!isBrazilianCountry(s.country_code)) {
          toast({
            title: "NFS-e automática indisponível",
            description: "Este cadastro é internacional. Faça a emissão fiscal pelo fluxo contábil apropriado ao país.",
            variant: "destructive",
          });
          return;
        }
        const cpf = String(s.cpf || "").replace(/\D/g, "");
        const cep = String(s.cep || "").replace(/\D/g, "");
        const missing: string[] = [];
        if (cpf.length < 11) missing.push("CPF");
        if (cep.length < 8) missing.push("CEP");
        if (!String(s.address || "").trim()) missing.push("endereço");
        if (missing.length) {
          const ok = window.confirm(`Cadastro fiscal incompleto: falta ${missing.join(", ")}. A NFS-e pode sair vazia ou falhar. Emitir mesmo assim?`);
          if (!ok) return;
        }
      }
    }
    setIssuingInvoice(asaasPaymentId);
    try {
      const { data, error } = await supabase.functions.invoke("asaas-integration", {
        body: { action: "create-invoice", paymentId: asaasPaymentId },
      });
      if (error) throw error;
      toast({ title: "Nota fiscal emitida!", description: "A NFS-e foi solicitada com sucesso." });
      setAllPayments(prev => prev.map(p =>
        p.asaas_payment_id === asaasPaymentId ? { ...p, invoice_status: data?.status || "SCHEDULED" } : p
      ));
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("já existe") || msg.includes("already")) {
        setAllPayments(prev => prev.map(p =>
          p.asaas_payment_id === asaasPaymentId ? { ...p, invoice_status: "SCHEDULED" } : p
        ));
        toast({ title: "Nota já emitida", description: "Já existe uma nota fiscal agendada para esta cobrança." });
      } else {
        toast({ title: "Erro ao emitir nota", description: msg || "Tente novamente.", variant: "destructive" });
      }
    } finally {
      setIssuingInvoice(null);
    }
  };

  // Filtered payments
  const filteredPayments = allPayments.filter(p => {
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    if (filterMethod !== "all") {
      const method = p.billing_type === "CREDIT_CARD" ? "CREDIT_CARD" : p.billing_type;
      if (method !== filterMethod) return false;
    }
    if (filterSearch) {
      const name = p.students?.full_name || "";
      if (!name.toLowerCase().includes(filterSearch.toLowerCase())) return false;
    }
    if (filterDateFrom) {
      const pDate = (p.due_date || p.created_at).substring(0, 10);
      if (pDate < filterDateFrom) return false;
    }
    if (filterDateTo) {
      const pDate = (p.due_date || p.created_at).substring(0, 10);
      if (pDate > filterDateTo) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredPayments.length / PAGE_SIZE));
  const paginatedPayments = filteredPayments.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [filterStatus, filterMethod, filterSearch, filterDateFrom, filterDateTo]);

  const chartColors = ["hsl(220, 70%, 25%)", "hsl(220, 60%, 35%)", "hsl(220, 50%, 45%)", "hsl(220, 40%, 55%)"];
  const revenueColor = "hsl(220, 70%, 25%)";
  const cashColor = "hsl(150, 60%, 30%)";

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const hasPositiveChartValue = (data: { value: number }[]) =>
    data.some((item) => Number(item.value) > 0);

  const MetricUnavailable = ({ partialValue }: { partialValue?: number }) => (
    <div className="space-y-0.5">
      <p className="text-xl font-bold text-foreground font-sans">—</p>
      {partialValue && partialValue > 0 ? (
        <p className="text-xs text-muted-foreground/60 font-sans">Parcial conciliado: {formatCurrency(partialValue)}</p>
      ) : (
        <p className="text-xs text-muted-foreground/60 font-sans">Indisponível</p>
      )}
    </div>
  );

  const CountMetricUnavailable = ({ partialCount, partialValue }: { partialCount: number; partialValue: number }) => (
    <div className="space-y-0.5">
      <p className="text-xl font-bold text-foreground font-sans">—</p>
      {partialCount > 0 || partialValue > 0 ? (
        <p className="text-xs text-muted-foreground/60 font-sans">Parcial conciliado: {partialCount} ({formatCurrency(partialValue)})</p>
      ) : (
        <p className="text-xs text-muted-foreground/60 font-sans">Indisponível</p>
      )}
    </div>
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "CONFIRMED":
      case "RECEIVED":
        return <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/30">Confirmado</Badge>;
      case "RECEIVED_IN_CASH":
        return <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/30">Recebido</Badge>;
      case "PENDING":
        return <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 hover:bg-amber-500/30">Pendente</Badge>;
      case "OVERDUE":
        return <Badge className="bg-red-500/20 text-red-600 border-red-500/30 hover:bg-red-500/30">Atrasado</Badge>;
      case "REFUNDED":
        return <Badge className="bg-gray-500/20 text-gray-600 border-gray-500/30">Estornado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const calcVariation = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const VariationBadge = ({ current, previous }: { current: number; previous: number }) => {
    const variation = calcVariation(current, previous);
    if (variation === 0 && current === 0 && previous === 0) return null;
    const isPositive = variation >= 0;
    return (
      <div className={`flex items-center gap-1 text-xs font-medium ${isPositive ? "text-emerald-500" : "text-red-500"}`}>
        {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
        <span>{isPositive ? "+" : ""}{variation}%</span>
      </div>
    );
  };

  const renderRevenueChart = (data: { month: string; value: number }[], color: string, label: string, unavailable = false) => (
    unavailable && !hasPositiveChartValue(data) ? (
      <p className="text-muted-foreground font-sans text-center py-8">Conciliação de cartão pendente</p>
    ) : data.length > 0 && hasPositiveChartValue(data) ? (
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data}>
          <XAxis dataKey="month" tick={{ fill: "hsl(0,0%,45%)", fontSize: 12 }} />
          <YAxis tick={{ fill: "hsl(0,0%,45%)", fontSize: 12 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={(value: number) => [formatCurrency(value), label]} contentStyle={{ backgroundColor: "hsl(0,0%,100%)", border: "1px solid hsl(0,0%,88%)" }} />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    ) : unavailable ? (
      <p className="text-muted-foreground font-sans text-center py-8">Valores parcialmente conciliados</p>
    ) : (
      <p className="text-muted-foreground font-sans text-center py-8">Nenhum dado de receita</p>
    )
  );

  const formatMonthLabel = (key: string) => {
    const [year, month] = key.split("-").map(Number);
    const date = new Date(year, month - 1, 15);
    return format(date, "MMM/yy", { locale: ptBR }).replace(/^./, (c) => c.toUpperCase());
  };

  const formatPaymentDate = (payment: RecentPayment) => {
    const date = parseFinancialDate(payment.due_date || payment.created_at);
    return date ? format(date, "dd/MM/yyyy", { locale: ptBR }) : "—";
  };

  const paymentInstallmentLabel = (payment: RecentPayment) => {
    if (payment.installment_label) return payment.installment_label;
    if (payment.billing_type === "CREDIT_CARD" && payment.asaas_payment_id) return "Parcela";
    return (payment.installment_count || 1) > 1 ? `${payment.installment_count}x` : "À vista";
  };

  const handleSync = async (syncAll: boolean) => {
    if (syncAll) setSyncingAll(true); else setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("asaas-integration", {
        body: { action: "sync-payments", companyId: effectiveCompanyId, syncAll },
      });
      if (error) throw error;
      toast({ title: "Sincronização concluída", description: data?.message || "Dados atualizados." });
      await loadData();
    } catch (err: any) {
      toast({ title: "Erro ao sincronizar", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
      setSyncingAll(false);
    }
  };

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-4xl text-primary">FINANCEIRO</h1>
              <BnitoContextButton
                label="dashboard financeiro"
                context="Dashboard financeiro com faturamento, caixa, pendencias, inadimplencia, conversao, metodo de pagamento e historico."
                question="Como devo interpretar o financeiro e priorizar pendencias?"
              />
            </div>
            <p className="text-muted-foreground font-sans">Gestão financeira da consultoria</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={syncing || syncingAll}
              onClick={() => handleSync(false)}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sincronizando..." : "Sincronizar"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={syncing || syncingAll}
              onClick={() => handleSync(true)}
            >
              <Download className={`h-4 w-4 mr-2 ${syncingAll ? "animate-spin" : ""}`} />
              {syncingAll ? "Importando..." : "Sync 6 meses"}
            </Button>
          </div>
        </div>

        {(financialProjectionUnavailable || financialStats.unreconciledCreditCardCount > 0) && (
          <Card className="border-amber-500/40 bg-amber-500/10">
            <CardContent className="flex items-start gap-3 pt-4">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-amber-700 font-sans">Financeiro parcialmente conciliado</p>
                <p className="text-xs text-muted-foreground font-sans">
                  {financialProjectionUnavailable
                    ? "Cartões não puderam ser conciliados agora. Indicadores com cartão ficam indisponíveis; valores não cartão continuam separados."
                    : `${financialStats.unreconciledCreditCardCount} pagamento(s) de cartão ficaram pendentes de conciliação e não entram nos indicadores.`}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-lg bg-emerald-500/10">
                <TrendingUp className="h-6 w-6 text-emerald-500" />
              </div>
              <div className="flex-1">
                {hasUnavailableCreditCards ? (
                  <MetricUnavailable partialValue={financialStats.monthRevenueBilling} />
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-xl font-bold text-foreground font-sans">{formatCurrency(financialStats.monthRevenueBilling)}</p>
                    <VariationBadge current={financialStats.monthRevenueBilling} previous={financialStats.prevMonthBilling} />
                  </div>
                )}
                <p className="text-sm text-muted-foreground font-sans">Faturamento — {format(new Date(), "MMM/yy", { locale: ptBR }).replace(/^./, c => c.toUpperCase())}</p>
                {!hasUnavailableCreditCards && financialStats.prevMonthBilling > 0 && (
                  <p className="text-xs text-muted-foreground/60 font-sans">Mês anterior: {formatCurrency(financialStats.prevMonthBilling)}</p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-lg bg-purple-500/10">
                <TrendingUp className="h-6 w-6 text-purple-500" />
              </div>
              <div className="flex-1">
                {hasUnavailableCreditCards ? (
                  <MetricUnavailable />
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-xl font-bold text-foreground font-sans">{formatCurrency(ticketMedio)}</p>
                    <VariationBadge current={ticketMedio} previous={financialStats.prevTicketMedio} />
                  </div>
                )}
                <p className="text-sm text-muted-foreground font-sans">Ticket Médio</p>
                {!hasUnavailableCreditCards && financialStats.prevTicketMedio > 0 && (
                  <p className="text-xs text-muted-foreground/60 font-sans">Mês anterior: {formatCurrency(financialStats.prevTicketMedio)}</p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-lg bg-blue-500/10">
                <Wallet className="h-6 w-6 text-blue-500" />
              </div>
              <div className="flex-1">
                {hasUnavailableCreditCards ? (
                  <MetricUnavailable partialValue={financialStats.monthRevenueCash} />
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-xl font-bold text-foreground font-sans">{formatCurrency(financialStats.monthRevenueCash)}</p>
                    <VariationBadge current={financialStats.monthRevenueCash} previous={financialStats.prevMonthCash} />
                  </div>
                )}
                <p className="text-sm text-muted-foreground font-sans">Caixa — {format(new Date(), "MMM/yy", { locale: ptBR }).replace(/^./, c => c.toUpperCase())}</p>
                {!hasUnavailableCreditCards && financialStats.prevMonthCash > 0 && (
                  <p className="text-xs text-muted-foreground/60 font-sans">Mês anterior: {formatCurrency(financialStats.prevMonthCash)}</p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-lg bg-amber-500/10">
                <Clock className="h-6 w-6 text-amber-500" />
              </div>
              <div>
                {hasUnavailableCreditCards ? (
                  <CountMetricUnavailable partialCount={financialStats.pendingCount} partialValue={financialStats.pendingValue} />
                ) : (
                  <>
                    <p className="text-xl font-bold text-foreground font-sans">{financialStats.pendingCount}</p>
                    <p className="text-sm text-muted-foreground font-sans">Pendentes ({formatCurrency(financialStats.pendingValue)})</p>
                  </>
                )}
                {hasUnavailableCreditCards && (
                  <p className="text-sm text-muted-foreground font-sans">Pendentes</p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-lg bg-red-500/10">
                <AlertCircle className="h-6 w-6 text-red-500" />
              </div>
              <div>
                {hasUnavailableCreditCards ? (
                  <CountMetricUnavailable partialCount={financialStats.overdueCount} partialValue={financialStats.overdueValue} />
                ) : (
                  <>
                    <p className="text-xl font-bold text-foreground font-sans">{financialStats.overdueCount}</p>
                    <p className="text-sm text-muted-foreground font-sans">Atrasados ({formatCurrency(financialStats.overdueValue)})</p>
                  </>
                )}
                {hasUnavailableCreditCards && (
                  <p className="text-sm text-muted-foreground font-sans">Atrasados</p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-lg bg-primary/10">
                <Percent className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground font-sans">{financialStats.conversionRate}%</p>
                <p className="text-sm text-muted-foreground font-sans">Taxa de Conversão</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary text-xl">
                FATURAMENTO MENSAL
                <BnitoContextButton
                  label="faturamento mensal"
                  context="Grafico de faturamento por mes de criacao da venda."
                  question="O que devo observar neste faturamento mensal?"
                  className="ml-auto"
                />
              </CardTitle>
              <p className="text-xs text-muted-foreground font-sans">Valor total das vendas no mês de criação</p>
            </CardHeader>
            <CardContent>
              {renderRevenueChart(monthlyBilling, revenueColor, "Faturamento", hasUnavailableCreditCards)}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary text-xl">
                CAIXA MENSAL + PREVISÃO
                <BnitoContextButton
                  label="caixa mensal e previsao"
                  context="Grafico de recebido por mes e previsao de parcelas futuras."
                  question="Como devo ler caixa recebido versus previsao futura?"
                  className="ml-auto"
                />
              </CardTitle>
              <p className="text-xs text-muted-foreground font-sans">Recebido por mês + previsão dos próximos meses (parcelas futuras)</p>
            </CardHeader>
            <CardContent>
              {renderRevenueChart(monthlyCash, cashColor, "Caixa", hasUnavailableCreditCards)}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary text-xl">
                MÉTODO DE PAGAMENTO (R$)
                <BnitoContextButton
                  label="metodos de pagamento"
                  context="Distribuicao de receita por metodo de pagamento."
                  question="O que a distribuicao por metodo de pagamento sugere operacionalmente?"
                  className="ml-auto"
                />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {paymentMethodChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={paymentMethodChart}>
                    <XAxis dataKey="name" tick={{ fill: "hsl(0,0%,45%)", fontSize: 12 }} />
                    <YAxis tick={{ fill: "hsl(0,0%,45%)", fontSize: 12 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value: number) => [formatCurrency(value), "Valor"]} contentStyle={{ backgroundColor: "hsl(0,0%,100%)", border: "1px solid hsl(0,0%,88%)" }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {paymentMethodChart.map((_, i) => (
                        <Cell key={i} fill={chartColors[i % chartColors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground font-sans text-center py-8">
                  {hasUnavailableCreditCards ? "Conciliação de cartão pendente" : "Nenhum pagamento confirmado"}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary text-xl">
                RECEITA POR PLANO
                <BnitoContextButton
                  label="receita por plano"
                  context="Receita agrupada por plano vendido."
                  question="Como devo interpretar a receita por plano para ajustar oferta e operacao?"
                  className="ml-auto"
                />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {revenueByPlan.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={revenueByPlan} layout="vertical">
                    <XAxis type="number" tick={{ fill: "hsl(0,0%,45%)", fontSize: 12 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(1)}k`} />
                    <YAxis type="category" dataKey="name" tick={{ fill: "hsl(0,0%,45%)", fontSize: 11 }} width={120} />
                    <Tooltip formatter={(value: number) => [formatCurrency(value), "Receita"]} contentStyle={{ backgroundColor: "hsl(0,0%,100%)", border: "1px solid hsl(0,0%,88%)" }} />
                    <Bar dataKey="value" fill="hsl(220, 60%, 35%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground font-sans text-center py-8">
                  {hasUnavailableCreditCards ? "Conciliação de cartão pendente" : "Nenhum dado de plano"}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary text-xl">
              CAIXA — DETALHE POR ALUNO
              <BnitoContextButton
                label="caixa por aluno"
                context="Detalhamento mensal de caixa por aluno e previsao de parcelas futuras."
                question="Quais alunos devo revisar pelo impacto no caixa?"
                className="ml-auto"
              />
            </CardTitle>
            <p className="text-xs text-muted-foreground font-sans">Quanto entra no caixa por aluno em cada mês (inclui previsão de parcelas futuras)</p>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={cashMonthTabs[0]} className="w-full">
              <TabsList className="mb-4 flex-wrap h-auto gap-1">
                {cashMonthTabs.map((mk, i) => (
                  <TabsTrigger key={mk} value={mk} className="text-xs">
                    {i === 0 ? `${formatMonthLabel(mk)} (atual)` : formatMonthLabel(mk)}
                  </TabsTrigger>
                ))}
              </TabsList>
              {cashMonthTabs.map((mk) => {
                const students = cashByStudentByMonth[mk] || [];
                return (
                  <TabsContent key={mk} value={mk}>
                    {students.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Aluno</TableHead>
                            <TableHead>Valor no Caixa</TableHead>
                            <TableHead>Detalhe</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {students.map((s, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium font-sans">{s.name}</TableCell>
                              <TableCell className="font-sans">{formatCurrency(s.value)}</TableCell>
                              <TableCell className="font-sans text-muted-foreground">{s.detail}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="border-t-2 border-primary/20">
                            <TableCell className="font-bold font-sans">Total</TableCell>
                            <TableCell className="font-bold font-sans">{formatCurrency(students.reduce((s, r) => s + r.value, 0))}</TableCell>
                            <TableCell />
                          </TableRow>
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-muted-foreground font-sans text-center py-8">
                        {hasUnavailableCreditCards ? "Conciliação de cartão pendente" : "Nenhum recebimento previsto"}
                      </p>
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-primary text-xl">
                  HISTÓRICO DE PAGAMENTOS
                  <BnitoContextButton
                    label="historico de pagamentos"
                    context="Tabela filtravel de pagamentos, status, datas e metodos."
                    question="Como devo auditar este historico de pagamentos?"
                    className="ml-auto"
                  />
                </CardTitle>
                <p className="text-xs text-muted-foreground font-sans mt-1">
                  {hasUnavailableCreditCards
                    ? `${filteredPayments.length} linha(s) listada(s); cartões pendentes sem valor`
                    : `${filteredPayments.length} pagamentos encontrados`}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar aluno..."
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="CONFIRMED">Confirmado</SelectItem>
                  <SelectItem value="RECEIVED">Recebido</SelectItem>
                  <SelectItem value="PENDING">Pendente</SelectItem>
                  <SelectItem value="OVERDUE">Atrasado</SelectItem>
                  <SelectItem value="REFUNDED">Estornado</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterMethod} onValueChange={setFilterMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Método" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os métodos</SelectItem>
                  <SelectItem value="CREDIT_CARD">Cartão</SelectItem>
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="BOLETO">Boleto</SelectItem>
                </SelectContent>
              </Select>
              <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} placeholder="Data início" />
              <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} placeholder="Data fim" />
            </div>

            {paginatedPayments.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Aluno</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Parcelas</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>NFS-e</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedPayments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium font-sans">
                        {p.student_id ? (
                          <button
                            type="button"
                            className="max-w-[220px] truncate text-left hover:text-primary hover:underline"
                            title="Abrir perfil do aluno"
                            onClick={() => navigate(`${rolePrefix}/students/${p.student_id}`)}
                          >
                            {p.students?.full_name || "—"}
                          </button>
                        ) : (
                          p.students?.full_name || "—"
                        )}
                      </TableCell>
                      <TableCell className="font-sans">
                        {p.payment_row_note && p.value === 0 ? (
                          <span className="text-amber-600 text-sm">Pendente de conciliação</span>
                        ) : (
                          formatCurrency(Number(p.value))
                        )}
                      </TableCell>
                      <TableCell className="font-sans">
                        {p.billing_type === "CREDIT_CARD" ? "Cartão" : p.billing_type === "PIX" ? "PIX" : p.billing_type}
                      </TableCell>
                      <TableCell className="font-sans text-center">
                        {paymentInstallmentLabel(p)}
                      </TableCell>
                      <TableCell>{getStatusBadge(p.status)}</TableCell>
                      <TableCell>
                        {p.payment_row_note && p.invoice_action_available === false ? (
                          <Button size="sm" variant="outline" disabled title={p.payment_row_note}>
                            <FileText className="h-4 w-4" />
                            Indisponível
                          </Button>
                        ) : p.invoice_status ? (
                          <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {p.invoice_status === "SCHEDULED" ? "Agendada" : p.invoice_status === "AUTHORIZED" ? "Autorizada" : p.invoice_status === "CANCELED" ? "Cancelada" : p.invoice_status}
                          </Badge>
                        ) : (p.status === "CONFIRMED" || p.status === "RECEIVED" || p.status === "RECEIVED_IN_CASH") && p.asaas_payment_id ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={issuingInvoice === p.asaas_payment_id}
                            onClick={() => handleIssueInvoice(p.asaas_payment_id!)}
                          >
                            {issuingInvoice === p.asaas_payment_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <FileText className="h-4 w-4" />
                            )}
                            Emitir Nota
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-sans text-muted-foreground">
                        <div className="space-y-1">
                          <p>{formatPaymentDate(p)}</p>
                          {p.payment_row_note && (
                            <p className="text-xs text-amber-600">{p.payment_row_note}</p>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground font-sans text-center py-8">
                {hasUnavailableCreditCards ? "Conciliação de cartão pendente para estes filtros" : "Nenhum pagamento encontrado"}
              </p>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-sm text-muted-foreground font-sans">
                  Página {currentPage} de {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
