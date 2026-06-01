import { useEffect, useState } from "react";
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
import { AppLayout } from "@/components/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";

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
}

interface RecentPayment {
  id: string;
  value: number;
  billing_type: string;
  status: string;
  created_at: string;
  due_date: string | null;
  asaas_payment_id: string | null;
  invoice_status: string | null;
  installment_count: number;
  students: { full_name: string } | null;
}

interface CashDetail {
  name: string;
  value: number;
  detail: string;
}

const PAGE_SIZE = 20;

export default function FinancialDashboard() {
  const { toast } = useToast();
  const { companyId, role } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id : null) : companyId;
  const [financialStats, setFinancialStats] = useState<FinancialStats>({
    monthRevenueBilling: 0, monthRevenueCash: 0, pendingCount: 0, pendingValue: 0, overdueCount: 0, overdueValue: 0, conversionRate: 0, prevMonthBilling: 0, prevMonthCash: 0, prevTicketMedio: 0,
  });
  const [monthlyBilling, setMonthlyBilling] = useState<{ month: string; value: number }[]>([]);
  const [monthlyCash, setMonthlyCash] = useState<{ month: string; value: number }[]>([]);
  const [allPayments, setAllPayments] = useState<RecentPayment[]>([]);
  const [paymentMethodChart, setPaymentMethodChart] = useState<{ name: string; value: number }[]>([]);
  const [revenueByPlan, setRevenueByPlan] = useState<{ name: string; value: number }[]>([]);
  const [ticketMedio, setTicketMedio] = useState(0);
  const [cashByStudentByMonth, setCashByStudentByMonth] = useState<Record<string, CashDetail[]>>({});
  const [cashMonthTabs, setCashMonthTabs] = useState<string[]>([]);
  const [issuingInvoice, setIssuingInvoice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterMethod, setFilterMethod] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => { loadData(); }, [effectiveCompanyId]);

  const loadData = async () => {
    setLoading(true);
    const now = new Date();
    const currentMonthKey = format(now, "yyyy-MM");
    const prevMonthKey = format(subMonths(now, 1), "yyyy-MM");

    let paymentsQuery = supabase.from("payments").select("id, value, installment_count, billing_type, created_at, due_date, status, asaas_payment_id, invoice_status, student_id, students(full_name)");
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
    ] = await Promise.all([paymentsQuery, totalQuery, confirmedQuery]);

    const all = (paymentsAll || []) as any[];
    const billingStatuses = ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"];
    const cashStatuses = ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"];

    const billingPayments = all.filter((p) => billingStatuses.includes(p.status));
    const cashPayments = all.filter((p) => cashStatuses.includes(p.status));
    const pendingList = all.filter((p) => p.status === "PENDING");
    const overdueList = all.filter((p) => p.status === "OVERDUE");

    // Faturamento do mês atual e anterior
    const monthBilling = billingPayments
      .filter((p) => format(new Date(p.created_at), "yyyy-MM") === currentMonthKey)
      .reduce((sum, p) => sum + Number(p.value), 0);
    const prevMonthBilling = billingPayments
      .filter((p) => format(new Date(p.created_at), "yyyy-MM") === prevMonthKey)
      .reduce((sum, p) => sum + Number(p.value), 0);

    // Helper: distribute cash across months
    const distributeCash = (p: any, callback: (monthKey: string, value: number, studentName: string, detail: string) => void) => {
      const studentName = p.students?.full_name || "Sem aluno";
      const installments = Math.max(1, Number(p.installment_count) || 1);
      const baseDate = new Date(p.due_date || p.created_at);
      const shouldDistribute = p.billing_type === "CREDIT_CARD" && installments > 1;

      if (!shouldDistribute) {
        const key = format(baseDate, "yyyy-MM");
        const detail = p.billing_type === "PIX" ? "PIX à vista" : "À vista";
        callback(key, Number(p.value), studentName, detail);
        return;
      }

      const monthlyValue = Number(p.value) / installments;
      for (let i = 0; i < installments; i++) {
        const key = format(addMonths(baseDate, i), "yyyy-MM");
        callback(key, monthlyValue, studentName, `Parcela ${i + 1}/${installments}`);
      }
    };

    // Build cash per month
    let monthCash = 0;
    let prevMonthCash = 0;
    const cashMonthStudentMap: Record<string, Record<string, { value: number; detail: string }>> = {};

    const allMonthKeys: string[] = [];
    for (let i = 5; i >= -12; i--) {
      const key = format(i > 0 ? subMonths(now, i) : addMonths(now, -i), "yyyy-MM");
      allMonthKeys.push(key);
    }

    cashPayments.forEach((p) => {
      distributeCash(p, (monthKey, value, studentName, detail) => {
        if (monthKey === currentMonthKey) monthCash += value;
        if (monthKey === prevMonthKey) prevMonthCash += value;

        if (!cashMonthStudentMap[monthKey]) cashMonthStudentMap[monthKey] = {};
        if (!cashMonthStudentMap[monthKey][studentName]) cashMonthStudentMap[monthKey][studentName] = { value: 0, detail: "" };
        cashMonthStudentMap[monthKey][studentName].value += value;
        cashMonthStudentMap[monthKey][studentName].detail = detail;
      });
    });

    const futureTabs: string[] = [];
    for (let i = 0; i <= 12; i++) {
      futureTabs.push(format(addMonths(now, i), "yyyy-MM"));
    }
    setCashMonthTabs(futureTabs);

    const detailByMonth: Record<string, CashDetail[]> = {};
    futureTabs.forEach((mk) => {
      const map = cashMonthStudentMap[mk] || {};
      detailByMonth[mk] = Object.entries(map)
        .map(([name, { value, detail }]) => ({ name, value: Math.round(value * 100) / 100, detail }))
        .sort((a, b) => b.value - a.value);
    });
    setCashByStudentByMonth(detailByMonth);

    // Stats
    const pendingCount = pendingList.length;
    const pendingValue = pendingList.reduce((s, p) => s + Number(p.value), 0);
    const overdueCount = overdueList.length;
    const overdueValue = overdueList.reduce((s, p) => s + Number(p.value), 0);
    const conversionRate = totalPayments && totalPayments > 0
      ? Math.round(((confirmedCount || 0) / totalPayments) * 100) : 0;

    // Ticket médio atual e anterior
    const monthBillingPayments = billingPayments.filter(p => format(new Date(p.created_at), "yyyy-MM") === currentMonthKey);
    const prevMonthBillingPayments = billingPayments.filter(p => format(new Date(p.created_at), "yyyy-MM") === prevMonthKey);
    const currentTicket = monthBillingPayments.length > 0 ? monthBilling / monthBillingPayments.length : 0;
    const prevTicket = prevMonthBillingPayments.length > 0 ? prevMonthBilling / prevMonthBillingPayments.length : 0;
    setTicketMedio(currentTicket);

    setFinancialStats({
      monthRevenueBilling: monthBilling, monthRevenueCash: monthCash,
      pendingCount, pendingValue, overdueCount, overdueValue, conversionRate,
      prevMonthBilling, prevMonthCash, prevTicketMedio: prevTicket,
    });

    // Charts
    const billingMap: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      billingMap[format(subMonths(now, i), "yyyy-MM")] = 0;
    }
    billingPayments.forEach((p) => {
      const k = format(new Date(p.created_at), "yyyy-MM");
      if (billingMap[k] !== undefined) billingMap[k] += Number(p.value);
    });

    const cashChartMap: Record<string, number> = {};
    for (let i = 5; i >= -12; i--) {
      const k = format(i > 0 ? subMonths(now, i) : addMonths(now, -i), "yyyy-MM");
      cashChartMap[k] = 0;
    }
    cashPayments.forEach((p) => {
      distributeCash(p, (monthKey, value) => {
        if (cashChartMap[monthKey] !== undefined) cashChartMap[monthKey] += value;
      });
    });

    const fmtChart = (map: Record<string, number>) =>
      Object.entries(map).map(([key, value]) => {
        const [y, m] = key.split("-").map(Number);
        return {
          month: format(new Date(y, m - 1, 15), "MMM/yy", { locale: ptBR }),
          value: Math.round(value * 100) / 100,
        };
      });

    setMonthlyBilling(fmtChart(billingMap));
    setMonthlyCash(fmtChart(cashChartMap));

    // Payment methods
    const methodMap: Record<string, number> = {};
    billingPayments.forEach((p) => {
      const label = p.billing_type === "CREDIT_CARD" ? "Cartão" : p.billing_type === "PIX" ? "PIX" : p.billing_type;
      methodMap[label] = (methodMap[label] || 0) + Number(p.value);
    });
    setPaymentMethodChart(Object.entries(methodMap).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 })));

    // Revenue by Plan
    const planMap: Record<string, number> = {};
    const { data: studentsWithPlans } = await supabase
      .from("students")
      .select("id, selected_plan_id, plans(name)");
    const studentPlanMap: Record<string, string> = {};
    (studentsWithPlans || []).forEach((s: any) => {
      if (s.selected_plan_id && s.plans?.name) {
        studentPlanMap[s.id] = s.plans.name;
      }
    });
    billingPayments.forEach((p) => {
      const planName = studentPlanMap[p.student_id] || "Sem plano";
      planMap[planName] = (planMap[planName] || 0) + Number(p.value);
    });
    setRevenueByPlan(Object.entries(planMap).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value));

    // All payments sorted
    const sorted = [...all].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setAllPayments(sorted as RecentPayment[]);
    setCurrentPage(1);
    setLoading(false);
  };

  const handleIssueInvoice = async (asaasPaymentId: string) => {
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

  const renderRevenueChart = (data: { month: string; value: number }[], color: string, label: string) => (
    data.length > 0 ? (
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data}>
          <XAxis dataKey="month" tick={{ fill: "hsl(0,0%,45%)", fontSize: 12 }} />
          <YAxis tick={{ fill: "hsl(0,0%,45%)", fontSize: 12 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={(value: number) => [formatCurrency(value), label]} contentStyle={{ backgroundColor: "hsl(0,0%,100%)", border: "1px solid hsl(0,0%,88%)" }} />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    ) : (
      <p className="text-muted-foreground font-sans text-center py-8">Nenhum dado de receita</p>
    )
  );

  const formatMonthLabel = (key: string) => {
    const [year, month] = key.split("-").map(Number);
    const date = new Date(year, month - 1, 15);
    return format(date, "MMM/yy", { locale: ptBR }).replace(/^./, (c) => c.toUpperCase());
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
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-4xl text-primary">FINANCEIRO</h1>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-lg bg-emerald-500/10">
                <TrendingUp className="h-6 w-6 text-emerald-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-xl font-bold text-foreground font-sans">{formatCurrency(financialStats.monthRevenueBilling)}</p>
                  <VariationBadge current={financialStats.monthRevenueBilling} previous={financialStats.prevMonthBilling} />
                </div>
                <p className="text-sm text-muted-foreground font-sans">Faturamento — {format(new Date(), "MMM/yy", { locale: ptBR }).replace(/^./, c => c.toUpperCase())}</p>
                {financialStats.prevMonthBilling > 0 && (
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
                <div className="flex items-center gap-2">
                  <p className="text-xl font-bold text-foreground font-sans">{formatCurrency(ticketMedio)}</p>
                  <VariationBadge current={ticketMedio} previous={financialStats.prevTicketMedio} />
                </div>
                <p className="text-sm text-muted-foreground font-sans">Ticket Médio</p>
                {financialStats.prevTicketMedio > 0 && (
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
                <div className="flex items-center gap-2">
                  <p className="text-xl font-bold text-foreground font-sans">{formatCurrency(financialStats.monthRevenueCash)}</p>
                  <VariationBadge current={financialStats.monthRevenueCash} previous={financialStats.prevMonthCash} />
                </div>
                <p className="text-sm text-muted-foreground font-sans">Caixa — {format(new Date(), "MMM/yy", { locale: ptBR }).replace(/^./, c => c.toUpperCase())}</p>
                {financialStats.prevMonthCash > 0 && (
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
                <p className="text-xl font-bold text-foreground font-sans">{financialStats.pendingCount}</p>
                <p className="text-sm text-muted-foreground font-sans">Pendentes ({formatCurrency(financialStats.pendingValue)})</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-lg bg-red-500/10">
                <AlertCircle className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground font-sans">{financialStats.overdueCount}</p>
                <p className="text-sm text-muted-foreground font-sans">Atrasados ({formatCurrency(financialStats.overdueValue)})</p>
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
              <CardTitle className="text-primary text-xl">FATURAMENTO MENSAL</CardTitle>
              <p className="text-xs text-muted-foreground font-sans">Valor total das vendas no mês de criação</p>
            </CardHeader>
            <CardContent>
              {renderRevenueChart(monthlyBilling, revenueColor, "Faturamento")}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-primary text-xl">CAIXA MENSAL + PREVISÃO</CardTitle>
              <p className="text-xs text-muted-foreground font-sans">Recebido por mês + previsão dos próximos meses (parcelas futuras)</p>
            </CardHeader>
            <CardContent>
              {renderRevenueChart(monthlyCash, cashColor, "Caixa")}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-primary text-xl">MÉTODO DE PAGAMENTO (R$)</CardTitle></CardHeader>
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
                <p className="text-muted-foreground font-sans text-center py-8">Nenhum pagamento confirmado</p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-primary text-xl">RECEITA POR PLANO</CardTitle></CardHeader>
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
                <p className="text-muted-foreground font-sans text-center py-8">Nenhum dado de plano</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-primary text-xl">CAIXA — DETALHE POR ALUNO</CardTitle>
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
                      <p className="text-muted-foreground font-sans text-center py-8">Nenhum recebimento previsto</p>
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
                <CardTitle className="text-primary text-xl">HISTÓRICO DE PAGAMENTOS</CardTitle>
                <p className="text-xs text-muted-foreground font-sans mt-1">{filteredPayments.length} pagamentos encontrados</p>
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
                      <TableCell className="font-medium font-sans">{p.students?.full_name || "—"}</TableCell>
                      <TableCell className="font-sans">{formatCurrency(Number(p.value))}</TableCell>
                      <TableCell className="font-sans">
                        {p.billing_type === "CREDIT_CARD" ? "Cartão" : p.billing_type === "PIX" ? "PIX" : p.billing_type}
                      </TableCell>
                      <TableCell className="font-sans text-center">
                        {(p.installment_count || 1) > 1 ? `${p.installment_count}x` : "À vista"}
                      </TableCell>
                      <TableCell>{getStatusBadge(p.status)}</TableCell>
                      <TableCell>
                        {p.invoice_status ? (
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
                        {format(new Date(p.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground font-sans text-center py-8">Nenhum pagamento encontrado</p>
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
    </AppLayout>
  );
}
