import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, TrendingUp, RefreshCw, Clock, UserX, Timer, RotateCcw, MessageCircle, CalendarRange, BarChart3, ChevronDown } from "lucide-react";
import { format, addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { toast } from "sonner";
import { DashboardAlerts } from "@/components/DashboardAlerts";
import { MonthlyPrescriptionsCard } from "@/components/admin/MonthlyPrescriptionsCard";
import { PendingFeedbackCard } from "@/components/admin/PendingFeedbackCard";
import { CohortInsightsCard } from "@/components/admin/CohortInsightsCard";
import { AtRiskStudents } from "@/components/admin/AtRiskStudents";
import { useMaster } from "@/contexts/MasterContext";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { buildStudentChatMap, createPlansLink, openStudentChat, renewalMessage } from "@/lib/studentChat";
import { businessDateYmd } from "@/lib/businessDate";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { filterMaterializedWorkouts } from "@/lib/workoutPresence";

const LazyChart = lazy(() => import("recharts").then(mod => ({
  default: ({ data, colors }: { data: { name: string; count: number }[]; colors: string[] }) => (
    <mod.ResponsiveContainer width="100%" height={250}>
      <mod.BarChart data={data}>
        <mod.XAxis dataKey="name" tick={{ fill: "hsl(0,0%,45%)", fontSize: 12 }} />
        <mod.YAxis tick={{ fill: "hsl(0,0%,45%)", fontSize: 12 }} />
        <mod.Tooltip contentStyle={{ backgroundColor: "hsl(0,0%,100%)", border: "1px solid hsl(0,0%,88%)" }} labelStyle={{ color: "hsl(220,70%,25%)" }} />
        <mod.Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <mod.Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </mod.Bar>
      </mod.BarChart>
    </mod.ResponsiveContainer>
  )
})));

interface DashboardData {
  stats: { totalStudents: number; pendingStudents: number; awaitingRenewalStudents: number; inactiveStudents: number; trainers: number };
  planChart: { name: string; count: number }[];
  expiringContracts: any[];
  cycleCountdowns: any[];
  trainerMap: Record<string, string>;
}

async function fetchDashboardData(effectiveCompanyId: string | null | undefined): Promise<DashboardData> {
  // O ciclo diário é processado por cron com service_role. O painel usa datas
  // diretamente e não chama a RPC administrativa com um JWT de usuário.
  const today = businessDateYmd();
  const businessToday = parseISO(today);
  const sevenDaysFromNow = format(addDays(businessToday, 7), "yyyy-MM-dd");

  let studentQuery = supabase.from("students").select("*", { count: "exact", head: true }).eq("status", "active");
  let pendingQuery = supabase.from("students").select("*", { count: "exact", head: true }).eq("status", "pending");
  let awaitingRenewalQuery = supabase.from("students").select("*", { count: "exact", head: true }).eq("status", "awaiting_renewal");
  let inactiveQuery = supabase.from("students").select("*", { count: "exact", head: true }).eq("status", "inactive");
  let enrollQuery = supabase.from("enrollments").select("plan_id, plans(name)");
  let expiringQuery = supabase.from("enrollments").select("*, trainer_id, students(full_name, status), plans(name)")
    .in("status", ["active", "awaiting_renewal"]).lte("end_date", sevenDaysFromNow)
    .order("end_date", { ascending: false });

  if (effectiveCompanyId) {
    studentQuery = studentQuery.eq("company_id", effectiveCompanyId);
    pendingQuery = pendingQuery.eq("company_id", effectiveCompanyId);
    awaitingRenewalQuery = awaitingRenewalQuery.eq("company_id", effectiveCompanyId);
    inactiveQuery = inactiveQuery.eq("company_id", effectiveCompanyId);
    enrollQuery = enrollQuery.eq("company_id", effectiveCompanyId);
    expiringQuery = expiringQuery.eq("company_id", effectiveCompanyId);
  }

  // Trainer count + cycle enrollments in parallel with the others
  let cycleEnrollQuery = supabase.from("enrollments")
    .select("id, student_id, training_start_date, trainer_id, students(full_name, assigned_trainer_id)")
    .in("status", ["active", "awaiting_training"]) as any;
  if (effectiveCompanyId) cycleEnrollQuery = cycleEnrollQuery.eq("company_id", effectiveCompanyId);

  const trainerCountPromise = (async () => {
    if (effectiveCompanyId) {
      const { data: members } = await supabase.from("company_members").select("user_id").eq("company_id", effectiveCompanyId);
      if (!members || members.length === 0) return 0;
      const { count } = await supabase.from("user_roles").select("*", { count: "exact", head: true })
        .eq("role", "trainer").in("user_id", members.map(m => m.user_id));
      return count || 0;
    }
    const { count } = await supabase.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "trainer");
    return count || 0;
  })();

  const [studentRes, pendingRes, awaitingRenewalRes, inactiveRes, enrollRes, expiringRes, activeEnrollsRes, trainerCount] = await Promise.all([
    studentQuery,
    pendingQuery,
    awaitingRenewalQuery,
    inactiveQuery,
    enrollQuery,
    expiringQuery,
    cycleEnrollQuery,
    trainerCountPromise,
  ]);

  const failedQuery = [
    ["alunos ativos", studentRes],
    ["alunos pendentes", pendingRes],
    ["renovações", awaitingRenewalRes],
    ["alunos inativos", inactiveRes],
    ["matrículas", enrollRes],
    ["contratos a vencer", expiringRes],
    ["ciclos por matrícula", activeEnrollsRes],
  ].find(([, result]) => (result as any)?.error);
  if (failedQuery) {
    const [label, result] = failedQuery;
    throw new Error(`Falha ao carregar ${label}: ${(result as any).error.message}`);
  }

  const stats = {
    totalStudents: studentRes.count || 0,
    pendingStudents: pendingRes.count || 0,
    awaitingRenewalStudents: awaitingRenewalRes.count || 0,
    inactiveStudents: inactiveRes.count || 0,
    trainers: trainerCount,
  };

  const planCounts: Record<string, { name: string; count: number }> = {};
  (enrollRes.data || []).forEach((e: any) => {
    const name = e.plans?.name || "Sem plano";
    if (!planCounts[name]) planCounts[name] = { name, count: 0 };
    planCounts[name].count++;
  });
  const planChart = Object.values(planCounts).sort((a, b) => b.count - a.count);

  const expiringContracts = (expiringRes.data || []).filter((e: any) => {
    const s = e.students?.status;
    return s === "active" || s === "pending" || s === "awaiting_renewal";
  });

  // Cycle countdowns
  const activeEnrolls = (activeEnrollsRes as any)?.data || [];
  const countdowns: any[] = [];
  const enrollsWithDate = activeEnrolls.filter((e: any) => e.training_start_date);
  if (enrollsWithDate.length > 0) {
    const enrollIds = enrollsWithDate.map((e: any) => e.id);
    const enrollInfoMap: Record<string, { name: string; trainer_id: string | null; student_id: string }> = {};
    enrollsWithDate.forEach((e: any) => {
      enrollInfoMap[e.id] = {
        name: e.students?.full_name || "—",
        trainer_id: e.students?.assigned_trainer_id || e.trainer_id,
        student_id: e.student_id,
      };
    });
    const { data: cycleRows, error: cycleRowsError } = await supabase.from("training_cycles")
      .select("id, enrollment_id, cycle_number, start_date, end_date, status, prescribed_offline_at")
      .in("enrollment_id", enrollIds)
      .order("cycle_number");
    if (cycleRowsError) throw new Error(`Falha ao carregar trocas de treino: ${cycleRowsError.message}`);
    const allCycles = cycleRows || [];
    const activeCycles = allCycles.filter((cycle: any) => cycle.start_date <= today && cycle.end_date >= today);
    const nextCycles = activeCycles.map((cycle: any) => allCycles.find((candidate: any) =>
      candidate.enrollment_id === cycle.enrollment_id && candidate.cycle_number === cycle.cycle_number + 1,
    )).filter(Boolean);
    const nextCycleIds = nextCycles.map((cycle: any) => cycle.id);
    const [{ data: nextWorkouts, error: nextWorkoutsError }, { data: nextBundles, error: nextBundlesError }] = nextCycleIds.length > 0
      ? await Promise.all([
          supabase.from("workouts").select("cycle_id, exercises").in("cycle_id", nextCycleIds),
          (supabase as any).from("prescription_bundles").select("training_cycle_id").in("training_cycle_id", nextCycleIds).neq("status", "failed"),
        ])
      : [{ data: [] as any[], error: null }, { data: [] as any[], error: null }];
    if (nextWorkoutsError) throw new Error(`Falha ao conferir treinos futuros: ${nextWorkoutsError.message}`);
    if (nextBundlesError) throw new Error(`Falha ao conferir prescrições futuras: ${nextBundlesError.message}`);
    const preparedNextCycles = new Set([
      ...filterMaterializedWorkouts(nextWorkouts || []).map((row) => row.cycle_id),
      ...(nextBundles || []).map((row: any) => row.training_cycle_id),
      ...nextCycles.filter((cycle) => cycle.prescribed_offline_at).map((cycle) => cycle.id),
    ]);
    activeCycles.forEach((c: any) => {
      const info = enrollInfoMap[c.enrollment_id];
      const daysLeft = differenceInCalendarDays(parseISO(c.end_date), businessToday);
      if (daysLeft < 0 || daysLeft > 7) return;
      const nextCycle = nextCycles.find((candidate: any) => candidate.enrollment_id === c.enrollment_id);
      countdowns.push({
        student_name: info?.name || "—",
        student_id: info?.student_id,
        cycle_number: c.cycle_number,
        end_date: c.end_date,
        days_left: daysLeft,
        trainer_id: info?.trainer_id,
        next_cycle_id: nextCycle?.id || null,
        next_cycle_number: nextCycle?.cycle_number || null,
        next_start_date: nextCycle?.start_date || null,
        next_ready: Boolean(nextCycle && preparedNextCycles.has(nextCycle.id)),
      });
    });
  }
  countdowns.sort((a, b) => a.days_left - b.days_left);

  // Resolve trainer names once
  const allTrainerIds = new Set<string>();
  expiringContracts.forEach((e: any) => { if (e.trainer_id) allTrainerIds.add(e.trainer_id); });
  countdowns.forEach((m: any) => { if (m.trainer_id) allTrainerIds.add(m.trainer_id); });
  const trainerMap: Record<string, string> = {};
  if (allTrainerIds.size > 0) {
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", Array.from(allTrainerIds));
    (profiles || []).forEach((p: any) => { trainerMap[p.user_id] = p.full_name || ""; });
  }

  return { stats, planChart, expiringContracts, cycleCountdowns: countdowns, trainerMap };
}

const chartColors = ["hsl(220, 70%, 25%)", "hsl(220, 60%, 35%)", "hsl(220, 50%, 45%)", "hsl(220, 40%, 55%)"];

export default function AdminDashboard() {
  const { role, companyId } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const navigate = useNavigate();
  const [insightsOpen, setInsightsOpen] = useState(false);
  const routePrefix = role === "master" && isViewingCompany ? "admin" : role;
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id : null) : companyId;

  const { data, error: dashboardError, isLoading: dashboardLoading } = useQuery({
    queryKey: ["admin-dashboard", effectiveCompanyId ?? "all"],
    queryFn: () => fetchDashboardData(effectiveCompanyId),
    staleTime: 60_000,
  });

  // Mapa aluno→conversa para os botões "Renovar agora" (abre o chat com a mensagem pronta).
  const { data: studentChatMap } = useQuery({
    queryKey: ["student-chat-map", effectiveCompanyId ?? "all"],
    queryFn: () => buildStudentChatMap(effectiveCompanyId),
    staleTime: 60_000,
  });

  const handleRenew = async (studentId: string, fullName?: string, planName?: string, daysLeft?: number) => {
    try {
      const paymentLink = await createPlansLink(studentId);
      const message = renewalMessage({ fullName, planName, daysLeft, paymentLink, overdue: typeof daysLeft === "number" && daysLeft <= 0 });
      await openStudentChat({
        navigate,
        routePrefix: (routePrefix as string) || "admin",
        chatId: studentChatMap?.[studentId],
        studentId,
        message,
        onNoChat: (m) => { void navigator.clipboard?.writeText(m); toast.success("Aluno sem WhatsApp — mensagem de renovação copiada."); },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o link de renovação.");
    }
  };

  const handleCycleNotice = async (cycle: any) => {
    const firstName = String(cycle.student_name || "").trim().split(/\s+/)[0];
    const startLabel = cycle.next_start_date ? format(parseISO(cycle.next_start_date), "dd/MM") : "na próxima troca";
    const message = `Oi, ${firstName}! Seu próximo ciclo de treino já está programado e entra no app em ${startLabel}. Quando ele liberar, me conta como se sentiu no bloco anterior para eu acompanhar sua evolução.`;
    await openStudentChat({
      navigate,
      routePrefix: (routePrefix as string) || "admin",
      chatId: studentChatMap?.[cycle.student_id],
      studentId: cycle.student_id,
      message,
      onNoChat: (draft) => { void navigator.clipboard?.writeText(draft); toast.success("Aluno sem conversa interna — mensagem copiada."); },
    });
  };

  const stats = data?.stats ?? { totalStudents: 0, pendingStudents: 0, awaitingRenewalStudents: 0, inactiveStudents: 0, trainers: 0 };
  const planChart = data?.planChart ?? [];
  const expiringContracts = data?.expiringContracts ?? [];
  const cycleCountdowns = data?.cycleCountdowns ?? [];
  const trainerMap = data?.trainerMap ?? {};
  const businessToday = parseISO(businessDateYmd());

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl text-primary">DASHBOARD</h1>
          <p className="text-muted-foreground font-sans">
            {isViewingCompany ? `Visualizando: ${viewingCompany?.name}` : "Visão geral da consultoria"}
          </p>
        </div>

        {dashboardError && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-destructive">Não foi possível carregar os indicadores do painel.</p>
              <p className="mt-1 text-xs text-muted-foreground">{dashboardError instanceof Error ? dashboardError.message : "Atualize a página e tente novamente."}</p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card className="bg-card border-border cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate(`/${routePrefix}/students?status=active`)}>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-lg bg-primary/10"><Users className="h-6 w-6 text-primary" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground font-sans">{dashboardLoading ? "—" : stats.totalStudents}</p>
                <p className="text-sm text-muted-foreground font-sans">Alunos Ativos</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border cursor-pointer hover:border-warning/50 transition-colors" onClick={() => navigate(`/${routePrefix}/students?status=pending`)}>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-lg bg-warning/10"><Clock className="h-6 w-6 text-warning" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground font-sans">{dashboardLoading ? "—" : stats.pendingStudents}</p>
                <p className="text-sm text-muted-foreground font-sans">Alunos Pendentes</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border cursor-pointer hover:border-warning/50 transition-colors" onClick={() => navigate(`/${routePrefix}/students?status=awaiting_renewal`)}>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-lg bg-warning/10"><RotateCcw className="h-6 w-6 text-warning" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground font-sans">{dashboardLoading ? "—" : stats.awaitingRenewalStudents}</p>
                <p className="text-sm text-muted-foreground font-sans">Aguardando Renovação</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border cursor-pointer hover:border-muted-foreground/50 transition-colors" onClick={() => navigate(`/${routePrefix}/students?status=inactive`)}>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-lg bg-muted"><UserX className="h-6 w-6 text-muted-foreground" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground font-sans">{dashboardLoading ? "—" : stats.inactiveStudents}</p>
                <p className="text-sm text-muted-foreground font-sans">Alunos Inativos</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-lg bg-primary/10"><TrendingUp className="h-6 w-6 text-primary" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground font-sans">{dashboardLoading ? "—" : stats.trainers}</p>
                <p className="text-sm text-muted-foreground font-sans">Treinadores</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <DashboardAlerts compact />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-primary text-xl flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />RENOVAÇÃO
              </CardTitle>
            </CardHeader>
            <CardContent>
              {expiringContracts.length > 0 ? (
                <div className="space-y-3 max-h-[250px] overflow-auto">
                  {expiringContracts.map((contract: any) => {
                    const daysLeft = differenceInCalendarDays(parseISO(contract.end_date), businessToday);
                    return (
                      <div key={contract.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border cursor-pointer hover:brightness-110 transition-all" onClick={() => navigate(`/${routePrefix}/students/${contract.student_id}`)}>
                        <div>
                          <p className="text-foreground font-sans font-medium text-sm">{contract.students?.full_name}</p>
                          <p className="text-muted-foreground text-xs font-sans">{contract.plans?.name}</p>
                          {contract.trainer_id && trainerMap[contract.trainer_id] && (
                            <p className="text-muted-foreground/70 text-[11px] font-sans">Treinador: {trainerMap[contract.trainer_id]}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="rounded bg-destructive/20 px-2 py-1 text-xs font-medium text-destructive font-mono-data">
                            {daysLeft < 0 ? `${Math.abs(daysLeft)}d em atraso` : daysLeft === 0 ? "Vence hoje" : `${daysLeft}d restantes`}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs border-primary/40 text-primary hover:bg-primary/5"
                            onClick={(e) => { e.stopPropagation(); handleRenew(contract.student_id, contract.students?.full_name, contract.plans?.name, daysLeft); }}
                          >
                            <MessageCircle className="h-3.5 w-3.5 mr-1" /> Renovar agora
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground font-sans text-center py-8">Nenhuma renovação pendente</p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-primary text-xl flex items-center gap-2">
                <Timer className="h-5 w-5" />TROCA DE TREINO
              </CardTitle>
            </CardHeader>
            <CardContent>
              {cycleCountdowns.length > 0 ? (
                <div className="space-y-3 max-h-[300px] overflow-auto">
                  {cycleCountdowns.map((m: any, i: number) => (
                    <div key={i} className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/50 p-3 sm:flex-row sm:items-center sm:justify-between" onClick={() => m.student_id && navigate(`/${routePrefix}/students/${m.student_id}`)}>
                      <div>
                        <p className="text-foreground font-sans font-medium text-sm">{m.student_name}</p>
                        <p className="text-muted-foreground text-xs font-sans">Ciclo {m.cycle_number} · vence {format(parseISO(m.end_date), "dd/MM")}</p>
                        <p className={`mt-1 text-xs font-medium ${m.next_ready ? "text-emerald-700" : "text-amber-700"}`}>
                          {m.next_ready ? `Próximo ciclo ${m.next_cycle_number} pronto` : "Próxima prescrição pendente"}
                        </p>
                        {m.trainer_id && trainerMap[m.trainer_id] && (
                          <p className="text-muted-foreground/70 text-[11px] font-sans">Treinador: {trainerMap[m.trainer_id]}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                        <span className={`rounded px-2 py-1 text-xs font-medium font-mono-data ${m.days_left <= 0 ? "bg-destructive/20 text-destructive" : "bg-warning/20 text-warning"}`}>
                          {m.days_left <= 0 ? "Hoje" : `${m.days_left}d para troca`}
                        </span>
                        {m.next_ready ? (
                          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleCycleNotice(m)}>
                            <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> Avisar aluno
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => navigate(`/${routePrefix}/studio`, { state: { studentId: m.student_id, tab: "prescricao" } })}
                          >
                            <CalendarRange className="mr-1.5 h-3.5 w-3.5" /> Prescrever
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground font-sans text-center py-8">Nenhuma troca prevista para os próximos 7 dias</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Collapsible open={insightsOpen} onOpenChange={setInsightsOpen}>
          <Card className="bg-card border-border">
            <CollapsibleTrigger asChild>
              <button type="button" className="flex w-full items-center justify-between gap-4 p-6 text-left">
                <div>
                  <CardTitle className="text-primary text-xl flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />ANÁLISES E ACOMPANHAMENTO
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground font-sans">
                    Coorte, evasão, feedbacks e distribuição por plano quando precisar investigar com mais calma.
                  </p>
                </div>
                <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${insightsOpen ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-6 pt-0">
                <section className="rounded-lg border border-border bg-secondary/20 p-4">
                  <h2 className="text-primary text-xl">PLANOS MAIS VENDIDOS</h2>
                  <div className="mt-4">
                    {planChart.length > 0 ? (
                      <Suspense fallback={<div className="h-[250px] flex items-center justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
                        <LazyChart data={planChart} colors={chartColors} />
                      </Suspense>
                    ) : (
                      <p className="text-muted-foreground font-sans text-center py-8">Nenhuma matrícula registrada</p>
                    )}
                  </div>
                </section>

                {/* EVASÃO embutida na dashboard (antes era a rota separada /admin/evasao). */}
                <AtRiskStudents />
                <MonthlyPrescriptionsCard companyId={effectiveCompanyId} routePrefix={(routePrefix as string) || "admin"} />
                <PendingFeedbackCard companyId={effectiveCompanyId} routePrefix={(routePrefix as string) || "admin"} />
                <CohortInsightsCard companyId={effectiveCompanyId} />
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>
    </>
  );
}
