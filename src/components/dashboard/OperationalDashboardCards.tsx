import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { ClipboardList, Dumbbell, MessageCircle, type LucideIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { WhatsAppChatPanelContext } from "@/components/WhatsAppChatPanelContext";
import { requestWhatsAppChatPanel } from "@/lib/whatsappChatPanel";
import { openStudentChat } from "@/lib/studentChat";
import { hasWorkoutExercises } from "@/lib/workoutPresence";
import { normalizeSalesStage } from "@/lib/salesFunnelView";

import { readForIds, readPages, type Page } from "@/lib/pagedRead";
import { OPEN_ENROLLMENT_STATUSES, PORTFOLIO_TRAINER_COLUMN } from "@/lib/studentRoster";
import { dashboardFeedbackAction, readDashboardFeedbackOrigins } from "@/lib/dashboardFeedback";

type Scope = { companyId: string; actorId: string; role: string; studentIds?: string[] };

async function readCompletedAssessments(companyId: string, studentIds: string[]) {
  const rows = await readForIds(studentIds, (ids, from, to) => supabase.from("functional_assessments")
    .select("student_id").eq("company_id", companyId).eq("status", "completed")
    .in("student_id", ids).order("id").range(from, to));
  return new Set(rows.map(row => row.student_id));
}

export function useAssignedDashboardStudents(scope: Scope | null) {
  return useQuery({
    queryKey: ["dashboard-assigned-students", scope],
    enabled: Boolean(scope),
    queryFn: async () => {
      const { companyId, actorId } = scope!;
      // The operational view is the current portfolio without inactive registrations.
      return readPages((from, to) => supabase.from("students").select("id, full_name")
        .eq("company_id", companyId).eq(PORTFOLIO_TRAINER_COLUMN, actorId).neq("status", "inactive")
        .order("id").range(from, to));
    },
  });
}

export function DashboardCard({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  return <Card className="min-w-0 bg-card border-border">
    <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg text-primary">
      <Icon className="h-5 w-5 shrink-0" />{title}
    </CardTitle></CardHeader>
    <CardContent>{children}</CardContent>
  </Card>;
}

export function DashboardQueueState({ loading, error, empty }: { loading?: boolean; error?: unknown; empty: string }) {
  if (loading) return <p role="status" className="py-3 text-sm text-muted-foreground">Carregando…</p>;
  if (error) return <p role="alert" className="py-3 text-sm text-destructive">Não foi possível consultar esta fila.</p>;
  return <p className="py-3 text-sm text-muted-foreground">{empty}</p>;
}

const actionClass = buttonVariants({ size: "sm", variant: "outline" });

function QueueRow({ name, detail, to, action, onAction }: { name: string; detail: string; to?: string; action?: string; onAction?: () => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-secondary/40 p-3">
    <div className="min-w-0"><p className="break-words text-sm font-medium">{name}</p><p className="text-xs text-muted-foreground">{detail}</p></div>
    {to && <Link className={actionClass} to={to}>{action}</Link>}
    {onAction && <Button type="button" variant="outline" size="sm" onClick={onAction}>{action}</Button>}
  </div>;
}

export function AssessmentDashboardCard({ scope, routePrefix, allowChat }: { scope: Scope | null; routePrefix: string; allowChat: boolean }) {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["dashboard-assessment-queue", scope],
    enabled: Boolean(scope),
    queryFn: async () => {
      const { companyId } = scope!;
      const students = (await readPages((from, to) => supabase.from("students")
        .select("id, full_name, status, sales_stage, onboarding_instructions_sent_at, assessment_material_receipts(assessment_due_on)")
        .eq("company_id", companyId).eq("sales_stage", "active_onboarding").order("id").range(from, to)))
        .filter(student => normalizeSalesStage(student) === "active_onboarding");
      const ids = students.map(student => student.id);
      const [assessed, anamneses] = await Promise.all([
        readCompletedAssessments(companyId, ids),
        readForIds(ids, (batch, from, to) => supabase.from("student_anamneses").select("student_id")
          .eq("company_id", companyId).in("student_id", batch).order("id").range(from, to)),
      ]);
      const answered = new Set(anamneses.map(row => row.student_id));
      return students.filter(student => !assessed.has(student.id))
        .map(student => ({ ...student, hasAnamnesis: answered.has(student.id) }))
        .sort((a, b) => (a.assessment_material_receipts?.assessment_due_on ?? "9999")
          .localeCompare(b.assessment_material_receipts?.assessment_due_on ?? "9999"));
    },
  });
  return <DashboardCard title="Aguardando avaliação" icon={ClipboardList}>
    {query.data?.length && !query.error ? <div className="max-h-72 space-y-2 overflow-auto">{query.data.map(student =>
      <QueueRow key={student.id} name={student.full_name}
        detail={[
          student.hasAnamnesis ? "Anamnese registrada" : "Anamnese pendente",
          student.onboarding_instructions_sent_at ? "Instruções enviadas" : "Instruções pendentes",
          student.assessment_material_receipts
            ? `Avaliação até ${format(parseISO(student.assessment_material_receipts.assessment_due_on), "dd/MM")}`
            : "Aguardando material",
        ].filter(Boolean).join(" · ")}
        action="Ver avaliação" onAction={allowChat && scope ? () => {
          void openStudentChat({
            navigate, routePrefix, companyId: scope.companyId, studentId: student.id,
            message: "",
            onNoChat: () => toast.error("O aluno ainda não tem conversa ou telefone cadastrado."),
          }).catch(() => toast.error("Não foi possível abrir a conversa da avaliação."));
        } : undefined} />,
    )}</div> : <DashboardQueueState loading={query.isLoading} error={query.error}
      empty={scope ? "Nenhuma avaliação pendente no onboarding." : "A fila de avaliações está disponível no painel operacional da empresa."} />}
  </DashboardCard>;
}

export function hasPublishedFirstTraining(
  cycles: { id: string; status: string | null; bundle_id?: string | null; delivery_status?: string | null;
    prescribed_offline_at?: string | null; prescription_cleared_at?: string | null }[],
  materializedCycleIds: ReadonlySet<string>,
  bundles: { id?: string; training_cycle_id: string | null; status: string | null }[],
  hasPublishedCardio = false,
) {
  if (hasPublishedCardio) return true;
  return cycles.some(cycle => {
    if (cycle.prescription_cleared_at || !materializedCycleIds.has(cycle.id)) return false;
    const linked = bundles.filter(bundle => bundle.training_cycle_id === cycle.id);
    if (linked.some(bundle => (!cycle.bundle_id || bundle.id === cycle.bundle_id)
      && ["active", "scheduled", "completed"].includes(bundle.status ?? ""))) return true;
    if (cycle.bundle_id || cycle.prescribed_offline_at) return false;
    if (linked.length) return ["sent", "viewed", "delivered", "published"].includes(cycle.delivery_status ?? "");
    // Pre-bundle publication evidence is the materialized workout in a live or
    // historical cycle. Offline-only records cannot satisfy the digital queue.
    return ["active", "completed", "superseded"].includes(cycle.status ?? "");
  });
}

export function FirstTrainingDashboardCard({ scope, students, routePrefix, allowStudentNavigation, rosterLoading, rosterError }: {
  scope: Scope | null; students: { id: string; full_name: string }[]; routePrefix: string; allowStudentNavigation: boolean; rosterLoading: boolean; rosterError: unknown;
}) {
  const query = useQuery({
    queryKey: ["dashboard-first-training", scope],
    enabled: Boolean(scope),
    staleTime: 0,
    queryFn: async () => {
      const { companyId, studentIds = [] } = scope!;
      const enrollments = await readForIds(studentIds, (batch, from, to) => supabase.from("enrollments").select("student_id")
        .eq("company_id", companyId).in("student_id", batch).in("status", OPEN_ENROLLMENT_STATUSES).order("id").range(from, to));
      const enrolled = [...new Set(enrollments.map(row => row.student_id))];
      const assessed = await readCompletedAssessments(companyId, enrolled);
      const ids = enrolled.filter(id => assessed.has(id));
      const [cycles, bundles, runningPlans, receipts] = await Promise.all([
        readForIds(ids, (batch, from, to) => supabase.from("training_cycles").select("id, student_id, status, bundle_id, delivery_status, prescribed_offline_at, prescription_cleared_at")
          .eq("company_id", companyId).in("student_id", batch).order("id").range(from, to)),
        readForIds(ids, (batch, from, to) => supabase.from("prescription_bundles").select("id, student_id, training_cycle_id, running_plan_id, status")
          .eq("company_id", companyId).in("student_id", batch).order("id").range(from, to)),
        readForIds(ids, (batch, from, to) => supabase.from("running_plans").select("id, bundle_id, student_id, weeks, status")
          .eq("company_id", companyId).in("student_id", batch).in("status", ["active", "scheduled", "completed"]).order("id").range(from, to)),
        readForIds(ids, (batch, from, to) => supabase.from("assessment_material_receipts").select("student_id, first_prescription_due_on")
          .eq("company_id", companyId).in("student_id", batch).order("student_id").range(from, to)),
      ]);
      const workouts = await readForIds(cycles.map(cycle => cycle.id), (batch, from, to) => supabase.from("workouts").select("cycle_id, exercises")
        .in("cycle_id", batch).order("id").range(from, to));
      const materialized = new Set(workouts.filter(hasWorkoutExercises).map(workout => workout.cycle_id));
      const published = new Set(ids.filter(id => {
        const studentBundles = bundles.filter(bundle => bundle.student_id === id);
        const hasPublishedCardio = runningPlans.some(plan => plan.student_id === id
          && isPublishedFirstCardioPlan(plan, studentBundles));
        return hasPublishedFirstTraining(cycles.filter(cycle => cycle.student_id === id), materialized, studentBundles, hasPublishedCardio);
      }));
      const dueByStudent = new Map(receipts.map(receipt => [receipt.student_id, receipt.first_prescription_due_on]));
      const offlineStudents = new Set(cycles.filter(cycle => cycle.prescribed_offline_at && !cycle.prescription_cleared_at)
        .map(cycle => cycle.student_id));
      return ids.filter(id => !published.has(id)).map(id => ({
        id, dueOn: dueByStudent.get(id), offline: offlineStudents.has(id),
      }));
    },
  });
  const queued = new Map(query.data?.map(row => [row.id, row]));
  const rows = students.flatMap(student => {
    const row = queued.get(student.id);
    return row ? [{ ...student, ...row }] : [];
  }).sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));
  return <DashboardCard title="Primeiros treinos" icon={Dumbbell}>
    {rows.length && !query.error && !rosterError ? <div className="max-h-72 space-y-2 overflow-auto">{rows.map(student =>
      <QueueRow key={student.id} name={student.full_name} detail={[
        student.dueOn ? `Primeira prescrição digital até ${format(parseISO(student.dueOn), "dd/MM")}` : "Aguardando primeira publicação digital",
        student.offline && "Prescrição fora do app registrada",
      ].filter(Boolean).join(" · ")}
        to={allowStudentNavigation ? `/${routePrefix}/students/${student.id}?tab=prescricao` : undefined} action="Abrir treino" />,
    )}</div> : <DashboardQueueState loading={rosterLoading || query.isLoading} error={rosterError || query.error}
      empty="Nenhum primeiro treino pendente na sua carteira." />}
  </DashboardCard>;
}

export function WorkoutFeedbackDashboardCard({ scope, routePrefix, allowStudentNavigation, allowWhatsApp }: {
  scope: Scope | null; routePrefix: string; allowStudentNavigation: boolean; allowWhatsApp?: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["dashboard-workout-feedback", scope],
    enabled: Boolean(scope),
    queryFn: async () => {
      const { companyId, studentIds } = scope!;
      const page = (from: number, to: number, ids?: string[]) => {
        let request = supabase.from("workout_feedback").select("id, student_id, workout_title, created_at, pain_areas, students(full_name)")
          .eq("company_id", companyId).is("trainer_replied_at", null);
        if (ids) request = request.in("student_id", ids);
        return request.order("created_at", { ascending: false }).order("id").range(from, to);
      };
      const rows = studentIds ? await readForIds(studentIds, (ids, from, to) => page(from, to, ids)) : await readPages(page);
      return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
  });
  const feedbackIds = query.data?.map(row => row.id) ?? [];
  const originKey = ["dashboard-workout-feedback-origins", scope, feedbackIds];
  const origins = useQuery({
    queryKey: originKey,
    enabled: Boolean(scope && feedbackIds.length),
    queryFn: async () => {
      const rows = [];
      for (let from = 0; from < feedbackIds.length; from += 100) {
        rows.push(...await readDashboardFeedbackOrigins(scope!.companyId, feedbackIds.slice(from, from + 100)));
      }
      return rows;
    },
  });
  const byFeedback = new Map(!origins.error
    ? origins.data?.map(origin => [origin.feedback_id, origin]) : undefined);
  const acknowledge = useMutation({
    mutationFn: async (feedbackId: string) => {
      if (!scope || !allowWhatsApp) throw new Error("Acesso ao WhatsApp indisponível.");
      const result = await dashboardFeedbackAction("acknowledge-workout-feedback", scope.companyId, feedbackId);
      if (result?.reviewed !== true) throw new Error("Revisão ainda não confirmada.");
    },
    onError: (error) => toast.error(error.message),
    onSuccess: () => toast.success("Curtida aceita pelo provedor. Feedback revisado."),
    onSettled: () => queryClient.invalidateQueries({ queryKey: originKey, exact: true }),
  });
  const reply = useMutation({
    mutationFn: async (row: { id: string; student_id: string }) => {
      if (!scope || !allowWhatsApp) throw new Error("Acesso ao WhatsApp indisponível.");
      const result = await dashboardFeedbackAction("workout-feedback-origin", scope.companyId, row.id);
      if (!result?.chatId || result.studentId !== row.student_id) throw new Error("Mensagem original indisponível.");
      return { companyId: scope.companyId, chatId: result.chatId, studentId: row.student_id, dashboardFeedbackId: row.id };
    },
    onSuccess: (request) => {
      if (!requestWhatsAppChatPanel(request)) navigate(`/${routePrefix}/whatsapp-chat`, { state: request });
    },
    onError: (error) => toast.error(error.message),
  });
  const rows = query.data?.filter(row => !byFeedback.get(row.id)?.reviewed_at);
  return <DashboardCard title="Feedbacks de treino" icon={MessageCircle}>
    {rows?.length && !query.error ? <div className="max-h-72 space-y-2 overflow-auto">{rows.map(row => {
      const origin = byFeedback.get(row.id);
      const adjustment = origin?.needs_adjustment || (Array.isArray(row.pain_areas) && row.pain_areas.length > 0);
      const originStatus = origins.isLoading ? "Verificando origem"
        : origins.error ? "Origem do WhatsApp indisponível"
        : "Sem mensagem original vinculada no WhatsApp";
      const detail = [
        row.workout_title ?? "Treino",
        format(parseISO(row.created_at), "dd/MM"),
        adjustment ? "Ajuste pendente" : origin?.reaction_attempted_at ? "Curtida aguardando conciliação" : "Sem resposta",
        !origin?.has_original && originStatus,
      ].filter(Boolean).join(" · ");
      return <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-secondary/40 p-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium">{row.students?.full_name ?? "Aluno"}</p>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {origin?.has_original && allowWhatsApp ? <>
            <Button type="button" variant="outline" size="sm" disabled={reply.isPending} onClick={() => reply.mutate(row)}>Responder</Button>
            <Button type="button" variant="outline" size="sm" disabled={acknowledge.isPending || adjustment || !!origin.reaction_attempted_at}
              onClick={() => acknowledge.mutate(row.id)}>OK</Button>
          </> : allowStudentNavigation && <Link className={actionClass}
            to={`/${routePrefix}/students/${row.student_id}?tab=analytics`}>Ver feedback</Link>}
        </div>
      </div>;
    })}</div> : <DashboardQueueState loading={query.isLoading} error={query.error}
      empty={scope ? "Nenhum feedback de treino aguardando resposta." : "O resumo da empresa não inclui feedbacks por treino."} />}
  </DashboardCard>;
}

export function isPublishedFirstCardioPlan(
  plan: { id: string; bundle_id: string | null; weeks: unknown; status: string | null },
  bundles: { id: string; running_plan_id: string | null; status: string | null }[],
) {
  if (!Array.isArray(plan.weeks) || plan.weeks.length === 0
    || !["active", "scheduled", "completed"].includes(plan.status ?? "")) return false;
  const linked = bundles.filter(bundle => plan.bundle_id ? bundle.id === plan.bundle_id : bundle.running_plan_id === plan.id);
  if (plan.bundle_id || linked.length > 0) {
    return linked.some(bundle => bundle.status === "active" || bundle.status === "scheduled" || bundle.status === "completed");
  }
  return plan.status === "active" || plan.status === "completed";
}

type OperationalCadenceRow = {
  chat_id: string;
  contact_name: string | null;
  student_id: string | null;
  student_name: string | null;
  first_unanswered_at: string | null;
  last_team_message_at: string | null;
  chat_created_at: string | null;
  unanswered: boolean;
  without_team_message: boolean;
};

const contactCadenceClient = supabase as unknown as {
  rpc(name: "operational_contact_cadence_status", args: { _company_id: string; _student_ids?: string[] }): {
    order(column: "chat_id"): { range(from: number, to: number): Page<OperationalCadenceRow> };
  };
};

export function OperationalContactCadenceCard({ scope, routePrefix, allowChat = true }: { scope: Scope | null; routePrefix: string; allowChat?: boolean }) {
  const [filter, setFilter] = useState<"all" | "unanswered" | "without_team_message">("all");
  const [realtimeUnavailable, setRealtimeUnavailable] = useState(false);
  const companyId = scope?.companyId;
  const actorId = scope?.actorId;
  const queryClient = useQueryClient();
  const isChatOpen = useContext(WhatsAppChatPanelContext)?.isChatPanelOpen ?? false;
  const wasChatOpen = useRef(false);
  const query = useQuery({
    queryKey: ["dashboard-operational-cadence", companyId, scope],
    enabled: Boolean(scope),
    refetchInterval: realtimeUnavailable ? 30_000 : false,
    queryFn: async () => {
      const { companyId, studentIds } = scope!;
      const page = (from: number, to: number, ids?: string[]) => contactCadenceClient
        .rpc("operational_contact_cadence_status", { _company_id: companyId, _student_ids: ids })
        .order("chat_id").range(from, to);
      return studentIds ? readForIds(studentIds, (ids, from, to) => page(from, to, ids)) : readPages(page);
    },
  });
  useEffect(() => {
    if (!companyId || !actorId) return;
    const refreshKey = ["dashboard-operational-cadence", companyId];
    let pendingRefresh: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    let reconnecting = false;
    const refreshFromMessage = (message: Record<string, unknown>, updated: boolean) => {
      if (message.company_id !== companyId || message.type === "reaction") return;
      const hasOutgoingIdentity = message.is_from_me === true && Boolean(message.sender_id) && Boolean(message.message_id_external);
      const confirmedOutgoing = hasOutgoingIdentity && !message.failed_at
        && (["sent", "delivered", "read"].includes(String(message.status))
          || (message.status === "accepted" && ["SERVER_ACK", "SENT"].includes(String(message.provider_status))
            && Boolean(message.provider_status_at)));
      const failedOutgoing = updated && hasOutgoingIdentity && (message.status === "failed" || Boolean(message.failed_at));
      if (message.is_from_me !== false && !confirmedOutgoing && !failedOutgoing) return;

      // The RPC decides if a row is eligible and computes the business deadlines.
      if (pendingRefresh !== undefined) return;
      pendingRefresh = setTimeout(() => {
        pendingRefresh = undefined;
        void queryClient.invalidateQueries({ queryKey: refreshKey });
      }, 350);
    };
    const messageFilter = { schema: "public", table: "whatsapp_messages", filter: `company_id=eq.${companyId}` };
    const channel = supabase.channel(`dashboard-cadence:${companyId}:${actorId}`, { config: { private: true } })
      .on("postgres_changes", { ...messageFilter, event: "INSERT" }, ({ new: message }) => refreshFromMessage(message, false))
      .on("postgres_changes", { ...messageFilter, event: "UPDATE" }, ({ new: message }) => refreshFromMessage(message, true))
      .subscribe(status => {
        if (!active) return;
        if (status === "SUBSCRIBED") {
          setRealtimeUnavailable(false);
          if (reconnecting) void queryClient.invalidateQueries({ queryKey: refreshKey });
          reconnecting = false;
        } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
          reconnecting = true;
          setRealtimeUnavailable(true);
        }
      });

    return () => {
      active = false;
      clearTimeout(pendingRefresh);
      void supabase.removeChannel(channel);
    };
  }, [companyId, actorId, queryClient]);

  useEffect(() => {
    // Re-read on return from the panel even if the realtime connection dropped.
    if (wasChatOpen.current && !isChatOpen && companyId) {
      void queryClient.invalidateQueries({ queryKey: ["dashboard-operational-cadence", companyId] });
    }
    wasChatOpen.current = isChatOpen;
  }, [companyId, isChatOpen, queryClient]);

  const waitingSince = (row: OperationalCadenceRow) => Date.parse(
    (filter !== "without_team_message" && row.unanswered && row.first_unanswered_at)
    || row.last_team_message_at || row.chat_created_at || row.first_unanswered_at || "",
  );
  const rows = (query.data ?? []).filter(row => filter === "all" ? row.unanswered || row.without_team_message : row[filter])
    .sort((a, b) => waitingSince(a) - waitingSince(b));

  return <DashboardCard title="Cadência de contatos" icon={MessageCircle}>
    {!scope || query.isLoading || query.error ? <DashboardQueueState loading={query.isLoading} error={query.error}
      empty="A cadência precisa de acesso às mensagens da equipe." /> : <div className="space-y-2">
      <div role="group" aria-label="Filtrar cadência de contatos" className="flex flex-wrap gap-1.5">
        {([["all", "Todas"], ["unanswered", "Sem resposta há 24h"], ["without_team_message", "Sem mensagem há 7 dias"]] as const)
          .map(([value, label]) => <Button key={value} type="button" size="sm" variant={filter === value ? "default" : "outline"}
            aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</Button>)}
      </div>
      {rows.length ? <div className="max-h-56 space-y-2 overflow-auto">{rows.map(row =>
        <div key={row.chat_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-secondary/40 p-3">
          <div className="min-w-0">
            <p className="break-words text-sm font-medium">{row.student_name || row.contact_name || "Contato sem nome"}</p>
            <p className="text-xs text-muted-foreground">
              {[row.unanswered && "Sem resposta há 24h", row.without_team_message && "Sem mensagem da equipe há 7 dias"].filter(Boolean).join(" · ")}
            </p>
          </div>
          {allowChat && <Link className={actionClass} to={`/${routePrefix}/whatsapp-chat`} state={{ chatId: row.chat_id }} onClick={event => {
            if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && requestWhatsAppChatPanel({ chatId: row.chat_id })) event.preventDefault();
          }}>Abrir conversa</Link>}
        </div>)}</div> : <DashboardQueueState empty="Nenhum contato neste filtro." />}
    </div>}
  </DashboardCard>;
}
