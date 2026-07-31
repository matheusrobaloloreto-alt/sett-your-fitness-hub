// ============================================================================
// PrescriptionStudio.tsx — BN Performance Training
// Página PRINCIPAL do treinador. Junta tudo:
//   Tab 1: Anamnese (enviar link ou ver resposta do aluno)
//   Tab 2: Avaliação (vídeo → frames → IA → edição)  [usa VideoAssessment]
//   Tab 3: Prescrição (checkboxes de modalidade → gera integrado → PDFs separados)
// Cole em: src/pages/admin/PrescriptionStudio.tsx
//
// Instalar:  npm i jspdf
// ============================================================================
import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { useCompanyAiConfig } from "@/lib/companyAiConfig";
import {
  Loader2, Copy, CheckCircle2, Circle, AlertCircle, Send, Download, Wand2,
  Dumbbell, Activity, Waves, Bike, Apple, FileText, GripVertical, CalendarRange, Layers3,
} from "lucide-react";
import VideoAssessment from "@/components/VideoAssessment";
import { generateAllPDFs, generateAssessmentPDF } from "@/lib/generatePDFs";
import { sendPdfToStudentWhatsApp } from "@/lib/sendStudentMedia";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Tabs, TabsContent, TabsList, TabsTrigger } from "@/lib/studioUi";
import { BnitoContextButton } from "@/components/BnitoFloatingAssistant";
import {
  buildBnitoOrchestrationPlan,
  buildPrescriptionIntegration,
  formatPrescriptionIntegrationSummary,
} from "@/lib/prescriptionIntegration";
import { readEdgeError } from "@/lib/edgeError";
import { publishStrengthPlanToStudent } from "@/lib/publishStrengthPlan";
import { businessDateYmd } from "@/lib/businessDate";
import { PeriodizationRoadmap } from "@/components/admin/PeriodizationRoadmap";
import { openStudentChat } from "@/lib/studentChat";
import { toast } from "sonner";
import { filterMaterializedWorkouts } from "@/lib/workoutPresence";
import { anamnesisInviteUrl } from "@/lib/publicFlowLinks";
import {
  describeLongitudinalPhase,
  isCycleCurrent,
  longitudinalPhase,
  selectPrescriptionTargets,
  type PrescriptionScheduleCycle,
  type PrescriptionScheduleMode,
} from "@/lib/prescriptionSchedule";

type Modality = "musculacao" | "corrida" | "natacao" | "ciclismo" | "nutricao";
type GenStatus = "idle" | "generating" | "done" | "error";
const db = supabase as any;

const MODALITIES: { id: Modality; icon: any; label: string; sub: string }[] = [
  { id: "musculacao", icon: Dumbbell, label: "Musculação", sub: "Força + biomecânica" },
  { id: "corrida",    icon: Activity, label: "Corrida",    sub: "Zonas FC + periodização" },
  { id: "natacao",    icon: Waves,    label: "Natação",    sub: "Volume + técnica" },
  { id: "ciclismo",   icon: Bike,     label: "Ciclismo",   sub: "Potência + zonas" },
  { id: "nutricao",   icon: Apple,    label: "Nutrição",   sub: "Dicas práticas" },
];

export default function PrescriptionStudio() {
  const nav = useNavigate();
  // Empresa efetiva: master usa a empresa visualizada (MasterContext); staff usa a sua.
  // (Antes filtrava por company_members → master sem linha ficava travado.)
  const { user, companyId: authCompanyId, role, loading: authLoading } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id ?? null : null) : authCompanyId ?? null;
  const { config: aiConfig } = useCompanyAiConfig(effectiveCompanyId);
  const assistantName = aiConfig.assistant_name || "Setty";
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [students, setStudents]   = useState<{ id: string; name: string; email?: string | null }[]>([]);
  const [studentId, setStudentId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [sendingAssess, setSendingAssess] = useState(false);
  const [editPlan, setEditPlan] = useState<any | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [library, setLibrary] = useState<{ id: string; name: string; muscle_group: string | null }[]>([]);
  // #4 Templates de ciclo — salvar a prescrição editada e reusar em outros alunos.
  const [templates, setTemplates] = useState<{ id: string; name: string; plan: any }[]>([]);
  const [savingTemplate, setSavingTemplate] = useState(false);
  useEffect(() => {
    if (!companyId) { setTemplates([]); return; }
    db.from("cycle_templates").select("id, name, plan").eq("company_id", companyId).order("created_at", { ascending: false }).limit(24)
      .then(({ data }: any) => setTemplates(data || []));
  }, [companyId]);
  const saveAsTemplate = async () => {
    const plan = editPlan || results.musculacao;
    if (!plan || !companyId) return;
    const name = window.prompt("Nome do template (ex.: Hipertrofia feminino 4d):", plan.cycle_name || "");
    if (!name?.trim()) return;
    setSavingTemplate(true);
    const { data, error: tErr } = await db.from("cycle_templates")
      .insert({ company_id: companyId, name: name.trim(), plan, created_by: user?.id ?? null })
      .select("id, name, plan").single();
    setSavingTemplate(false);
    if (tErr) { toast.error("Não consegui salvar o template"); return; }
    setTemplates((t) => [data, ...t]);
    toast.success(`Template "${name.trim()}" salvo — aparece pra todos os seus alunos.`);
  };
  const applyCycleTemplate = (t: { id: string; name: string; plan: any }) => {
    const clone = JSON.parse(JSON.stringify(t.plan));
    setResults((r: any) => ({ ...r, musculacao: clone }));
    setStatus((s) => ({ ...s, musculacao: "done" }));
    setEditPlan(JSON.parse(JSON.stringify(clone)));
    setShowEdit(true);
    toast.success(`Template "${t.name}" carregado — revise e personalize antes de publicar.`);
  };
  const deleteTemplate = async (id: string) => {
    if (!window.confirm("Excluir este template?")) return;
    await db.from("cycle_templates").delete().eq("id", id);
    setTemplates((t) => t.filter((x) => x.id !== id));
  };
  const [pickerTarget, setPickerTarget] = useState<{ wi: number; ei: number | null } | null>(null);
  const [pickerGroup, setPickerGroup] = useState("");
  const [pickerSearch, setPickerSearch] = useState("");
  const [dragExercise, setDragExercise] = useState<{ wi: number; ei: number } | null>(null);
  const [tab, setTab]             = useState("anamnese");

  // Anamnese state
  const [anamnese, setAnamnese]       = useState<any>(null);
  const [inviteLink, setInviteLink]   = useState("");
  const [copying, setCopying]         = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [assessment, setAssessment]   = useState<any>(null);

  // Prescrição state
  const [modalities, setModalities]   = useState<Set<Modality>>(new Set(["musculacao"]));
  const [status, setStatus]           = useState<Record<string, GenStatus>>({});
  const [results, setResults]         = useState<Record<string, any>>({});
  const [generating, setGenerating]   = useState(false);
  const [error, setError]             = useState("");
  const [pdfs, setPdfs]               = useState<any[]>([]);
  // Publicação do treino de força para o app do aluno.
  const [publishing, setPublishing]   = useState(false);
  const [published, setPublished]     = useState<{ workoutsCreated: number; createdEnrollment: boolean; scheduled?: boolean } | null>(null);
  const [activeBundleId, setActiveBundleId] = useState<string | null>(null);
  const [resultCycleId, setResultCycleId] = useState<string | null>(null);
  const [scheduleCycles, setScheduleCycles] = useState<PrescriptionScheduleCycle[]>([]);
  const [scheduleMode, setScheduleMode] = useState<PrescriptionScheduleMode>("single");
  const [selectedCycleId, setSelectedCycleId] = useState<string>("");
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleProgress, setScheduleProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [scheduledSummaries, setScheduledSummaries] = useState<Array<{ cycle: PrescriptionScheduleCycle; modalities: string[] }>>([]);
  // Vídeo vindo do WhatsApp (handshake do chat → Studio) para a Avaliação Funcional.
  const [pendingVideoUrl, setPendingVideoUrl] = useState<string | null>(null);
  const location = useLocation();

  const scheduleTargets = useMemo(() => selectPrescriptionTargets({
    cycles: scheduleCycles,
    mode: scheduleMode,
    selectedCycleId,
  }), [scheduleCycles, scheduleMode, selectedCycleId]);

  const formatCycleDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const selectedScheduleCycle = scheduleCycles.find((cycle) => cycle.id === selectedCycleId) || null;
  const generationButtonLabel = scheduleMode === "remaining"
    ? `Gerar e agendar ${scheduleTargets.length} ${scheduleTargets.length === 1 ? "ciclo" : "ciclos"}`
    : selectedScheduleCycle
      ? `Gerar ${modalities.size} ${modalities.size === 1 ? "prescrição" : "prescrições"} · ciclo ${selectedScheduleCycle.cycle_number}`
      : "Selecione um ciclo";

  // ── Gate de auth ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!user) { nav("/auth"); return; }
    setAuthChecked(true);
  }, [authLoading, user, nav]);

  // Handshake do WhatsAppChat: "Usar na avaliação" navega pra cá com { studentId, videoUrl }.
  // Seleciona o aluno, abre a aba de Avaliação e injeta o vídeo no VideoAssessment.
  useEffect(() => {
    const st = location.state as { studentId?: string; videoUrl?: string; tab?: "anamnese" | "avaliacao" | "prescricao" } | null;
    if (st?.studentId) {
      setStudentId(st.studentId);
      setTab(st.videoUrl ? "avaliacao" : (st.tab || "prescricao"));
      if (st.videoUrl) setPendingVideoUrl(st.videoUrl);
      nav(location.pathname, { replace: true, state: null }); // consome o state (evita reinjeção)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Carrega alunos da empresa efetiva ─────────────────────────────────────
  useEffect(() => {
    if (!effectiveCompanyId) { setCompanyId(null); setStudents([]); return; }
    setCompanyId(effectiveCompanyId);
    (async () => {
      const { data: list } = await supabase
        .from("students")
        .select("id, full_name, email")
        .eq("company_id", effectiveCompanyId)
        .order("full_name");
      setStudents((list || []).map((s: any) => ({ id: s.id, name: s.full_name, email: s.email })));
    })();
  }, [effectiveCompanyId]);

  // ── Carrega anamnese + avaliação ao trocar aluno ────────────────────────
  useEffect(() => {
    if (!studentId) return;
    (async () => {
      const { data: a } = await db.from("student_anamneses").select("*").eq("student_id", studentId).maybeSingle();
      setAnamnese(a);
      // Pré-marca "o que o aluno vai receber" pelas flags da anamnese (já considera nutri/assessoria).
      if (a) {
        const next = new Set<Modality>();
        if ((a as any).wants_strength !== false) next.add("musculacao");
        if ((a as any).wants_running) next.add("corrida");
        if ((a as any).wants_swimming) next.add("natacao");
        if ((a as any).wants_cycling) next.add("ciclismo");
        if ((a as any).wants_nutrition) next.add("nutricao");
        if (next.size) setModalities(next);
      }
      const { data: assess } = await db.from("functional_assessments")
        .select("id, assessment_json, report_text, created_at").eq("student_id", studentId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      setAssessment(assess);
      setAssessmentId(assess?.id || null);
      setInviteLink("");
    })();
  }, [studentId]);

  useEffect(() => {
    if (!studentId) {
      setScheduleCycles([]);
      setSelectedCycleId("");
      return;
    }
    let active = true;
    (async () => {
      setScheduleLoading(true);
      setScheduledSummaries([]);
      const { data, error: scheduleError } = await db.rpc("sync_prescription_cycles", {
        _student_id: studentId,
        _start_date: null,
      });
      if (!active) return;
      if (scheduleError) {
        const { data: fallback } = await db.from("training_cycles")
          .select("id, enrollment_id, cycle_number, start_date, end_date, status")
          .eq("student_id", studentId)
          .order("cycle_number");
        setScheduleCycles((fallback || []).map((cycle: any) => ({ ...cycle, has_workouts: false, has_bundle: false })));
      } else {
        const rows = (data || []) as PrescriptionScheduleCycle[];
        setScheduleCycles(rows);
        const preferred = rows.find((cycle) => isCycleCurrent(cycle) && !cycle.has_workouts && !cycle.has_bundle)
          || rows.find((cycle) => !cycle.has_workouts && !cycle.has_bundle && cycle.start_date >= businessDateYmd())
          || rows.find((cycle) => isCycleCurrent(cycle))
          || rows[0];
        setSelectedCycleId(preferred?.id || "");
      }
      setScheduleLoading(false);
    })();
    return () => { active = false; };
  }, [studentId]);

  const student = students.find(s => s.id === studentId);
  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    const matches = q
      ? students.filter((s) => (s.name || "").toLowerCase().includes(q))
      : students;
    return matches.slice(0, 8);
  }, [studentSearch, students]);

  useEffect(() => {
    if (student && studentSearch !== student.name) setStudentSearch(student.name);
  }, [student, studentSearch]);

  const handleStudentSearchChange = (value: string) => {
    setStudentSearch(value);
    setStudentPickerOpen(true);
    const normalized = value.trim().toLowerCase();
    const exact = students.find((s) => (s.name || "").trim().toLowerCase() === normalized);
    setStudentId(exact?.id || "");
  };

  const selectStudent = (id: string) => {
    const selected = students.find((s) => s.id === id);
    setStudentId(id);
    setStudentSearch(selected?.name || "");
    setStudentPickerOpen(false);
  };

  const assessmentContext = assessment?.assessment_json
    ? { ...assessment.assessment_json, report_text: assessment.report_text, id: assessment.id, created_at: assessment.created_at }
    : null;
  // Check-in diário do aluno (últimas 48h) — pode escalar o readiness pra "cautela" (nunca o contrário).
  const [lastCheckin, setLastCheckin] = useState<any>(null);
  useEffect(() => {
    if (!studentId) { setLastCheckin(null); return; }
    const cutoff = businessDateYmd(new Date(Date.now() - 2 * 86400000));
    (db.from("student_checkins").select("checkin_date, sleep_quality, stress, pain")
      .eq("student_id", studentId).gte("checkin_date", cutoff)
      .order("checkin_date", { ascending: false }).limit(1).maybeSingle())
      .then(({ data }: any) => setLastCheckin(data));
  }, [studentId]);
  const prescriptionIntegration = useMemo(
    () => {
      const base = buildPrescriptionIntegration({
        anamnese,
        assessment: assessmentContext,
        assessmentId,
        assessmentCreatedAt: assessment?.created_at,
      });
      const c = lastCheckin;
      const bad = c && ((c.pain ?? 0) >= 4 || (c.sleep_quality ?? 5) <= 2 || (c.stress ?? 1) >= 4);
      if (bad && base.readiness.status === "pronto") {
        return {
          ...base,
          readiness: {
            ...base.readiness,
            status: "cautela" as typeof base.readiness.status,
            reason: `${base.readiness.reason} Check-in do aluno (${c.checkin_date}): ${[(c.pain ?? 0) >= 4 ? `dor ${c.pain}/10` : null, (c.sleep_quality ?? 5) <= 2 ? "sono ruim" : null, (c.stress ?? 1) >= 4 ? "estresse alto" : null].filter(Boolean).join(", ")} → volume reduzido.`,
          },
        };
      }
      return base;
    },
    [anamnese, assessmentContext, assessmentId, assessment?.created_at, lastCheckin],
  );
  const bnitoOrchestration = useMemo(
    () => buildBnitoOrchestrationPlan(prescriptionIntegration),
    [prescriptionIntegration],
  );
  const toggleMod = (m: Modality) => setModalities(prev => {
    const next = new Set(prev);
    if (next.has(m)) next.delete(m);
    else next.add(m);
    return next;
  });

  // ── Gera link de anamnese para enviar ao aluno ──────────────────────────
  async function createInvite(): Promise<string | null> {
    if (!studentId || !companyId) return null;
    setCreatingInvite(true);
    const token = crypto.randomUUID().replace(/-/g, "");
    const { data: { user } } = await supabase.auth.getUser();
    const { error: inviteError } = await db.from("anamnese_invites").insert({
      company_id: companyId, student_id: studentId, token,
      student_name: student?.name, created_by: user?.id, status: "pending",
    });
    if (inviteError) {
      setError(inviteError.message);
      setCreatingInvite(false);
      return null;
    }
    const link = anamnesisInviteUrl(window.location.origin, token);
    setInviteLink(link);
    setCreatingInvite(false);
    return link;
  }

  // Empresa efetiva → prefixo de rota do chat (mesma regra do resto do app).
  const chatRoutePrefix = role === "master" && isViewingCompany ? "admin" : (role || "admin");

  // Envia o link da anamnese DIRETO no WhatsApp do aluno (abre o chat com a mensagem pronta).
  async function sendAnamneseWhatsApp() {
    if (!studentId) return;
    const link = inviteLink || (await createInvite());
    if (!link) return;
    const nome = (student?.name || "").trim().split(/\s+/)[0] || "";
    const message = `Oi, ${nome}! Pra eu montar seu plano do jeito certo, responde essa anamnese rapidinha (leva uns minutos): ${link}`;
    const { data: chat } = await supabase.from("whatsapp_chats").select("id").eq("student_id", studentId).limit(1).maybeSingle();
    void openStudentChat({
      navigate: nav,
      routePrefix: chatRoutePrefix,
      chatId: (chat as any)?.id ?? null,
      studentId,
      message,
      onNoChat: (m) => { void navigator.clipboard?.writeText(m); toast.success("Aluno sem WhatsApp cadastrado — link copiado."); },
    });
  }
  function copyLink() {
    navigator.clipboard.writeText(inviteLink);
    setCopying(true); setTimeout(() => setCopying(false), 1500);
  }
  async function createInviteAndCopy() {
    if (!studentId) return;
    if (!inviteLink) {
      await createInvite();
      return;
    }
    copyLink();
  }

  async function loadPreviousPerformance(cycle: PrescriptionScheduleCycle) {
    const previousCycle = scheduleCycles.find((item) => item.cycle_number === cycle.cycle_number - 1);
    if (!previousCycle) return null;
    const today = new Date();
    const previousStart = new Date(`${previousCycle.start_date}T12:00:00`);
    if (previousStart.getTime() > today.getTime()) return null;
    const [{ data: feedback }, { data: workouts }] = await Promise.all([
      db.from("cycle_feedback").select("effort_score, goals_aligned, wants_adjustment, adjustment_notes, answers")
        .eq("cycle_id", previousCycle.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("workouts").select("id, exercises").eq("cycle_id", previousCycle.id),
    ]);
    const workoutIds = filterMaterializedWorkouts(workouts || []).map((workout) => workout.id);
    let completedDays = 0;
    if (workoutIds.length) {
      const { data: sessions } = await db.from("workout_sessions").select("session_date")
        .eq("student_id", studentId).in("workout_id", workoutIds).eq("status", "completed");
      completedDays = new Set((sessions || []).map((session: any) => session.session_date).filter(Boolean)).size;
    }
    if (!feedback && completedDays === 0) return null;
    const elapsedDays = Math.max(1, Math.min(42, Math.floor((today.getTime() - previousStart.getTime()) / 86_400_000) + 1));
    const expectedWeeks = Math.max(1, Math.ceil(elapsedDays / 7));
    const expected = Math.max(1, workoutIds.length * expectedWeeks);
    const feedbackText = JSON.stringify(feedback || {}).toLowerCase();
    const painMatches = [...feedbackText.matchAll(/(?:eva|dor)[^0-9]{0,8}([0-9]|10)/g)].map((match) => Number(match[1]));
    return {
      adherence_ratio: Math.min(1, completedDays / expected),
      completed_days: completedDays,
      expected_sessions: expected,
      max_eva: painMatches.length ? Math.max(...painMatches) : 0,
      effort_score: feedback?.effort_score ?? null,
      goals_aligned: feedback?.goals_aligned ?? null,
      wants_adjustment: feedback?.wants_adjustment ?? null,
      technique_breakdown: /t[eé]cnica|execu[cç][aã]o/.test(feedbackText) && /ruim|dific|falh|perd/.test(feedbackText),
    };
  }

  // ── Geração integrada e longitudinal das prescrições marcadas ────────────
  async function generate() {
    if (!studentId || !companyId) { setError("Selecione um aluno."); return; }
    if (modalities.size === 0) { setError("Marque ao menos uma modalidade."); return; }
    if (scheduleTargets.length === 0) { setError("Não há ciclo disponível para esta opção de agendamento."); return; }
    if (scheduleTargets.some((cycle) => cycle.has_workouts || cycle.has_bundle)) {
      const confirmed = window.confirm("Um dos ciclos selecionados já tem prescrição. Deseja substituir esse bloco mantendo as mesmas datas?");
      if (!confirmed) return;
    }

    setGenerating(true); setError(""); setPdfs([]); setScheduledSummaries([]);
    const st: Record<string, GenStatus> = {};
    modalities.forEach((modality) => { st[modality] = "idle"; });
    setStatus(st); setResults({}); setPublished(null); setActiveBundleId(null); setResultCycleId(null);

    const firstTarget = scheduleTargets[0];
    const [strengthHistoryRes, runningHistoryRes, nutritionHistoryRes] = await Promise.all([
      db.from("ai_strength_plans").select("id, plan, sequence_number, training_cycle_id, created_at")
        .eq("student_id", studentId).order("created_at", { ascending: false }),
      db.from("running_plans").select("id, sport, plan_name, goal, duration_weeks, weeks, fc_zones, safety_check, sequence_number, training_cycle_id, created_at")
        .eq("student_id", studentId).order("created_at", { ascending: false }),
      db.from("nutrition_plans").select("id, plan_name, goal, target_calories, target_protein_g, target_carbs_g, target_fat_g, meals, sequence_number, training_cycle_id, created_at")
        .eq("student_id", studentId).order("created_at", { ascending: false }),
    ]);
    const priorToFirst = (row: any) => row.sequence_number == null || Number(row.sequence_number) < firstTarget.cycle_number;
    let previousStrength: any = (strengthHistoryRes.data || []).find(priorToFirst) || null;
    const previousCardio: Record<string, any> = {};
    for (const row of runningHistoryRes.data || []) {
      const key = String(row.sport || "corrida").toLowerCase();
      if (!previousCardio[key] && priorToFirst(row)) previousCardio[key] = row;
    }
    let previousNutrition: any = (nutritionHistoryRes.data || []).find(priorToFirst) || null;
    const summaries: Array<{ cycle: PrescriptionScheduleCycle; modalities: string[] }> = [];
    const preparedCycleIds = new Set<string>();
    let lastBundleId: string | null = null;

    try {
      for (let cycleIndex = 0; cycleIndex < scheduleTargets.length; cycleIndex += 1) {
        const cycle = scheduleTargets[cycleIndex];
        const phase = longitudinalPhase(cycle.cycle_number);
        const programSequence = {
          sequence_number: cycle.cycle_number,
          total_cycles: scheduleCycles.length,
          start_date: cycle.start_date,
          end_date: cycle.end_date,
          phase,
        };
        setScheduleProgress({ current: cycleIndex + 1, total: scheduleTargets.length, label: `Ciclo ${cycle.cycle_number}` });
        modalities.forEach((modality) => { st[modality] = "idle"; });
        setStatus({ ...st });

        const newResults: Record<string, any> = {};
        let strengthPlan: any = null;
        let strengthPlanId: string | null = null;
        const cardioPlans: Record<string, any> = {};
        let firstRunningPlanId: string | null = null;
        const bundleId = crypto.randomUUID();
        lastBundleId = bundleId;
        const assessmentCtx = assessmentContext;
        const integrationCtx = prescriptionIntegration;
        const orchestrationCtx = buildBnitoOrchestrationPlan(integrationCtx);
        const previousCycle = scheduleCycles.find((item) => item.cycle_number === cycle.cycle_number - 1);
        const performanceCtx = previousCycle && preparedCycleIds.has(previousCycle.id)
          ? null
          : await loadPreviousPerformance(cycle);
        const a = anamnese || {};

        const { error: bundleCreateError } = await db.from("prescription_bundles").insert({
          id: bundleId, company_id: companyId, student_id: studentId,
          anamnese_id: a.id || null, assessment_id: assessmentId,
          training_cycle_id: cycle.id,
          modalities: Array.from(modalities),
          has_strength: modalities.has("musculacao"), has_cardio: modalities.has("corrida"),
          has_swimming: modalities.has("natacao"), has_cycling: modalities.has("ciclismo"),
          has_nutrition: modalities.has("nutricao"),
          notes: [
            formatPrescriptionIntegrationSummary(integrationCtx),
            `Continuidade: ciclo ${cycle.cycle_number}/${scheduleCycles.length}, fase ${phase}, vigência ${cycle.start_date} a ${cycle.end_date}.`,
          ].join("\n"),
          status: "generating",
        });
        if (bundleCreateError) throw new Error(`Falha ao iniciar o ciclo ${cycle.cycle_number}: ${bundleCreateError.message}`);
        setActiveBundleId(bundleId);

        const linkBundleItem = async (modality: Modality | "avaliacao", entityType: string, entityId: string) => {
          const { error: itemError } = await db.from("prescription_bundle_items").insert({
            bundle_id: bundleId, company_id: companyId, student_id: studentId,
            modality, entity_type: entityType, entity_id: entityId,
          });
          if (itemError) throw new Error(`Falha ao vincular ${modality} ao ciclo ${cycle.cycle_number}: ${itemError.message}`);
        };
        if (assessmentId) await linkBundleItem("avaliacao", "functional_assessment", assessmentId);

        if (modalities.has("musculacao")) {
          setStatus((current) => ({ ...current, musculacao: "generating" }));
          const cardioDays = ["corrida", "natacao", "ciclismo"].some((modality) => modalities.has(modality as Modality))
            ? Number(a.days_per_week_cardio) || 0 : 0;
          const { data, error: edgeError } = await supabase.functions.invoke("ai-prescribe-workout", { body: {
            student_id: studentId, student_name: student?.name, company_id: companyId,
            anamnese_id: a.id, objective: a.objective, fitness_level: a.activity_level,
            days_per_week: Number(a.days_per_week_strength) || 3, duration_weeks: 6,
            equipment: a.equipment, block_number: cycle.cycle_number,
            is_endurance_athlete: a.is_endurance_athlete, restrictions: a.injuries, notes: a.notes,
            running_days_context: cardioDays > 0 ? { days_per_week: cardioDays, sport: a.sport } : null,
            assessment_context: assessmentCtx, anamnese_context: a,
            prescription_integration: integrationCtx, bnito_orchestration: orchestrationCtx,
            bundle_id: bundleId, training_cycle_id: cycle.id,
            previous_plan_id: previousStrength?.id || null,
            previous_plan_context: previousStrength?.plan || null,
            previous_performance_context: performanceCtx,
            program_sequence: programSequence,
          } });
          if (edgeError || data?.error) throw new Error((await readEdgeError(edgeError, data)) || `Falha na musculação do ciclo ${cycle.cycle_number}.`);
          if (!data?.id) throw new Error("A musculação foi gerada sem ID persistido.");
          strengthPlanId = data.id; strengthPlan = data.plan; newResults.musculacao = data.plan;
          await linkBundleItem("musculacao", "ai_strength_plan", data.id);
          const { error: linkError } = await db.from("prescription_bundles").update({ strength_plan_id: data.id }).eq("id", bundleId);
          if (linkError) throw new Error(`Falha ao ligar musculação: ${linkError.message}`);
          setStatus((current) => ({ ...current, musculacao: "done" }));
        }

        const sportMap: Record<string, string> = { corrida: "corrida", natacao: "natacao", ciclismo: "ciclismo" };
        for (const modality of ["corrida", "natacao", "ciclismo"] as Modality[]) {
          if (!modalities.has(modality)) continue;
          setStatus((current) => ({ ...current, [modality]: "generating" }));
          const prior = previousCardio[sportMap[modality]];
          const { data, error: edgeError } = await supabase.functions.invoke("ai-running-plan", { body: {
            student_id: studentId, student_name: student?.name, company_id: companyId,
            anamnese_id: a.id, sport: sportMap[modality], goal: a.cardio_goal || "Melhora de performance",
            duration_weeks: 6, days_per_week: Number(a.days_per_week_cardio) || 3,
            session_duration: Number(a.session_duration_min) || 60,
            current_volume: cycle.cycle_number === 1 ? a.current_volume_weekly : null,
            fcmax: a.fcmax, fcrep: a.fcrep, experience_months: a.experience_months, injuries: a.injuries,
            strength_plan_context: strengthPlan ? {
              days_per_week: Number(a.days_per_week_strength) || 3,
              workouts: (strengthPlan.workouts || []).map((workout: any) => ({
                day: workout.day_of_week, focus: workout.split_focus,
                has_heavy_legs: (workout.exercises || []).some((exercise: any) =>
                  ["quadríceps", "posterior", "glúteos"].some((group) => (exercise.muscle_group || "").toLowerCase().includes(group))),
              })),
            } : null,
            other_cardio_context: Object.keys(cardioPlans).length ? cardioPlans : null,
            assessment_context: assessmentCtx, anamnese_context: a,
            prescription_integration: integrationCtx, bnito_orchestration: orchestrationCtx,
            bundle_id: bundleId, training_cycle_id: cycle.id,
            previous_plan_id: prior?.id || null, previous_plan_context: prior || null,
            block_number: cycle.cycle_number, program_sequence: programSequence,
          } });
          if (edgeError || data?.error) throw new Error((await readEdgeError(edgeError, data)) || `Falha em ${modality} no ciclo ${cycle.cycle_number}.`);
          if (!data?.id) throw new Error(`A prescrição de ${modality} foi gerada sem ID persistido.`);
          await linkBundleItem(modality, "running_plan", data.id);
          if (!firstRunningPlanId) firstRunningPlanId = data.id;
          previousCardio[sportMap[modality]] = { id: data.id, ...data.plan };
          cardioPlans[modality] = data.plan; newResults[modality] = data.plan;
          setStatus((current) => ({ ...current, [modality]: "done" }));
        }
        if (firstRunningPlanId) await db.from("prescription_bundles").update({ running_plan_id: firstRunningPlanId }).eq("id", bundleId);

        if (modalities.has("nutricao")) {
          setStatus((current) => ({ ...current, nutricao: "generating" }));
          const { data: studentData } = await db.from("students").select("weight_kg, height_cm, gender, birth_date").eq("id", studentId).maybeSingle();
          const age = a.age || (studentData?.birth_date ? Math.floor((Date.now() - new Date(studentData.birth_date).getTime()) / 31557600000) : null);
          const totalCardioHours = Object.values(cardioPlans).reduce((sum: number, plan: any) => sum + (Number(plan?.volume_weekly_hours) || 0), 0);
          const { data, error: edgeError } = await supabase.functions.invoke("ai-nutrition-plan", { body: {
            student_id: studentId, student_name: student?.name, company_id: companyId,
            anamnese_id: a.id, age, gender: studentData?.gender || "M", weight_kg: studentData?.weight_kg,
            height_cm: studentData?.height_cm, body_fat_percent: a.body_fat_percent, objective: a.objective,
            activity_level: a.activity_level, is_endurance_athlete: a.is_endurance_athlete,
            meals_per_day: Number(a.meals_per_day) || 5, food_restrictions: a.food_restrictions,
            budget: a.budget_food, stress_score: a.stress_score, sleep_quality: a.sleep_quality,
            has_microwave: a.has_kitchen, nutrition_context: a.nutrition_context,
            training_modality: Array.from(modalities).filter((modality) => modality !== "nutricao").join(" + "),
            strength_plan_context: strengthPlan ? {
              sessions_per_week: Number(a.days_per_week_strength) || 3,
              session_duration_min: Number(a.session_duration_min) || 60,
              estimated_weekly_kcal: (Number(a.days_per_week_strength) || 3) * (Number(a.session_duration_min) || 60) / 60 * 450,
            } : null,
            running_plan_context: Object.keys(cardioPlans).length ? {
              modalities: Object.keys(cardioPlans), volume_weekly_hours: totalCardioHours,
              estimated_weekly_kcal: totalCardioHours * 700,
            } : null,
            anamnese_context: a, prescription_integration: integrationCtx, bnito_orchestration: orchestrationCtx,
            bundle_id: bundleId, training_cycle_id: cycle.id,
            previous_plan_id: previousNutrition?.id || null, previous_plan_context: previousNutrition || null,
            block_number: cycle.cycle_number, program_sequence: programSequence,
          } });
          if (edgeError || data?.error) throw new Error((await readEdgeError(edgeError, data)) || `Falha na nutrição do ciclo ${cycle.cycle_number}.`);
          if (!data?.id) throw new Error("A nutrição foi gerada sem ID persistido.");
          await linkBundleItem("nutricao", "nutrition_plan", data.id);
          const { error: linkError } = await db.from("prescription_bundles").update({ nutrition_plan_id: data.id }).eq("id", bundleId);
          if (linkError) throw new Error(`Falha ao ligar nutrição: ${linkError.message}`);
          previousNutrition = { id: data.id, ...data.plan };
          newResults.nutricao = data.plan;
          setStatus((current) => ({ ...current, nutricao: "done" }));
        }

        const shouldMaterializeStrength = Boolean(strengthPlan && (scheduleMode === "remaining" || !isCycleCurrent(cycle)));
        if (shouldMaterializeStrength) {
          const publication = await publishStrengthPlanToStudent({
            plan: strengthPlan, studentId, companyId, createdBy: user?.id ?? null,
            aiOriginal: strengthPlan, bundleId, targetCycleId: cycle.id, replaceTargetCycle: true,
          });
          setPublished({
            workoutsCreated: publication.workoutsCreated,
            createdEnrollment: publication.createdEnrollment,
            scheduled: !isCycleCurrent(cycle),
          });
        }

        const finalStatus = isCycleCurrent(cycle) ? "active" : "scheduled";
        const { error: bundleFinalizeError } = await db.from("prescription_bundles")
          .update({ status: finalStatus, generation_error: null, training_cycle_id: cycle.id })
          .eq("id", bundleId);
        if (bundleFinalizeError) throw new Error(`Falha ao finalizar ciclo ${cycle.cycle_number}: ${bundleFinalizeError.message}`);

        // Mantém a auditoria das versões antigas sem deixar mais de um pacote
        // vigente para o mesmo bloco. Só supersede depois que o novo pacote
        // terminou com sucesso, preservando o anterior em caso de falha.
        const { error: supersedeError } = await db.from("prescription_bundles")
          .update({ status: "superseded" })
          .eq("training_cycle_id", cycle.id)
          .neq("id", bundleId)
          .neq("status", "failed");
        if (supersedeError) throw new Error(`Ciclo ${cycle.cycle_number} gerado, mas falhou ao arquivar a versão anterior: ${supersedeError.message}`);

        if (strengthPlanId) previousStrength = { id: strengthPlanId, plan: strengthPlan };
        summaries.push({ cycle, modalities: Array.from(modalities) });
        preparedCycleIds.add(cycle.id);
        setResults({ ...newResults });
        setResultCycleId(cycle.id);
      }

      setScheduledSummaries(summaries);
      setScheduleCycles((current) => current.map((cycle) => preparedCycleIds.has(cycle.id)
        ? { ...cycle, has_bundle: true, has_workouts: cycle.has_workouts || modalities.has("musculacao") }
        : cycle));
      if (scheduleMode === "remaining") toast.success(`${summaries.length} ciclo(s) de 6 semanas foram gerados e agendados em progressão.`);
    } catch (generationError: any) {
      setError(generationError?.message || "Falha ao gerar a sequência de prescrições.");
      if (lastBundleId) await db.from("prescription_bundles").update({
        status: "failed", generation_error: String(generationError?.message || "Falha na geração").slice(0, 1000),
      }).eq("id", lastBundleId);
    } finally {
      setScheduleProgress(null);
      setGenerating(false);
    }
  }

  // ── Publica o treino de força gerado para o app do aluno ────────────────
  async function publishToStudent() {
    if (!results.musculacao || !studentId || !companyId) return;
    // P13 — checagem pré-publicação: avisa exercícios fora da biblioteca (sem vídeo/ligação).
    const plan0: any = editPlan || results.musculacao;
    const noLib: string[] = [];
    (plan0?.workouts || []).forEach((w: any) => (w?.exercises || []).forEach((e: any) => {
      if (!e?.exercise_id) noLib.push(e?.exercise_name || e?.library_exercise_name || "exercício");
    }));
    if (noLib.length) {
      const sample = [...new Set(noLib)].slice(0, 6).join(", ");
      const ok = window.confirm(`${noLib.length} exercício(s) fora da biblioteca (sem vídeo/ligação): ${sample}${noLib.length > 6 ? "…" : ""}.\n\nDá pra trocá-los pela biblioteca na edição (clique no nome do exercício). Publicar assim mesmo?`);
      if (!ok) return;
    }
    setPublishing(true); setError(""); setPublished(null);
    try {
      const r = await publishStrengthPlanToStudent({
        plan: editPlan || results.musculacao, studentId, companyId, createdBy: user?.id ?? null,
        aiOriginal: results.musculacao, // P9/P15 — versiona + resume edições do professor.
        bundleId: activeBundleId,
        targetCycleId: resultCycleId,
        replaceTargetCycle: Boolean(resultCycleId),
      });
      const targetCycle = scheduleCycles.find((cycle) => cycle.id === resultCycleId);
      const scheduledForFuture = Boolean(targetCycle && !isCycleCurrent(targetCycle));
      setPublished({ workoutsCreated: r.workoutsCreated, createdEnrollment: r.createdEnrollment, scheduled: scheduledForFuture });
      if (!scheduledForFuture) {
        // #5 Push — avisa o aluno no celular somente quando o bloco já está vigente.
        supabase.functions.invoke("push-send", {
          body: { action: "notify", student_ids: [studentId], title: "Prescrição nova no app", body: "Seu novo ciclo de treino já está disponível.", url: "/aluno" },
        }).catch(() => {});
      }
      // P14 — trilha de decisão desta publicação (best-effort; não bloqueia).
      try {
        const readiness = (prescriptionIntegration as any)?.readiness?.status ?? null;
        const editedFlag = JSON.stringify(results.musculacao?.workouts || []) !== JSON.stringify((editPlan || results.musculacao)?.workouts || []);
        const decisions: string[] = [];
        if (readiness && readiness !== "pronto") decisions.push(`prontidão: ${readiness}`);
        if (noLib.length) decisions.push(`${noLib.length} fora da biblioteca`);
        if (editedFlag) decisions.push("editado pelo professor");
        await db.from("ai_decision_logs").insert({
          student_id: studentId, company_id: companyId, source: "publish",
          summary: decisions.length ? decisions.join(" · ") : "publicado como a IA gerou",
          payload: { readiness, edited: editedFlag, no_library: noLib.length, workouts: (editPlan || results.musculacao)?.workouts?.length || 0 },
        });
      } catch { /* log opcional */ }
      if (scheduledForFuture) {
        toast.success(`Ciclo ${targetCycle?.cycle_number || "futuro"} agendado. Ele aparecerá ao aluno em ${targetCycle ? formatCycleDate(targetCycle.start_date) : "sua data de início"}.`);
      } else {
        // Abre a conversa interna com o aviso pronto; o professor confirma o envio.
        const nome = (student?.name || "").trim().split(/\s+/)[0] || "";
        void openStudentChat({
          navigate: nav,
          routePrefix: chatRoutePrefix,
          studentId,
          message: `Oi, ${nome}! Sua nova prescrição já está no seu app. É só abrir e treinar. Qualquer dúvida, me chama!`,
        });
      }
    } catch (e: any) {
      setError(e?.message || "Falha ao publicar o treino para o aluno.");
    }
    setPublishing(false);
  }

  // Espelha o plano de força gerado num rascunho editável (publicar usa esta versão).
  useEffect(() => {
    if (results.musculacao) { try { setEditPlan(JSON.parse(JSON.stringify(results.musculacao))); } catch { setEditPlan(results.musculacao); } }
    else setEditPlan(null);
  }, [results.musculacao]);
  // Biblioteca de exercícios para o seletor ao adicionar exercício na edição.
  useEffect(() => {
    (async () => {
      const { data } = await db.from("exercise_library").select("id, name, muscle_group").order("name");
      setLibrary(((data as any[]) || []).map((r) => ({ id: r.id, name: r.name, muscle_group: r.muscle_group })));
    })();
  }, []);
  const updateExField = (wi: number, ei: number, field: string, value: any) =>
    setEditPlan((p: any) => { if (!p) return p; const n = JSON.parse(JSON.stringify(p)); if (n.workouts?.[wi]?.exercises?.[ei]) n.workouts[wi].exercises[ei][field] = value; return n; });
  const updateWName = (wi: number, value: string) =>
    setEditPlan((p: any) => { if (!p) return p; const n = JSON.parse(JSON.stringify(p)); if (n.workouts?.[wi]) n.workouts[wi].name = value; return n; });
  const renumberExercises = (exercises: any[] = []) =>
    exercises.map((exercise, index) => ({ ...exercise, exercise_order: index + 1 }));
  const removeExercise = (wi: number, ei: number) =>
    setEditPlan((p: any) => {
      if (!p) return p;
      const n = JSON.parse(JSON.stringify(p));
      if (n.workouts?.[wi]?.exercises) {
        n.workouts[wi].exercises.splice(ei, 1);
        n.workouts[wi].exercises = renumberExercises(n.workouts[wi].exercises);
      }
      return n;
    });
  const moveExerciseTo = (wi: number, fromIndex: number, toIndex: number) =>
    setEditPlan((p: any) => {
      if (!p) return p;
      const n = JSON.parse(JSON.stringify(p));
      const exercises = n.workouts?.[wi]?.exercises;
      if (!Array.isArray(exercises)) return n;
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= exercises.length || toIndex >= exercises.length) return n;
      const [moved] = exercises.splice(fromIndex, 1);
      exercises.splice(toIndex, 0, moved);
      n.workouts[wi].exercises = renumberExercises(exercises);
      return n;
    });
  const addExercise = (wi: number) =>
    setEditPlan((p: any) => {
      if (!p) return p; const n = JSON.parse(JSON.stringify(p));
      if (n.workouts?.[wi]) { n.workouts[wi].exercises = n.workouts[wi].exercises || []; n.workouts[wi].exercises.push({ exercise_name: "", sets: 3, reps: "10-12", rest_seconds: 60, cues: "", exercise_order: n.workouts[wi].exercises.length + 1 }); n.workouts[wi].exercises = renumberExercises(n.workouts[wi].exercises); }
      return n;
    });
  const removeWorkout = (wi: number) =>
    setEditPlan((p: any) => { if (!p) return p; const n = JSON.parse(JSON.stringify(p)); n.workouts?.splice(wi, 1); return n; });
  const addWorkout = () =>
    setEditPlan((p: any) => {
      if (!p) return p; const n = JSON.parse(JSON.stringify(p)); n.workouts = n.workouts || [];
      n.workouts.push({ name: `Treino ${String.fromCharCode(65 + n.workouts.length)}`, day_of_week: n.workouts.length + 1, exercises: [] });
      return n;
    });
  // Adiciona um exercício escolhido da BIBLIOTECA (com exercise_id → vídeo etc. no app).
  const pickExercise = (lib: { id: string; name: string; muscle_group: string | null }) => {
    if (!pickerTarget) return;
    const { wi, ei } = pickerTarget;
    setEditPlan((p: any) => {
      if (!p) return p; const n = JSON.parse(JSON.stringify(p));
      const w = n.workouts?.[wi]; if (!w) return n;
      w.exercises = w.exercises || [];
      if (ei == null) {
        w.exercises.push({ exercise_id: lib.id, exercise_name: lib.name, library_exercise_name: lib.name, muscle_group: lib.muscle_group || "", sets: 3, reps: "10-12", rest_seconds: 60, cues: "", exercise_order: w.exercises.length + 1 });
      } else if (w.exercises[ei]) {
        w.exercises[ei] = { ...w.exercises[ei], exercise_id: lib.id, exercise_name: lib.name, library_exercise_name: lib.name, muscle_group: lib.muscle_group || "" };
      }
      w.exercises = renumberExercises(w.exercises);
      return n;
    });
    setPickerTarget(null); setPickerSearch(""); setPickerGroup("");
  };

  // ── Avaliação funcional: baixar PDF / enviar no WhatsApp ──────────────────
  function assessmentMeta() {
    return {
      studentName: student?.name || "Aluno",
      date: new Date(assessment?.created_at || Date.now()).toLocaleDateString("pt-BR"),
      professional: "Matheus Loreto",
      cref: "040718-G/SC",
    };
  }
  function assessmentFileName() {
    return `avaliacao-funcional-${(student?.name || "aluno").replace(/\s+/g, "-").toLowerCase()}.pdf`;
  }
  function assessmentFramePath(value: string): string | null {
    if (!value.startsWith("http")) return value.replace(/^\/+/, "");
    const marker = "/storage/v1/object/public/assessment-frames/";
    const markerIndex = value.indexOf(marker);
    if (markerIndex < 0) return null;
    return decodeURIComponent(value.slice(markerIndex + marker.length).split("?")[0]);
  }
  // Carrega as fotos dos frames (assessment_frames) como dataURLs, na ordem das vistas.
  async function loadFrameImages(): Promise<string[]> {
    if (!assessment?.id) return [];
    try {
      const { data } = await supabase.from("assessment_frames")
        .select("image_url, frame_index").eq("assessment_id", assessment.id).order("frame_index");
      const urls = ((data as any[]) || []).map((r) => r.image_url).filter(Boolean);
      const out: string[] = [];
      for (const u of urls) {
        try {
          const storedValue = String(u);
          const storagePath = assessmentFramePath(storedValue);
          let fetchUrl = storedValue;
          if (storagePath) {
            const { data: signed, error: signedError } = await supabase.storage
              .from("assessment-frames")
              .createSignedUrl(storagePath, 10 * 60);
            if (signedError || !signed?.signedUrl) throw signedError || new Error("Frame indisponível");
            fetchUrl = signed.signedUrl;
          }
          const resp = await fetch(fetchUrl);
          if (!resp.ok) throw new Error(`Frame indisponível (${resp.status})`);
          const b = await resp.blob();
          out.push(await new Promise<string>((res) => { const fr = new FileReader(); fr.onloadend = () => res(fr.result as string); fr.readAsDataURL(b); }));
        } catch { out.push(""); }
      }
      return out;
    } catch { return []; }
  }
  async function downloadAssessmentPDF() {
    if (!assessment) return;
    setSendingAssess(true);
    try {
      const imgs = await loadFrameImages();
      generateAssessmentPDF(assessment, assessmentMeta(), imgs).save(assessmentFileName());
    } catch (e: any) {
      toast.error("Não consegui gerar o PDF: " + (e?.message || "erro"));
    }
    setSendingAssess(false);
  }
  async function sendAssessmentWhatsApp() {
    if (!assessment || !companyId || !studentId) return;
    setSendingAssess(true);
    try {
      const imgs = await loadFrameImages();
      const blob = generateAssessmentPDF(assessment, assessmentMeta(), imgs).output("blob");
      await sendPdfToStudentWhatsApp({
        companyId, studentId, blob, fileName: assessmentFileName(),
        caption: `${(student?.name || "").split(" ")[0] || "Olá"}, segue sua avaliação funcional 💪`,
      });
      toast.success("Avaliação enviada no WhatsApp!");
    } catch (e: any) {
      toast.error("Não consegui enviar: " + (e?.message || "erro"));
    }
    setSendingAssess(false);
  }

  // ── Gera os PDFs separados ──────────────────────────────────────────────
  function downloadPDFs() {
    const meta = {
      studentName: student?.name || "Aluno",
      date: new Date().toLocaleDateString("pt-BR"),
    };
    const generated = generateAllPDFs(results, meta);
    setPdfs(generated);
    // Baixa todos
    generated.forEach(g => g.doc.save(g.filename));
  }

  const statusIcon = (s: GenStatus) => {
    if (s === "generating") return <Loader2 className="h-4 w-4 animate-spin text-[#8B7355]" />;
    if (s === "done")       return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (s === "error")      return <AlertCircle className="h-4 w-4 text-red-500" />;
    return <Circle className="h-4 w-4 text-slate-300" />;
  };

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-5">
      <div className="flex items-center gap-3 pt-1">
        <div className="h-11 w-11 rounded-xl bg-[#1B2B4A] flex items-center justify-center text-white font-black tracking-tight shadow-sm">BN</div>
        <div className="leading-tight">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-800">Studio de Prescrição</h1>
            <BnitoContextButton
              label="studio de prescricao"
              context="Fluxo principal do treinador: anamnese, avaliacao, prescricoes integradas e PDFs."
              question="Me orienta no fluxo completo deste aluno: anamnese, avaliacao, prescricao e PDF?"
            />
          </div>
          <p className="text-xs text-[#8B7355] font-medium">Anamnese → Avaliação → Prescrições integradas → PDFs</p>
        </div>
      </div>

      {/* Seleção de aluno */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            Aluno
            <BnitoContextButton
              label="aluno no studio"
              context="Seleciona o aluno e permite gerar link de anamnese ou iniciar prescricao."
              question="O que devo conferir antes de abrir a prescricao deste aluno no Studio?"
              className="ml-auto"
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {students.length > 0 ? (
            <div className="relative">
              <Input
                value={studentSearch}
                onChange={e => handleStudentSearchChange(e.target.value)}
                onFocus={() => setStudentPickerOpen(true)}
                onBlur={() => window.setTimeout(() => setStudentPickerOpen(false), 120)}
                placeholder="Digite ou selecione um aluno..."
                autoComplete="off"
                role="combobox"
                aria-expanded={studentPickerOpen}
                aria-controls="studio-student-options"
              />
              {studentPickerOpen && (
                <div
                  id="studio-student-options"
                  role="listbox"
                  className="absolute z-30 mt-2 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
                >
                  {filteredStudents.length ? filteredStudents.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      role="option"
                      aria-selected={s.id === studentId}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectStudent(s.id)}
                      className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors hover:bg-slate-50 ${
                        s.id === studentId ? "bg-[#1B2B4A]/5 font-semibold text-[#1B2B4A]" : "text-slate-700"
                      }`}
                    >
                      <span>{s.name}</span>
                      {s.email && <span className="ml-3 truncate text-xs text-slate-400">{s.email}</span>}
                    </button>
                  )) : (
                    <div className="px-4 py-3 text-sm text-slate-500">Nenhum aluno encontrado.</div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
              Nenhum aluno encontrado para esta empresa.
            </div>
          )}
          {studentId && (
            <div className="space-y-2">
              <Button onClick={sendAnamneseWhatsApp} disabled={creatingInvite} className="w-full bg-[#1B2B4A] hover:bg-[#1B2B4A]/90 text-white">
                {creatingInvite ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Abrir conversa interna com a anamnese
              </Button>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button onClick={createInviteAndCopy} disabled={creatingInvite} variant="outline">
                  {creatingInvite ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : inviteLink ? <Copy className="h-4 w-4 mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  {inviteLink ? (copying ? "Link copiado" : "Copiar anamnese") : "Gerar link de anamnese"}
                </Button>
                <Button onClick={() => setTab("prescricao")} variant="outline">
                  <Wand2 className="h-4 w-4 mr-2" /> Fazer prescrição
                </Button>
              </div>
            </div>
          )}
          {inviteLink && (
            <div className="flex gap-2">
              <Input value={inviteLink} readOnly className="text-sm" />
              <Button onClick={copyLink} variant="outline">
                {copying ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {studentId && (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="anamnese">1. Anamnese</TabsTrigger>
            <TabsTrigger value="avaliacao">2. Avaliação</TabsTrigger>
            <TabsTrigger value="prescricao">3. Prescrição</TabsTrigger>
          </TabsList>

          {/* ── TAB 1: ANAMNESE ── */}
          <TabsContent value="anamnese" className="space-y-4 mt-4">
            <Card>
              <CardContent className="pt-5">
                <div className="mb-3 flex justify-end">
                  <BnitoContextButton
                    label="tab anamnese do Studio"
                    context="Etapa de anamnese do Studio: link publico, resposta do aluno e dados que alimentam a prescricao."
                    question="Como devo conduzir a anamnese antes de prescrever?"
                    text="BNITO"
                  />
                </div>
                {anamnese ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                      <CheckCircle2 className="h-4 w-4" /> Anamnese respondida pelo aluno
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm text-slate-600 mt-2">
                      <div>Objetivo: <span className="font-medium text-slate-800">{anamnese.objective || "—"}</span></div>
                      <div>Nível: <span className="font-medium text-slate-800">{anamnese.activity_level || "—"}</span></div>
                      <div>Modalidade: <span className="font-medium text-slate-800">{anamnese.training_modality || "—"}</span></div>
                      <div>Dias força/sem: <span className="font-medium text-slate-800">{anamnese.days_per_week_strength || "—"}</span></div>
                    </div>
                    {anamnese.injuries && <p className="text-xs bg-slate-50 rounded p-2 mt-2">Lesões: {anamnese.injuries}</p>}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-600">Este aluno ainda não respondeu a anamnese. Gere um link e envie para ele preencher:</p>
                    {!inviteLink ? (
                      <Button onClick={createInvite} disabled={creatingInvite} className="bg-[#1B2B4A] hover:bg-[#1B2B4A]/90">
                        {creatingInvite ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />} Gerar link de anamnese
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Input value={inviteLink} readOnly className="text-sm" />
                        <Button onClick={copyLink} variant="outline">
                          {copying ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    )}
                    {inviteLink && <p className="text-xs text-slate-400">O link está pronto para a conversa interna. Quando o aluno responder, a anamnese aparece aqui.</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── TAB 2: AVALIAÇÃO ── */}
          <TabsContent value="avaliacao" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <BnitoContextButton
                label="tab avaliacao do Studio"
                context="Etapa de avaliacao do Studio, incluindo video, frames e IA para compensacoes funcionais."
                question="O que devo observar nesta avaliacao antes de montar o treino?"
                text="BNITO"
              />
            </div>
            {assessment && (
              <Card><CardContent className="pt-4">
                <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4" /> Avaliação já realizada
                  <Badge variant="outline" className="text-xs">{assessment.assessment_json?.total_compensacoes || 0} compensações</Badge>
                </div>
                <p className="text-xs text-slate-400 mt-1">Gere uma nova abaixo se quiser refazer.</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button size="sm" variant="outline" onClick={downloadAssessmentPDF} disabled={sendingAssess}>{sendingAssess ? "Gerando..." : "Baixar PDF"}</Button>
                  <Button size="sm" onClick={sendAssessmentWhatsApp} disabled={sendingAssess} className="bg-[#1B2B4A] text-white hover:bg-[#1B2B4A]/90">
                    {sendingAssess ? "Enviando..." : "Enviar pela conversa interna"}
                  </Button>
                </div>
              </CardContent></Card>
            )}
            <VideoAssessment
              studentId={studentId}
              companyId={companyId!}
              initialVideoUrl={pendingVideoUrl}
              onInitialVideoConsumed={() => setPendingVideoUrl(null)}
              onComplete={(id, videoResult) => {
                setAssessmentId(id);
                if (videoResult) {
                  setAssessment({
                    id,
                    assessment_json: videoResult.assessment_json,
                    report_text: videoResult.report_text,
                    created_at: new Date().toISOString(),
                  });
                }
                setTab("prescricao");
              }}
            />
          </TabsContent>

          {/* ── TAB 3: PRESCRIÇÃO ── */}
          <TabsContent value="prescricao" className="space-y-4 mt-4">
            {!anamnese && (
              <Card><CardContent className="pt-4">
                <p className="text-sm text-amber-600 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" /> Recomendado: o aluno responder a anamnese primeiro (Tab 1).
                </p>
              </CardContent></Card>
            )}

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  Resultado integrado para prescrição
                  <Badge variant={prescriptionIntegration.readiness.status === "pronto" ? "default" : "outline"} className="text-xs">
                    {prescriptionIntegration.readiness.status}
                  </Badge>
                  <BnitoContextButton
                    label="resultado integrado"
                    context="Resumo tecnico que cruza anamnese, avaliacao funcional, restricoes, objetivo e regras para a IA prescritoras."
                    question="Revise este resultado integrado e me diga quais cuidados devo manter na prescricao."
                    className="ml-auto"
                  />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-slate-600">{prescriptionIntegration.readiness.reason}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border border-slate-200 p-2">
                    Anamnese: {prescriptionIntegration.sources.has_anamnese ? "ok" : "pendente"}
                  </div>
                  <div className="rounded border border-slate-200 p-2">
                    Avaliação: {prescriptionIntegration.sources.has_assessment ? "ok" : "pendente"}
                  </div>
                </div>
                {prescriptionIntegration.functional_findings.priorities.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Prioridades funcionais</p>
                    <ul className="space-y-1 text-slate-600">
                      {prescriptionIntegration.functional_findings.priorities.slice(0, 4).map((item, index) => (
                        <li key={index}>- {item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {prescriptionIntegration.prescription_decision.exercise_selection_rules.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Regras para a IA</p>
                    <ul className="space-y-1 text-slate-600">
                      {prescriptionIntegration.prescription_decision.exercise_selection_rules.slice(0, 4).map((item, index) => (
                        <li key={index}>- {item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-display">
                  <CalendarRange className="h-5 w-5 text-[#8B7355]" />
                  Vigência e agendamento
                  <span className="ml-auto font-mono-data text-xs font-normal text-slate-500">
                    {scheduleCycles.length > 0 ? `${scheduleCycles.length} ciclos · ${scheduleCycles.length * 6} semanas` : "Sem vigência"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200" role="group" aria-label="Modo de agendamento">
                  <button
                    type="button"
                    onClick={() => setScheduleMode("single")}
                    className={`flex min-h-10 items-center justify-center gap-2 px-3 text-sm transition-colors ${scheduleMode === "single" ? "bg-[#1B2B4A] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    <CalendarRange className="h-4 w-4" /> Um ciclo
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleMode("remaining")}
                    className={`flex min-h-10 items-center justify-center gap-2 border-l border-slate-200 px-3 text-sm transition-colors ${scheduleMode === "remaining" ? "bg-[#1B2B4A] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    <Layers3 className="h-4 w-4" /> Plano restante
                  </button>
                </div>

                {scheduleLoading ? (
                  <div className="flex min-h-16 items-center justify-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando vigência
                  </div>
                ) : scheduleCycles.length === 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    O aluno precisa de uma matrícula vigente para agendar prescrições.
                  </div>
                ) : (
                  <>
                    {scheduleMode === "single" && (
                      <label className="block">
                        <span className="text-eyebrow mb-1.5 block">Ciclo de destino</span>
                        <select
                          value={selectedCycleId}
                          onChange={(event) => setSelectedCycleId(event.target.value)}
                          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#8B7355] focus:ring-2 focus:ring-[#8B7355]/15"
                        >
                          {scheduleCycles.map((cycle) => (
                            <option key={cycle.id} value={cycle.id}>
                              Ciclo {cycle.cycle_number} · {formatCycleDate(cycle.start_date)} a {formatCycleDate(cycle.end_date)}{cycle.has_workouts || cycle.has_bundle ? " · prescrito" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                      {scheduleCycles.map((cycle) => {
                        const prepared = Boolean(cycle.has_workouts || cycle.has_bundle);
                        const current = isCycleCurrent(cycle);
                        const completed = cycle.end_date < businessDateYmd();
                        const selected = scheduleMode === "single" ? cycle.id === selectedCycleId : scheduleTargets.some((target) => target.id === cycle.id);
                        const statusLabel = prepared ? "Prescrito" : completed ? "Concluído" : current ? "Atual" : "Pendente";
                        return (
                          <button
                            key={cycle.id}
                            type="button"
                            onClick={() => { setScheduleMode("single"); setSelectedCycleId(cycle.id); }}
                            className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2.5 text-left transition-colors ${selected ? "bg-[#F5EDD8]/55" : "bg-white hover:bg-slate-50"}`}
                          >
                            <span className={`flex h-8 w-8 items-center justify-center rounded-md font-mono-data text-xs font-semibold ${selected ? "bg-[#1B2B4A] text-white" : "bg-slate-100 text-slate-600"}`}>
                              {cycle.cycle_number}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-slate-800">{describeLongitudinalPhase(longitudinalPhase(cycle.cycle_number))}</span>
                              <span className="block font-mono-data text-[11px] text-slate-500">{formatCycleDate(cycle.start_date)} — {formatCycleDate(cycle.end_date)}</span>
                            </span>
                            <span className={`text-xs font-medium ${prepared ? "text-emerald-700" : current ? "text-[#8B7355]" : "text-slate-500"}`}>{statusLabel}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  Orquestração {assistantName}
                  <Badge variant="outline" className="text-xs">6 semanas</Badge>
                  <BnitoContextButton
                    label="orquestracao BNITO"
                    context="BNITO unifica os agentes de musculacao, corrida e nutricao em um ciclo de 6 semanas com trocas de estimulo a cada 2 semanas."
                    question="Revise a orquestracao de 6 semanas e me diga onde preciso tomar cuidado antes de gerar."
                    className="ml-auto"
                  />
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-xs text-slate-600 md:grid-cols-3">
                {bnitoOrchestration.blocks.map((block) => (
                  <div key={block.block} className="rounded border border-slate-200 p-3">
                    <p className="font-medium text-slate-800">Semanas {block.weeks[0]}-{block.weeks[1]}</p>
                    <p className="mt-1">{block.name}</p>
                    <p className="mt-2 text-slate-400">{block.advanced_methods.join(", ")}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  O que esse aluno vai receber?
                  <BnitoContextButton
                    label="modalidades do Studio"
                    context="Escolha de musculacao, corrida, natacao, ciclismo e nutricao no Studio."
                    question="Quais modalidades fazem sentido para este aluno e como evitar excesso de carga?"
                    className="ml-auto"
                  />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {MODALITIES.map(({ id, icon: Icon, label, sub }) => (
                    <button key={id} onClick={() => toggleMod(id)}
                      className={`relative rounded-xl border-2 p-3 text-left transition ${
                        modalities.has(id) ? "border-[#8B7355] bg-[#F5EDD8]/50 shadow-sm" : "border-slate-200 hover:border-[#8B7355]/40 hover:bg-slate-50"}`}>
                      {modalities.has(id) && <CheckCircle2 className="h-4 w-4 text-[#8B7355] absolute top-2 right-2" />}
                      <Icon className={`h-5 w-5 mb-1 ${modalities.has(id) ? "text-[#8B7355]" : "text-slate-400"}`} />
                      <div className="text-sm font-medium text-slate-800">{label}</div>
                      <div className="text-xs text-slate-500">{sub}</div>
                    </button>
                  ))}
                </div>

                {/* Progresso */}
                {(generating || Object.keys(status).length > 0) && (
                  <div className="mt-4 space-y-2 border rounded-lg p-4 bg-slate-50">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <p className="text-eyebrow">Geração integrada</p>
                      {scheduleProgress && <span className="font-mono-data text-xs text-slate-500">{scheduleProgress.label} · {scheduleProgress.current}/{scheduleProgress.total}</span>}
                    </div>
                    {Array.from(modalities).map(m => {
                      const meta = MODALITIES.find(x => x.id === m)!;
                      return (
                        <div key={m} className="flex items-center gap-2 text-sm">
                          {statusIcon(status[m] || "idle")}
                          <span>{meta.label}</span>
                          {m === "nutricao" && modalities.size > 1 && status[m] !== "idle" && (
                            <Badge variant="outline" className="text-xs">GET sobre carga total</Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

                {scheduledSummaries.length > 0 && (
                  <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50/40">
                    {scheduledSummaries.map(({ cycle, modalities: generatedModalities }) => (
                      <div key={cycle.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span className="text-slate-700">Ciclo {cycle.cycle_number} · {formatCycleDate(cycle.start_date)} a {formatCycleDate(cycle.end_date)}</span>
                        <span className="font-mono-data text-xs text-emerald-700">{generatedModalities.length} {generatedModalities.length === 1 ? "prescrição" : "prescrições"}</span>
                      </div>
                    ))}
                  </div>
                )}

                <Button className="w-full mt-4 bg-[#1B2B4A] hover:bg-[#1B2B4A]/90"
                  onClick={generate} disabled={generating || scheduleLoading || modalities.size === 0 || scheduleTargets.length === 0}>
                  {generating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {scheduleProgress ? `Gerando ${scheduleProgress.label.toLowerCase()} (${scheduleProgress.current}/${scheduleProgress.total})` : "Gerando"}</>
                    : generationButtonLabel}
                </Button>

                {/* #4 Templates de ciclo — começar de um treino salvo em vez de gerar do zero */}
                {templates.length > 0 && studentId && (
                  <div className="mt-3 border rounded-lg p-2 bg-slate-50/60">
                    <p className="text-[11px] font-medium text-slate-600 mb-1.5">📋 Ou comece de um template seu:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {templates.map((t) => (
                        <span key={t.id} className="inline-flex items-center rounded-full border border-slate-200 bg-white overflow-hidden">
                          <button type="button" onClick={() => applyCycleTemplate(t)}
                            className="px-2.5 py-1 text-xs text-[#1B2B4A] hover:bg-[#F5EDD8]/60">{t.name}</button>
                          <button type="button" title="Excluir template" onClick={() => deleteTemplate(t.id)}
                            className="px-1.5 py-1 text-[10px] text-slate-400 hover:text-red-500 border-l border-slate-100">✕</button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Resultados + download */}
            {Object.values(results).some(Boolean) && !generating && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    Prescrições geradas
                    <BnitoContextButton
                      label="prescricoes geradas no Studio"
                      context="Resultados integrados e PDFs prontos para revisao pelo professor."
                      question="Me ajuda a revisar estes resultados antes de baixar os PDFs?"
                      className="ml-auto"
                    />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.keys(results).map(mod => {
                    const meta = MODALITIES.find(x => x.id === mod);
                    return (
                      <div key={mod} className="flex items-center gap-2 text-sm border-l-2 border-[#8B7355] pl-3 py-1">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="font-medium">{meta?.label}</span>
                        <span className="text-slate-400 text-xs">pronta</span>
                      </div>
                    );
                  })}
                  <Button onClick={downloadPDFs} className="w-full bg-[#8B7355] hover:bg-[#8B7355]/90 mt-2">
                    <Download className="h-4 w-4 mr-2" /> Baixar PDFs separados ({Object.keys(results).length})
                  </Button>

                  {results.musculacao && (
                    <PeriodizationRoadmap
                      objective={results.musculacao.objective}
                      durationWeeks={results.musculacao.duration_weeks}
                      className="mt-2"
                    />
                  )}

                  {/* Revisar e editar a prescrição de força ANTES de publicar no app */}
                  {editPlan && Array.isArray(editPlan.workouts) && (
                    <div className="border rounded-lg p-3 mt-2 bg-slate-50/60">
                      <div className="flex items-center gap-3 flex-wrap">
                        <button type="button" onClick={() => setShowEdit(s => !s)} className="text-sm font-medium text-[#1B2B4A] underline">
                          {showEdit ? "Ocultar edição" : "✏️ Revisar e editar o treino antes de enviar"}
                        </button>
                        <button type="button" onClick={saveAsTemplate} disabled={savingTemplate}
                          className="text-xs text-[#8B7355] underline disabled:opacity-50">
                          {savingTemplate ? "Salvando…" : "💾 Salvar como template"}
                        </button>
                      </div>
                      {showEdit && (
                        <div className="mt-3 space-y-3">
                          <p className="text-xs text-slate-500">Edite séries / reps / descanso / obs. Ao publicar, vai a versão editada pro app do aluno.</p>
                          {editPlan.workouts.map((w: any, wi: number) => (
                            <div key={wi} className="border rounded-lg p-2 bg-white space-y-1.5">
                              <div className="flex items-center gap-2">
                                <Input value={w.name || ""} onChange={e => updateWName(wi, e.target.value)} className="h-8 text-sm font-medium" />
                                <button type="button" onClick={() => removeWorkout(wi)} className="text-xs text-red-500 px-2 shrink-0 whitespace-nowrap">Remover treino</button>
                              </div>
                              <div className="grid grid-cols-12 gap-1 text-[10px] text-slate-400 uppercase px-0.5">
                                <span className="col-span-1">Arrastar</span><span className="col-span-2">Exercício</span><span className="col-span-1">Sér</span><span className="col-span-2">Reps</span><span className="col-span-2">Desc(s)</span><span className="col-span-3">Obs</span><span className="col-span-1"></span>
                              </div>
                              {(w.exercises || []).map((ex: any, ei: number) => (
                                <div
                                  key={`${ex.exercise_id || ex.exercise_name || "exercise"}-${ei}`}
                                  draggable
                                  onDragStart={(event) => {
                                    setDragExercise({ wi, ei });
                                    event.dataTransfer.effectAllowed = "move";
                                    event.dataTransfer.setData("text/plain", `${wi}:${ei}`);
                                  }}
                                  onDragOver={(event) => {
                                    if (dragExercise?.wi === wi) {
                                      event.preventDefault();
                                      event.dataTransfer.dropEffect = "move";
                                    }
                                  }}
                                  onDrop={(event) => {
                                    event.preventDefault();
                                    const source = dragExercise;
                                    setDragExercise(null);
                                    if (!source || source.wi !== wi) return;
                                    moveExerciseTo(wi, source.ei, ei);
                                  }}
                                  onDragEnd={() => setDragExercise(null)}
                                  className={`grid grid-cols-12 gap-1 items-center rounded-md transition-colors ${
                                    dragExercise?.wi === wi && dragExercise?.ei === ei ? "bg-[#F5EDD8]/70 opacity-70" : "hover:bg-slate-50"
                                  }`}
                                >
                                  <div className="col-span-3 sm:col-span-1 flex items-center">
                                    <button
                                      type="button"
                                      className="h-7 w-8 inline-flex items-center justify-center rounded border border-slate-200 text-slate-500 cursor-grab active:cursor-grabbing hover:bg-white"
                                      title="Arraste para mudar a ordem"
                                      aria-label="Arraste para mudar a ordem do exercício"
                                    >
                                      <GripVertical className="h-4 w-4" />
                                    </button>
                                  </div>
                                  <button type="button" onClick={() => { setPickerTarget({ wi, ei }); setPickerSearch(""); setPickerGroup(""); }} className="col-span-9 sm:col-span-2 text-xs font-medium truncate text-left hover:text-[#1B2B4A] hover:underline" title="Trocar exercício (biblioteca)">{ex.exercise_name || "—"} ✎</button>
                                  <Input className="col-span-3 sm:col-span-1 h-7 text-xs px-1" value={String(ex.sets ?? "")} onChange={e => updateExField(wi, ei, "sets", e.target.value)} placeholder="séries" />
                                  <Input className="col-span-3 sm:col-span-2 h-7 text-xs px-1" value={String(ex.reps ?? "")} onChange={e => updateExField(wi, ei, "reps", e.target.value)} placeholder="reps" />
                                  <Input className="col-span-3 sm:col-span-2 h-7 text-xs px-1" value={String(ex.rest_seconds ?? "")} onChange={e => updateExField(wi, ei, "rest_seconds", e.target.value)} placeholder="desc(s)" />
                                  <Input className="col-span-9 sm:col-span-3 h-7 text-xs px-1" value={ex.cues || ex.notes || ""} onChange={e => updateExField(wi, ei, "cues", e.target.value)} placeholder="obs" />
                                  <button type="button" onClick={() => removeExercise(wi, ei)} className="col-span-3 sm:col-span-1 text-red-500 text-sm" title="Remover exercício">✕</button>
                                </div>
                              ))}
                              <button type="button" onClick={() => { setPickerTarget(pickerTarget?.wi === wi && pickerTarget?.ei == null ? null : { wi, ei: null }); setPickerSearch(""); setPickerGroup(""); }} className="text-xs text-[#1B2B4A] underline mt-1">+ Adicionar exercício</button>
                              {pickerTarget?.wi === wi && (
                                <div className="mt-2 border rounded-lg p-2 bg-slate-50">
                                  <div className="flex items-center justify-between mb-1">
                                    <p className="text-[11px] font-medium text-slate-600">{pickerTarget.ei == null ? "Adicionar da biblioteca" : "Trocar exercício"}</p>
                                    <button type="button" onClick={() => setPickerTarget(null)} className="text-[11px] text-slate-400">fechar</button>
                                  </div>
                                  <Input value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} placeholder="Buscar na biblioteca..." className="h-8 text-xs mb-2" />
                                  <div className="flex flex-wrap gap-1 mb-2">
                                    {["", ...Array.from(new Set(library.map(l => l.muscle_group).filter(Boolean) as string[])).sort()].map(g => (
                                      <button type="button" key={g || "all"} onClick={() => setPickerGroup(g)} className={`px-2 py-0.5 rounded-full text-[10px] border ${pickerGroup === g ? "border-[#8B7355] bg-[#F5EDD8]/60 text-[#1B2B4A]" : "border-slate-200 text-slate-500"}`}>{g || "Todos"}</button>
                                    ))}
                                  </div>
                                  <div className="max-h-44 overflow-y-auto space-y-1">
                                    {library.length === 0 && <p className="text-xs text-slate-400">Carregando biblioteca…</p>}
                                    {library
                                      .filter(l => !pickerGroup || l.muscle_group === pickerGroup)
                                      .filter(l => (l.name || "").toLowerCase().includes(pickerSearch.trim().toLowerCase()))
                                      .slice(0, 60).map(l => (
                                        <button type="button" key={l.id} onClick={() => pickExercise(l)} className="w-full text-left text-xs px-2 py-1 rounded border border-transparent hover:bg-white hover:border-slate-200 flex justify-between gap-2">
                                          <span className="truncate">{l.name}</span>
                                          {l.muscle_group && <span className="text-slate-400 shrink-0">{l.muscle_group}</span>}
                                        </button>
                                      ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                          <button type="button" onClick={addWorkout} className="text-sm text-[#1B2B4A] underline">+ Adicionar treino</button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Publica o treino de força no app do aluno (o PDF/IA sozinho NÃO aparece pro aluno). */}
                  {results.musculacao && scheduledSummaries.length <= 1 && (
                    <>
                      <Button onClick={publishToStudent} disabled={publishing} variant="outline"
                        className="w-full border-[#1B2B4A] text-[#1B2B4A] hover:bg-[#1B2B4A]/5">
                        {publishing
                          ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Publicando…</>
                          : <><Dumbbell className="h-4 w-4 mr-2" /> Publicar treino no app do aluno</>}
                      </Button>
                      {published && (
                        <p className="text-xs text-green-600 flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {published.scheduled
                            ? `Treino agendado (${published.workoutsCreated} sessões). Ele aparecerá no app somente na data de início do ciclo.`
                            : `Treino publicado (${published.workoutsCreated} sessões)${published.createdEnrollment ? " · matrícula criada" : ""}. O aluno já vê no app dele.`}
                        </p>
                      )}
                    </>
                  )}
                  {results.musculacao && scheduledSummaries.length > 1 && (
                    <p className="flex items-center gap-1.5 text-xs text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      A sequência de força já foi vinculada aos ciclos. Cada bloco aparece ao aluno apenas durante a própria vigência.
                    </p>
                  )}
                  {pdfs.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {pdfs.map(p => (
                        <button key={p.modality} onClick={() => p.doc.save(p.filename)}
                          className="flex items-center gap-2 text-sm border rounded-lg p-2 hover:bg-slate-50">
                          <FileText className="h-4 w-4 text-[#8B7355]" />
                          <span>{p.label}.pdf</span>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
