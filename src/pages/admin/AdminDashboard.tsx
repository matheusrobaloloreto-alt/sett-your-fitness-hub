import { CompanyOperationsReports } from "@/components/admin/operations/OperationsConsumers";
import { lazy, Suspense, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, TrendingUp, RefreshCw, Clock, UserX, Timer, RotateCcw, MessageCircle, CalendarRange, BarChart3, ChevronDown, UserPlus } from "lucide-react";
import { format, addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { toast } from "sonner";
import { DashboardAlerts } from "@/components/DashboardAlerts";
import { MonthlyPrescriptionsCard } from "@/components/admin/MonthlyPrescriptionsCard";
import { PendingFeedbackCard } from "@/components/admin/PendingFeedbackCard";
import { CohortInsightsCard } from "@/components/admin/CohortInsightsCard";
import { ContactCadenceCard } from "@/components/admin/ContactCadenceCard";
import { AtRiskStudents } from "@/components/admin/AtRiskStudents";
import { useMaster } from "@/contexts/MasterContext";
import { useAuth } from "@/hooks/useAuth";
import { Link, useNavigate } from "react-router-dom";
import { buildStudentChatMap, createPlansLink, isRenewalOverdue, openStudentChat, renewalMessage } from "@/lib/studentChat";
import { businessDateYmd } from "@/lib/businessDate";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { filterMaterializedWorkouts } from "@/lib/workoutPresence";
import { RenewalsAndCyclesPanel } from "@/components/dashboard/RenewalsAndCyclesPanel";
import { DashboardSnapshotContext, type CompanyDashboardSnapshot } from "@/contexts/DashboardSnapshotContext";
import { parseCompanyDashboardSnapshot } from "@/lib/companyDashboardSnapshot";
import { DEFAULT_COMPANY_PRODUCT_SETTINGS, fetchCompanyProductSettings } from '@/lib/companyProductSettings';
import { useCompanyExperiencePolicy } from '@/hooks/useCompanyExperiencePolicy';
import { useRolePermissions } from "@/hooks/useRolePermissions";
import {
  AssessmentDashboardCard, AssignedDashboardInsights, DashboardCard, DashboardQueueState, FirstTrainingDashboardCard,
  OperationalContactCadenceCard, useAssignedDashboardStudents, WorkoutFeedbackDashboardCard,
} from "@/components/dashboard/OperationalDashboardCards";
import { AthleticClubStar } from "@/components/AthleticClubStar";

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
  stats: { totalStudents: number; interestedStudents: number; pendingStudents: number; awaitingRenewalStudents: number; inactiveStudents: number; trainers: number };
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
  const experience = effectiveCompanyId ? (await fetchCompanyProductSettings(effectiveCompanyId)).settings.experience : DEFAULT_COMPANY_PRODUCT_SETTINGS.experience;
  const renewalDate = format(addDays(businessToday, experience.renewal_notice_days), "yyyy-MM-dd");

  let studentQuery = supabase.from("students").select("*", { count: "exact", head: true }).eq("status", "active");
  let interestedQuery = (supabase as any).from("leads").select("*", { count: "exact", head: true })
    .is("converted_to_student_id", null)
    .in("stage", ["interested", "contacted"]);
  let pendingQuery = supabase.from("students").select("*", { count: "exact", head: true }).eq("status", "pending");
  let awaitingRenewalQuery = supabase.from("students").select("*", { count: "exact", head: true }).eq("status", "awaiting_renewal");
  let inactiveQuery = supabase.from("students").select("*", { count: "exact", head: true }).eq("status", "inactive");
  let enrollQuery = supabase.from("enrollments").select("plan_id, plans(name)");
  let expiringQuery = supabase.from("enrollments").select("id, student_id, end_date, trainer_id, students(full_name, status), plans(name)")
    .in("status", ["active", "awaiting_renewal"]).lte("end_date", renewalDate)
    .order("end_date", { ascending: false });

  if (effectiveCompanyId) {
    studentQuery = studentQuery.eq("company_id", effectiveCompanyId);
    interestedQuery = interestedQuery.eq("company_id", effectiveCompanyId);
    pendingQuery = pendingQuery.eq("company_id", effectiveCompanyId);
    awaitingRenewalQuery = awaitingRenewalQuery.eq("company_id", effectiveCompanyId);
    inactiveQuery = inactiveQuery.eq("company_id", effectiveCompanyId);
    enrollQuery = enrollQuery.eq("company_id", effectiveCompanyId);
    expiringQuery = expiringQuery.eq("company_id", effectiveCompanyId);
  }

  // Trainer count + cycle enrollments in parallel with the others
  let cycleEnrollQuery = supabase.from("enrollments")
    .select("id, student_id, training_start_date, trainer_id, students(full_name, assigned_trainer_id)")
    .in("status", ["active", "awaiting_training", "awaiting_renewal"]) as any;
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

  const [studentRes, interestedRes, pendingRes, awaitingRenewalRes, inactiveRes, enrollRes, expiringRes, activeEnrollsRes, trainerCount] = await Promise.all([
    studentQuery,
    interestedQuery,
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
    ["interessados", interestedRes],
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
    interestedStudents: interestedRes.count || 0,
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

  const countdowns = await fetchPrescriptionCountdowns(effectiveCompanyId!, activeEnrollsRes.data ?? [], today, renewalDate);

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

async function fetchPrescriptionCountdowns(companyId: string, activeEnrolls: any[], today: string, renewalDate: string) {
  const businessToday = parseISO(today);
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
      .select("id, enrollment_id, cycle_number, start_date, end_date, status, prescribed_offline_at, prescription_cleared_at, superseded_by_cycle_id")
      .eq("company_id", companyId)
      .is("superseded_by_cycle_id", null)
      .in("enrollment_id", enrollIds)
      .neq("status", "superseded")
      .order("cycle_number");
    if (cycleRowsError) throw new Error(`Falha ao carregar trocas de treino: ${cycleRowsError.message}`);
    const schedules = new Map<string, NonNullable<typeof cycleRows>>();
    for (const cycle of cycleRows ?? []) {
      const schedule = schedules.get(cycle.enrollment_id) ?? [];
      schedule.push(cycle);
      schedules.set(cycle.enrollment_id, schedule);
    }
    const windows = [...schedules.values()].flatMap(schedule => {
      const ordered = schedule.sort((a, b) => a.start_date.localeCompare(b.start_date) || a.cycle_number - b.cycle_number);
      const current = ordered.filter(cycle => cycle.start_date <= today).at(-1);
      if (!current) return [];
      return [{
        current,
        previous: ordered.filter(cycle => cycle.end_date < current.start_date).at(-1),
        next: ordered.find(cycle => cycle.start_date > current.end_date),
      }];
    });
    const targetIds = [...new Set(windows.flatMap(({ current, next }) => next ? [current.id, next.id] : [current.id]))];
    const [workouts, bundles] = targetIds.length ? await Promise.all([
      supabase.from("workouts").select("cycle_id, exercises").is("superseded_at", null).in("cycle_id", targetIds),
      supabase.from("prescription_bundles").select("training_cycle_id").eq("company_id", companyId)
        .in("training_cycle_id", targetIds).in("status", ["active", "scheduled"]),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (workouts.error) throw new Error(`Falha ao conferir treinos: ${workouts.error.message}`);
    if (bundles.error) throw new Error(`Falha ao conferir prescrições: ${bundles.error.message}`);
    const prepared = new Set([
      ...filterMaterializedWorkouts(workouts.data).map(row => row.cycle_id),
      ...(bundles.data ?? []).map(row => row.training_cycle_id),
    ]);
    const ready = (cycle: NonNullable<typeof cycleRows>[number]) =>
      !cycle.prescription_cleared_at && (Boolean(cycle.prescribed_offline_at) || prepared.has(cycle.id));
    for (const { current, previous, next } of windows) {
      // Keep a missed handoff visible when its projected cycle has already started.
      const missedHandoff = previous && !ready(current);
      const reference = missedHandoff ? previous : current;
      const target = missedHandoff ? current : next;
      if (reference.end_date > renewalDate || (target && ready(target))) continue;
      const info = enrollInfoMap[reference.enrollment_id];
      countdowns.push({
        student_name: info.name,
        student_id: info.student_id,
        cycle_number: reference.cycle_number,
        end_date: reference.end_date,
        days_left: differenceInCalendarDays(parseISO(reference.end_date), businessToday),
        trainer_id: info.trainer_id,
        next_cycle_id: target?.id ?? null,
        next_cycle_number: target?.cycle_number ?? null,
        next_start_date: target?.start_date ?? null,
        next_ready: false,
      });
    }
  }
  countdowns.sort((a, b) => a.days_left - b.days_left);

  return countdowns;
}

export function prescriptionDeadlineTone(daysLeft: number) {
  if (daysLeft < 0) return "bg-destructive/20 text-destructive";
  if (daysLeft === 0) return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
}

const chartColors = ["hsl(220, 70%, 25%)", "hsl(220, 60%, 35%)", "hsl(220, 50%, 45%)", "hsl(220, 40%, 55%)"];

function dashboardDataFromSnapshot(snapshot: CompanyDashboardSnapshot | null | undefined): DashboardData | undefined {
  if (!snapshot) return undefined;
  return {
    stats: {
      totalStudents: Number(snapshot.stats?.totalStudents) || 0,
      interestedStudents: Number(snapshot.stats?.interestedStudents) || 0,
      pendingStudents: Number(snapshot.stats?.pendingStudents) || 0,
      awaitingRenewalStudents: Number(snapshot.stats?.awaitingRenewalStudents) || 0,
      inactiveStudents: Number(snapshot.stats?.inactiveStudents) || 0,
      trainers: Number(snapshot.stats?.trainers) || 0,
    },
    planChart: snapshot.planChart || [],
    expiringContracts: snapshot.expiringContracts || [],
    cycleCountdowns: snapshot.cycleCountdowns || [],
    trainerMap: snapshot.trainerMap || {},
  };
}

function dashboardErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return "Atualize a página e tente novamente.";
}

interface AdminDashboardProps {
  readOnly?: boolean;
  routePrefixOverride?: string;
  title?: string;
  subtitle?: string;
  includeCoordinatorPanels?: boolean;
  operationalExtras?: ReactNode;
}

export default function AdminDashboard({
  readOnly = false,
  routePrefixOverride,
  title = "DASHBOARD",
  subtitle,
  includeCoordinatorPanels = false,
  operationalExtras,
}: AdminDashboardProps = {}) {
  const { role, companyId, user } = useAuth();
  const { canAccess, loading: permissionsLoading } = useRolePermissions();
  const { viewingCompany, isViewingCompany } = useMaster();
  const navigate = useNavigate();
  const [view, setView] = useState<"all" | "mine">("all");
  const mine = view === "mine";
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [renewalFilter, setRenewalFilter] = useState<"all" | "pending" | "overdue">("all");
  const [cycleFilter, setCycleFilter] = useState<"all" | "pending" | "overdue">("all");
  const routePrefix = routePrefixOverride ?? (role === "master" && isViewingCompany ? "admin" : role);
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id : null) : companyId;
  const actorScope = effectiveCompanyId && user?.id && role ? { companyId: effectiveCompanyId, actorId: user.id, role } : null;
  const roster = useAssignedDashboardStudents(mine ? actorScope : null);
  const studentIds = new Set((roster.data ?? []).map(student => student.id));
  const assignedScope = actorScope && roster.data && !roster.error ? { ...actorScope, studentIds: [...studentIds] } : null;
  const operationalScope = mine ? assignedScope : readOnly ? null : actorScope;
  const safeRoutePrefix = routePrefix || "admin";
  const canOpenStudent = (mine || !readOnly) && (role !== "coordinator" || (!permissionsLoading && canAccess("students")));
  const canOpenChat = !permissionsLoading && canAccess("whatsapp");
  const canRunAdminOperations = !readOnly && (role === "admin" || role === "master");
  const { policy, isPending: policyPending, error: policyError } = useCompanyExperiencePolicy(effectiveCompanyId);

  const day = businessDateYmd();
  const myCycles = useQuery({
    queryKey: ["dashboard-my-prescriptions", assignedScope, day, policy.renewal_notice_days],
    enabled: mine && !!assignedScope && !policyPending && !policyError,
    queryFn: async () => {
      const { companyId, studentIds } = assignedScope!;
      const deadline = format(addDays(parseISO(day), policy.renewal_notice_days), "yyyy-MM-dd");
      const rows = [];
      for (let start = 0; start < studentIds.length; start += 100) {
        const { data, error } = await supabase.from("enrollments")
          .select("id, student_id, training_start_date, trainer_id, students(full_name, assigned_trainer_id)")
          .eq("company_id", companyId).in("student_id", studentIds.slice(start, start + 100))
          .in("status", ["active", "awaiting_training", "awaiting_renewal"]);
        if (error) throw error;
        rows.push(...await fetchPrescriptionCountdowns(companyId, data ?? [], day, deadline));
      }
      return rows;
    },
  });

  const { data: snapshotData, error: snapshotError, isLoading: snapshotLoading } = useQuery({
    queryKey: ["company-dashboard-snapshot", effectiveCompanyId ?? "none", policy.risk_no_workout_days, policy.renewal_notice_days, user?.id, role, day],
    queryFn: async () => {
      if (!effectiveCompanyId) return null;
      const { data, error } = await supabase.rpc("get_company_dashboard_snapshot", { _company_id: effectiveCompanyId });
      if (error) throw error;
      return parseCompanyDashboardSnapshot(data, effectiveCompanyId);
    },
    staleTime: 60_000,
    enabled: readOnly && !!effectiveCompanyId,
  });

  const { data: liveData, error: liveDashboardError, isLoading: liveDashboardLoading } = useQuery({
    queryKey: ["admin-dashboard", effectiveCompanyId ?? "all", policy.renewal_notice_days, user?.id, role, day],
    queryFn: () => fetchDashboardData(effectiveCompanyId),
    staleTime: 60_000,
    enabled: !readOnly && Boolean(effectiveCompanyId) && !policyPending,
  });
  const data = readOnly ? dashboardDataFromSnapshot(snapshotData) : liveData;
  const dashboardError = policyError ?? (readOnly ? snapshotError : liveDashboardError);
  const dashboardLoading = readOnly ? snapshotLoading : liveDashboardLoading;

  // Mapa aluno→conversa para os botões "Renovar agora" (abre o chat com a mensagem pronta).
  const { data: studentChatMap } = useQuery({
    queryKey: ["student-chat-map", effectiveCompanyId ?? "all"],
    queryFn: () => buildStudentChatMap(effectiveCompanyId),
    staleTime: 60_000,
    enabled: !readOnly && canRunAdminOperations && !mine && !!effectiveCompanyId && canOpenChat,
  });

  const navigateWhenInteractive = (target: string, options?: any) => {
    if (!canOpenStudent) return;
    navigate(target, options);
  };

  const handleRenew = async (studentId: string, enrollmentId: string, fullName?: string, planName?: string, daysLeft?: number) => {
    if (!canRunAdminOperations || !effectiveCompanyId) return;
    try {
      const paymentLink = await createPlansLink(studentId, { enrollmentId });
      const message = renewalMessage({ fullName, planName, daysLeft, paymentLink });
      await openStudentChat({
        navigate,
        routePrefix: (routePrefix as string) || "admin",
        chatId: studentChatMap?.[studentId],
        studentId,
        message,
        companyId: effectiveCompanyId,
        messageEvent: isRenewalOverdue(daysLeft) ? 'renewal_overdue' : 'renewal_due',
        messageValues: { nome: fullName ?? '', primeiro_nome: (fullName ?? '').trim().split(/\s+/)[0], link: paymentLink, prazo: typeof daysLeft === 'number' ? String(daysLeft) : '' },
        onNoChat: (m) => { void navigator.clipboard?.writeText(m); toast.success("Aluno sem WhatsApp — mensagem de renovação copiada."); },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o link de renovação.");
    }
  };

  const stats = data?.stats ?? { totalStudents: 0, interestedStudents: 0, pendingStudents: 0, awaitingRenewalStudents: 0, inactiveStudents: 0, trainers: 0 };
  const planChart = data?.planChart ?? [];
  const expiringContracts = (data?.expiringContracts ?? []).filter(row => !mine || studentIds.has(row.student_id));
  const cycleCountdowns = ((mine ? myCycles.data : data?.cycleCountdowns) ?? [])
    .filter(row => !row.next_ready && (!mine || studentIds.has(row.student_id)))
    .sort((a, b) => a.days_left - b.days_left);
  const trainerMap = data?.trainerMap ?? {};
  const businessToday = parseISO(businessDateYmd());
  const visibleRenewals = expiringContracts.filter((contract: any) => {
    const daysLeft = differenceInCalendarDays(parseISO(contract.end_date), businessToday);
    return renewalFilter === "pending" ? Number.isFinite(daysLeft) && !isRenewalOverdue(daysLeft) : renewalFilter === "overdue" ? isRenewalOverdue(daysLeft) : true;
  });
  const visibleCycleCountdowns = cycleCountdowns.filter((cycle: any) => (
    cycleFilter === "pending" ? Number(cycle.days_left) >= 0 : cycleFilter === "overdue" ? Number(cycle.days_left) < 0 : true
  ));

  const queueLoading = dashboardLoading || (mine && roster.isLoading);
  const queueError = dashboardError || (mine && roster.error);
  const cycleLoading = mine ? roster.isLoading || myCycles.isLoading || policyPending : dashboardLoading;
  const cycleError = mine ? roster.error || myCycles.error || policyError : dashboardError;

  return (
    <>
      <DashboardSnapshotContext.Provider value={readOnly ? snapshotData ?? null : null}>
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl text-primary">{title}</h1>
          <p className="text-muted-foreground font-sans">
            {subtitle ?? (isViewingCompany ? `Visualizando: ${viewingCompany?.name}` : "Visão geral da consultoria")}
          </p>
          {readOnly && !mine && (
            <p className="mt-1 text-xs text-muted-foreground font-sans">
              Visualização completa da empresa. Ações administrativas permanecem restritas a admin/coordenador.
            </p>
          )}
        </div>

        <div role="group" aria-label="Carteira do dashboard" className="flex flex-wrap gap-2">
          {([["all", "Todos os alunos"], ["mine", "Meus alunos"]] as const).map(([value, label]) => (
            <Button key={value} type="button" size="sm" variant={view === value ? "default" : "outline"}
              aria-pressed={view === value} disabled={value === "mine" && !actorScope}
              onClick={() => setView(value)}>{label}</Button>
          ))}
        </div>

        {dashboardError && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-destructive">Não foi possível carregar os indicadores do painel.</p>
              <p className="mt-1 text-xs text-muted-foreground">{dashboardErrorMessage(dashboardError)}</p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          {!mine && <DashboardCard title="Interessados" icon={UserPlus}>
            {!data || dashboardError ? <DashboardQueueState loading={dashboardLoading} error={dashboardError}
              empty="Selecione uma empresa para consultar os interessados." /> : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">{stats.interestedStudents} contatos na fila de interessados</p>
                {!readOnly && !permissionsLoading && canAccess("registration") && <Button size="sm" variant="outline" onClick={() => navigate(`/${safeRoutePrefix}/registration`)}>Ver interessados</Button>}
              </div>
            )}
          </DashboardCard>}
          {mine ? <FirstTrainingDashboardCard scope={operationalScope} students={roster.data ?? []}
            routePrefix={safeRoutePrefix} allowStudentNavigation={canOpenStudent} rosterLoading={roster.isLoading} rosterError={roster.error} />
            : <AssessmentDashboardCard scope={operationalScope} routePrefix={safeRoutePrefix} allowChat={canOpenChat} />}
          <OperationalContactCadenceCard scope={canOpenChat ? operationalScope : null} routePrefix={safeRoutePrefix} />
          <Card className="bg-card border-border">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-primary text-xl flex items-center gap-2">
                  <Timer className="h-5 w-5" />Próximas prescrições
                </CardTitle>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar trocas de treino">
                  {([['all', 'Todas'], ['pending', 'Pendentes'], ['overdue', 'Atrasadas']] as const).map(([value, label]) => (
                    <Button key={value} type="button" size="sm" variant={cycleFilter === value ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => setCycleFilter(value)}>{label}</Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!cycleLoading && !cycleError && visibleCycleCountdowns.length > 0 ? (
                <div className="space-y-3 max-h-[300px] overflow-auto">
                  {visibleCycleCountdowns.map((m: any) => (
                    <div key={m.next_cycle_id ?? `${m.student_id}-${m.cycle_number}-${m.end_date}`} className={`flex flex-col gap-3 rounded-lg border border-border bg-secondary/50 p-3 sm:flex-row sm:items-center sm:justify-between ${!canOpenStudent ? "" : "cursor-pointer hover:brightness-110 transition-all"}`} onClick={() => m.student_id && navigateWhenInteractive(`/${routePrefix}/students/${m.student_id}`)}>
                      <div>
                        <button
                          type="button"
                          className="text-left font-sans text-sm font-medium text-foreground hover:text-primary hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (m.student_id) {
                              navigateWhenInteractive(`/${routePrefix}/students/${m.student_id}`);
                            }
                          }}
                        >
                          <span className="inline-flex min-w-0 items-center gap-1.5">
                            <span className="truncate">{m.student_name}</span>
                            <AthleticClubStar studentId={m.student_id} companyId={effectiveCompanyId} className="shrink-0" />
                          </span>
                        </button>
                        <p className="text-muted-foreground text-xs font-sans">Ciclo {m.cycle_number} · vence {format(parseISO(m.end_date), "dd/MM")}</p>
                        <p className="mt-1 text-xs font-medium text-muted-foreground">
                          {m.next_cycle_number ? `Ciclo ${m.next_cycle_number} · prescrição pendente` : "Próxima prescrição pendente"}
                        </p>
                        {m.trainer_id && trainerMap[m.trainer_id] && (
                          <p className="text-muted-foreground/70 text-[11px] font-sans">Treinador: {trainerMap[m.trainer_id]}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                        <span className={`rounded px-2 py-1 text-xs font-medium font-mono-data ${prescriptionDeadlineTone(m.days_left)}`}>
                          {m.days_left < 0 ? `${Math.abs(m.days_left)}d em atraso` : m.days_left === 0 ? "Hoje" : `${m.days_left}d para troca`}
                        </span>
                        {canOpenStudent && m.student_id && (
                          <Button asChild size="sm" className="h-8 text-xs">
                            <Link to={`/${safeRoutePrefix}/students/${m.student_id}?tab=prescricao${m.next_cycle_id ? `&cycle=${encodeURIComponent(m.next_cycle_id)}` : ""}`}>
                              <CalendarRange className="mr-1.5 h-3.5 w-3.5" /> Prescrever
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <DashboardQueueState loading={cycleLoading} error={cycleError} empty="Nenhuma próxima prescrição no período configurado." />
              )}
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-primary text-xl flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />Renovações
                </CardTitle>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar renovações">
                  {([['all', 'Todas'], ['pending', 'Pendentes'], ['overdue', 'Atrasadas']] as const).map(([value, label]) => (
                    <Button key={value} type="button" size="sm" variant={renewalFilter === value ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => setRenewalFilter(value)}>{label}</Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!queueLoading && !queueError && visibleRenewals.length > 0 ? (
                <div className="space-y-3 max-h-[250px] overflow-auto">
                  {visibleRenewals.map((contract: any) => {
                    const daysLeft = differenceInCalendarDays(parseISO(contract.end_date), businessToday);
                    return (
                      <div key={contract.id} className={`flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-secondary/50 border border-border transition-all ${!canOpenStudent ? "" : "cursor-pointer hover:brightness-110"}`} onClick={() => navigateWhenInteractive(`/${routePrefix}/students/${contract.student_id}?tab=enrollments`)}>
                        <div>
                          <button
                            type="button"
                            className="text-left font-sans text-sm font-medium text-foreground hover:text-primary hover:underline"
                            onClick={(event) => {
                              event.stopPropagation();
                              navigateWhenInteractive(`/${routePrefix}/students/${contract.student_id}?tab=enrollments`);
                            }}
                          >
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              <span className="truncate">{contract.students?.full_name}</span>
                              <AthleticClubStar studentId={contract.student_id} companyId={effectiveCompanyId} className="shrink-0" />
                            </span>
                          </button>
                          <p className="text-muted-foreground text-xs font-sans">{contract.plans?.name}</p>
                          {contract.trainer_id && trainerMap[contract.trainer_id] && (
                            <p className="text-muted-foreground/70 text-[11px] font-sans">Treinador: {trainerMap[contract.trainer_id]}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-destructive/20 px-2 py-1 text-xs font-medium text-destructive font-mono-data">
                            {daysLeft < 0 ? `${Math.abs(daysLeft)}d em atraso` : daysLeft === 0 ? "Vence hoje" : `${daysLeft}d restantes`}
                          </span>
                          {canOpenStudent && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={event => {
                              event.stopPropagation();
                              navigateWhenInteractive("/" + safeRoutePrefix + "/students/" + contract.student_id + "?tab=enrollments");
                            }}>Ver matrícula</Button>
                          )}
                          {canRunAdminOperations && !mine && canOpenChat && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs border-primary/40 text-primary hover:bg-primary/5"
                              onClick={(e) => { e.stopPropagation(); handleRenew(contract.student_id, contract.id, contract.students?.full_name, contract.plans?.name, daysLeft); }}
                            >
                              <MessageCircle className="h-3.5 w-3.5 mr-1" /> Renovar agora
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <DashboardQueueState loading={queueLoading} error={queueError} empty="Nenhuma renovação pendente." />
              )}
            </CardContent>
          </Card>


          <DashboardAlerts section="birthdays" readOnly={readOnly} studentIds={mine ? studentIds : undefined}
            birthdayLoading={readOnly ? queueLoading : mine && roster.isLoading}
            birthdayError={readOnly ? queueError : mine && roster.error}
            agendaPath={!permissionsLoading && canAccess("agenda") && canOpenStudent ? "/" + safeRoutePrefix + "/agenda" : undefined}
            allowStudentNavigation={canOpenStudent} allowBirthdayMessage={canOpenChat} />
          <WorkoutFeedbackDashboardCard scope={operationalScope} routePrefix={safeRoutePrefix} allowStudentNavigation={canOpenStudent} />
        <Collapsible open={insightsOpen} onOpenChange={setInsightsOpen}>
          <Card className="bg-card border-border">
            <CollapsibleTrigger asChild>
              <button type="button" className="flex w-full items-center justify-between gap-4 p-6 text-left">
                <div>
                  <CardTitle className="text-primary text-xl flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />Análises e acompanhamento
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground font-sans">
                    NPS, matrículas por plano e acompanhamento de alunos.
                  </p>
                </div>
                <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${insightsOpen ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-6 pt-0">
                {mine ? <AssignedDashboardInsights scope={assignedScope} /> : <>
                <section className="rounded-lg border border-border bg-secondary/20 p-4">
                  <h2 className="text-primary text-xl">Matrículas por plano</h2>
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

                <CohortInsightsCard companyId={effectiveCompanyId} readOnly={readOnly} />
                {role !== "coordinator" && <>
                  <AtRiskStudents readOnly={readOnly} routePrefix={safeRoutePrefix} />
                  <MonthlyPrescriptionsCard companyId={effectiveCompanyId} routePrefix={safeRoutePrefix} readOnly={readOnly} />
                  <PendingFeedbackCard companyId={effectiveCompanyId} routePrefix={safeRoutePrefix} readOnly={readOnly} />
                </>}
                </>}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
        </div>

        {!mine && <details className="rounded-xl border border-border bg-card">
          <summary className="cursor-pointer p-4 text-sm font-semibold text-primary">Mais operações</summary>
          <div className="space-y-4 p-4 pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <Card className={`bg-card border-border transition-colors ${readOnly ? "" : "cursor-pointer hover:border-primary/50"}`} onClick={() => navigateWhenInteractive(`/${routePrefix}/students?status=active`)}>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-lg bg-primary/10"><Users className="h-6 w-6 text-primary" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground font-sans">{(dashboardLoading || dashboardError || !data) ? "—" : stats.totalStudents}</p>
                <p className="text-sm text-muted-foreground font-sans">Alunos Ativos</p>
              </div>
            </CardContent>
          </Card>
          <Card className={`bg-card border-border transition-colors ${readOnly ? "" : "cursor-pointer hover:border-warning/50"}`} onClick={() => navigateWhenInteractive(`/${routePrefix}/students?status=pending`)}>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-lg bg-warning/10"><Clock className="h-6 w-6 text-warning" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground font-sans">{(dashboardLoading || dashboardError || !data) ? "—" : stats.pendingStudents}</p>
                <p className="text-sm text-muted-foreground font-sans">Alunos Pendentes</p>
              </div>
            </CardContent>
          </Card>
          <Card className={`bg-card border-border transition-colors ${readOnly ? "" : "cursor-pointer hover:border-warning/50"}`} onClick={() => navigateWhenInteractive(`/${routePrefix}/students?status=awaiting_renewal`)}>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-lg bg-warning/10"><RotateCcw className="h-6 w-6 text-warning" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground font-sans">{(dashboardLoading || dashboardError || !data) ? "—" : stats.awaitingRenewalStudents}</p>
                <p className="text-sm text-muted-foreground font-sans">Aguardando Renovação</p>
              </div>
            </CardContent>
          </Card>
          <Card className={`bg-card border-border transition-colors ${readOnly ? "" : "cursor-pointer hover:border-muted-foreground/50"}`} onClick={() => navigateWhenInteractive(`/${routePrefix}/students?status=inactive`)}>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-lg bg-muted"><UserX className="h-6 w-6 text-muted-foreground" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground font-sans">{(dashboardLoading || dashboardError || !data) ? "—" : stats.inactiveStudents}</p>
                <p className="text-sm text-muted-foreground font-sans">Alunos Inativos</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="p-3 rounded-lg bg-primary/10"><TrendingUp className="h-6 w-6 text-primary" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground font-sans">{(dashboardLoading || dashboardError || !data) ? "—" : stats.trainers}</p>
                <p className="text-sm text-muted-foreground font-sans">Treinadores</p>
              </div>
            </CardContent>
          </Card>
        </div>
            <DashboardAlerts section="extras" readOnly={readOnly} showRecentStudents />
            {(canOpenChat || readOnly) && <ContactCadenceCard companyId={effectiveCompanyId} routePrefix={safeRoutePrefix} readOnly={readOnly} />}
            {canRunAdminOperations && effectiveCompanyId && <CompanyOperationsReports companyId={effectiveCompanyId} />}
            {includeCoordinatorPanels && <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <RenewalsAndCyclesPanel effectiveCompanyId={effectiveCompanyId} routePrefix={safeRoutePrefix} readOnly={readOnly} renewalsOnly />
              <RenewalsAndCyclesPanel effectiveCompanyId={effectiveCompanyId} routePrefix={safeRoutePrefix} readOnly={readOnly} cyclesOnly />
            </div>}
            {operationalExtras}
          </div>
        </details>}
      </div>
      </DashboardSnapshotContext.Provider>
    </>
  );
}
