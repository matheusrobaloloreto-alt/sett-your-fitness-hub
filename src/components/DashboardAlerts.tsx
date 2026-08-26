import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Cake, Dumbbell, UserCheck, CalendarDays, AlertTriangle, Bell, Check, MessageCircle, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { BnitoContextButton } from "@/components/BnitoFloatingAssistant";
import { buildStudentChatMap, openStudentChat, birthdayMessage } from "@/lib/studentChat";
import { filterMaterializedWorkouts } from "@/lib/workoutPresence";
import { FUNNEL_STAGE_META, normalizeSalesStage, stageNextAction } from "@/lib/salesFunnelView";

interface Birthday { full_name: string; birth_date: string; student_id: string; isToday: boolean; day: number; }
interface MissingWorkout { student_name: string; student_id: string; cycle_number: number; cycle_id: string; start_date: string; end_date: string; trainer_name?: string; }
interface AwaitingTrainingDate { student_name: string; student_id: string; enrollment_id: string; trainer_name?: string; }
interface AwaitingTrainer { student_name: string; student_id: string; }
interface MissingEnrollment { student_name: string; student_id: string; }
interface IncompleteBilling { student_name: string; student_id: string; missing: string[]; }
interface RecentStudent {
  student_name: string;
  student_id: string;
  status: string;
  created_at: string;
  sales_stage: string | null;
  fiscal_completed_at: string | null;
  payment_link_sent_at: string | null;
  activated_at: string | null;
  assessment_due_at: string | null;
  onboarding_instructions_sent_at: string | null;
}

interface AlertsData {
  birthdays: Birthday[];
  missingWorkouts: MissingWorkout[];
  awaitingTrainer: AwaitingTrainer[];
  awaitingTrainingDate: AwaitingTrainingDate[];
  missingEnrollment: MissingEnrollment[];
  incompleteBilling: IncompleteBilling[];
  recentStudents: RecentStudent[];
}

interface Props {
  trainerId?: string;
  compact?: boolean;
}

async function fetchAlerts(
  trainerId: string | undefined,
  effectiveCompanyId: string | null | undefined,
): Promise<AlertsData> {
  const today = new Date();
  const addCompanyFilter = (query: any) => {
    if (effectiveCompanyId) return query.eq("company_id", effectiveCompanyId);
    return query;
  };

  const queries: any[] = [
    addCompanyFilter(supabase.from("students").select("id, full_name, birth_date, assigned_trainer_id, status")
      .not("birth_date", "is", null).eq("status", "active")),
  ];

  if (!trainerId) {
    queries.push(addCompanyFilter(supabase.from("enrollments").select("id, student_id, trainer_id, students(full_name)")
      .in("status", ["active", "awaiting_training", "awaiting_renewal"]).is("trainer_id", null)));
    queries.push(addCompanyFilter(supabase.from("enrollments").select("id, student_id, trainer_id, created_at, students(full_name)")
      .in("status", ["active", "awaiting_training"]).is("training_start_date", null)));
    queries.push(addCompanyFilter(supabase.from("students").select("id, full_name").eq("status", "active")));
    queries.push(addCompanyFilter(
      supabase.from("enrollments")
        .select("student_id, trainer_id, training_start_date")
        .in("status", ["active", "awaiting_training", "awaiting_renewal"]),
    ));
  }

  let enrollQuery = supabase.from("enrollments").select("id, student_id, trainer_id, students(full_name)")
    .eq("status", "active") as any;
  if (trainerId) enrollQuery = enrollQuery.eq("trainer_id", trainerId);
  if (effectiveCompanyId) enrollQuery = enrollQuery.eq("company_id", effectiveCompanyId);
  queries.push(enrollQuery);

  const results = await Promise.all(queries);

  const allTrainerIds = new Set<string>();
  const collectTrainerIds = (data: any[]) => {
    data?.forEach((e: any) => { if (e.trainer_id) allTrainerIds.add(e.trainer_id); });
  };
  if (!trainerId) collectTrainerIds(results[2]?.data || []);
  collectTrainerIds(results[trainerId ? 1 : 5]?.data || []);

  const trainerMap: Record<string, string> = {};
  if (allTrainerIds.size > 0) {
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", Array.from(allTrainerIds));
    (profiles || []).forEach((p: any) => { trainerMap[p.user_id] = p.full_name || "—"; });
  }

  // Aniversariantes do MÊS atual (usa 'T00:00:00' para evitar o drift de fuso já conhecido no projeto).
  const birthdays: Birthday[] = [];
  const curMonth = today.getMonth();
  const curDay = today.getDate();
  (results[0].data || []).forEach((s: any) => {
    if (!s.birth_date) return;
    const bd = new Date(`${s.birth_date}T00:00:00`);
    if (bd.getMonth() !== curMonth) return;
    birthdays.push({ full_name: s.full_name, birth_date: s.birth_date, student_id: s.id, day: bd.getDate(), isToday: bd.getDate() === curDay });
  });
  birthdays.sort((a, b) => a.day - b.day);

  let awaitingTrainer: AwaitingTrainer[] = [];
  let awaitingTrainingDate: AwaitingTrainingDate[] = [];
  let missingEnrollment: MissingEnrollment[] = [];
  let nextIdx: number;

  if (!trainerId) {
    awaitingTrainer = (results[1].data || [])
      .map((e: any) => ({ student_name: e.students?.full_name || "—", student_id: e.student_id }));
    // Alunos que já têm alguma matrícula (ativa/aguardando) com data de treino definida — não devem aparecer como "sem data"
    const studentsWithTrainingDate = new Set(
      (results[4].data || []).filter((e: any) => e.training_start_date).map((e: any) => e.student_id)
    );
    const seenAwaitingDate = new Set<string>();
    awaitingTrainingDate = (results[2].data || [])
      .filter((e: any) => !studentsWithTrainingDate.has(e.student_id))
      .filter((e: any) => {
        if (seenAwaitingDate.has(e.student_id)) return false;
        seenAwaitingDate.add(e.student_id);
        return true;
      })
      .map((e: any) => ({
        student_name: e.students?.full_name || "—", student_id: e.student_id, enrollment_id: e.id,
        trainer_name: e.trainer_id ? trainerMap[e.trainer_id] : undefined,
      }));
    const activeStudents = results[3].data || [];
    const enrolledIds = new Set((results[4].data || []).map((e: any) => e.student_id));
    missingEnrollment = activeStudents.filter((s: any) => !enrolledIds.has(s.id))
      .map((s: any) => ({ student_name: s.full_name, student_id: s.id }));
    nextIdx = 5;
  } else {
    nextIdx = 1;
  }

  // Cycle alerts — flag apenas alunos SEM nenhum treino em nenhum ciclo (aluno realmente novo)
  let missingWorkouts: MissingWorkout[] = [];
  const enrollments = results[nextIdx].data;
  if (enrollments && enrollments.length > 0) {
    const enrollIds = enrollments.map((e: any) => e.id);
    const enrollMap: Record<string, { name: string; student_id: string; trainer_name?: string }> = {};
    enrollments.forEach((e: any) => {
      enrollMap[e.id] = { name: e.students?.full_name || "—", student_id: e.student_id, trainer_name: e.trainer_id ? trainerMap[e.trainer_id] : undefined };
    });

    // Todos os ciclos (qualquer status) das matrículas vigentes
    const { data: allCycles } = await supabase.from("training_cycles")
      .select("id, enrollment_id, cycle_number, start_date, end_date, status, prescribed_offline_at")
      .in("enrollment_id", enrollIds);

    if (allCycles && allCycles.length > 0) {
      const allCycleIds = allCycles.map((c: any) => c.id);
      const { data: workouts } = await supabase.from("workouts").select("cycle_id, exercises").in("cycle_id", allCycleIds);
      const cyclesWithWorkout = new Set(filterMaterializedWorkouts(workouts || []).map((w) => w.cycle_id));

      // Ciclos ativos sem treino real nem marcação "fora do app" são pendência operacional.
      allCycles.forEach((c: any) => {
        const info = enrollMap[c.enrollment_id];
        if (!info?.student_id) return;
        if (c.status !== "active") return;
        if (cyclesWithWorkout.has(c.id) || c.prescribed_offline_at) return;
        missingWorkouts.push({
          student_name: info.name || "—", student_id: info.student_id, cycle_number: c.cycle_number,
          cycle_id: c.id, start_date: c.start_date, end_date: c.end_date, trainer_name: info.trainer_name,
        });
      });


      missingWorkouts = missingWorkouts.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
    }
  }


  // Incomplete billing
  let incompleteBilling: IncompleteBilling[] = [];
  let recentStudents: RecentStudent[] = [];
  if (!trainerId) {
    let billingQuery = supabase.from("students")
      .select("id, full_name, cpf, cep, phone, whatsapp, address, address_number, neighborhood")
      .in("status", ["active", "pending"]);
    if (effectiveCompanyId) billingQuery = billingQuery.eq("company_id", effectiveCompanyId);
    const { data: billingStudents } = await billingQuery;
    const flagged: IncompleteBilling[] = [];
    (billingStudents || []).forEach((s: any) => {
      const cpfDigits = (s.cpf || "").replace(/\D/g, "");
      const cepDigits = (s.cep || "").replace(/\D/g, "");
      const phoneDigits = (s.whatsapp || s.phone || "").replace(/\D/g, "");
      const missing: string[] = [];
      if (cpfDigits.length !== 11) missing.push("CPF");
      if (cepDigits.length !== 8) missing.push("CEP");
      if (phoneDigits.length < 10) missing.push("WhatsApp");
      if (!s.address) missing.push("Rua");
      if (!s.address_number) missing.push("Número");
      if (!s.neighborhood) missing.push("Bairro");
      if (missing.length > 0) flagged.push({ student_name: s.full_name, student_id: s.id, missing });
    });
    incompleteBilling = flagged.sort((a, b) => b.missing.length - a.missing.length);

    const recentCutoff = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    let recentQuery = supabase
      .from("students")
      .select("id, full_name, status, created_at, sales_stage, fiscal_completed_at, payment_link_sent_at, activated_at, assessment_due_at, onboarding_instructions_sent_at")
      .in("status", ["interested", "active", "pending"])
      .or(`created_at.gte.${recentCutoff},sales_stage.in.(interested,fiscal_registration_pending,payment_pending,active_onboarding)`)
      .order("created_at", { ascending: false });
    if (effectiveCompanyId) recentQuery = recentQuery.eq("company_id", effectiveCompanyId);
    const { data: recentRows } = await recentQuery;
    recentStudents = (recentRows || []).map((student) => ({
      student_name: student.full_name,
      student_id: student.id,
      status: student.status,
      created_at: student.created_at,
      sales_stage: student.sales_stage,
      fiscal_completed_at: student.fiscal_completed_at,
      payment_link_sent_at: student.payment_link_sent_at,
      activated_at: student.activated_at,
      assessment_due_at: student.assessment_due_at,
      onboarding_instructions_sent_at: student.onboarding_instructions_sent_at,
    }));
  }

  return { birthdays, missingWorkouts, awaitingTrainer, awaitingTrainingDate, missingEnrollment, incompleteBilling, recentStudents };
}

export function DashboardAlerts({ trainerId, compact = false }: Props) {
  const { role, companyId, user } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id : null) : companyId;
  const routePrefix = role === "master" && isViewingCompany ? "admin" : role;
  const safeRoutePrefix = (routePrefix as string) || "admin";

  const { data } = useQuery({
    queryKey: ["dashboard-alerts", trainerId ?? "all", effectiveCompanyId ?? "all"],
    queryFn: () => fetchAlerts(trainerId, effectiveCompanyId),
    staleTime: 60_000,
  });

  const { data: pendingActions = [] } = useQuery({
    queryKey: ["admin-alerts", effectiveCompanyId ?? "all", user?.id ?? "anon"],
    queryFn: async () => {
      let q = supabase.from("admin_alerts" as any)
        .select("id, type, severity, title, message, action_url, created_at, target_role, target_user_id, student_id")
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (effectiveCompanyId) q = q.eq("company_id", effectiveCompanyId);
      const { data } = await q;
      return (data as any[]) || [];
    },
    staleTime: 30_000,
    enabled: !!user?.id,
  });

  const resolveAlert = async (id: string) => {
    await supabase.from("admin_alerts" as any).update({ resolved_at: new Date().toISOString(), resolved_by: user?.id }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["admin-alerts"] });
  };

  const birthdays = data?.birthdays ?? [];
  const missingWorkouts = data?.missingWorkouts ?? [];
  const awaitingTrainer = data?.awaitingTrainer ?? [];
  const awaitingTrainingDate = data?.awaitingTrainingDate ?? [];
  const missingEnrollment = data?.missingEnrollment ?? [];
  const incompleteBilling = data?.incompleteBilling ?? [];
  const recentStudents = data?.recentStudents ?? [];

  const goToStudent = (studentId: string) => navigate(`/${safeRoutePrefix}/students/${studentId}`);

  // Mapa aluno→conversa para o botão de mensagem de aniversário (abre o chat com a mensagem pronta).
  const { data: studentChatMap } = useQuery({
    queryKey: ["student-chat-map", effectiveCompanyId ?? "all"],
    queryFn: () => buildStudentChatMap(effectiveCompanyId),
    staleTime: 60_000,
  });
  const sendBirthday = (studentId: string, fullName: string) => {
    void openStudentChat({
      navigate,
      routePrefix: safeRoutePrefix,
      chatId: studentChatMap?.[studentId],
      studentId,
      message: birthdayMessage(fullName),
      onNoChat: (m) => { void navigator.clipboard?.writeText(m); toast.success("Aluno sem WhatsApp — mensagem de aniversário copiada."); },
    });
  };

  const hasContent = pendingActions.length > 0 || birthdays.length > 0 || missingWorkouts.length > 0 || awaitingTrainer.length > 0 || awaitingTrainingDate.length > 0 || missingEnrollment.length > 0 || incompleteBilling.length > 0 || recentStudents.length > 0;
  if (!hasContent) return null;

  const itemClass = "flex items-center justify-between p-2 rounded-lg cursor-pointer hover:brightness-110 transition-all";

  if (compact) {
    const attentionItems = [
      ...pendingActions.map((a: any) => ({
        key: `alert-${a.id}`,
        tone: a.severity === "error" ? "danger" : a.severity === "warning" ? "warning" : "info",
        label: "Ação",
        title: a.title,
        subtitle: a.message || "Pendência administrativa ou técnica.",
        action: () => a.action_url ? navigate(a.action_url) : a.student_id && goToStudent(a.student_id),
        resolveId: a.id,
      })),
      ...awaitingTrainer.map((a, i) => ({
        key: `trainer-${a.student_id}-${i}`,
        tone: "warning",
        label: "Treinador",
        title: a.student_name,
        subtitle: "Aguardando definição de treinador.",
        action: () => goToStudent(a.student_id),
      })),
      ...awaitingTrainingDate.map((a, i) => ({
        key: `date-${a.enrollment_id}-${i}`,
        tone: "warning",
        label: "Data",
        title: a.student_name,
        subtitle: a.trainer_name ? `Sem data de treino · ${a.trainer_name}` : "Sem data de início do treino.",
        action: () => goToStudent(a.student_id),
      })),
      ...missingEnrollment.map((a, i) => ({
        key: `enrollment-${a.student_id}-${i}`,
        tone: "danger",
        label: "Matrícula",
        title: a.student_name,
        subtitle: "Aluno ativo sem matrícula ativa.",
        action: () => goToStudent(a.student_id),
      })),
      ...incompleteBilling.map((a, i) => ({
        key: `billing-${a.student_id}-${i}`,
        tone: "danger",
        label: "Cobrança",
        title: a.student_name,
        subtitle: `Falta: ${a.missing.join(", ")}`,
        action: () => goToStudent(a.student_id),
      })),
      ...missingWorkouts.map((a, i) => ({
        key: `workout-${a.cycle_id}-${i}`,
        tone: "danger",
        label: "Treino",
        title: a.student_name,
        subtitle: `Ciclo ${a.cycle_number} sem treino prescrito.`,
        action: () => goToStudent(a.student_id),
      })),
      ...birthdays.map((a, i) => ({
        key: `birthday-${a.student_id}-${i}`,
        tone: a.isToday ? "info" : "neutral",
        label: "Aniversário",
        title: a.full_name,
        subtitle: a.isToday ? "Hoje" : `Dia ${a.day}`,
        action: () => goToStudent(a.student_id),
        birthday: a,
      })),
      ...recentStudents.map((student, i) => {
        const stage = normalizeSalesStage(student);
        return {
          key: `recent-${student.student_id}-${i}`,
          tone: stage === "payment_pending" ? "warning" : stage === "active_onboarding" ? "info" : "neutral",
          label: "Cadastro",
          title: student.student_name,
          subtitle: `${FUNNEL_STAGE_META[stage].label} · ${stageNextAction(student)}`,
          action: () => goToStudent(student.student_id),
        };
      }),
    ];

    const visibleItems = attentionItems.slice(0, 6);
    const hiddenCount = Math.max(attentionItems.length - visibleItems.length, 0);
    const countPills = [
      { label: "Ações", value: pendingActions.length },
      { label: "Treinador", value: awaitingTrainer.length },
      { label: "Matrícula", value: missingEnrollment.length },
      { label: "Cobrança", value: incompleteBilling.length },
      { label: "Treino", value: missingWorkouts.length },
      { label: "Aniversários", value: birthdays.length },
      { label: "Cadastros", value: recentStudents.length },
    ].filter((item) => item.value > 0);

    const toneClass: Record<string, string> = {
      danger: "border-destructive/20 bg-destructive/5 text-destructive",
      warning: "border-warning/20 bg-warning/5 text-warning",
      info: "border-primary/20 bg-primary/5 text-primary",
      neutral: "border-border bg-secondary/40 text-muted-foreground",
    };

    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-primary text-xl flex flex-wrap items-center gap-2">
            <Bell className="h-5 w-5" />CENTRAL DE ATENÇÃO
            <BnitoContextButton
              label="central de atencao"
              context={`Dashboard com ${attentionItems.length} pendencias consolidadas por prioridade operacional.`}
              question="Qual destas pendencias eu devo resolver primeiro hoje?"
              className="ml-auto"
            />
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            {countPills.map((pill) => (
              <span key={pill.label} className="rounded border border-border bg-secondary/40 px-2 py-1 text-xs font-sans text-muted-foreground">
                {pill.label}: <strong className="text-foreground font-mono-data">{pill.value}</strong>
              </span>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {visibleItems.map((item) => (
              <div key={item.key} className={`flex items-center justify-between gap-3 rounded-lg border p-2 ${toneClass[item.tone] || toneClass.neutral}`}>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={item.action}>
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded bg-background/70 px-1.5 py-0.5 text-[11px] font-sans">{item.label}</span>
                    <p className="truncate text-sm font-medium text-foreground font-sans">{item.title}</p>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground font-sans">{item.subtitle}</p>
                </button>
                {item.resolveId && (
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => resolveAlert(item.resolveId)}>
                    <Check className="h-4 w-4" />
                  </Button>
                )}
                {item.birthday && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs shrink-0 border-primary/40 text-primary hover:bg-primary/5"
                    onClick={() => sendBirthday(item.birthday.student_id, item.birthday.full_name)}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          {hiddenCount > 0 && (
            <p className="mt-3 text-xs text-muted-foreground font-sans">
              +{hiddenCount} itens adicionais. Use as telas específicas para limpar a fila completa.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {pendingActions.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-primary text-lg flex items-center gap-2">
              <Bell className="h-5 w-5" />AÇÕES PENDENTES
              <BnitoContextButton
                label="acoes pendentes"
                context={`Dashboard com ${pendingActions.length} acoes pendentes administrativas e tecnicas.`}
                question="Como devo priorizar estas acoes pendentes?"
                className="ml-auto"
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[240px] overflow-auto">
              {pendingActions.map((a: any) => {
                const tone = a.severity === "warning"
                  ? "bg-warning/5 border-warning/20"
                  : a.severity === "error"
                  ? "bg-destructive/5 border-destructive/20"
                  : "bg-primary/5 border-primary/20";
                return (
                  <div key={a.id} className={`flex items-start justify-between gap-2 p-2 rounded-lg border ${tone}`}>
                    <button
                      type="button"
                      className="flex-1 text-left min-w-0"
                      onClick={() => a.action_url ? navigate(a.action_url) : a.student_id && goToStudent(a.student_id)}
                    >
                      <p className="text-sm font-sans text-foreground font-medium truncate">{a.title}</p>
                      {a.message && <p className="text-xs text-muted-foreground font-sans line-clamp-2">{a.message}</p>}
                    </button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={(e) => { e.stopPropagation(); resolveAlert(a.id); }}>
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {awaitingTrainingDate.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-primary text-lg flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />DEFINIR DATA DE TREINO
              <BnitoContextButton
                label="alunos sem data de treino"
                context={`Existem ${awaitingTrainingDate.length} alunos aguardando definicao de data de treino.`}
                question="Qual criterio usar para definir data de inicio de treino destes alunos?"
                className="ml-auto"
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[200px] overflow-auto">
              {awaitingTrainingDate.map((a, i) => (
                <div key={i} className={`${itemClass} bg-warning/5 border border-warning/20`} onClick={() => goToStudent(a.student_id)}>
                  <div>
                    <p className="text-sm font-sans text-foreground">{a.student_name}</p>
                    {a.trainer_name && <p className="text-xs text-muted-foreground/70 font-sans">{a.trainer_name}</p>}
                  </div>
                  <span className="text-xs font-sans font-medium px-2 py-0.5 rounded bg-warning/20 text-warning">Sem data</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {awaitingTrainer.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-primary text-lg flex items-center gap-2">
              <UserCheck className="h-5 w-5" />AGUARDANDO TREINADOR
              <BnitoContextButton
                label="alunos aguardando treinador"
                context={`Existem ${awaitingTrainer.length} alunos aguardando treinador.`}
                question="Como devo distribuir estes alunos entre os treinadores?"
                className="ml-auto"
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[200px] overflow-auto">
              {awaitingTrainer.map((a, i) => (
                <div key={i} className={`${itemClass} bg-warning/5 border border-warning/20`} onClick={() => goToStudent(a.student_id)}>
                  <p className="text-sm font-sans text-foreground">{a.student_name}</p>
                  <span className="text-xs font-sans font-medium px-2 py-0.5 rounded bg-warning/20 text-warning">Sem treinador</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {recentStudents.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-primary text-lg flex items-center gap-2">
              <UserPlus className="h-5 w-5" />NOVOS CADASTROS
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-7 px-2 text-xs"
                onClick={() => navigate(`/${safeRoutePrefix}/registration`)}
              >
                Ver esteira
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[200px] overflow-auto">
              {recentStudents.map((student) => {
                const stage = normalizeSalesStage(student);
                const tone = stage === "payment_pending"
                  ? "bg-warning/5 border-warning/20"
                  : stage === "active_onboarding"
                  ? "bg-primary/5 border-primary/20"
                  : "bg-secondary/40 border-border";
                const chipTone = stage === "payment_pending"
                  ? "bg-warning/15 text-warning"
                  : stage === "active_onboarding"
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground";
                return (
                  <div
                    key={student.student_id}
                    className={`${itemClass} ${tone} border`}
                    onClick={() => goToStudent(student.student_id)}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-sans text-foreground truncate">{student.student_name}</p>
                      <p className="text-xs text-muted-foreground font-sans truncate">
                        {FUNNEL_STAGE_META[stage].label} · {stageNextAction(student)}
                      </p>
                    </div>
                    <span className={`text-xs font-sans font-medium px-2 py-0.5 rounded shrink-0 ${chipTone}`}>
                      {FUNNEL_STAGE_META[stage].shortLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {missingEnrollment.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-destructive text-lg flex items-center gap-2">
              <Dumbbell className="h-5 w-5" />SEM MATRÍCULA ATIVA
              <BnitoContextButton
                label="alunos sem matricula ativa"
                context={`Existem ${missingEnrollment.length} alunos ativos sem matricula ativa.`}
                question="O que devo conferir antes de regularizar matricula destes alunos?"
                className="ml-auto"
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[200px] overflow-auto">
              {missingEnrollment.map((m, i) => (
                <div key={i} className={`${itemClass} bg-destructive/5 border border-destructive/20`} onClick={() => goToStudent(m.student_id)}>
                  <p className="text-sm font-sans text-foreground">{m.student_name}</p>
                  <span className="text-xs font-sans font-medium px-2 py-0.5 rounded bg-destructive/20 text-destructive">Pendente</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {incompleteBilling.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-destructive text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />COBRANÇA INCOMPLETA
              <BnitoContextButton
                label="cobranca incompleta"
                context={`Existem ${incompleteBilling.length} alunos com dados obrigatorios faltando para link de cobranca.`}
                question="Quais dados devo corrigir primeiro para o link de cobranca funcionar?"
                className="ml-auto"
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[200px] overflow-auto">
              {incompleteBilling.map((b, i) => (
                <div key={i} className={`${itemClass} bg-destructive/5 border border-destructive/20`} onClick={() => goToStudent(b.student_id)}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-sans text-foreground truncate">{b.student_name}</p>
                    <p className="text-xs text-muted-foreground font-sans truncate">Falta: {b.missing.join(", ")}</p>
                  </div>
                  <span className="text-xs font-sans font-medium px-2 py-0.5 rounded bg-destructive/20 text-destructive shrink-0 ml-2">Link não funciona</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {birthdays.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-primary text-lg flex items-center gap-2">
              <Cake className="h-5 w-5" />ANIVERSÁRIOS DO MÊS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[260px] overflow-auto">
              {birthdays.map((b, i) => (
                <div key={i} className={`${itemClass} bg-secondary/50 border border-border`} onClick={() => goToStudent(b.student_id)}>
                  <div className="min-w-0">
                    <p className="text-sm font-sans text-foreground truncate">{b.full_name}</p>
                    <span className={`text-xs font-sans font-medium ${b.isToday ? "text-primary" : "text-muted-foreground"}`}>
                      {b.isToday ? "🎉 Hoje!" : `dia ${b.day}`}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs shrink-0 border-primary/40 text-primary hover:bg-primary/5"
                    onClick={(e) => { e.stopPropagation(); sendBirthday(b.student_id, b.full_name); }}
                  >
                    <MessageCircle className="h-3.5 w-3.5 mr-1" /> Mensagem
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {missingWorkouts.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-primary text-lg flex items-center gap-2">
              <Dumbbell className="h-5 w-5" />SEM TREINO NO CICLO
              <BnitoContextButton
                label="ciclos sem treino"
                context={`Existem ${missingWorkouts.length} ciclos sem treino prescrito no dashboard.`}
                question="Como devo priorizar e montar os treinos pendentes destes ciclos?"
                className="ml-auto"
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[200px] overflow-auto">
              {missingWorkouts.map((m, i) => (
                <div key={i} className={`${itemClass} bg-destructive/5 border border-destructive/20`} onClick={() => goToStudent(m.student_id)}>
                  <div>
                    <p className="text-sm font-sans text-foreground">{m.student_name}</p>
                    <p className="text-xs text-muted-foreground font-sans">Ciclo {m.cycle_number} — {new Date(m.start_date).toLocaleDateString("pt-BR")} a {new Date(m.end_date).toLocaleDateString("pt-BR")}</p>
                    {m.trainer_name && <p className="text-xs text-muted-foreground/70 font-sans">{m.trainer_name}</p>}
                  </div>
                  <span className="text-xs font-sans font-medium px-2 py-0.5 rounded bg-destructive/20 text-destructive">Sem treino</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
