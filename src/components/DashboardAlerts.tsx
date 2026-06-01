import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Cake, Dumbbell, UserCheck, CalendarDays, AlertTriangle, Bell, Check } from "lucide-react";
import { differenceInDays, setYear } from "date-fns";

interface Birthday { full_name: string; birth_date: string; daysUntil: number; student_id: string; }
interface MissingWorkout { student_name: string; student_id: string; cycle_number: number; cycle_id: string; start_date: string; end_date: string; trainer_name?: string; }
interface AwaitingTrainingDate { student_name: string; student_id: string; enrollment_id: string; trainer_name?: string; }
interface AwaitingTrainer { student_name: string; student_id: string; }
interface MissingEnrollment { student_name: string; student_id: string; }
interface IncompleteBilling { student_name: string; student_id: string; missing: string[]; }

interface AlertsData {
  birthdays: Birthday[];
  missingWorkouts: MissingWorkout[];
  awaitingTrainer: AwaitingTrainer[];
  awaitingTrainingDate: AwaitingTrainingDate[];
  missingEnrollment: MissingEnrollment[];
  incompleteBilling: IncompleteBilling[];
}

interface Props {
  trainerId?: string;
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
    queries.push(addCompanyFilter(supabase.from("students").select("id, full_name, assigned_trainer_id")
      .in("status", ["active", "pending"]).is("assigned_trainer_id", null)));
    queries.push(addCompanyFilter(supabase.from("enrollments").select("id, student_id, trainer_id, students(full_name)")
      .in("status", ["active", "awaiting_training"]).is("training_start_date", null)));
    queries.push(addCompanyFilter(supabase.from("students").select("id, full_name").eq("status", "active")));
    queries.push(supabase.from("enrollments").select("student_id").in("status", ["active", "awaiting_training"]));
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

  let trainerMap: Record<string, string> = {};
  if (allTrainerIds.size > 0) {
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", Array.from(allTrainerIds));
    (profiles || []).forEach((p: any) => { trainerMap[p.user_id] = p.full_name || "—"; });
  }

  // Birthdays
  const birthdays: Birthday[] = [];
  (results[0].data || []).forEach((s: any) => {
    if (!s.birth_date) return;
    const bd = new Date(s.birth_date);
    const thisYear = setYear(bd, today.getFullYear());
    let diff = differenceInDays(thisYear, today);
    if (diff < 0) {
      const nextYear = setYear(bd, today.getFullYear() + 1);
      diff = differenceInDays(nextYear, today);
    }
    if (diff <= 30) birthdays.push({ full_name: s.full_name, birth_date: s.birth_date, daysUntil: diff, student_id: s.id });
  });
  birthdays.sort((a, b) => a.daysUntil - b.daysUntil);

  let awaitingTrainer: AwaitingTrainer[] = [];
  let awaitingTrainingDate: AwaitingTrainingDate[] = [];
  let missingEnrollment: MissingEnrollment[] = [];
  let nextIdx: number;

  if (!trainerId) {
    awaitingTrainer = (results[1].data || []).map((s: any) => ({ student_name: s.full_name, student_id: s.id }));
    awaitingTrainingDate = (results[2].data || []).map((e: any) => ({
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

  // Cycle alerts
  let missingWorkouts: MissingWorkout[] = [];
  const enrollments = results[nextIdx].data;
  if (enrollments && enrollments.length > 0) {
    const enrollIds = enrollments.map((e: any) => e.id);
    const enrollMap: Record<string, { name: string; student_id: string; trainer_name?: string }> = {};
    enrollments.forEach((e: any) => {
      enrollMap[e.id] = { name: e.students?.full_name || "—", student_id: e.student_id, trainer_name: e.trainer_id ? trainerMap[e.trainer_id] : undefined };
    });

    const { data: allCycles } = await supabase.from("training_cycles").select("*")
      .in("enrollment_id", enrollIds).in("status", ["active"]);
    const activeCycleIds: string[] = (allCycles || []).map((c: any) => c.id);

    if (activeCycleIds.length > 0) {
      const { data: workouts } = await supabase.from("workouts").select("cycle_id").in("cycle_id", activeCycleIds);
      const cyclesWithWorkout = new Set((workouts || []).map((w: any) => w.cycle_id));
      const missing: MissingWorkout[] = [];
      (allCycles || []).forEach((c: any) => {
        if (!cyclesWithWorkout.has(c.id)) {
          const info = enrollMap[c.enrollment_id];
          missing.push({ student_name: info?.name || "—", student_id: info?.student_id || "", cycle_number: c.cycle_number, cycle_id: c.id, start_date: c.start_date, end_date: c.end_date, trainer_name: info?.trainer_name });
        }
      });
      const firstPerStudent = new Map<string, MissingWorkout>();
      missing.forEach((m) => {
        const existing = firstPerStudent.get(m.student_name);
        if (!existing || m.cycle_number < existing.cycle_number) firstPerStudent.set(m.student_name, m);
      });
      missingWorkouts = Array.from(firstPerStudent.values())
        .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
    }
  }

  // Incomplete billing
  let incompleteBilling: IncompleteBilling[] = [];
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
  }

  return { birthdays, missingWorkouts, awaitingTrainer, awaitingTrainingDate, missingEnrollment, incompleteBilling };
}

export function DashboardAlerts({ trainerId }: Props) {
  const { role, companyId, user } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id : null) : companyId;
  const routePrefix = role === "master" && isViewingCompany ? "admin" : role;

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

  const goToStudent = (studentId: string) => navigate(`/${routePrefix}/students/${studentId}`);

  const hasContent = pendingActions.length > 0 || birthdays.length > 0 || missingWorkouts.length > 0 || awaitingTrainer.length > 0 || awaitingTrainingDate.length > 0 || missingEnrollment.length > 0 || incompleteBilling.length > 0;
  if (!hasContent) return null;

  const itemClass = "flex items-center justify-between p-2 rounded-lg cursor-pointer hover:brightness-110 transition-all";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {pendingActions.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-primary text-lg flex items-center gap-2">
              <Bell className="h-5 w-5" />AÇÕES PENDENTES
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

      {missingEnrollment.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-destructive text-lg flex items-center gap-2">
              <Dumbbell className="h-5 w-5" />SEM MATRÍCULA ATIVA
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
              <Cake className="h-5 w-5" />ANIVERSÁRIOS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[200px] overflow-auto">
              {birthdays.map((b, i) => (
                <div key={i} className={`${itemClass} bg-secondary/50 border border-border`} onClick={() => goToStudent(b.student_id)}>
                  <p className="text-sm font-sans text-foreground">{b.full_name}</p>
                  <span className={`text-xs font-sans font-medium px-2 py-0.5 rounded ${b.daysUntil === 0 ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {b.daysUntil === 0 ? "🎉 Hoje!" : `em ${b.daysUntil}d`}
                  </span>
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
