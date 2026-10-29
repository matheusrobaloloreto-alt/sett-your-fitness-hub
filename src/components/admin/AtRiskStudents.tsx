import { selectPrescriptionEnrollment, type PrescriptionScheduleCycle } from '@/lib/prescriptionSchedule';
import { projectPrescriptionCoverage, scheduleDay } from '@/lib/prescriptionCoverage';
// Central de Atenção ("semáforo BNITO"): unifica os sinais de atenção por aluno usando a máquina
// de status única (studentStatus) + dor relatada na anamnese, com PRÓXIMA MELHOR AÇÃO:
// mensagem pronta + atalho para a conversa interna. Componente standalone do dashboard.
import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { deriveStudentStatus, riskReasons, STUDENT_STATUS_LABELS, STUDENT_STATUS_COLORS, type StudentStatus } from "@/lib/studentStatus";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { createPlansLink, openStudentChat } from "@/lib/studentChat";
import { useDashboardSnapshot } from "@/contexts/DashboardSnapshotContext";
import { AthleticClubStar } from "@/components/AthleticClubStar";
import { useCompanyExperiencePolicy } from '@/hooks/useCompanyExperiencePolicy';

interface RiskRow {
  id: string;
  name: string;
  status: StudentStatus;
  reasons: string[];
  chatId?: string | null;
  pain?: string | null;      // "joelho (moderada)" — dor relatada na anamnese
  message: string;           // próxima melhor ação: mensagem pronta pro aluno
  tone: "red" | "amber";     // semáforo
  cycleEndsInDays?: number | null;
  scheduledStart?: boolean;
}
const PAID = ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"];

// Mensagem pronta por situação (tom humano, aberta como rascunho no chat interno).
function buildMessage(name: string, status: StudentStatus, reasons: string[], pain?: string | null): string {
  const first = (name || "").split(" ")[0] || "tudo bem";
  if (pain) {
    return `Oi ${first}! Vi que você relatou dor (${pain}). Como está se sentindo hoje? Quero ajustar seu treino pra treinar sem dor — me conta como foi essa semana. 💪`;
  }
  if (status === "renovacao") {
    return `Oi ${first}! Seu ciclo de treino está chegando ao fim — bora planejar o próximo? Já tenho ideias pra sua evolução. Me chama aqui! 🚀`;
  }
  const semTreinar = reasons.find((r) => r.startsWith("Sem treinar"));
  if (semTreinar) {
    return `Oi ${first}! Senti sua falta nos treinos (${semTreinar.toLowerCase()}). Aconteceu algo? Se a rotina apertou, eu adapto o plano pra encaixar — me conta. 💪`;
  }
  if (reasons.includes("Pagamento em atraso")) {
    return `Oi ${first}! Passando pra avisar que consta uma pendência no seu plano. Qualquer dificuldade me chama que a gente resolve junto. 🙂`;
  }
  return `Oi ${first}! Passando pra saber como estão os treinos. Precisa de algum ajuste? Estou aqui. 💪`;
}

export function AtRiskStudents({ readOnly = false, routePrefix = "admin" }: { readOnly?: boolean; routePrefix?: string } = {}) {
  const navigate = useNavigate();
  const { companyId, role } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id : null) : companyId;
  const snapshot = useDashboardSnapshot();
  const { policy, error: policyError } = useCompanyExperiencePolicy(effectiveCompanyId);
  const [rows, setRows] = useState<RiskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const loadGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    if (readOnly) {
      setLoadError(!snapshot);
      setRows((snapshot?.atRiskStudents || []) as RiskRow[]);
      setLoading(false);
      return;
    }
    // Sem empresa efetiva (master fora do company-view), não lista global de todas as empresas.
    if (!effectiveCompanyId) { setRows([]); setLoading(false); return; }
    setLoading(true); setLoadError(false);
    try {
      const { data: students, error: studentsError } = await supabase
        .from("students" as any).select("id, full_name, status")
        .neq("status", "inactive").eq("company_id", effectiveCompanyId);
      if (studentsError) throw studentsError;
      if (generation !== loadGeneration.current) return;
      const ids = (students ?? []).map((s: any) => s.id);
      if (ids.length === 0) { setRows([]); setLoading(false); return; }

      const results = await Promise.all([
        supabase.from("payments").select("student_id, status").in("student_id", ids).not("status", "in", `(${PAID.map((s) => `"${s}"`).join(",")})`),
        supabase.from("workout_sessions").select("student_id, completed_at").in("student_id", ids).eq("status", "completed"),
        supabase.from("whatsapp_chats").select("id, student_id").in("student_id", ids),
        supabase.from("training_cycles").select("id, enrollment_id, student_id, company_id, cycle_number, start_date, end_date, status, superseded_by_cycle_id, prescription_cleared_at, prescribed_offline_at").in("student_id", ids).eq("company_id", effectiveCompanyId),
        // Dor relatada na anamnese (moderada/severa entra no semáforo do professor).
        (supabase as any).from("student_body_limitations").select("student_id, region, severity").in("student_id", ids).in("severity", ["moderada", "severa"]),
        (supabase as any).from("functional_assessments").select("student_id, created_at").in("student_id", ids).order("created_at", { ascending: false }),
        supabase.from("enrollments").select("id, student_id, company_id, status, start_date, end_date, training_start_date, created_at, plans(duration_days, duration_weeks, cycle_duration_days)").in("student_id", ids).eq("company_id", effectiveCompanyId),
      ]);
      if (results.some(result => result.error)) throw new Error('Risk inputs unavailable');
      if (generation !== loadGeneration.current) return;
      const [{ data: pays }, { data: sessions }, { data: chats }, { data: cycles }, { data: pains }, { data: assessments }, { data: enrollments }] = results;
      const cycleIds = (cycles ?? []).map(cycle => cycle.id);
      const workoutResult = cycleIds.length ? await supabase.from('workouts').select('cycle_id, exercises').in('cycle_id', cycleIds) : { data: [], error: null };
      const bundleResult = cycleIds.length ? await supabase.from('prescription_bundles').select('training_cycle_id, status').in('training_cycle_id', cycleIds) : { data: [], error: null };
      if (workoutResult.error || bundleResult.error) throw new Error('Prescription evidence unavailable');
      if (generation !== loadGeneration.current) return;
      const materialized = new Set((workoutResult.data ?? []).filter(workout => Array.isArray(workout.exercises) && workout.exercises.length > 0).map(workout => workout.cycle_id));
      const bundles = new Set((bundleResult.data ?? []).filter(bundle => bundle.status !== 'failed').map(bundle => bundle.training_cycle_id));
      const scheduleCycles: PrescriptionScheduleCycle[] = (cycles ?? []).map(cycle => ({ ...cycle, has_usable_workouts: materialized.has(cycle.id), has_workouts: materialized.has(cycle.id), has_bundle: bundles.has(cycle.id) }));

      const overdue = new Set((pays ?? []).map((p: any) => p.student_id));
      const lastSession: Record<string, string> = {};
      (sessions ?? []).forEach((s: any) => { if (s.completed_at && (!lastSession[s.student_id] || s.completed_at > lastSession[s.student_id]) ) lastSession[s.student_id] = s.completed_at; });
      const chatByStudent: Record<string, string> = {};
      (chats ?? []).forEach((c: any) => { chatByStudent[c.student_id] = c.id; });
      const painByStudent: Record<string, string> = {};
      (pains ?? []).forEach((p: any) => { if (!painByStudent[p.student_id]) painByStudent[p.student_id] = `${p.region} (${p.severity})`; });
      // Última avaliação funcional por aluno (já vem ordenado desc) — reavaliação devida após 60 dias.
      const lastAssessment: Record<string, string> = {};
      (assessments ?? []).forEach((a: any) => { if (!lastAssessment[a.student_id]) lastAssessment[a.student_id] = a.created_at; });

      const now = Date.now();
      const out: RiskRow[] = [];
      for (const s of students as any[]) {
        const last = lastSession[s.id];
        const daysSince = last ? Math.floor((now - new Date(last).getTime()) / 86400000) : null;
        const enrollment = selectPrescriptionEnrollment((enrollments ?? []).filter(enrollment => enrollment.student_id === s.id), { expectedStudentId: s.id, expectedCompanyId: effectiveCompanyId });
        const plan = enrollment?.plans;
        const coverage = enrollment ? projectPrescriptionCoverage({ enrollment, cycles: scheduleCycles, expectedStudentId: s.id, expectedCompanyId: effectiveCompanyId,
          planDurationDays: plan?.duration_days ?? (plan?.duration_weeks ? plan.duration_weeks * 7 : undefined), cycleDurationDays: plan?.cycle_duration_days ?? 42 }) : null;
        const currentWorkoutCycles = coverage?.cycles.filter(cycle => coverage.currentWorkoutCycleIds.includes(cycle.id)) ?? [];
        const endDay = currentWorkoutCycles.length ? Math.min(...currentWorkoutCycles.map(cycle => scheduleDay(cycle.end_date)), coverage?.term?.end ?? Infinity) : NaN;
        const cycleEndsInDays = Number.isFinite(endDay) ? Math.round((endDay - scheduleDay(new Date())) / 86400000) : null;
        const signals = {
          baseStatus: s.status, hasAnamnesis: true, hasAssessment: true, hasActiveWorkout: coverage?.hasCurrentWorkout ?? false,
          daysSinceLastTraining: daysSince, paymentOverdue: overdue.has(s.id), cycleEndsInDays,
        };
        const status = deriveStudentStatus(signals, policy);
        const pain = painByStudent[s.id] ?? null;
        // Reavaliação devida: aluno ativo com ciclo, última avaliação > 60 dias (base p/ renovar com evidência).
        const la = lastAssessment[s.id];
        const reassessDue = coverage?.hasCurrentWorkout && la && (now - new Date(la).getTime()) / 86400000 > 60;
        if (coverage?.notStarted && !pain) continue;
        // Entra no painel: risco/renovação (como antes) OU dor relatada OU reavaliação devida (mesmo "ativo").
        if (status === "aguardando_prescricao" || status === "risco" || status === "renovacao" || ((pain || reassessDue) && status === "ativo")) {
          const reasons = coverage?.notStarted ? [] : riskReasons(signals, policy);
          if (!coverage?.hasCurrentWorkout && !coverage?.notStarted) reasons.unshift(coverage?.hasCurrentOfflinePrescription ? 'Prescrição registrada fora do app; sem treino digital vigente' : enrollment ? 'Plano vigente sem treino publicado' : 'Sem matrícula vigente por datas');
          if (coverage?.warnings.includes('schedule_gap')) reasons.push('Lacuna na agenda contratada');
          if (coverage?.warnings.includes('schedule_overlap_or_review')) reasons.push('Agenda pendente de revisão: sobreposição');
          if (coverage?.warnings.includes('history_outside_current_contract')) reasons.push('Histórico anterior no contrato atual');
          if (reassessDue) reasons.unshift(`Reavaliação devida (última há ${Math.floor((now - new Date(la).getTime()) / 86400000)}d)`);
          if (pain) reasons.unshift(`Dor: ${pain}`);
          out.push({
            id: s.id, name: s.full_name, status, reasons, scheduledStart: coverage?.notStarted, chatId: chatByStudent[s.id], pain, cycleEndsInDays,
            message: buildMessage(s.full_name, status, reasons, pain),
            tone: pain || status === "risco" ? "red" : "amber",
          });
        }
      }
      // Semáforo: vermelho (dor/risco) primeiro, depois âmbar (renovação).
      out.sort((a, b) => (a.tone === "red" ? -1 : 1) - (b.tone === "red" ? -1 : 1));
      if (generation === loadGeneration.current) setRows(out);
    } catch {
      if (generation === loadGeneration.current) { setLoadError(true); setRows([]); }
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [effectiveCompanyId, readOnly, snapshot, policy]);

  useEffect(() => { void load(); const generation = loadGeneration.current; return () => { if (loadGeneration.current === generation) loadGeneration.current = generation + 1; }; }, [load]);

  const openConversation = async (row: RiskRow) => {
    if (readOnly || !effectiveCompanyId) return;
    try {
      const renewal = row.status === 'renovacao' && !row.pain;
      const link = renewal ? await createPlansLink(row.id) : '';
      await openStudentChat({
      navigate,
      routePrefix,
      chatId: row.chatId,
      studentId: row.id,
      message: row.message,
      ...(renewal ? {
        companyId: effectiveCompanyId,
        messageEvent: typeof row.cycleEndsInDays === 'number' && row.cycleEndsInDays <= 0 ? 'renewal_overdue' as const : 'renewal_due' as const,
        messageValues: { nome: row.name, primeiro_nome: row.name.trim().split(/\s+/)[0], link, prazo: typeof row.cycleEndsInDays === 'number' ? String(row.cycleEndsInDays) : '' },
      } : {}),
      onNoChat: () => toast.error("Esse aluno ainda não tem telefone ou conversa cadastrada."),
      });
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : 'Nao foi possivel preparar o rascunho.'); }
  };
  const openStudent = (studentId: string) => {
    if (readOnly) return;
    navigate(`/${routePrefix}/students/${studentId}`);
  };

  if (loadError) return <p role="alert" className="text-sm text-destructive">Não foi possível confirmar a cobertura de treinos. Recarregue antes de avaliar os alunos.</p>;
  if (policyError) return <p role="alert" className="text-sm text-destructive">Nao foi possivel carregar a politica de risco.</p>;
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        {readOnly && <p className="mb-2 text-xs text-muted-foreground">Este resumo não valida a cobertura atual dos treinos.</p>}
        <p className="text-eyebrow mb-3 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-destructive" /> Central de atenção</p>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{readOnly ? "Resumo sem alertas. Cobertura de treinos ainda precisa de conferência." : "Ninguém precisando de atenção agora. 👏"}</p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div key={r.id} className="py-2.5">
                <div className="flex items-center gap-3">
                  <span className={cn("h-2 w-2 rounded-full shrink-0", r.tone === "red" ? "bg-destructive" : "bg-amber-500")} />
                  <div
                    className={cn("flex-1 min-w-0", !readOnly && "cursor-pointer")}
                    onClick={readOnly ? undefined : () => openStudent(r.id)}
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                      <AthleticClubStar studentId={r.id} companyId={effectiveCompanyId} className="shrink-0" />
                      <Badge className={cn("text-[10px]", r.pain && r.status === "ativo" ? "bg-destructive/15 text-destructive" : STUDENT_STATUS_COLORS[r.status])}>
                        {r.scheduledStart ? "Início programado" : r.pain && r.status === "ativo" ? "Dor relatada" : STUDENT_STATUS_LABELS[r.status]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{r.reasons.join(" · ")}</p>
                  </div>
                  {!readOnly && (
                    <button
                      onClick={() => void openConversation(r)}
                      className="rounded p-1.5 text-primary transition-colors hover:bg-muted/60"
                      title="Abrir conversa interna"
                      aria-label={`Abrir conversa interna com ${r.name}`}
                    >
                      <MessageSquare className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
