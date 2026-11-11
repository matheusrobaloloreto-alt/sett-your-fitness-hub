import { Fragment, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, TrendingUp, RefreshCw, UserX, Timer, RotateCcw, MessageCircle, CalendarRange, UserPlus } from "lucide-react";
import { format, addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { toast } from "sonner";
import { DashboardAlerts } from "@/components/DashboardAlerts";
import { PendingFeedbackCard } from "@/components/admin/PendingFeedbackCard";
import { useMaster } from "@/contexts/MasterContext";
import { useAuth } from "@/hooks/useAuth";
import { Link, useNavigate } from "react-router-dom";
import { businessDateYmd } from "@/lib/businessDate";
import { filterMaterializedWorkouts } from "@/lib/workoutPresence";
import { DashboardSnapshotContext, type CompanyDashboardSnapshot } from "@/contexts/DashboardSnapshotContext";
import { parseCompanyDashboardSnapshot, type DashboardRenewalRow } from "@/lib/companyDashboardSnapshot";
import { DEFAULT_COMPANY_PRODUCT_SETTINGS, fetchCompanyProductSettings } from '@/lib/companyProductSettings';
import { useCompanyExperiencePolicy } from '@/hooks/useCompanyExperiencePolicy';
import { useRolePermissions } from "@/hooks/useRolePermissions";
import {
  AssessmentDashboardCard, DashboardCard, DashboardQueueState, FirstTrainingDashboardCard,
  OperationalContactCadenceCard, useAssignedDashboardStudents, WorkoutFeedbackDashboardCard,
} from "@/components/dashboard/OperationalDashboardCards";
import { AthleticClubStar } from "@/components/AthleticClubStar";
import { useCompanyOperations } from "@/components/admin/operations/OperationsConsumers";
import { fetchCompanyCommercialSettings } from "@/lib/companyCommercialSettings";
import { isOpenFunnelStage, normalizeLeadSalesStage, normalizeSalesStage, resolveFunnelStageMeta } from "@/lib/salesFunnelView";
import { OPEN_ENROLLMENT_STATUSES } from "@/lib/studentRoster";
import { readPages } from "@/lib/pagedRead";
import { selectDashboardPrescriptionEnrollments } from "@/lib/dashboardPrescriptionEnrollments";
import { dashboardRenewalsForPeriod, openDashboardRenewalDraft, readDashboardRenewalQueue, type RenewalPeriod } from "@/lib/dashboardRenewals";

import { useTheme } from "@/contexts/ThemeContext";
import { normalizeProfessionalAppearance, type DashboardSection } from "@/lib/professionalAppearance";

interface DashboardData {
  stats: { totalStudents: number; interestedStudents: number; awaitingRenewalStudents: number; inactiveStudents: number; trainers: number };
  expiringContracts: DashboardRenewalRow[] | null;
  cycleCountdowns: any[];
  trainerMap: Record<string, string>;
}

const renewalFilters = {
  currentMonth: { label: "Este mês", empty: "Nenhuma renovação em aberto neste mês." },
  previousMonth: { label: "Mês passado", empty: "Nenhuma renovação em aberto no mês passado." },
  all: { label: "Todos", empty: "Nenhuma renovação em aberto." },
};

function activeStudentPrescriptionEnrollments() {
  return supabase.from("enrollments")
    .select("id, company_id, student_id, status, start_date, created_at, training_start_date, trainer_id, students!inner(full_name, assigned_trainer_id)")
    .eq("students.status", "active")
    .in("status", OPEN_ENROLLMENT_STATUSES);
}

async function fetchClosingPreview(companyId: string) {
  const [students, leads] = await Promise.all([
    supabase.from("students").select("id, full_name, company_id, status, sales_stage, created_at")
      .eq("company_id", companyId)
      .or("sales_stage.in.(interested,contacted,fiscal_registration_pending,payment_pending,active_onboarding),and(sales_stage.is.null,status.in.(interested,pending))")
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(12),
    supabase.from("leads").select("id, full_name, company_id, stage, created_at")
      .eq("company_id", companyId).is("converted_to_student_id", null)
      .in("stage", ["interested", "contacted", "fiscal_registration", "fiscal_registration_pending"])
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(6),
  ]);
  if (students.error || leads.error) throw students.error ?? leads.error;
  const rows = [
    ...(students.data ?? []).map(row => ({ ...row, key: `student:${row.id}`, step: normalizeSalesStage(row) })),
    ...(leads.data ?? []).map(row => ({ ...row, key: `lead:${row.id}`, step: normalizeLeadSalesStage(row.stage) })),
  ];
  return rows.filter(row => row.company_id === companyId && isOpenFunnelStage(row.step))
    .sort((left, right) => (right.created_at ?? "").localeCompare(left.created_at ?? "") || right.key.localeCompare(left.key))
    .slice(0, 5);
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
  let awaitingRenewalQuery = supabase.from("students").select("*", { count: "exact", head: true }).eq("status", "awaiting_renewal");
  let inactiveQuery = supabase.from("students").select("*", { count: "exact", head: true }).eq("status", "inactive");
  let expiringQuery = supabase.from("enrollments").select("id, student_id, end_date, trainer_id, status, created_at, students!inner(full_name, status), plans(name)")
    .in("status", OPEN_ENROLLMENT_STATUSES)
    .in("students.status", ["active", "pending", "awaiting_renewal"])
    .order("id");

  if (effectiveCompanyId) {
    studentQuery = studentQuery.eq("company_id", effectiveCompanyId);
    interestedQuery = interestedQuery.eq("company_id", effectiveCompanyId);
    awaitingRenewalQuery = awaitingRenewalQuery.eq("company_id", effectiveCompanyId);
    inactiveQuery = inactiveQuery.eq("company_id", effectiveCompanyId);
    expiringQuery = expiringQuery.eq("company_id", effectiveCompanyId).eq("students.company_id", effectiveCompanyId);
  }

  // Trainer count + cycle enrollments in parallel with the others
  let cycleEnrollQuery = activeStudentPrescriptionEnrollments();
  if (effectiveCompanyId) cycleEnrollQuery = cycleEnrollQuery
    .eq("company_id", effectiveCompanyId).eq("students.company_id", effectiveCompanyId);

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

  const [studentRes, interestedRes, awaitingRenewalRes, inactiveRes, expiringContracts, activeEnrollsRes, trainerCount] = await Promise.all([
    studentQuery,
    interestedQuery,
    awaitingRenewalQuery,
    inactiveQuery,
    readPages((from, to) => expiringQuery.range(from, to)),
    cycleEnrollQuery,
    trainerCountPromise,
  ]);

  const failedQuery = [
    ["alunos ativos", studentRes],
    ["interessados", interestedRes],
    ["renovações", awaitingRenewalRes],
    ["alunos inativos", inactiveRes],
    ["ciclos por matrícula", activeEnrollsRes],
  ].find(([, result]) => (result as any)?.error);
  if (failedQuery) {
    const [label, result] = failedQuery;
    throw new Error(`Falha ao carregar ${label}: ${(result as any).error.message}`);
  }

  const stats = {
    totalStudents: studentRes.count || 0,
    interestedStudents: interestedRes.count || 0,
    awaitingRenewalStudents: awaitingRenewalRes.count || 0,
    inactiveStudents: inactiveRes.count || 0,
    trainers: trainerCount,
  };

  const countdowns = await fetchPrescriptionCountdowns(effectiveCompanyId!, activeEnrollsRes.data ?? [], today, renewalDate);

  // Resolve trainer names once
  const allTrainerIds = new Set<string>();
  expiringContracts.forEach(e => { if (e.trainer_id) allTrainerIds.add(e.trainer_id); });
  countdowns.forEach((m: any) => { if (m.trainer_id) allTrainerIds.add(m.trainer_id); });
  const trainerMap: Record<string, string> = {};
  if (allTrainerIds.size > 0) {
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", Array.from(allTrainerIds));
    (profiles || []).forEach((p: any) => { trainerMap[p.user_id] = p.full_name || ""; });
  }

  return { stats, expiringContracts, cycleCountdowns: countdowns, trainerMap };
}

async function fetchPrescriptionCountdowns(companyId: string, activeEnrolls: any[], today: string, renewalDate: string) {
  const businessToday = parseISO(today);
  const countdowns: any[] = [];
  const enrollsWithDate = selectDashboardPrescriptionEnrollments(activeEnrolls, today).filter((e: any) => e.training_start_date);
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

function dashboardDataFromSnapshot(snapshot: CompanyDashboardSnapshot | null | undefined): DashboardData | undefined {
  if (!snapshot) return undefined;
  return {
    stats: {
      totalStudents: Number(snapshot.stats?.totalStudents) || 0,
      interestedStudents: Number(snapshot.stats?.interestedStudents) || 0,
      awaitingRenewalStudents: Number(snapshot.stats?.awaitingRenewalStudents) || 0,
      inactiveStudents: Number(snapshot.stats?.inactiveStudents) || 0,
      trainers: Number(snapshot.stats?.trainers) || 0,
    },
    expiringContracts: readDashboardRenewalQueue(snapshot),
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
  const [renewalFilter, setRenewalFilter] = useState<RenewalPeriod>("currentMonth");
  const [preparingRenewal, setPreparingRenewal] = useState(false);
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
  const canViewClosing = !!effectiveCompanyId && !readOnly && !mine && !permissionsLoading && canAccess("registration");
  const closingPreview = useQuery({
    queryKey: ["dashboard-closing-preview", effectiveCompanyId, user?.id, role],
    queryFn: () => fetchClosingPreview(effectiveCompanyId!),
    enabled: canViewClosing,
  });
  const closingOperations = useCompanyOperations(effectiveCompanyId ?? null, canViewClosing);
  const closingCommercial = useQuery({
    queryKey: ["dashboard-closing-labels", effectiveCompanyId, user?.id, role],
    queryFn: () => fetchCompanyCommercialSettings(effectiveCompanyId!),
    enabled: canViewClosing && closingOperations.data?.version === 0,
  });
  const closingLabels = resolveFunnelStageMeta(closingCommercial.data?.settings.funnel_labels ?? {}, closingOperations.data);
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
        const { data, error } = await activeStudentPrescriptionEnrollments()
          .eq("company_id", companyId).eq("students.company_id", companyId)
          .in("student_id", studentIds.slice(start, start + 100));
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

  const navigateWhenInteractive = (target: string, options?: any) => {
    if (!canOpenStudent) return;
    navigate(target, options);
  };

  const handleRenew = async (contract: DashboardRenewalRow, daysLeft: number) => {
    if (!canRunAdminOperations || !canOpenChat || mine || !effectiveCompanyId || preparingRenewal) return;
    setPreparingRenewal(true);
    try {
      const result = await openDashboardRenewalDraft({
        companyId: effectiveCompanyId,
        contract,
        daysLeft,
        navigate,
        routePrefix: safeRoutePrefix,
        copyDraft: navigator.clipboard?.writeText?.bind(navigator.clipboard),
      });
      if (result === "copied") toast.success("Aluno sem WhatsApp. Mensagem de renovação copiada.");
    } catch (error) {
      toast.error(dashboardErrorMessage(error));
    } finally {
      setPreparingRenewal(false);
    }
  };

  const stats = data?.stats ?? { totalStudents: 0, interestedStudents: 0, awaitingRenewalStudents: 0, inactiveStudents: 0, trainers: 0 };
  const renewalQueueUnavailable = data?.expiringContracts === null;
  const expiringContracts = (data?.expiringContracts ?? []).filter(row => !mine || studentIds.has(row.student_id));
  const cycleCountdowns = ((mine ? myCycles.data : data?.cycleCountdowns) ?? [])
    .filter(row => !row.next_ready && (!mine || studentIds.has(row.student_id)))
    .sort((a, b) => a.days_left - b.days_left);
  const trainerMap = data?.trainerMap ?? {};
  const visibleRenewals = dashboardRenewalsForPeriod(expiringContracts, renewalFilter, day);
  const visibleCycleCountdowns = cycleCountdowns.filter((cycle: any) => (
    cycleFilter === "pending" ? Number(cycle.days_left) >= 0 : cycleFilter === "overdue" ? Number(cycle.days_left) < 0 : true
  ));

  const queueLoading = dashboardLoading || (mine && roster.isLoading);
  const queueError = dashboardError || (mine && roster.error);
  const cycleLoading = mine ? roster.isLoading || myCycles.isLoading || policyPending : dashboardLoading;
  const cycleError = mine ? roster.error || myCycles.error || policyError : dashboardError;

  const { settings: appearanceSettings } = useTheme();
  const { dashboardOrder } = normalizeProfessionalAppearance(appearanceSettings?.professional_appearance);
  const sections: Record<DashboardSection, ReactNode> = {
    indicators: (!mine && <div className="grid grid-cols-2 gap-2 md:col-span-2 lg:grid-cols-4" aria-label="Indicadores da empresa">
          {([
            ["Alunos Ativos", stats.totalStudents, Users, "active"],
            ["Aguardando Renovação", stats.awaitingRenewalStudents, RotateCcw, "awaiting_renewal"],
            ["Alunos Inativos", stats.inactiveStudents, UserX, "inactive"],
            ["Treinadores", stats.trainers, TrendingUp, null],
          ] as const).map(([label, value, Icon, status]) => {
            const content = <>
              <span className="shrink-0 rounded-full bg-muted p-2"><Icon aria-hidden="true" className="h-4 w-4 text-primary" /></span>
              <span className="min-w-0">
                <span className="block text-lg font-semibold leading-tight">{dashboardLoading || dashboardError || !data ? "—" : value}</span>
                <span className="block text-xs text-muted-foreground">{label}</span>
              </span>
            </>;
            const className = "flex min-w-0 items-center gap-2 rounded-xl border border-border bg-card p-2.5 text-left";
            return status && canOpenStudent
              ? <Link key={label} to={`/${safeRoutePrefix}/students?status=${status}`} className={`${className} hover:border-primary/50`}>{content}</Link>
              : <div key={label} className={className}>{content}</div>;
          })}
        </div>),
    interested: (!mine && <DashboardCard title="Interessados" icon={UserPlus}>
            {canViewClosing ? <>
              {closingPreview.data?.length ? <ul className="max-h-56 divide-y overflow-auto" aria-label="Fases da esteira">
                {closingPreview.data.map(row => <li key={row.key} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 break-words font-medium">{row.full_name}</span>
                  <span className="text-right text-xs text-muted-foreground">{closingLabels[row.step].shortLabel}</span>
                </li>)}
              </ul> : <DashboardQueueState loading={closingPreview.isLoading} error={closingPreview.error}
                empty="Nenhuma pessoa nas etapas abertas da esteira." />}
              <Link className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
                to={`/${safeRoutePrefix}/registration`}>Ver mais</Link>
            </> : !data || dashboardError ? <DashboardQueueState loading={dashboardLoading} error={dashboardError}
              empty="Selecione uma empresa para consultar os interessados." />
              : <p className="text-sm text-muted-foreground">{stats.interestedStudents} contatos iniciais</p>}
          </DashboardCard>),
    firstTraining: (mine && <FirstTrainingDashboardCard scope={operationalScope} students={roster.data ?? []}
            routePrefix={safeRoutePrefix} allowStudentNavigation={canOpenStudent} rosterLoading={roster.isLoading} rosterError={roster.error} />),
    prescriptions: (<Card className="bg-card border-border">
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
          </Card>),
    renewals: (<Card className="bg-card border-border">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-primary text-xl flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />Renovações
                </CardTitle>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar renovações">
                  {(Object.keys(renewalFilters) as RenewalPeriod[]).map(value => (
                    <Button key={value} type="button" size="sm" variant={renewalFilter === value ? "default" : "outline"} aria-pressed={renewalFilter === value} className="h-7 px-2 text-xs" onClick={() => setRenewalFilter(value)}>{renewalFilters[value].label}</Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!queueLoading && !queueError && renewalQueueUnavailable ? (
                <p role="alert" className="py-3 text-sm text-destructive">
                  Renovações indisponíveis nesta versão dos dados. Atualize a página e tente novamente.
                </p>
              ) : !queueLoading && !queueError && visibleRenewals.length > 0 ? (
                <div className="space-y-3 max-h-[250px] overflow-auto">
                  {visibleRenewals.map(({ contract, daysLeft }) => {
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
                              disabled={preparingRenewal}
                              onClick={(e) => { e.stopPropagation(); void handleRenew(contract, daysLeft); }}
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
                <DashboardQueueState loading={queueLoading} error={queueError} empty={renewalFilters[renewalFilter].empty} />
              )}
            </CardContent>
          </Card>),
    workoutFeedback: (<WorkoutFeedbackDashboardCard scope={operationalScope} routePrefix={safeRoutePrefix} allowStudentNavigation={canOpenStudent} allowWhatsApp={canOpenChat && (!readOnly || mine)} />),
    contactCadence: (<OperationalContactCadenceCard scope={canOpenChat ? mine ? assignedScope : actorScope : null}
            routePrefix={safeRoutePrefix} allowChat={!readOnly || mine} />),
    assessments: (!mine && <AssessmentDashboardCard scope={operationalScope} routePrefix={safeRoutePrefix} allowChat={canOpenChat} />),
    cycleFeedback: (!mine && role !== "coordinator" && <PendingFeedbackCard companyId={effectiveCompanyId} routePrefix={safeRoutePrefix} readOnly={readOnly} />),
    birthdays: (<DashboardAlerts section="birthdays" readOnly={readOnly} studentIds={mine ? studentIds : undefined}
            birthdayLoading={readOnly ? queueLoading : mine && roster.isLoading}
            birthdayError={readOnly ? queueError : mine && roster.error}
            allowStudentNavigation={canOpenStudent} allowBirthdayMessage={canOpenChat} />),
    enrollmentQueue: (!mine && includeCoordinatorPanels && operationalExtras && <details className="md:col-span-2 rounded-xl border border-border bg-card">
          <summary className="cursor-pointer p-4 text-sm font-semibold text-primary">Fila de matrículas</summary>
          <div className="overflow-x-auto p-4 pt-0">{operationalExtras}</div>
        </details>),
  };

  return (
    <>
      <DashboardSnapshotContext.Provider value={readOnly ? snapshotData ?? null : null}>
      <div className="space-y-6">
        <div role="group" aria-label="Carteira do dashboard" className="flex flex-wrap justify-end gap-2">
          {([["all", "Todos os alunos"], ["mine", "Meus alunos"]] as const).map(([value, label]) => (
            <Button key={value} type="button" size="sm" variant={view === value ? "default" : "outline"}
              aria-pressed={view === value} disabled={value === "mine" && !actorScope}
              onClick={() => setView(value)}>{label}</Button>
          ))}
        </div>

        {(readOnly || isViewingCompany || subtitle || title !== "DASHBOARD") && <div>
          {(readOnly || title !== "DASHBOARD") && <h1 className="text-4xl text-primary">{title}</h1>}
          {(subtitle || isViewingCompany) && <p className="text-muted-foreground font-sans">
            {subtitle ?? `Visualizando: ${viewingCompany?.name}`}
          </p>}
          {readOnly && !mine && (
            <p className="mt-1 text-xs text-muted-foreground font-sans">
              Visualização completa da empresa. Ações administrativas permanecem restritas a admin/coordenador.
            </p>
          )}
        </div>}

        {dashboardError && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-destructive">Não foi possível carregar os indicadores do painel.</p>
              <p className="mt-1 text-xs text-muted-foreground">{dashboardErrorMessage(dashboardError)}</p>
            </CardContent>
          </Card>
        )}

        <div className="sett-dashboard-grid grid grid-cols-1 items-start gap-3 md:grid-cols-2">
          {dashboardOrder.map(id => <Fragment key={id}>{sections[id]}</Fragment>)}
        </div>
      </div>
      </DashboardSnapshotContext.Provider>
    </>
  );
}
