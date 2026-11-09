import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { ClipboardList, Dumbbell, MessageCircle, type LucideIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { requestWhatsAppChatPanel } from "@/lib/whatsappChatPanel";
import { openStudentChat } from "@/lib/studentChat";
import { hasWorkoutExercises } from "@/lib/workoutPresence";
import { normalizeSalesStage } from "@/lib/salesFunnelView";

import { readForIds, readPages, type Page } from "@/lib/pagedRead";
import { OPEN_ENROLLMENT_STATUSES, PORTFOLIO_TRAINER_COLUMN } from "@/lib/studentRoster";
import { ENROLLMENT_HISTORY_BY_PLAN_LABEL } from "@/lib/companyDashboardSnapshot";
import { readEnrollmentHistoryByPlan } from "@/lib/studentRosterReads";

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
  cycles: { id: string; status: string | null }[],
  materializedCycleIds: ReadonlySet<string>,
  bundles: { training_cycle_id: string | null; status: string | null }[],
  hasPublishedCardio = false,
) {
  if (hasPublishedCardio) return true;
  const linked = new Set(bundles.filter(bundle => !["generating", "draft", "failed"].includes(bundle.status ?? ""))
    .map(bundle => bundle.training_cycle_id));
  const published = new Set(bundles.filter(bundle => bundle.status === "active" || bundle.status === "scheduled").map(bundle => bundle.training_cycle_id));
  return cycles.some(cycle => materializedCycleIds.has(cycle.id) && (
    published.has(cycle.id)
    || (!linked.has(cycle.id) && (cycle.status === "active" || cycle.status === "completed" || cycle.status === "superseded"))
  ));
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
        readForIds(ids, (batch, from, to) => supabase.from("training_cycles").select("id, student_id, status")
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
      return ids.filter(id => !published.has(id)).map(id => ({ id, dueOn: dueByStudent.get(id) }));
    },
  });
  const queued = new Map(query.data?.map(row => [row.id, row.dueOn]));
  const rows = students.filter(student => queued.has(student.id)).map(student => ({ ...student, dueOn: queued.get(student.id) }))
    .sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));
  return <DashboardCard title="Primeiros treinos" icon={Dumbbell}>
    {rows.length && !query.error && !rosterError ? <div className="max-h-72 space-y-2 overflow-auto">{rows.map(student =>
      <QueueRow key={student.id} name={student.full_name} detail={student.dueOn
        ? `Primeira prescrição até ${format(parseISO(student.dueOn), "dd/MM")}` : "Aguardando primeira publicação"}
        to={allowStudentNavigation ? `/${routePrefix}/students/${student.id}?tab=prescricao` : undefined} action="Abrir treino" />,
    )}</div> : <DashboardQueueState loading={rosterLoading || query.isLoading} error={rosterError || query.error}
      empty="Nenhum primeiro treino pendente na sua carteira." />}
  </DashboardCard>;
}

export function WorkoutFeedbackDashboardCard({ scope, routePrefix, allowStudentNavigation }: { scope: Scope | null; routePrefix: string; allowStudentNavigation: boolean }) {
  const query = useQuery({
    queryKey: ["dashboard-workout-feedback", scope],
    enabled: Boolean(scope),
    queryFn: async () => {
      const { companyId, studentIds } = scope!;
      const page = (from: number, to: number, ids?: string[]) => {
        let request = supabase.from("workout_feedback").select("id, student_id, workout_title, created_at, students(full_name)")
          .eq("company_id", companyId).is("trainer_replied_at", null);
        if (ids) request = request.in("student_id", ids);
        return request.order("created_at", { ascending: false }).order("id").range(from, to);
      };
      const rows = studentIds ? await readForIds(studentIds, (ids, from, to) => page(from, to, ids)) : await readPages(page);
      return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
  });
  return <DashboardCard title="Feedbacks de treino" icon={MessageCircle}>
    {query.data?.length && !query.error ? <div className="max-h-72 space-y-2 overflow-auto">{query.data.map(row =>
      <QueueRow key={row.id} name={row.students?.full_name ?? "Aluno"} detail={`${row.workout_title ?? "Treino"} · ${format(parseISO(row.created_at), "dd/MM")} · sem resposta`}
        to={allowStudentNavigation ? `/${routePrefix}/students/${row.student_id}?tab=analytics` : undefined} action="Ver feedback" />,
    )}</div> : <DashboardQueueState loading={query.isLoading} error={query.error}
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

export function OperationalContactCadenceCard({ scope, routePrefix }: { scope: Scope | null; routePrefix: string }) {
  const query = useQuery({
    queryKey: ["dashboard-operational-cadence", scope],
    enabled: Boolean(scope),
    queryFn: async () => {
      const { companyId, studentIds } = scope!;
      const page = (from: number, to: number, ids?: string[]) => contactCadenceClient
        .rpc("operational_contact_cadence_status", { _company_id: companyId, _student_ids: ids })
        .order("chat_id").range(from, to);
      return studentIds ? readForIds(studentIds, (ids, from, to) => page(from, to, ids)) : readPages(page);
    },
  });
  return <DashboardCard title="Cadência de contatos" icon={MessageCircle}>
    {!scope || query.isLoading || query.error ? <DashboardQueueState loading={query.isLoading} error={query.error}
      empty="A cadência precisa de acesso às mensagens da equipe." /> : <div className="space-y-2">
      {([["unanswered", "Sem resposta há 24h"], ["without_team_message", "Sem mensagem da equipe há 7 dias"]] as const).map(([key, label]) => {
        const waitingSince = (row: OperationalCadenceRow) => (key === "unanswered"
          ? row.first_unanswered_at : row.last_team_message_at ?? row.chat_created_at ?? row.first_unanswered_at) ?? "";
        const rows = query.data?.filter(row => row[key] === true)
          .sort((a, b) => Date.parse(waitingSince(a)) - Date.parse(waitingSince(b))) ?? [];
        return <details key={key} className="rounded-lg border border-border bg-secondary/40 p-3">
          <summary className="cursor-pointer text-sm font-medium">{label} · {rows.length}</summary>
          <div className="mt-2 max-h-56 space-y-1 overflow-auto">
            {rows.map(row => <Link key={row.chat_id} className="block rounded px-2 py-1 text-sm text-primary hover:bg-muted"
              to={`/${routePrefix}/whatsapp-chat`} state={{ chatId: row.chat_id }}
              onClick={event => {
                if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && requestWhatsAppChatPanel({ chatId: row.chat_id })) event.preventDefault();
              }}>{row.student_name || row.contact_name || "Contato sem nome"}</Link>)}
          </div>
        </details>;
      })}
    </div>}
  </DashboardCard>;
}

export function AssignedDashboardInsights({ scope }: { scope: Scope | null }) {
  const query = useQuery({
    queryKey: ["dashboard-assigned-insights", scope],
    enabled: Boolean(scope),
    queryFn: async () => {
      const { companyId, studentIds = [] } = scope!;
      const [feedback, plans] = await Promise.all([
        readForIds(studentIds, (ids, from, to) => supabase.from("cycle_feedback").select("nps")
          .eq("company_id", companyId).in("student_id", ids).not("nps", "is", null).order("id").range(from, to)),
        readEnrollmentHistoryByPlan(companyId, studentIds),
      ]);
      const scores = feedback.map(row => row.nps).filter(score => score != null && score >= 0 && score <= 10);
      const netPromoters = scores.reduce((net, score) => net + (score >= 9 ? 1 : score <= 6 ? -1 : 0), 0);
      return { nps: scores.length ? Math.round(100 * netPromoters / scores.length) : null,
        responses: scores.length, plans };
    },
  });
  if (!query.data || query.error) return <DashboardQueueState loading={query.isLoading} error={query.error}
    empty="Resumo da carteira indisponível." />;
  return <div className="space-y-2 text-sm">
    <p>{query.data.nps == null ? "Sem respostas de NPS na carteira." : `NPS ${query.data.nps} · ${query.data.responses} respostas de fim de ciclo`}</p>
    <h3 className="font-medium text-primary">{ENROLLMENT_HISTORY_BY_PLAN_LABEL}</h3>
    {query.data.plans.length ? <ul className="space-y-1 text-muted-foreground">
      {query.data.plans.map(({ name, count }) => <li key={name}>{name} · {count}</li>)}
    </ul> : <p className="text-muted-foreground">Nenhuma matrícula registrada.</p>}
  </div>;
}
