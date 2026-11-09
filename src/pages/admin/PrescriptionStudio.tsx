import { projectPrescriptionCoverage } from '@/lib/prescriptionCoverage';
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
import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { useCompanyAiConfig } from "@/lib/companyAiConfig";
import {
  Loader2, Copy, CheckCircle2, Circle, AlertCircle, Send, Download, Wand2,
  Dumbbell, Activity, Waves, Bike, Apple, FileText, GripVertical, CalendarRange, Layers3, Play,
} from "lucide-react";
import VideoAssessment from "@/components/VideoAssessment";
import { generateAllPDFs, generateAssessmentPDF } from "@/lib/generatePDFs";
import { loadCompanyPDFMeta } from '@/lib/prescription/pdfMeta';
import { CompanyMethodologyContext } from '@/lib/prescription/companyMethodologyContext';
import { sendPdfToStudentWhatsApp } from "@/lib/sendStudentMedia";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Tabs, TabsContent, TabsList, TabsTrigger } from "@/lib/studioUi";
import { BnitoContextButton } from "@/components/BnitoFloatingAssistant";
import {
  buildBnitoOrchestrationPlan,
  buildPrescriptionIntegration,
  formatPrescriptionIntegrationSummary,
} from "../../../supabase/functions/_shared/prescription/integration";
import { readEdgeError } from "@/lib/edgeError";
import { buildPublishDecisionLog, publishIntegratedStudioDraft, publishStrengthDraftToStudent, type StudioModalityVersions } from "@/lib/publishStrengthPlan";
import { businessDateYmd } from "@/lib/businessDate";
import { PeriodizationRoadmap } from "@/components/admin/PeriodizationRoadmap";
import { openStudentChat } from "@/lib/studentChat";
import { toast } from "sonner";
import { filterMaterializedWorkouts } from "@/lib/workoutPresence";
import { anamnesisInviteUrl } from "@/lib/publicFlowLinks";
import { resolveStudioAnamnesis, studioAnamnesisGenerationBlockReason } from "@/lib/preRegistrationData";
import { exerciseThumb, youtubeIdFromUrl } from "@/lib/exerciseCover";
import { summarizeExerciseWeeklyProgression } from "@/lib/weeklyStrengthPeriodization";
import {
  buildWorkoutOrderUnits,
  moveWorkoutOrderUnit,
  moveWorkoutOrderUnitByExerciseIndex,
  renumberWorkoutExercises,
} from "@/lib/workoutOrder";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CardioPlanEditor, type CardioPlanDraft } from "@/components/admin/CardioPlanEditor";
import {
  captureGeneratedCardioPlan,
  captureGeneratedStrengthPlan,
  saveCardioPlanDraft,
  saveStrengthPlanDraft,
} from "@/lib/cardioPlanPersistence";
import {
  describeLongitudinalPhase,
  isCycleCurrent,
  hasActivePrescriptionContent,
  longitudinalPhase,
  scheduleSpanWeeks,
  isPrescriptionHistoryBeforeTarget,
  selectDefaultPrescriptionScheduleCycle,
  selectPreviousPrescriptionCycle,
  selectPrescriptionEnrollment,
  selectPrescriptionTargets,
  type PrescriptionEnrollment,
  type PrescriptionScheduleCycle,
  type PrescriptionScheduleMode,
} from "@/lib/prescriptionSchedule";
import {
  clearWhatsAppAssessmentHandoff,
  resolveStudioWhatsAppAssessmentHandoff,
  type WhatsAppAssessmentVideoHandoff,
} from "@/lib/whatsappAssessmentHandoff";

type Modality = "musculacao" | "corrida" | "natacao" | "ciclismo" | "nutricao";
type GenStatus = "idle" | "generating" | "done" | "error";
const db = supabase as any;

type PendingStrength = { bundleId: string; cycleId: string } & (
  { mixed: true; body?: never } | { mixed?: false; body?: Record<string, unknown> }
);
type GeneratedStrength = ReturnType<typeof captureGeneratedStrengthPlan>;

function readPendingStrength(key: string): PendingStrength | null {
  try {
    const [bundleId, cycleId, kind] = (sessionStorage.getItem(key) || "").split(":");
    return bundleId && cycleId ? { bundleId, cycleId, mixed: kind === "mixed" } : null;
  } catch {
    return null;
  }
}

function isAmbiguousStrengthFailure(error: unknown) {
  return error instanceof FunctionsFetchError || error instanceof FunctionsRelayError
    || (error instanceof FunctionsHttpError && [502, 503, 504].includes(error.context?.status))
    // A successful HTTP response can also be lost while the SDK reads or parses its body.
    || (error instanceof Error && ["AbortError", "TypeError", "SyntaxError"].includes(error.name));
}

async function requestStudioStrength(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("ai-prescribe-workout", { body });
  if (isAmbiguousStrengthFailure(error)) return { outcome: "unconfirmed" } as const;
  if (error || data?.error) {
    throw new Error((await readEdgeError(error, data)) || "Falha na musculação.", { cause: error });
  }
  if (!data?.id) throw new Error("A musculação foi gerada sem ID persistido.");
  if (data.draft_only !== true) {
    throw new Error("O servidor precisa ser atualizado para confirmar o rascunho da musculação.");
  }
  return { outcome: "draft", strength: captureGeneratedStrengthPlan(data) } as const;
}

type StudioLibraryExercise = {
  id: string;
  name: string;
  muscle_group: string | null;
  video_url?: string | null;
  video_path?: string | null;
  thumbnail_url?: string | null;
  youtube_video_id?: string | null;
};

function studioAnswerSources(anamnese: Record<string, unknown>) {
  const asRecord = (value: unknown): Record<string, unknown> => (
    value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {}
  );
  return [
    anamnese,
    asRecord(anamnese.raw_answers),
    asRecord(anamnese.answers),
    asRecord(anamnese.responses),
  ];
}

function studioAnamneseValue(anamnese: Record<string, unknown>, keys: string[]) {
  for (const source of studioAnswerSources(anamnese)) {
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
  }
  return undefined;
}

function formatStudioTempo(value: string) {
  return /^\d{4}$/.test(value) ? value.split("").join("-") : value;
}

const MODALITIES: { id: Modality; icon: any; label: string; sub: string }[] = [
  { id: "musculacao", icon: Dumbbell, label: "Musculação", sub: "Força + biomecânica" },
  { id: "corrida",    icon: Activity, label: "Corrida",    sub: "Zonas FC + periodização" },
  { id: "natacao",    icon: Waves,    label: "Natação",    sub: "Volume + técnica" },
  { id: "ciclismo",   icon: Bike,     label: "Ciclismo",   sub: "Potência + zonas" },
  { id: "nutricao",   icon: Apple,    label: "Nutrição",   sub: "Dicas práticas" },
];

type StudioEnrollment = PrescriptionEnrollment & { plans?: { duration_days?: number | null; duration_weeks?: number | null; cycle_duration_days?: number | null } | null };
export function selectStudioEnrollment(rows: StudioEnrollment[], studentId: string, companyId: string, day = businessDateYmd()) {
  if (!studentId || !companyId) throw new Error('Selecione aluno e empresa antes de consultar a agenda.');
  return selectPrescriptionEnrollment(rows, { today: day, expectedStudentId: studentId, expectedCompanyId: companyId });
}
export function projectStudioSchedule(enrollment: StudioEnrollment, cycles: PrescriptionScheduleCycle[], studentId: string, companyId: string, day = businessDateYmd()) {
  if (enrollment.student_id !== studentId || enrollment.company_id !== companyId) throw new Error('Agenda fora do escopo do aluno ou empresa.');
  const result = projectPrescriptionCoverage({ enrollment, cycles, today: day, expectedStudentId: studentId, expectedCompanyId: companyId,
    cycleDurationDays: enrollment.plans?.cycle_duration_days || 42,
    planDurationDays: enrollment.plans?.duration_days || (enrollment.plans?.duration_weeks || 6) * 7 });
  if (!result.reliable) throw new Error('Vigência da matrícula inválida.');
  return result;
}

interface PrescriptionStudioProps {
  embeddedStudentId?: string;
  initialTab?: "avaliacao";
}

export default function PrescriptionStudio({ embeddedStudentId, initialTab }: PrescriptionStudioProps = {}) {
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
  const [students, setStudents]   = useState<{ id: string; name: string; email?: string | null; phone?: string | null; whatsapp?: string | null }[]>([]);
  const [studentId, setStudentId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [sendingAssess, setSendingAssess] = useState(false);
  const [editPlan, setEditPlan] = useState<any | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [library, setLibrary] = useState<StudioLibraryExercise[]>([]);
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
  const applyCycleTemplate = async (template: { id: string; name: string }) => {
    if (generationInFlight.current || generating || savingStrength || publishingStrengthRef.current || !studentId || !companyId) return;
    const cycle = selectedScheduleCycle;
    if (!cycle) { setError("Selecione o ciclo que receberá o modelo."); return; }
    if (generatedStrengthDrafts.some(draft => draft.cycle.id === cycle.id)
      && !window.confirm("Abrir um novo rascunho deste ciclo a partir do modelo?")) return;

    setGenerating(true);
    setError("");
    try {
      const { data, error: stageError } = await db.rpc("stage_studio_strength_template", {
        p_cycle_id: cycle.id, p_template_id: template.id,
      });
      if (stageError || !data?.bundle_id || !data.start_date || !data.end_date) {
        throw new Error("Não foi possível criar o rascunho do modelo para este ciclo.");
      }
      const staged = captureGeneratedStrengthPlan(data);
      const target = { ...cycle, start_date: data.start_date, end_date: data.end_date };
      const draft = { studentId, companyId, cycle: target, bundleId: data.bundle_id,
        draftId: staged.planId, draftVersion: staged.planVersion, plan: staged.plan };
      setGeneratedStrengthDrafts(current => [...current.filter(item => item.cycle.id !== cycle.id), draft]);
      setStrengthPlanId(staged.planId);
      setStrengthPlanVersion(staged.planVersion);
      setActiveIntegratedBundleId(null);
      setResults({ musculacao: staged.plan });
      setStatus(current => ({ ...current, musculacao: "done" }));
      setSavedStrength(false);
      setPublished(null);
      toast.success(`Modelo "${template.name}" carregado. Revise o rascunho antes de publicar.`);
    } catch (stageError) {
      setError(stageError instanceof Error ? stageError.message : "Falha ao carregar o modelo.");
    } finally {
      setGenerating(false);
    }
  };
  const deleteTemplate = async (id: string) => {
    if (!window.confirm("Excluir este template?")) return;
    await db.from("cycle_templates").delete().eq("id", id);
    setTemplates((t) => t.filter((x) => x.id !== id));
  };
  const [pickerTarget, setPickerTarget] = useState<{ wi: number; ei: number | null } | null>(null);
  const [pickerGroup, setPickerGroup] = useState("");
  const [pickerSearch, setPickerSearch] = useState("");
  const [dragExercise, setDragExercise] = useState<{ wi: number; unitIndex: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ wi: number; unitIndex: number } | null>(null);
  const dragPointerRef = useRef<{ wi: number; unitIndex: number; targetIndex: number | null } | null>(null);
  const [exerciseVideoPlayer, setExerciseVideoPlayer] = useState<{ url: string; title: string } | null>(null);
  const [tab, setTab]             = useState(initialTab ?? "anamnese");

  // Anamnese state
  const [anamnese, setAnamnese]       = useState<any>(null);
  const [anamneseLoading, setAnamneseLoading] = useState(false);
  const [anamneseLoadError, setAnamneseLoadError] = useState("");
  const anamneseGenerationBlockReason = studioAnamnesisGenerationBlockReason({
    loading: anamneseLoading,
    loadError: anamneseLoadError,
  });
  const [inviteLink, setInviteLink]   = useState("");
  const [copying, setCopying]         = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [assessment, setAssessment]   = useState<any>(null);

  // Prescrição state
  const [modalities, setModalities]   = useState<Set<Modality>>(new Set(["musculacao"]));
  const [status, setStatus]           = useState<Record<string, GenStatus>>({});
  const [results, setResults]         = useState<Record<string, any>>({});
  const [cardioPlanIds, setCardioPlanIds] = useState<Partial<Record<"corrida" | "natacao" | "ciclismo", string>>>({});
  const [cardioPlanVersions, setCardioPlanVersions] = useState<Partial<Record<"corrida" | "natacao" | "ciclismo", string>>>({});
  const [savingCardio, setSavingCardio] = useState<Partial<Record<"corrida" | "natacao" | "ciclismo", boolean>>>({});
  const [savedCardio, setSavedCardio] = useState<Partial<Record<"corrida" | "natacao" | "ciclismo", boolean>>>({});
  const [strengthPlanId, setStrengthPlanId] = useState<string | null>(null);
  const [strengthPlanVersion, setStrengthPlanVersion] = useState<string | null>(null);
  const [savingStrength, setSavingStrength] = useState(false);
  const [savedStrength, setSavedStrength] = useState(false);
  const [generating, setGenerating]   = useState(false);
  const generationInFlight = useRef(false);
  const [pendingStrengthAttempts, setPendingStrengthAttempts] = useState<Record<string, PendingStrength | null>>({});
  const [error, setError]             = useState("");
  const [pdfs, setPdfs]               = useState<any[]>([]);
  // Publicação do treino de força para o app do aluno.
  const [publishing, setPublishing]   = useState(false);
  const [publicationError, setPublicationError] = useState<{ draftId: string; message: string } | null>(null);
  const [published, setPublished]     = useState<{ workoutsCreated: number; current: boolean; scheduled: boolean; integrated: boolean } | null>(null);
  const [scheduleCycles, setScheduleCycles] = useState<PrescriptionScheduleCycle[]>([]);
  const [scheduleCoverage, setScheduleCoverage] = useState<ReturnType<typeof projectStudioSchedule> | null>(null);
  const [scheduleMode, setScheduleMode] = useState<PrescriptionScheduleMode>("single");
  const [selectedCycleId, setSelectedCycleId] = useState<string>("");
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleLoadError, setScheduleLoadError] = useState("");
  const [hasCurrentEnrollment, setHasCurrentEnrollment] = useState(false);
  const [scheduleProgress, setScheduleProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [scheduledSummaries, setScheduledSummaries] = useState<Array<{ cycle: PrescriptionScheduleCycle; modalities: string[] }>>([]);
  const [generatedStrengthDrafts, setGeneratedStrengthDrafts] = useState<Array<{
    studentId: string;
    companyId: string;
    cycle: PrescriptionScheduleCycle;
    bundleId: string;
    draftId: string;
    draftVersion: string;
    plan: any;
    integrated?: boolean;
  }>>([]);
  const [integratedDrafts, setIntegratedDrafts] = useState<Array<{
    cycle: PrescriptionScheduleCycle;
    bundleId: string;
    versions: StudioModalityVersions;
    plans: Record<string, CardioPlanDraft>;
    hasStrength: boolean;
  }>>([]);
  const [activeIntegratedBundleId, setActiveIntegratedBundleId] = useState<string | null>(null);
  const activeIntegratedDraft = integratedDrafts.find(item => item.bundleId === activeIntegratedBundleId
    && item.cycle.student_id === studentId && item.cycle.company_id === companyId);
  const activePublicationDraft = activeIntegratedDraft ?? generatedStrengthDrafts.find(item =>
    !item.integrated && item.draftId === strengthPlanId && item.studentId === studentId && item.companyId === companyId);
  const publishingStrengthRef = useRef(false);
  const [intercycleWaiverReason, setIntercycleWaiverReason] = useState("");
  // Vídeo vindo do WhatsApp, vinculado a aluno + conversa + mensagem.
  const [pendingWhatsAppVideo, setPendingWhatsAppVideo] = useState<WhatsAppAssessmentVideoHandoff | null>(null);
  const location = useLocation();
  const isEmbedded = Boolean(embeddedStudentId);

  const scheduleTargets = useMemo(() => selectPrescriptionTargets({
    cycles: scheduleCycles,
    mode: scheduleMode,
    selectedCycleId,
  }), [scheduleCycles, scheduleMode, selectedCycleId]);

  const formatCycleDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const selectedScheduleCycle = scheduleCycles.find((cycle) => cycle.id === selectedCycleId) || null;
  const pendingStrengthKey = user?.id && companyId && companyId === effectiveCompanyId && studentId
    ? `sett:studio-pending-strength:${user.id}:${companyId}:${studentId}` : null;
  const activeStrengthScope = useRef(pendingStrengthKey);
  useLayoutEffect(() => {
    activeStrengthScope.current = pendingStrengthKey;
    return () => { activeStrengthScope.current = null; };
  }, [pendingStrengthKey]);
  const pendingStrength = pendingStrengthKey
    ? pendingStrengthAttempts[pendingStrengthKey] === undefined
      ? readPendingStrength(pendingStrengthKey)
      : pendingStrengthAttempts[pendingStrengthKey]
    : null;
  const pendingStrengthCycle = scheduleCycles.find(cycle => cycle.id === pendingStrength?.cycleId
    && cycle.student_id === studentId && cycle.company_id === companyId);
  const generatesStrengthOnly = modalities.size === 1 && modalities.has("musculacao");
  const generateLabel = generatesStrengthOnly ? "Gerar rascunho" : "Gerar rascunho integrado";
  const generationButtonLabel = pendingStrength ? "Iniciar nova geração" : scheduleMode === "remaining"
    ? `${generateLabel} · ${scheduleTargets.length} ${scheduleTargets.length === 1 ? "ciclo" : "ciclos"}`
    : selectedScheduleCycle
      ? `${generateLabel} · ciclo ${selectedScheduleCycle.cycle_number}`
      : "Selecione um ciclo";

  // ── Gate de auth ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!user) { nav("/auth"); return; }
    setAuthChecked(true);
  }, [authLoading, user, nav]);

  // O history.state permanece intacto até o vídeo ser validado, aberto e cortado.
  // Assim, falha de rede/permissão não destrói a possibilidade de retry.
  useEffect(() => {
    if (embeddedStudentId) setStudentId(embeddedStudentId);
    if (embeddedStudentId) setStudentPickerOpen(false);
  }, [embeddedStudentId]);

  useEffect(() => {
    const handoff = resolveStudioWhatsAppAssessmentHandoff(location.state, { embeddedStudentId });
    if (handoff) {
      if (embeddedStudentId && handoff.studentId !== embeddedStudentId) return;
      if (!embeddedStudentId) setStudentId(handoff.studentId);
      setTab("avaliacao");
      setPendingWhatsAppVideo(handoff);
      return;
    }
    if (isEmbedded) return;
    const dashboardHandoff = location.state as { studentId?: unknown; tab?: unknown } | null;
    if (typeof dashboardHandoff?.studentId === "string") setStudentId(dashboardHandoff.studentId);
    if (
      dashboardHandoff?.tab === "anamnese"
      || dashboardHandoff?.tab === "avaliacao"
      || dashboardHandoff?.tab === "prescricao"
    ) {
      setTab(dashboardHandoff.tab);
    }
  }, [embeddedStudentId, isEmbedded, location.state]);

  const consumeWhatsAppAssessmentHandoff = () => {
    clearWhatsAppAssessmentHandoff();
    setPendingWhatsAppVideo(null);
    if (isEmbedded) {
      const state = location.state && typeof location.state === "object"
        ? { ...(location.state as Record<string, unknown>) }
        : null;
      if (state) delete state.whatsappAssessmentHandoff;
      nav(`${location.pathname}${location.search}`, {
        replace: true,
        state: state && Object.keys(state).length ? state : null,
      });
      return;
    }
    nav(location.pathname, { replace: true, state: null });
  };

  // ── Carrega alunos da empresa efetiva ─────────────────────────────────────
  useEffect(() => {
    if (!effectiveCompanyId) { setCompanyId(null); setStudents([]); return; }
    setCompanyId(effectiveCompanyId);
    (async () => {
      const { data: list } = await supabase
        .from("students")
        .select("id, full_name, email, phone, whatsapp")
        .eq("company_id", effectiveCompanyId)
        .order("full_name");
      setStudents((list || []).map((s: any) => ({
        id: s.id,
        name: s.full_name,
        email: s.email,
        phone: s.phone,
        whatsapp: s.whatsapp,
      })));
    })();
  }, [effectiveCompanyId]);

  const student = students.find(s => s.id === studentId);

  // ── Carrega anamnese + avaliação ao trocar aluno ────────────────────────
  useEffect(() => {
    if (!studentId) {
      setAnamnese(null);
      setAnamneseLoading(false);
      setAnamneseLoadError("");
      setAssessment(null);
      setAssessmentId(null);
      setInviteLink("");
      return;
    }
    let active = true;
    setAnamnese(null);
    setAnamneseLoading(true);
    setAnamneseLoadError("");
    setAssessment(null);
    setAssessmentId(null);
    setInviteLink("");
    (async () => {
      try {
        const nextAnamnese = await resolveStudioAnamnesis({
          db,
          studentId,
          companyId,
          phone: student?.whatsapp || student?.phone,
        });
        if (!active) return;
        setAnamnese(nextAnamnese);
        // Pré-marca "o que o aluno vai receber" pelas flags da anamnese (já considera nutri/assessoria).
        if (nextAnamnese) {
          const next = new Set<Modality>();
          if ((nextAnamnese as any).wants_strength !== false) next.add("musculacao");
          if ((nextAnamnese as any).wants_running) next.add("corrida");
          if ((nextAnamnese as any).wants_swimming) next.add("natacao");
          if ((nextAnamnese as any).wants_cycling) next.add("ciclismo");
          if ((nextAnamnese as any).wants_nutrition) next.add("nutricao");
          if (next.size) setModalities(next);
        }
      } catch (error) {
        if (!active) return;
        console.error("PrescriptionStudio anamnesis load failed", {
          studentId,
          companyId,
          message: error instanceof Error ? error.message : "unknown error",
        });
        setAnamnese(null);
        setAnamneseLoadError("Falha ao carregar a anamnese. Tente novamente antes de prescrever.");
      } finally {
        if (active) setAnamneseLoading(false);
      }
      const { data: assess } = await db.from("functional_assessments")
        .select("id, assessment_json, report_text, created_at").eq("student_id", studentId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!active) return;
      setAssessment(assess);
      setAssessmentId(assess?.id || null);
      setInviteLink("");
    })();
    return () => { active = false; };
  }, [studentId, companyId, student?.phone, student?.whatsapp]);

  useEffect(() => {
    if (!studentId || !companyId) {
      setScheduleCoverage(null);
      setScheduleCycles([]);
      setSelectedCycleId("");
      setScheduleLoadError("");
      setHasCurrentEnrollment(false);
      return;
    }
    let active = true;
    (async () => {
      setScheduleLoading(true);
      setScheduleCoverage(null);
      setScheduleLoadError("");
      setHasCurrentEnrollment(false);
      setScheduleCycles([]);
      setSelectedCycleId("");
      setScheduledSummaries([]);
      try {
        let enrollmentQuery = db.from("enrollments")
          .select("*, plans(duration_days, duration_weeks, cycle_duration_days)")
          .eq("student_id", studentId)
          .in("status", ["active", "awaiting_training", "awaiting_renewal"])
          .order("created_at", { ascending: false });
        if (companyId) enrollmentQuery = enrollmentQuery.eq("company_id", companyId);
        const { data: enrollmentRows, error: enrollmentError } = await enrollmentQuery;
        if (enrollmentError) throw enrollmentError;
        const currentEnrollment = selectStudioEnrollment(enrollmentRows || [], studentId, companyId);
        if (!active) return;
        setHasCurrentEnrollment(Boolean(currentEnrollment));
        if (!currentEnrollment) {
          setScheduleCycles([]);
          setSelectedCycleId("");
          return;
        }

        let cycleQuery = db.from("training_cycles")
          .select("*")
          .eq("enrollment_id", currentEnrollment.id)
          .order("start_date", { ascending: true })
          .order("cycle_number", { ascending: true });
        if (companyId) cycleQuery = cycleQuery.eq("company_id", companyId);
        const { data: cycleRows, error: cycleError } = await cycleQuery;
        if (cycleError) throw cycleError;
        if (!active) return;

        const cycleIds = ((cycleRows || []) as PrescriptionScheduleCycle[]).map((cycle) => cycle.id);
        let workoutCycleIds = new Set<string>();
        let bundleCycleIds = new Set<string>();
        if (cycleIds.length > 0) {
          let workoutQuery = db.from("workouts")
            .select("id, cycle_id, exercises")
            .in("cycle_id", cycleIds)
            .is("superseded_at", null);
          let bundleQuery = db.from("prescription_bundles")
            .select("id, training_cycle_id, status")
            .in("training_cycle_id", cycleIds)
            .in("status", ["active", "scheduled"]);
          if (companyId) {
            workoutQuery = workoutQuery.eq("company_id", companyId);
            bundleQuery = bundleQuery.eq("company_id", companyId);
          }
          const [{ data: workoutRows, error: workoutError }, { data: bundleRows, error: bundleError }] = await Promise.all([
            workoutQuery,
            bundleQuery,
          ]);
          if (workoutError) throw workoutError;
          if (bundleError) throw bundleError;
          if (!active) return;
          workoutCycleIds = new Set(
            filterMaterializedWorkouts(workoutRows || [])
              .map((workout: any) => workout.cycle_id)
              .filter(Boolean),
          );
          bundleCycleIds = new Set((bundleRows || [])
            .map((bundle: any) => bundle.training_cycle_id)
            .filter(Boolean));
        }

        let rows: PrescriptionScheduleCycle[] = ((cycleRows || []) as PrescriptionScheduleCycle[]).map((cycle) => ({
          ...cycle,
          has_workouts: workoutCycleIds.has(cycle.id),
          has_usable_workouts: !cycle.prescription_cleared_at && workoutCycleIds.has(cycle.id),
          has_bundle: bundleCycleIds.has(cycle.id),
        }));
        const coverage = projectStudioSchedule(currentEnrollment, rows, studentId, companyId);
        rows = coverage.cycles;
        setScheduleCoverage(coverage);
        setScheduleCycles(rows);
        const preferred = selectDefaultPrescriptionScheduleCycle(rows, new Date(`${businessDateYmd()}T12:00:00`));
        setSelectedCycleId(preferred?.id || "");
      } catch (loadError) {
        const safeError = loadError && typeof loadError === "object"
          ? {
            code: "code" in loadError ? String((loadError as { code?: unknown }).code || "") : "",
            message: "message" in loadError ? String((loadError as { message?: unknown }).message || "") : "",
          }
          : { code: "", message: String(loadError || "") };
        console.error("PrescriptionStudio schedule load failed", safeError);
        if (!active) return;
        setScheduleCycles([]);
        setSelectedCycleId("");
        setScheduleLoadError("Não foi possível carregar a vigência persistida. Tente novamente antes de prescrever.");
      } finally {
        if (active) setScheduleLoading(false);
      }
    })();
    return () => { active = false; };
  }, [studentId, companyId]);

  useEffect(() => {
    if (scheduleLoading || !studentId || !companyId || scheduleCycles.length === 0) return;
    const pendingBundleId = pendingStrengthKey ? readPendingStrength(pendingStrengthKey)?.bundleId : null;
    const cyclesById = new Map(scheduleCycles.map(cycle => [cycle.id, cycle]));
    let active = true;
    (async () => {
      const { data: bundles, error: bundleError } = await db.from("prescription_bundles")
        .select("id,training_cycle_id,studio_strength_snapshot,studio_modalities_draft,modalities").eq("company_id", companyId).eq("student_id", studentId)
        .eq("studio_strength_draft", true).eq("status", "draft").in("training_cycle_id", [...cyclesById.keys()]);
      if (!active || bundleError || !bundles?.length) return;
      const bundleById = new Map<string, any>(bundles.map((bundle: any) => [bundle.id, bundle]));

      const { data: plans, error: draftError } = await db.from("ai_strength_plans")
        .select("id,bundle_id,studio_draft_cycle_id,updated_at,plan").eq("company_id", companyId).eq("student_id", studentId)
        .in("bundle_id", [...bundleById.keys()]).order("created_at", { ascending: false });
      if (!active || draftError || !plans?.length) return;
      const recovered = new Map<string, typeof generatedStrengthDrafts[number]>();
      for (const row of plans) {
        const cycle = cyclesById.get(row.studio_draft_cycle_id);
        const bundle = bundleById.get(row.bundle_id);
        const snapshot = bundle?.studio_strength_snapshot;
        if (!bundle?.studio_modalities_draft && bundle?.modalities?.some((modality: string) => modality !== "musculacao")) continue;
        if (!cycle || row.bundle_id === pendingBundleId || recovered.has(cycle.id)
          || !snapshot?.start_date || !snapshot.end_date || !row.updated_at || !row.plan
          || (cycle.bundle_id ?? null) !== snapshot.bundle_id) continue;
        recovered.set(cycle.id, { studentId, companyId, bundleId: row.bundle_id, draftId: row.id,
          draftVersion: row.updated_at, plan: row.plan, integrated: bundle.studio_modalities_draft, cycle: { ...cycle, start_date: snapshot.start_date, end_date: snapshot.end_date } });
      }
      setGeneratedStrengthDrafts(current => [
        ...current,
        ...[...recovered.values()].filter(draft => !current.some(item => item.cycle.id === draft.cycle.id)),
      ]);
    })();
    return () => { active = false; };
  }, [studentId, companyId, scheduleLoading, scheduleCycles, pendingStrengthKey]);

  useEffect(() => {
    if (scheduleLoading || !studentId || !companyId || scheduleCycles.length === 0) return;
    const cycles = new Map(scheduleCycles.map(cycle => [cycle.id, cycle]));
    let active = true;
    (async () => {
      const { data: bundles, error: bundleError } = await db.from("prescription_bundles")
        .select("id,training_cycle_id,modalities,studio_modalities_snapshot").eq("company_id", companyId).eq("student_id", studentId)
        .eq("studio_modalities_draft", true).eq("status", "draft").in("training_cycle_id", [...cycles.keys()]);
      if (!active || bundleError || !bundles?.length) return;
      const { data: rows, error: draftError } = await db.from("studio_modality_drafts")
        .select("id,bundle_id,modality,plan,updated_at").in("bundle_id", bundles.map((bundle: any) => bundle.id));
      if (!active || draftError || !rows) return;
      const recovered: typeof integratedDrafts = [];
      for (const bundle of bundles) {
        const cycle = cycles.get(bundle.training_cycle_id);
        const snapshot = bundle.studio_modalities_snapshot;
        if (!cycle || cycle.start_date !== snapshot?.start_date || cycle.end_date !== snapshot?.end_date
          || (cycle.bundle_id ?? null) !== snapshot.bundle_id) continue;
        const drafts = rows.filter((row: any) => row.bundle_id === bundle.id);
        const modalities = bundle.modalities.filter((modality: string) => modality !== "musculacao");
        if (drafts.length !== modalities.length || !modalities.every((modality: string) => drafts.some((row: any) => row.modality === modality))) continue;
        recovered.push({
          cycle, bundleId: bundle.id, hasStrength: bundle.modalities.includes("musculacao"),
          versions: Object.fromEntries(drafts.map((row: any) => [row.modality, { id: row.id, updated_at: row.updated_at }])),
          plans: Object.fromEntries(drafts.map((row: any) => [row.modality, row.plan])),
        });
      }
      setIntegratedDrafts(current => [...current, ...recovered.filter(draft => !current.some(item => item.bundleId === draft.bundleId))]);
    })();
    return () => { active = false; };
  }, [studentId, companyId, scheduleLoading, scheduleCycles]);

  function openIntegratedDraft(draft: typeof integratedDrafts[number], strength?: typeof generatedStrengthDrafts[number]) {
    const versions = { ...draft.versions };
    delete versions.nutricao;
    setActiveIntegratedBundleId(draft.bundleId);
    setCardioPlanIds(Object.fromEntries(Object.entries(versions).map(([key, value]) => [key, value.id])));
    setCardioPlanVersions(Object.fromEntries(Object.entries(versions).map(([key, value]) => [key, value.updated_at])));
    setSavedCardio({});
    const plans = { ...draft.plans, ...(strength ? { musculacao: strength.plan } : {}) };
    setResults(plans);
    setStatus(Object.fromEntries(Object.keys(plans).map(modality => [modality, "done"])));
    setStrengthPlanId(strength?.draftId ?? null);
    setStrengthPlanVersion(strength?.draftVersion ?? null);
    setSavedStrength(false);
    setPublished(null);
    setError("");
  }

  function openStrengthDraft(draft: typeof generatedStrengthDrafts[number]) {
    const current = generatedStrengthDrafts.find(item => item.draftId === strengthPlanId);
    if (current && JSON.stringify(editPlan) !== JSON.stringify(current.plan)
      && !window.confirm("Você tem alterações sem salvar no rascunho aberto. Trocar de rascunho mesmo assim?")) return;
    if (draft.integrated) {
      const integrated = integratedDrafts.find(item => item.bundleId === draft.bundleId);
      if (integrated) openIntegratedDraft(integrated, draft);
      return;
    }
    setActiveIntegratedBundleId(null);
    setCardioPlanIds({});
    setCardioPlanVersions({});
    setResults({ musculacao: draft.plan });
    setEditPlan(draft.plan);
    setStrengthPlanId(draft.draftId);
    setStrengthPlanVersion(draft.draftVersion);
    setStatus(current => ({ ...current, musculacao: "done" }));
    setSavedStrength(false);
    setPublished(null);
    setError("");
  }

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
    if (generationInFlight.current) return;
    setStudentSearch(value);
    setStudentPickerOpen(true);
    const normalized = value.trim().toLowerCase();
    const exact = students.find((s) => (s.name || "").trim().toLowerCase() === normalized);
    setStudentId(exact?.id || "");
  };

  const selectStudent = (id: string) => {
    if (generationInFlight.current) return;
    const selected = students.find((s) => s.id === id);
    setStudentId(id);
    setStudentSearch(selected?.name || "");
    setStudentPickerOpen(false);
  };

  const assessmentContext = useMemo(
    () => assessment?.assessment_json
      ? { ...assessment.assessment_json, report_text: assessment.report_text, id: assessment.id, created_at: assessment.created_at }
      : null,
    [assessment],
  );
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
  const buildStudentIntegration = useCallback(
    (currentAnamnesis: Record<string, unknown> | null) => {
      const base = buildPrescriptionIntegration({
        anamnese: currentAnamnesis,
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
    [assessmentContext, assessmentId, assessment?.created_at, lastCheckin],
  );
  const prescriptionIntegration = useMemo(() => buildStudentIntegration(anamnese), [buildStudentIntegration, anamnese]);
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
    const previousCycle = selectPreviousPrescriptionCycle(scheduleCycles, cycle);
    if (!previousCycle) return null;
    const today = new Date();
    const previousStart = new Date(`${previousCycle.start_date}T12:00:00`);
    if (previousStart.getTime() > today.getTime()) return null;
    const [{ data: feedback }, { data: workouts }] = await Promise.all([
      db.from("cycle_feedback").select("effort_score, goals_aligned, wants_adjustment, adjustment_notes, answers")
        .eq("cycle_id", previousCycle.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("workouts").select("id, exercises").eq("cycle_id", previousCycle.id).is("superseded_at", null),
    ]);
    const workoutIds = filterMaterializedWorkouts<{ id: string; exercises?: unknown }>(workouts || [])
      .map((workout) => workout.id);
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

  function rememberPendingStrength(key: string, attempt: PendingStrength | null) {
    setPendingStrengthAttempts(current => ({ ...current, [key]: attempt }));
    // The request contains anamnesis and assessment details. Keep only IDs across reloads.
    try {
      if (attempt) sessionStorage.setItem(key, `${attempt.bundleId}:${attempt.cycleId}${attempt.mixed ? ":mixed" : ""}`);
      else sessionStorage.removeItem(key);
    } catch { /* In-memory retry still works if storage is unavailable. */ }
  }

  async function finalizeStrengthDraft(bundleId: string, cycle: PrescriptionScheduleCycle, integrated = false) {
    const { data, error } = await db.from("prescription_bundles")
      .update({ status: "draft", generation_error: null })
      .eq("id", bundleId).eq("company_id", cycle.company_id).eq("student_id", cycle.student_id)
      .eq("training_cycle_id", cycle.id).eq(integrated ? "studio_modalities_draft" : "studio_strength_draft", true)
      .in("status", ["generating", "draft"]).select("id").maybeSingle();
    if (error || data?.id !== bundleId) {
      throw new Error(`Não foi possível confirmar o pacote do ciclo ${cycle.cycle_number}. Consulte o rascunho pendente.`);
    }
  }

  function showStrengthDraft(cycle: PrescriptionScheduleCycle, bundleId: string, strength: GeneratedStrength, integrated = false) {
    const { plan, planId: draftId, planVersion: draftVersion } = strength;
    const draft = { studentId: cycle.student_id, companyId: cycle.company_id, cycle, bundleId, draftId, draftVersion, plan, integrated };
    setStrengthPlanId(draftId);
    setStrengthPlanVersion(draftVersion);
    setSavedStrength(false);
    setPublished(null);
    setGeneratedStrengthDrafts(current => [...current.filter(item => item.cycle.id !== cycle.id), draft]);
  }

  async function retryPendingStrength() {
    if (generationInFlight.current || generating || savingStrength || publishingStrengthRef.current
      || scheduleLoading || !pendingStrengthKey || !pendingStrength || pendingStrength.mixed || !pendingStrengthCycle) return;
    generationInFlight.current = true;
    setGenerating(true);
    setError("");
    setStatus(current => ({ ...current, musculacao: "generating" }));
    const { bundleId, body } = pendingStrength;
    const cycle = pendingStrengthCycle;

    try {
      let strength: GeneratedStrength;
      let draftCycle = cycle;
      let needsFinalize = true;
      if (body) {
        const response = await requestStudioStrength(body);
        if (response.outcome === "unconfirmed") {
          throw new Error("A resposta da musculação ainda não foi confirmada. Retente quando a conexão voltar.");
        }
        strength = response.strength;
      } else {
        const [bundle, plan] = await Promise.all([
          db.from("prescription_bundles").select("status,studio_strength_snapshot,studio_strength_draft")
            .eq("id", bundleId).eq("company_id", cycle.company_id).eq("student_id", cycle.student_id)
            .eq("training_cycle_id", cycle.id).maybeSingle(),
          db.from("ai_strength_plans").select("studio_draft_cycle_id,studio_publication")
            .eq("bundle_id", bundleId).eq("company_id", cycle.company_id).eq("student_id", cycle.student_id)
            .maybeSingle(),
        ]);
        if (activeStrengthScope.current !== pendingStrengthKey) return;
        if (bundle.error || plan.error) throw new Error("Não foi possível consultar o rascunho pendente. Tente novamente.");
        const receipt = plan.data?.studio_publication;
        if (bundle.data?.studio_strength_draft === false && receipt?.cycle_id === cycle.id && receipt.bundle_id === bundleId) {
          rememberPendingStrength(pendingStrengthKey, null);
          setStatus(current => ({ ...current, musculacao: "done" }));
          toast.info("Esta geração de musculação já foi publicada. Consulte o ciclo na agenda.");
          return;
        }
        if (!plan.data) {
          throw new Error("Ainda não há rascunho salvo para esta tentativa. Consulte novamente ou inicie uma nova geração.");
        }
        const snapshot = bundle.data?.studio_strength_snapshot;
        if (!bundle.data?.studio_strength_draft || plan.data.studio_draft_cycle_id !== cycle.id
          || !snapshot?.start_date || !snapshot.end_date || (cycle.bundle_id ?? null) !== snapshot.bundle_id) {
          throw new Error("O rascunho pendente não corresponde mais ao ciclo atual.");
        }
        draftCycle = { ...cycle, start_date: snapshot.start_date, end_date: snapshot.end_date };
        const response = await requestStudioStrength({
          student_id: cycle.student_id, company_id: cycle.company_id,
          bundle_id: bundleId, training_cycle_id: cycle.id, draft_only: true, recover_draft_only: true,
          expected_cycle_start: snapshot.start_date, expected_cycle_end: snapshot.end_date,
        });
        if (response.outcome === "unconfirmed") {
          throw new Error("Não foi possível confirmar o rascunho pendente. Tente novamente.");
        }
        strength = response.strength;
        needsFinalize = bundle.data.status !== "draft";
      }

      if (activeStrengthScope.current !== pendingStrengthKey) return;
      if (needsFinalize) await finalizeStrengthDraft(bundleId, cycle);
      if (activeStrengthScope.current !== pendingStrengthKey) return;
      rememberPendingStrength(pendingStrengthKey, null);
      setActiveIntegratedBundleId(null);
      showStrengthDraft(draftCycle, bundleId, strength);
      setResults(current => ({ ...current, musculacao: strength.plan }));
      setStatus(current => ({ ...current, musculacao: "done" }));
    } catch (retryError) {
      if (activeStrengthScope.current !== pendingStrengthKey) return;
      if (body && retryError instanceof Error && retryError.cause instanceof FunctionsHttpError
        && [409, 422].includes(retryError.cause.context?.status)) {
        rememberPendingStrength(pendingStrengthKey, { bundleId, cycleId: cycle.id });
      }
      setStatus(current => ({ ...current, musculacao: "error" }));
      setError(retryError instanceof Error ? retryError.message : "Falha ao recuperar a musculação.");
    } finally {
      generationInFlight.current = false;
      setGenerating(false);
    }
  }

  // ── Geração integrada e longitudinal das prescrições marcadas ────────────
  async function generate() {
    if (generationInFlight.current || generating || savingStrength || publishingStrengthRef.current) return;
    if (!studentId || !companyId || !pendingStrengthKey) { setError("Selecione um aluno."); return; }
    if (anamneseGenerationBlockReason) { setError(anamneseGenerationBlockReason); return; }
    if (modalities.size === 0) { setError("Marque ao menos uma modalidade."); return; }
    if (scheduleTargets.length === 0) { setError("Não há ciclo disponível para esta opção de agendamento."); return; }
    if (pendingStrength && !window.confirm("Iniciar uma nova geração? A musculação da tentativa pendente ainda pode ter sido salva. A nova geração vai criar outro pacote.")) return;
    if (!pendingStrength && generatedStrengthDrafts.some(draft => draft.studentId === studentId && draft.companyId === companyId)
      && !window.confirm("Iniciar outra geração? Ela substituirá os rascunhos abertos nesta tela.")) return;
    if (!generatesStrengthOnly) {
      const message = modalities.has("musculacao")
        ? "As outras modalidades selecionadas podem ser publicadas agora. A musculação fica para revisão. Continuar?"
        : "As modalidades selecionadas podem ser publicadas nesta etapa. Continuar?";
      const confirmed = window.confirm(message);
      if (!confirmed) return;
    }

    generationInFlight.current = true;
    if (pendingStrength) rememberPendingStrength(pendingStrengthKey, null);
    setGenerating(true); setError(""); setPdfs([]); setScheduledSummaries([]);
    const st: Record<string, GenStatus> = {};
    modalities.forEach((modality) => { st[modality] = "idle"; });
    setActiveIntegratedBundleId(null);
    setStatus(st); setResults({}); setCardioPlanIds({}); setCardioPlanVersions({}); setSavingCardio({}); setSavedCardio({});
    setStrengthPlanId(null); setStrengthPlanVersion(null); setSavedStrength(false);
    setPublished(null);

    let lastBundleId: string | null = null;
    let bundleCanFail = true;
    try {
      const latestAnamnesis = await resolveStudioAnamnesis({ db, studentId, companyId, phone: student?.whatsapp || student?.phone });
      if (activeStrengthScope.current !== pendingStrengthKey) return;
      setAnamnese(latestAnamnesis);
      const integrationCtx = buildStudentIntegration(latestAnamnesis);
      const a = latestAnamnesis || {};
      const firstTarget = scheduleTargets[0];
      const [strengthHistoryRes, runningHistoryRes, nutritionHistoryRes] = await Promise.all([
        db.from("ai_strength_plans").select("id, plan, sequence_number, training_cycle_id, created_at")
          .eq("student_id", studentId).is("studio_draft_cycle_id", null).is("studio_superseded_cycle_id", null)
          .or("studio_publication.is.null,training_cycle_id.not.is.null")
          .order("created_at", { ascending: false }),
        db.from("running_plans").select("id, sport, plan_name, goal, duration_weeks, weeks, fc_zones, safety_check, sequence_number, training_cycle_id, created_at")
          .eq("student_id", studentId).order("created_at", { ascending: false }),
        db.from("nutrition_plans").select("id, plan_name, goal, target_calories, target_protein_g, target_carbs_g, target_fat_g, meals, sequence_number, training_cycle_id, created_at")
          .eq("student_id", studentId).order("created_at", { ascending: false }),
      ]);
      const priorToFirst = (row: any) => isPrescriptionHistoryBeforeTarget(row, firstTarget, scheduleCycles);
      let previousStrength: any = (strengthHistoryRes.data || [])
        .find((row: any) => row.plan?.studio_draft_only !== true && priorToFirst(row)) || null;
      const previousCardio: Record<string, any> = {};
      for (const row of runningHistoryRes.data || []) {
        const key = String(row.sport || "corrida").toLowerCase();
        if (!previousCardio[key] && priorToFirst(row)) previousCardio[key] = row;
      }
      let previousNutrition: any = (nutritionHistoryRes.data || []).find(priorToFirst) || null;
      const summaries: Array<{ cycle: PrescriptionScheduleCycle; modalities: string[] }> = [];
      const preparedCycleIds = new Set<string>();
      if (modalities.has("musculacao") && strengthHistoryRes.error) {
        throw new Error("Não foi possível carregar o histórico seguro de musculação.");
      }
      for (let cycleIndex = 0; cycleIndex < scheduleTargets.length; cycleIndex += 1) {
        const cycle = scheduleTargets[cycleIndex];
        const phase = longitudinalPhase(cycle.cycle_number, cycle);
        const programSequence = {
          sequence_number: cycle.sequence_number ?? cycle.cycle_number,
          total_cycles: scheduleCycles.length,
          start_date: cycle.start_date,
          end_date: cycle.end_date,
          phase,
        };
        setScheduleProgress({ current: cycleIndex + 1, total: scheduleTargets.length, label: `Ciclo ${cycle.cycle_number}` });
        modalities.forEach((modality) => { st[modality] = "idle"; });
        setStatus({ ...st });

        const newResults: Record<string, any> = {};
        let generatedCardio = {
          plans: {} as Partial<Record<"corrida" | "natacao" | "ciclismo", CardioPlanDraft>>,
          planIds: {} as Partial<Record<"corrida" | "natacao" | "ciclismo", string>>,
          planVersions: {} as Partial<Record<"corrida" | "natacao" | "ciclismo", string>>,
        };
        let generatedStrength: GeneratedStrength | null = null;
        const cardioPlans: Record<string, any> = {};
        const integrated = !generatesStrengthOnly;
        const modalityVersions: StudioModalityVersions = {};
        const bundleId = crypto.randomUUID();
        lastBundleId = null;
        bundleCanFail = true;
        const assessmentCtx = assessmentContext;
        const orchestrationCtx = buildBnitoOrchestrationPlan(integrationCtx);
        const previousCycle = selectPreviousPrescriptionCycle(scheduleCycles, cycle);
        const performanceCtx = previousCycle && preparedCycleIds.has(previousCycle.id)
          ? null
          : await loadPreviousPerformance(cycle);

        if (activeStrengthScope.current !== pendingStrengthKey) return;
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
          ...(modalities.has("musculacao") ? { studio_strength_draft: true } : {}),
          ...(integrated ? { studio_modalities_draft: true } : {}),
        });
        if (bundleCreateError) throw new Error(`Falha ao iniciar o ciclo ${cycle.cycle_number}: ${bundleCreateError.message}`);
        lastBundleId = bundleId;

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
          const fitnessLevel = studioAnamneseValue(a, [
            "fitness_level", "strength_level", "training_level", "nivel_treino", "nivel_musculacao",
          ]);
          const experienceMonths = studioAnamneseValue(a, [
            "experience_months", "strength_experience_months", "muscle_training_months",
            "training_experience_months", "tempo_treino_meses", "tempo_de_treino_meses",
          ]);
          const body = {
            student_id: studentId, student_name: student?.name, company_id: companyId,
            anamnese_id: a.id, objective: a.objective,
            fitness_level: fitnessLevel,
            experience_months: experienceMonths,
            days_per_week: Number(a.days_per_week_strength ?? 3), duration_weeks: 6,
            equipment: a.equipment, block_number: cycle.sequence_number ?? cycle.cycle_number,
            is_endurance_athlete: a.is_endurance_athlete, restrictions: a.injuries, notes: a.notes,
            running_days_context: cardioDays > 0 ? { days_per_week: cardioDays, sport: a.sport } : null,
            assessment_context: assessmentCtx, anamnese_context: a,
            prescription_integration: integrationCtx, bnito_orchestration: orchestrationCtx,
            bundle_id: bundleId, training_cycle_id: cycle.id, draft_only: true,
            expected_cycle_start: cycle.start_date, expected_cycle_end: cycle.end_date,
            previous_plan_id: previousStrength?.id || null,
            previous_plan_context: previousStrength?.plan || null,
            previous_performance_context: performanceCtx,
            program_sequence: programSequence,
            intercycle_waiver_reason: intercycleWaiverReason.trim() || null,
          };
          if (activeStrengthScope.current !== pendingStrengthKey) return;
          rememberPendingStrength(pendingStrengthKey, generatesStrengthOnly
            ? { bundleId, cycleId: cycle.id, body }
            : { bundleId, cycleId: cycle.id, mixed: true });

          let response;
          try {
            response = await requestStudioStrength(body);
          } catch (strengthError) {
            rememberPendingStrength(pendingStrengthKey, null);
            throw strengthError;
          }
          if (response.outcome === "unconfirmed") {
            bundleCanFail = false;
            if (!generatesStrengthOnly) {
              await new Promise(resolve => window.setTimeout(resolve, 350));
              if (activeStrengthScope.current !== pendingStrengthKey) return;
              response = await requestStudioStrength(body);
            }
          }
          if (response.outcome === "unconfirmed") {
            throw new Error(generatesStrengthOnly
              ? "A resposta da musculação se perdeu. Retente a mesma geração quando a conexão voltar."
              : "A resposta da musculação não foi confirmada. Confira o ciclo antes de iniciar outra geração.");
          }
          if (activeStrengthScope.current !== pendingStrengthKey) return;
          bundleCanFail = !generatesStrengthOnly;
          if (!generatesStrengthOnly) rememberPendingStrength(pendingStrengthKey, null);
          generatedStrength = response.strength;
          newResults.musculacao = generatedStrength.plan;
          setStatus((current) => ({ ...current, musculacao: "done" }));
        }

        const strengthPlan = generatedStrength?.plan as { workouts?: unknown[] } | undefined;
        const sportMap: Record<string, string> = { corrida: "corrida", natacao: "natacao", ciclismo: "ciclismo" };
        for (const modality of ["corrida", "natacao", "ciclismo"] as Modality[]) {
          if (!modalities.has(modality)) continue;
          setStatus((current) => ({ ...current, [modality]: "generating" }));
          const prior = previousCardio[sportMap[modality]];
          const { data, error: edgeError } = await supabase.functions.invoke("ai-running-plan", { body: {
            student_id: studentId, student_name: student?.name, company_id: companyId,
            anamnese_id: a.id, sport: sportMap[modality], goal: a.cardio_goal || "Melhora de performance",
            duration_weeks: 6, days_per_week: Number(a.days_per_week_cardio ?? 3),
            session_duration: Number(a.endurance_session_duration_min ?? a.session_duration_min ?? 60),
            current_volume: (cycle.sequence_number ?? cycle.cycle_number) === 1 ? a.current_volume_weekly : null,
            current_volume_unit: (cycle.sequence_number ?? cycle.cycle_number) === 1 ? a.current_volume_unit : null,
            fcmax: a.fcmax, fcrep: a.fcrep, experience_months: a.experience_months, injuries: a.injuries,
            strength_plan_context: strengthPlan ? {
              days_per_week: Number(a.days_per_week_strength ?? 3),
              workouts: (strengthPlan.workouts || []).map((workout: any) => ({
                day: workout.day_of_week, focus: workout.split_focus,
                has_heavy_legs: (workout.exercises || []).some((exercise: any) =>
                  ["quadríceps", "posterior", "glúteos"].some((group) => (exercise.muscle_group || "").toLowerCase().includes(group))),
              })),
            } : null,
            other_cardio_context: Object.keys(cardioPlans).length ? cardioPlans : null,
            assessment_context: assessmentCtx, anamnese_context: a,
            prescription_integration: integrationCtx, bnito_orchestration: orchestrationCtx,
            bundle_id: bundleId, training_cycle_id: cycle.id, draft_only: true,
            previous_plan_id: prior?.id || null, previous_plan_context: prior || null,
            block_number: cycle.sequence_number ?? cycle.cycle_number, program_sequence: programSequence,
          } });
          if (edgeError || data?.error) throw new Error((await readEdgeError(edgeError, data)) || `Falha em ${modality} no ciclo ${cycle.cycle_number}.`);
          if (data?.draft_only !== true) throw new Error(`O servidor não confirmou o rascunho de ${modality}.`);
          generatedCardio = captureGeneratedCardioPlan(
            generatedCardio,
            modality as "corrida" | "natacao" | "ciclismo",
            { id: data?.id, plan: data?.plan, updated_at: data?.updated_at },
          );
          modalityVersions[modality as "corrida" | "natacao" | "ciclismo"] = { id: data.id, updated_at: data.updated_at };
          previousCardio[sportMap[modality]] = { id: data.id, ...data.plan };
          cardioPlans[modality] = data.plan; newResults[modality] = data.plan;
          setStatus((current) => ({ ...current, [modality]: "done" }));
        }

        if (modalities.has("nutricao")) {
          setStatus((current) => ({ ...current, nutricao: "generating" }));
          const { data: studentData } = await db.from("students").select("weight_kg, height_cm, gender, birth_date").eq("id", studentId).eq("company_id", companyId).maybeSingle();
          const age = a.age || (studentData?.birth_date ? Math.floor((Date.now() - new Date(studentData.birth_date).getTime()) / 31557600000) : null);
          const totalCardioHours = Object.values(cardioPlans).reduce((sum: number, plan: any) => sum + (Number(plan?.volume_weekly_hours) || 0), 0);
          const { data, error: edgeError } = await supabase.functions.invoke("ai-nutrition-plan", { body: {
            student_id: studentId, student_name: student?.name, company_id: companyId,
            anamnese_id: a.id, age, gender: studentData?.gender || "M", weight_kg: studentData?.weight_kg,
            height_cm: studentData?.height_cm, body_fat_percent: a.body_fat_percent, objective: a.objective,
            activity_level: a.activity_level, is_endurance_athlete: a.is_endurance_athlete,
            meals_per_day: Number(a.meals_per_day ?? 5), food_restrictions: a.food_restrictions,
            budget: a.budget_food, stress_score: a.stress_score, sleep_quality: a.sleep_quality,
            has_microwave: a.has_kitchen, nutrition_context: a.nutrition_context,
            training_modality: Array.from(modalities).filter((modality) => modality !== "nutricao").join(" + "),
            strength_plan_context: strengthPlan ? {
              sessions_per_week: Number(a.days_per_week_strength ?? 3),
              session_duration_min: Number(a.session_duration_min ?? 60),
              estimated_weekly_kcal: (Number(a.days_per_week_strength ?? 3)) * (Number(a.session_duration_min ?? 60)) / 60 * 450,
            } : null,
            running_plan_context: Object.keys(cardioPlans).length ? {
              modalities: Object.keys(cardioPlans), volume_weekly_hours: totalCardioHours,
              estimated_weekly_kcal: totalCardioHours * 700,
            } : null,
            anamnese_context: a, prescription_integration: integrationCtx, bnito_orchestration: orchestrationCtx,
            bundle_id: bundleId, training_cycle_id: cycle.id, draft_only: true,
            previous_plan_id: previousNutrition?.id || null, previous_plan_context: previousNutrition || null,
            block_number: cycle.sequence_number ?? cycle.cycle_number, program_sequence: programSequence,
          } });
          if (edgeError || data?.error) throw new Error((await readEdgeError(edgeError, data)) || `Falha na nutrição do ciclo ${cycle.cycle_number}.`);
          if (data?.draft_only !== true || !data.id || !data.updated_at || !data.plan) {
            throw new Error("O servidor não confirmou o rascunho de nutrição.");
          }
          modalityVersions.nutricao = { id: data.id, updated_at: data.updated_at };
          previousNutrition = { id: data.id, ...data.plan };
          newResults.nutricao = data.plan;
          setStatus((current) => ({ ...current, nutricao: "done" }));
        }

        if (activeStrengthScope.current !== pendingStrengthKey) return;
        await finalizeStrengthDraft(bundleId, cycle, integrated);
        if (activeStrengthScope.current !== pendingStrengthKey) return;
        if (generatesStrengthOnly) rememberPendingStrength(pendingStrengthKey, null);
        if (generatedStrength) showStrengthDraft(cycle, bundleId, generatedStrength, integrated);
        else {
          setStrengthPlanId(null);
          setStrengthPlanVersion(null);
        }
        if (integrated) {
          const plans = Object.fromEntries(Object.keys(modalityVersions).map(modality => [modality, newResults[modality]]));
          setIntegratedDrafts(current => [...current, { cycle, bundleId, versions: modalityVersions, plans, hasStrength: Boolean(generatedStrength) }]);
          setActiveIntegratedBundleId(bundleId);
        }

        if (generatedStrength) previousStrength = { id: generatedStrength.planId, plan: strengthPlan };
        lastBundleId = null;
        summaries.push({ cycle, modalities: Array.from(modalities) });
        preparedCycleIds.add(cycle.id);
        setResults({ ...newResults });
        setCardioPlanIds({ ...generatedCardio.planIds });
        setCardioPlanVersions({ ...generatedCardio.planVersions });
      }

      setScheduledSummaries(summaries);
      if (scheduleMode === "remaining") toast.success(`${summaries.length} ciclo(s) gerados. Revise os rascunhos antes de publicar.`);
    } catch (generationError: any) {
      if (activeStrengthScope.current === pendingStrengthKey) {
        setError(generationError?.message || "Falha ao gerar a sequência de prescrições.");
        setStatus(current => Object.fromEntries(Object.entries(current).map(([modality, state]) => (
          [modality, state === "generating" ? "error" : state]
        ))));
      }
      if (lastBundleId && bundleCanFail && activeStrengthScope.current === pendingStrengthKey) {
        try {
          await db.from("prescription_bundles").update({
            status: "failed", generation_error: String(generationError?.message || "Falha na geração").slice(0, 1000),
          }).eq("id", lastBundleId).eq("company_id", companyId).eq("student_id", studentId).eq("status", "generating");
        } catch { /* Preserve the original generation error if the status write also fails. */ }
      }
    } finally {
      generationInFlight.current = false;
      setScheduleProgress(null);
      setGenerating(false);
    }
  }

  async function saveCardioDraft(modality: "corrida" | "natacao" | "ciclismo", plan: CardioPlanDraft) {
    const planId = cardioPlanIds[modality];
    const expectedUpdatedAt = cardioPlanVersions[modality];
    if (!planId || !expectedUpdatedAt) {
      toast.error("Não encontrei a versão persistida deste plano. Gere a prescrição novamente antes de salvar.");
      return;
    }
    setSavingCardio((current) => ({ ...current, [modality]: true }));
    setSavedCardio((current) => ({ ...current, [modality]: false }));
    const scope = pendingStrengthKey;
    try {
      const saved = await saveCardioPlanDraft(supabase, { planId, expectedUpdatedAt, plan });
      if (activeStrengthScope.current !== scope) return;
      setResults((current) => ({ ...current, [modality]: saved.plan }));
      setCardioPlanVersions((current) => ({ ...current, [modality]: saved.updatedAt }));
      setSavedCardio((current) => ({ ...current, [modality]: true }));
      setIntegratedDrafts(current => current.map(draft => draft.bundleId === activeIntegratedBundleId ? {
        ...draft, plans: { ...draft.plans, [modality]: saved.plan },
        versions: { ...draft.versions, [modality]: { id: saved.id, updated_at: saved.updatedAt } },
      } : draft));
      const modalityName = modality === "natacao" ? "natação" : modality === "ciclismo" ? "ciclismo" : "corrida";
      toast.success(`Rascunho de ${modalityName} salvo.`);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Falha ao salvar a prescrição aeróbica.";
      toast.error(message);
    } finally {
      setSavingCardio((current) => ({ ...current, [modality]: false }));
    }
  }

  async function saveStrengthDraft() {
    if (generationInFlight.current || savingStrength || publishingStrengthRef.current || generating) return;
    if (!strengthPlanId || !strengthPlanVersion || !editPlan) {
      toast.error("Não encontrei a versão persistida da musculação. Gere a prescrição novamente.");
      return;
    }
    setSavingStrength(true);
    setSavedStrength(false);
    try {
      const saved = await saveStrengthPlanDraft(supabase, {
        planId: strengthPlanId,
        expectedUpdatedAt: strengthPlanVersion,
        plan: editPlan,
      });
      setEditPlan(saved.plan);
      setResults((current) => ({ ...current, musculacao: saved.plan }));
      setStrengthPlanVersion(saved.updatedAt);
      setGeneratedStrengthDrafts(current => current.map(draft => draft.draftId === saved.id
        ? { ...draft, draftVersion: saved.updatedAt, plan: saved.plan } : draft));
      setSavedStrength(true);
      toast.success("Alterações da musculação salvas.");
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Falha ao salvar a musculação.");
    } finally {
      setSavingStrength(false);
    }
  }

  async function publishToStudent(bundleId: string) {
    if (generationInFlight.current || generating || savingStrength || Object.values(savingCardio).some(Boolean)
      || publishingStrengthRef.current || !studentId || !companyId) return;
    const integrated = activeIntegratedDraft?.bundleId === bundleId ? activeIntegratedDraft : null;
    const draft = generatedStrengthDrafts.find(item => item.bundleId === bundleId && item.studentId === studentId && item.companyId === companyId);
    if ((draft && draft.draftId !== strengthPlanId) || (draft?.integrated && !integrated)
      || (integrated?.hasStrength && !draft) || (!integrated && !draft)) return;
    const targetCycle = integrated?.cycle ?? draft?.cycle;
    if (!targetCycle) return;
    const cycleId = targetCycle.id;
    if (integrated && Object.keys(integrated.plans).some(key => JSON.stringify(integrated.plans[key]) !== JSON.stringify(results[key]))) {
      setPublicationError({ draftId: bundleId, message: "Salve as alterações aeróbicas do rascunho antes de publicar." });
      return;
    }
    const label = integrated ? "o pacote completo" : "musculação";
    if (!window.confirm(`Publicar ${label} de ${student?.name || "este aluno"} no ciclo ${targetCycle.cycle_number} (${formatCycleDate(targetCycle.start_date)} a ${formatCycleDate(targetCycle.end_date)})? As modalidades deste pacote podem substituir prescrições desse ciclo.`)) return;
    // P13 — checagem pré-publicação: avisa exercícios fora da biblioteca (sem vídeo/ligação).
    const plan0 = draft ? editPlan || draft.plan : null;
    const noLib: string[] = [];
    (plan0?.workouts || []).forEach((w: any) => (w?.exercises || []).forEach((e: any) => {
      if (!e?.exercise_id) noLib.push(e?.exercise_name || e?.library_exercise_name || "exercício");
    }));
    if (noLib.length) {
      const sample = [...new Set(noLib)].slice(0, 6).join(", ");
      const ok = window.confirm(`${noLib.length} exercício(s) fora da biblioteca (sem vídeo/ligação): ${sample}${noLib.length > 6 ? "…" : ""}.\n\nDá pra trocá-los pela biblioteca na edição (clique no nome do exercício). Publicar assim mesmo?`);
      if (!ok) return;
    }
    const scope = pendingStrengthKey;
    publishingStrengthRef.current = true;
    setPublishing(true); setPublicationError(null); setPublished(null);
    try {
      const target = { bundleId, cycleId, companyId };
      const strength = draft ? { draftId: draft.draftId, draftVersion: draft.draftVersion, plan: plan0 } : undefined;
      const r = integrated
        ? await publishIntegratedStudioDraft({ ...target, modalities: integrated.versions, strength })
        : await publishStrengthDraftToStudent({ ...target, ...strength! });
      if (activeStrengthScope.current !== scope) return;
      setIntegratedDrafts(current => current.filter(item => item.bundleId !== bundleId));
      setActiveIntegratedBundleId(null);
      setCardioPlanIds({});
      setCardioPlanVersions({});
      if (draft) {
        setGeneratedStrengthDrafts(current => current.filter(item => item.cycle.id !== cycleId));
        setStrengthPlanId(null);
        setStrengthPlanVersion(null);
      }
      setScheduleCycles(current => current.map(cycle => cycle.id === cycleId ? {
        ...cycle, has_bundle: true,
        ...(draft ? {
          bundle_id: bundleId, has_workouts: true, has_usable_workouts: true,
          prescription_cleared_at: null, prescription_cleared_event_id: null, prescription_cleared_signature: null,
          prescribed_offline_at: null, prescribed_offline_by: null, prescribed_offline_note: null,
        } : {}),
      } : cycle));
      const scheduledForFuture = r.scheduled;
      setPublished({ workoutsCreated: r.workoutsCreated, current: r.current, scheduled: scheduledForFuture, integrated: Boolean(integrated) });
      if (draft && r.current && !r.replayed) {
        // #5 Push — avisa o aluno no celular somente quando o bloco já está vigente.
        supabase.functions.invoke("push-send", {
          body: { action: "notify", event: 'new_workout', student_ids: [studentId], title: "Prescrição nova no app", body: "Seu novo ciclo de treino já está disponível.", url: "/aluno" },
        }).catch(() => {});
      }
      // P14 — trilha de decisão desta publicação (best-effort; não bloqueia).
      try {
        const readiness = (prescriptionIntegration as any)?.readiness?.status ?? null;
        const editedFlag = JSON.stringify(draft?.plan?.workouts || []) !== JSON.stringify(plan0?.workouts || []);
        if (draft && !r.replayed) await db.from("ai_decision_logs").insert(buildPublishDecisionLog({
          studentId,
          companyId,
          readiness,
          edited: editedFlag,
          noLibrary: noLib.length,
          workouts: plan0?.workouts?.length || 0,
        }));
      } catch { /* log opcional */ }
      if (scheduledForFuture) {
        toast.success(`Ciclo ${targetCycle?.cycle_number || "futuro"} agendado. Ele aparecerá ao aluno em ${targetCycle ? formatCycleDate(targetCycle.start_date) : "sua data de início"}.`);
      } else if (r.current && draft && !r.replayed) {
        // Abre a conversa interna com o aviso pronto; o professor confirma o envio.
        const nome = (student?.name || "").trim().split(/\s+/)[0] || "";
        void openStudentChat({
          navigate: nav,
          routePrefix: chatRoutePrefix,
          studentId,
          message: `Oi, ${nome}! Sua nova prescrição já está no seu app. É só abrir e treinar. Qualquer dúvida, me chama!`,
        });
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Falha ao publicar o treino para o aluno.";
      if (activeStrengthScope.current === scope) setPublicationError({ draftId: bundleId, message });
    } finally {
      publishingStrengthRef.current = false;
      setPublishing(false);
    }
  }

  // Espelha o plano de força gerado num rascunho editável (publicar usa esta versão).
  useEffect(() => {
    if (results.musculacao) {
      try { setEditPlan(JSON.parse(JSON.stringify(results.musculacao))); } catch { setEditPlan(results.musculacao); }
      setShowEdit(true);
    }
    else setEditPlan(null);
  }, [results.musculacao]);
  // Biblioteca de exercícios para o seletor ao adicionar exercício na edição.
  useEffect(() => {
    (async () => {
      const { data } = await db
        .from("exercise_library")
        .select("id, name, muscle_group, video_url, video_path, thumbnail_url, youtube_video_id")
        .order("name");
      setLibrary(((data as any[]) || []).map((r) => ({
        id: r.id,
        name: r.name,
        muscle_group: r.muscle_group,
        video_url: r.video_url || null,
        video_path: r.video_path || null,
        thumbnail_url: r.thumbnail_url || null,
        youtube_video_id: r.youtube_video_id || null,
      })));
    })();
  }, []);
  const normalizeExerciseName = (value?: string | null) =>
    (value || "").trim().toLowerCase();
  const findLibraryExercise = (exercise: any): StudioLibraryExercise | null => {
    const id = exercise?.exercise_id;
    if (id) {
      const byId = library.find((item) => item.id === id);
      if (byId) return byId;
    }

    const names = [
      exercise?.library_exercise_name,
      exercise?.exercise_name,
      exercise?.name,
    ].map(normalizeExerciseName).filter(Boolean);
    if (names.length === 0) return null;

    return library.find((item) => names.includes(normalizeExerciseName(item.name))) || null;
  };
  const exerciseStorageUrl = (path?: string | null) => {
    if (!path) return null;
    if (path.startsWith("http")) return path;
    return supabase.storage.from("exercises-videos").getPublicUrl(path).data.publicUrl;
  };
  const exerciseVideoUrl = (exercise?: any, libraryExercise?: StudioLibraryExercise | null) => {
    const storedPath = exercise?.video_path || libraryExercise?.video_path;
    const storedUrl = exerciseStorageUrl(storedPath);
    if (storedUrl) return storedUrl;

    const videoUrl = exercise?.video_url || libraryExercise?.video_url;
    if (videoUrl) return videoUrl;

    const youtubeId = exercise?.youtube_video_id || libraryExercise?.youtube_video_id;
    return youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : null;
  };
  const isDirectVideoUrl = (url?: string | null) =>
    !!url && /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
  const exerciseVideoEmbedUrl = (url?: string | null) => {
    if (!url) return null;
    const youtubeId = youtubeIdFromUrl(url);
    if (youtubeId) return `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0`;
    const vimeoId = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i)?.[1];
    return vimeoId ? `https://player.vimeo.com/video/${vimeoId}?autoplay=1` : null;
  };
  const ExerciseVideoPreview = ({
    exercise,
    libraryExercise,
    interactive = true,
  }: {
    exercise?: any;
    libraryExercise?: StudioLibraryExercise | null;
    interactive?: boolean;
  }) => {
    const videoUrl = exerciseVideoUrl(exercise, libraryExercise);
    const thumbUrl = exerciseThumb({
      youtube_video_id: exercise?.youtube_video_id || libraryExercise?.youtube_video_id || null,
      video_url: exercise?.video_url || libraryExercise?.video_url || null,
      video_path: exercise?.video_path || libraryExercise?.video_path || null,
      thumbnail_url: exercise?.thumbnail_url || libraryExercise?.thumbnail_url || null,
    });
    const youtubeThumb = videoUrl ? youtubeIdFromUrl(videoUrl) : null;
    const poster = thumbUrl || (youtubeThumb ? `https://i.ytimg.com/vi/${youtubeThumb}/hqdefault.jpg` : null);
    const className = "relative h-11 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm";
    const content = (
      <>
        {poster ? (
          <img src={poster} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : videoUrl && isDirectVideoUrl(videoUrl) ? (
          <video src={videoUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <Dumbbell className="h-4 w-4 text-slate-400" />
          </span>
        )}
        {videoUrl && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/15">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/90 shadow-sm">
              <Play className="h-3 w-3 fill-[#1B2B4A] text-[#1B2B4A]" />
            </span>
          </span>
        )}
      </>
    );

    if (!interactive || !videoUrl) {
      return (
        <div className={className} title={videoUrl ? "Vídeo do exercício" : "Sem vídeo cadastrado"}>
          {content}
        </div>
      );
    }

    return (
      <button
        type="button"
        className={`${className} hover:ring-2 hover:ring-[#1B2B4A]/20`}
        title="Abrir vídeo do exercício"
        onClick={(event) => {
          event.stopPropagation();
          setExerciseVideoPlayer({
            url: videoUrl,
            title: libraryExercise?.name || exercise?.exercise_name || exercise?.name || "Vídeo do exercício",
          });
        }}
      >
        {content}
      </button>
    );
  };
  const updateEditableStrengthPlan = (updater: (plan: any) => any) => {
    setSavedStrength(false);
    setEditPlan(updater);
  };
  const updateExField = (wi: number, ei: number, field: string, value: any) =>
    updateEditableStrengthPlan((p: any) => {
      if (!p) return p;
      const n = JSON.parse(JSON.stringify(p));
      const exercise = n.workouts?.[wi]?.exercises?.[ei];
      if (!exercise) return n;
      const previous = Number(exercise[field]);
      exercise[field] = value;
      if (Array.isArray(exercise.weekly_prescription)) {
        if (field === "sets") {
          const next = Math.max(1, Number(value) || 1);
          const delta = Number.isFinite(previous) ? next - previous : 0;
          exercise.weekly_prescription = exercise.weekly_prescription.map((week: any) => ({
            ...week,
            sets: Math.max(1, (Number(week.sets) || next) + delta),
          }));
        } else if (field === "reps") {
          exercise.weekly_prescription = exercise.weekly_prescription.map((week: any) => ({ ...week, reps: String(value) }));
        } else if (field === "rest_seconds") {
          const next = Math.max(0, Number(value) || 0);
          const delta = Number.isFinite(previous) ? next - previous : 0;
          exercise.weekly_prescription = exercise.weekly_prescription.map((week: any) => ({
            ...week,
            rest_seconds: Math.max(0, (Number(week.rest_seconds) || next) + delta),
          }));
        }
      }
      return n;
    });
  const updateWName = (wi: number, value: string) =>
    updateEditableStrengthPlan((p: any) => { if (!p) return p; const n = JSON.parse(JSON.stringify(p)); if (n.workouts?.[wi]) n.workouts[wi].name = value; return n; });
  const renumberExercises = (exercises: any[] = []) =>
    renumberWorkoutExercises(exercises);
  const removeExercise = (wi: number, ei: number) =>
    updateEditableStrengthPlan((p: any) => {
      if (!p) return p;
      const n = JSON.parse(JSON.stringify(p));
      if (n.workouts?.[wi]?.exercises) {
        n.workouts[wi].exercises.splice(ei, 1);
        n.workouts[wi].exercises = renumberExercises(n.workouts[wi].exercises);
      }
      return n;
    });
  const moveExerciseTo = (wi: number, fromUnitIndex: number, toUnitIndex: number) =>
    updateEditableStrengthPlan((p: any) => {
      if (!p) return p;
      const n = JSON.parse(JSON.stringify(p));
      const exercises = n.workouts?.[wi]?.exercises;
      if (!Array.isArray(exercises)) return n;
      n.workouts[wi].exercises = moveWorkoutOrderUnit(exercises, fromUnitIndex, toUnitIndex);
      return n;
    });
  const moveExerciseByIndex = (wi: number, exerciseIndex: number, direction: "up" | "down") =>
    updateEditableStrengthPlan((p: any) => {
      if (!p) return p;
      const n = JSON.parse(JSON.stringify(p));
      const exercises = n.workouts?.[wi]?.exercises;
      if (!Array.isArray(exercises)) return n;
      n.workouts[wi].exercises = moveWorkoutOrderUnitByExerciseIndex(exercises, exerciseIndex, direction);
      return n;
    });
  const resetExerciseDrag = () => {
    dragPointerRef.current = null;
    setDragExercise(null);
    setDropTarget(null);
  };
  const scrollExerciseDragViewport = (clientY: number) => {
    const margin = 72;
    const maxStep = 24;
    if (clientY < margin) window.scrollBy(0, -maxStep);
    if (window.innerHeight - clientY < margin) window.scrollBy(0, maxStep);
  };
  const targetUnitFromPoint = (clientX: number, clientY: number) => {
    const element = document.elementFromPoint(clientX, clientY)?.closest("[data-workout-drop-index]") as HTMLElement | null;
    if (!element) return null;
    return {
      wi: Number(element.dataset.workoutIndex),
      unitIndex: Number(element.dataset.workoutDropIndex),
    };
  };
  const handleExercisePointerMove = (event: any, wi: number) => {
    const drag = dragPointerRef.current;
    if (!drag || drag.wi !== wi) return;
    scrollExerciseDragViewport(event.clientY);
    const target = targetUnitFromPoint(event.clientX, event.clientY);
    if (!target || target.wi !== wi || Number.isNaN(target.unitIndex)) return;
    drag.targetIndex = target.unitIndex;
    setDropTarget({ wi, unitIndex: target.unitIndex });
  };
  const handleExercisePointerUp = () => {
    const drag = dragPointerRef.current;
    if (!drag) return resetExerciseDrag();
    if (drag.targetIndex !== null) moveExerciseTo(drag.wi, drag.unitIndex, drag.targetIndex);
    resetExerciseDrag();
  };
  const addExercise = (wi: number) =>
    updateEditableStrengthPlan((p: any) => {
      if (!p) return p; const n = JSON.parse(JSON.stringify(p));
      if (n.workouts?.[wi]) { n.workouts[wi].exercises = n.workouts[wi].exercises || []; n.workouts[wi].exercises.push({ exercise_name: "", sets: 3, reps: "10-12", rest_seconds: 60, cues: "", exercise_order: n.workouts[wi].exercises.length + 1 }); n.workouts[wi].exercises = renumberExercises(n.workouts[wi].exercises); }
      return n;
    });
  const removeWorkout = (wi: number) =>
    updateEditableStrengthPlan((p: any) => { if (!p) return p; const n = JSON.parse(JSON.stringify(p)); n.workouts?.splice(wi, 1); return n; });
  const addWorkout = () =>
    updateEditableStrengthPlan((p: any) => {
      if (!p) return p; const n = JSON.parse(JSON.stringify(p)); n.workouts = n.workouts || [];
      n.workouts.push({ name: `Treino ${String.fromCharCode(65 + n.workouts.length)}`, day_of_week: n.workouts.length + 1, exercises: [] });
      return n;
    });
  // Adiciona um exercício escolhido da BIBLIOTECA (com exercise_id → vídeo etc. no app).
  const pickExercise = (lib: StudioLibraryExercise) => {
    if (!pickerTarget) return;
    const { wi, ei } = pickerTarget;
    updateEditableStrengthPlan((p: any) => {
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
  async function assessmentMeta() {
    return loadCompanyPDFMeta(companyId!, {
      studentName: student?.name || "Aluno",
      date: new Date(assessment?.created_at || Date.now()).toLocaleDateString("pt-BR"),
    });
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
      generateAssessmentPDF(assessment, await assessmentMeta(), imgs).save(assessmentFileName());
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
      const blob = generateAssessmentPDF(assessment, await assessmentMeta(), imgs).output("blob");
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
  async function downloadPDFs() {
    try {
    const meta = await loadCompanyPDFMeta(companyId!, {
      studentName: student?.name || "Aluno",
      date: new Date().toLocaleDateString("pt-BR"),
    });
    const generated = generateAllPDFs(results, meta);
    setPdfs(generated);
    // Baixa todos
    generated.forEach(g => g.doc.save(g.filename));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nao foi possivel carregar a identidade da empresa.');
    }
  }

  const statusIcon = (s: GenStatus) => {
    if (s === "generating") return <Loader2 className="h-4 w-4 animate-spin text-[#8B7355]" />;
    if (s === "done")       return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (s === "error")      return <AlertCircle className="h-4 w-4 text-red-500" />;
    return <Circle className="h-4 w-4 text-slate-300" />;
  };

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-5">
      <Dialog
        open={!!exerciseVideoPlayer}
        onOpenChange={(open) => {
          if (!open) setExerciseVideoPlayer(null);
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-4xl overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-2xl sm:rounded-2xl">
          <DialogHeader className="border-b border-slate-100 px-5 py-4 pr-12 text-left">
            <DialogTitle className="truncate text-lg text-[#1B2B4A]">
              {exerciseVideoPlayer?.title || "Vídeo do exercício"}
            </DialogTitle>
          </DialogHeader>
          <div className="bg-black">
            {exerciseVideoPlayer && exerciseVideoEmbedUrl(exerciseVideoPlayer.url) ? (
              <iframe
                key={exerciseVideoPlayer.url}
                src={exerciseVideoEmbedUrl(exerciseVideoPlayer.url) || undefined}
                title={exerciseVideoPlayer.title}
                className="aspect-video max-h-[75vh] w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : exerciseVideoPlayer && isDirectVideoUrl(exerciseVideoPlayer.url) ? (
              <video
                key={exerciseVideoPlayer.url}
                src={exerciseVideoPlayer.url}
                className="aspect-video max-h-[75vh] w-full bg-black object-contain"
                controls
                autoPlay
                playsInline
              />
            ) : (
              <div className="flex aspect-video items-center justify-center px-6 text-center text-sm text-white/75">
                Este formato de vídeo não pode ser reproduzido dentro do app.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center gap-3 pt-1">
        <div className="h-11 w-11 rounded-xl bg-[#1B2B4A] flex items-center justify-center text-white font-black tracking-tight shadow-sm">BN</div>
        <div className="leading-tight">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-800">Prescrição Integrada</h1>
            <BnitoContextButton
              studentId={studentId || undefined}
              label="studio de prescricao"
              context="Fluxo principal do treinador: anamnese, avaliacao, prescricoes integradas e PDFs."
              question="Me orienta no fluxo completo deste aluno: anamnese, avaliacao, prescricao e PDF?"
            />
          </div>
          <p className="text-xs text-[#8B7355] font-medium">Anamnese → Avaliação → Prescrições integradas → PDFs</p>
        </div>
      </div>

      {/* Seleção de aluno */}
      {!isEmbedded && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              Aluno
              <BnitoContextButton
                studentId={studentId || undefined}
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
                  disabled={generating}
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
                        disabled={generating}
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
      )}

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
                    studentId={studentId || undefined}
                    label="tab anamnese do Studio"
                    context="Etapa de anamnese do Studio: link publico, resposta do aluno e dados que alimentam a prescricao."
                    question="Como devo conduzir a anamnese antes de prescrever?"
                    text="BNITO"
                  />
                </div>
                {anamneseLoading ? (
                  <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando anamnese deste aluno...
                  </div>
                ) : anamneseLoadError ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-medium">Não foi possível carregar a anamnese.</p>
                        <p className="mt-1 text-xs text-red-600">{anamneseLoadError}</p>
                      </div>
                    </div>
                  </div>
                ) : anamnese ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                      <CheckCircle2 className="h-4 w-4" /> Anamnese respondida pelo aluno
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm text-slate-600 mt-2">
                      <div>Objetivo: <span className="font-medium text-slate-800">{anamnese.objective || "—"}</span></div>
                      <div>Nível: <span className="font-medium text-slate-800">{anamnese.activity_level || "—"}</span></div>
                      <div>Modalidade: <span className="font-medium text-slate-800">{anamnese.training_modality || "—"}</span></div>
                      <div>Dias força/sem: <span className="font-medium text-slate-800">{anamnese.days_per_week_strength ?? "—"}</span></div>
                    </div>
                    {anamnese.injuries && <p className="text-xs bg-slate-50 rounded p-2 mt-2">Lesões: {anamnese.injuries}</p>}
                    {anamnese.current_pain != null && <p className="text-xs mt-2">Dor atual · {anamnese.current_pain === false ? "Não relatada" : anamnese.current_pain}</p>}
                    {anamnese.intercycle_update?.new_goals && <p className="text-xs mt-2">Meta relatada · {anamnese.intercycle_update.new_goals}</p>}
                    {anamnese.intercycle_update?.goal_needs_review && <p className="text-xs mt-2">Revise a meta relatada com o aluno. O objetivo classificado segue em uso.</p>}
                    {anamnese.intercycle_update?.equipment_needs_review && <p className="text-xs mt-2">Confirme os equipamentos no novo local antes de publicar.</p>}
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
                studentId={studentId || undefined}
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
              key={studentId}
              studentId={studentId}
              companyId={companyId!}
              initialWhatsAppVideo={pendingWhatsAppVideo?.studentId === studentId ? pendingWhatsAppVideo : null}
              onInitialVideoConsumed={consumeWhatsAppAssessmentHandoff}
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
                    studentId={studentId || undefined}
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
                    {scheduleCycles.length > 0 ? `${scheduleCycles.length} ciclos · ${scheduleSpanWeeks(scheduleCycles)} semanas` : "Sem vigência"}
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

                {scheduleCoverage && <section aria-label="Cobertura contratual do Studio" className="mb-3 space-y-2 text-xs">
                  <p>Contrato: {formatCycleDate(scheduleCoverage.term!.contract_start_date)} a {formatCycleDate(scheduleCoverage.term!.end_date)}. Início operacional: {formatCycleDate(scheduleCoverage.term!.start_date)}. Agenda não equivale a treino entregue.</p>
                  {scheduleCoverage.notStarted && <p>Treinamento ainda não iniciado. Preparação futura, sem antecipar a liberação.</p>}
                  {scheduleCoverage.slots.map(slot => <p key={slot.position}>Período {slot.position}: {formatCycleDate(slot.start_date)} a {formatCycleDate(slot.end_date)} · {slot.state === 'missing' ? 'Lacuna de agenda' : slot.state === 'review' ? 'Revisar sobreposição' : slot.state === 'scheduled' ? 'Pendente de treino' : slot.state === 'offline' ? 'Prescrição fora do app' : 'Conteúdo preparado'}</p>)}
                  {scheduleCoverage.historyCycles.length > 0 && <details><summary>Histórico anterior e fora da vigência ({scheduleCoverage.historyCycles.length})</summary>{scheduleCoverage.historyCycles.map(cycle => <p key={cycle.id}>Ciclo {cycle.cycle_number} · {formatCycleDate(cycle.start_date)} a {formatCycleDate(cycle.end_date)}</p>)}</details>}
                </section>}

                {scheduleLoading ? (
                  <div className="flex min-h-16 items-center justify-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando vigência
                  </div>
                ) : scheduleLoadError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {scheduleLoadError}
                  </div>
                ) : scheduleCycles.length === 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    {hasCurrentEnrollment
                      ? "A matrícula vigente ainda não possui ciclos persistidos. Ajuste a vigência no perfil do aluno antes de prescrever."
                      : "O aluno precisa de uma matrícula vigente para agendar prescrições."}
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
                              Ciclo {cycle.cycle_number} · {formatCycleDate(cycle.start_date)} a {formatCycleDate(cycle.end_date)}{cycle.prescription_cleared_at ? " · prescrição removida" : cycle.prescribed_offline_at ? " · fora do app" : cycle.has_workouts ? " · treino preparado" : cycle.has_bundle ? " · rascunho preparado" : " · pendente"}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                      {scheduleCycles.map((cycle) => {
                        const prepared = hasActivePrescriptionContent(cycle);
                        const current = isCycleCurrent(cycle);
                        const completed = cycle.end_date < businessDateYmd();
                        const selected = scheduleMode === "single" ? cycle.id === selectedCycleId : scheduleTargets.some((target) => target.id === cycle.id);
                        const statusLabel = cycle.prescription_cleared_at ? "Prescrição removida" : cycle.prescribed_offline_at ? "Prescrito fora do app" : cycle.has_workouts ? "Treino preparado" : cycle.has_bundle ? "Rascunho preparado" : completed ? "Sem treino no período encerrado" : current ? "Atual · sem treino" : "Pendente";
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
                              <span className="block truncate text-sm font-medium text-slate-800">{describeLongitudinalPhase(longitudinalPhase(cycle.cycle_number, cycle))}</span>
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
                    studentId={studentId || undefined}
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
                    studentId={studentId || undefined}
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

                {anamneseGenerationBlockReason && (
                  <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                    {anamneseGenerationBlockReason}
                  </p>
                )}

                {scheduleTargets.some((cycle) => cycle.cycle_number > 1) && (
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                    <label className="text-xs font-medium text-amber-900">Dispensa da Anamnese interciclos (somente se ainda não houver resposta)</label>
                    <Input className="mt-2" value={intercycleWaiverReason} onChange={(event) => setIntercycleWaiverReason(event.target.value)} placeholder="Motivo obrigatório; será registrado com seu usuário e horário." />
                    <p className="mt-1 text-[11px] text-amber-800">Sem resposta nem dispensa explícita, a geração do próximo ciclo é bloqueada. EVA acima de 5 também exige handoff.</p>
                  </div>
                )}

                {pendingStrength && (
                  <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    {pendingStrength.mixed ? (
                      <p>A musculação da geração integrada pode ter sido salva. Uma nova geração exige confirmação.</p>
                    ) : <p>Há uma geração de musculação com resultado pendente.</p>}
                    {!pendingStrength.mixed && (pendingStrengthCycle ? (
                      <Button type="button" variant="outline" size="sm" className="mt-2"
                        disabled={generating || publishing || savingStrength || scheduleLoading}
                        onClick={retryPendingStrength}>
                        {pendingStrength.body ? "Retentar musculação" : "Consultar rascunho pendente"} · ciclo {pendingStrengthCycle.cycle_number}
                      </Button>
                    ) : <p>O ciclo da tentativa pendente está indisponível na agenda atual.</p>)}
                  </div>
                )}

                <Button className="w-full mt-4 bg-[#1B2B4A] hover:bg-[#1B2B4A]/90"
                  onClick={generate} disabled={generating || publishing || savingStrength || scheduleLoading || Boolean(scheduleLoadError) || Boolean(anamneseGenerationBlockReason) || modalities.size === 0 || scheduleTargets.length === 0}>
                  {generating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {scheduleProgress ? `Gerando ${scheduleProgress.label.toLowerCase()} (${scheduleProgress.current}/${scheduleProgress.total})` : "Gerando"}</>
                    : generationButtonLabel}
                </Button>

                {integratedDrafts.filter(draft => !draft.hasStrength && draft.cycle.student_id === studentId
                  && draft.cycle.company_id === companyId).map(draft => (
                  <Button key={draft.bundleId} type="button" variant="outline" size="sm" className="mr-2 mt-2"
                    disabled={generating || publishing || Object.values(savingCardio).some(Boolean) || draft.bundleId === activeIntegratedBundleId}
                    onClick={() => openIntegratedDraft(draft)}>
                    Revisar pacote · ciclo {draft.cycle.cycle_number}
                  </Button>
                ))}
                {generatedStrengthDrafts.filter(draft => draft.studentId === studentId && draft.companyId === companyId
                  && (!draft.integrated || integratedDrafts.some(item => item.bundleId === draft.bundleId))).map(draft => (
                  <Button key={draft.draftId} type="button" variant="outline" size="sm" className="mr-2 mt-2"
                    disabled={generating || publishing || savingStrength || Object.values(savingCardio).some(Boolean) || draft.draftId === strengthPlanId}
                    onClick={() => openStrengthDraft(draft)}>
                    Revisar rascunho · ciclo {draft.cycle.cycle_number}
                  </Button>
                ))}

                {/* #4 Templates de ciclo — começar de um treino salvo em vez de gerar do zero */}
                {templates.length > 0 && studentId && (
                  <div className="mt-3 border rounded-lg p-2 bg-slate-50/60">
                    <p className="text-[11px] font-medium text-slate-600 mb-1.5">📋 Ou comece de um template seu:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {templates.map((t) => (
                        <span key={t.id} className="inline-flex items-center rounded-full border border-slate-200 bg-white overflow-hidden">
                          <button type="button" onClick={() => void applyCycleTemplate(t)} disabled={generating || publishing || savingStrength || !selectedScheduleCycle}
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
                      studentId={studentId || undefined}
                      label="prescricoes geradas no Studio"
                      context="Resultados integrados e PDFs prontos para revisao pelo professor."
                      question="Me ajuda a revisar estes resultados antes de baixar os PDFs?"
                      className="ml-auto"
                    />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <CompanyMethodologyContext plan={results.musculacao} />
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
                    <div className="mt-2 rounded-lg border bg-slate-50/60 p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                        <button type="button" onClick={() => setShowEdit(s => !s)} className="text-left text-sm font-medium text-[#1B2B4A] underline">
                          {showEdit ? "Ocultar ajuste da musculação" : "✏️ Ajustar musculação"}
                        </button>
                        <Button type="button" size="sm" className="w-full sm:w-auto" onClick={() => void saveStrengthDraft()} disabled={savingStrength || generating || publishing || !strengthPlanId || !strengthPlanVersion}>
                          {savingStrength ? "Salvando…" : savedStrength ? "Musculação salva" : "Salvar alterações de musculação"}
                        </Button>
                        <button type="button" onClick={saveAsTemplate} disabled={savingTemplate}
                          className="text-left text-xs text-[#8B7355] underline disabled:opacity-50">
                          {savingTemplate ? "Salvando…" : "💾 Salvar como template"}
                        </button>
                      </div>
                      {showEdit && (
                        <div className="mt-3 space-y-3">
                          <p className="text-xs text-slate-500">Edite séries / reps / descanso / obs. Ao publicar, vai a versão editada pro app do aluno.</p>
                          {Array.isArray(editPlan.weekly_periodization) && editPlan.weekly_periodization.length > 0 && (
                            <div className="grid gap-2 sm:grid-cols-3">
                              {editPlan.weekly_periodization.map((week: any) => (
                                <div key={week.week} className="rounded-xl border border-slate-200 bg-white p-2.5">
                                  <p className="font-mono-data text-[10px] font-semibold uppercase text-[#8B7355]">Semana {week.week}</p>
                                  <p className="mt-1 text-xs font-medium text-[#1B2B4A]">{week.stimulus}</p>
                                  <p className="mt-1 text-[11px] text-slate-500">Cadência {week.tempo_focus} · RIR {week.rir}</p>
                                  <p className="text-[11px] text-slate-500">{week.methods?.length ? week.methods.join(" + ") : week.method_focus}</p>
                                </div>
                              ))}
                            </div>
                          )}
                          {editPlan.workouts.map((w: any, wi: number) => (
                            <div key={wi} className="space-y-2 rounded-lg border bg-white p-2">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <Input value={w.name || ""} onChange={e => updateWName(wi, e.target.value)} className="h-8 text-sm font-medium" />
                                <button type="button" onClick={() => removeWorkout(wi)} className="shrink-0 whitespace-nowrap px-2 text-left text-xs text-red-500">Remover treino</button>
                              </div>
                              <div className="hidden grid-cols-12 gap-1 px-0.5 text-[10px] uppercase text-slate-400 sm:grid">
                                <span className="col-span-1">Arrastar</span><span className="col-span-1">Vídeo</span><span className="col-span-2">Exercício</span><span className="col-span-1">Sér</span><span className="col-span-2">Reps</span><span className="col-span-2">Desc(s)</span><span className="col-span-2">Obs</span><span className="col-span-1"></span>
                              </div>
                              {(() => {
                                const units = buildWorkoutOrderUnits(w.exercises || []);
                                const dropZone = (unitIndex: number) => (
                                  <div
                                    key={`drop-${wi}-${unitIndex}`}
                                    data-workout-index={wi}
                                    data-workout-drop-index={unitIndex}
                                    onDragOver={(event) => {
                                      if (dragExercise?.wi === wi) {
                                        event.preventDefault();
                                        event.dataTransfer.dropEffect = "move";
                                        setDropTarget({ wi, unitIndex });
                                      }
                                    }}
                                    onDrop={(event) => {
                                      event.preventDefault();
                                      const source = dragExercise;
                                      resetExerciseDrag();
                                      if (!source || source.wi !== wi) return;
                                      moveExerciseTo(wi, source.unitIndex, unitIndex);
                                    }}
                                    className={`h-2 rounded-full transition-colors ${
                                      dropTarget?.wi === wi && dropTarget.unitIndex === unitIndex
                                        ? "bg-[#8B7355]"
                                        : "bg-transparent"
                                    }`}
                                    aria-hidden="true"
                                  />
                                );

                                return (
                                  <>
                                    {dropZone(0)}
                                    {units.map((unit, unitIndex) => {
                                      const isDragging = dragExercise?.wi === wi && dragExercise.unitIndex === unitIndex;
                                      return (
                                        <div
                                          key={unit.id}
                                          draggable
                                          onDragStart={(event) => {
                                            if (!(event.target as HTMLElement).closest("[data-workout-drag-handle]")) {
                                              event.preventDefault();
                                              return;
                                            }
                                            setDragExercise({ wi, unitIndex });
                                            event.dataTransfer.effectAllowed = "move";
                                            event.dataTransfer.setData("text/plain", `${wi}:${unitIndex}`);
                                          }}
                                          onDragEnd={resetExerciseDrag}
                                          onPointerMove={(event) => handleExercisePointerMove(event, wi)}
                                          onPointerUp={handleExercisePointerUp}
                                          onPointerCancel={resetExerciseDrag}
                                          className={`rounded-xl border transition-colors ${
                                            unit.type === "group"
                                              ? "border-[#8B7355]/50 bg-[#FAF8F2]"
                                              : "border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/60"
                                          } ${isDragging ? "opacity-70 ring-2 ring-[#8B7355]/40" : ""}`}
                                        >
                                          <div className="flex items-center gap-2 border-b border-slate-100 px-2 py-1">
                                            <button
                                              type="button"
                                              className="h-7 w-8 inline-flex touch-none items-center justify-center rounded border border-slate-200 bg-white text-slate-500 cursor-grab active:cursor-grabbing hover:bg-slate-50"
                                              title={unit.type === "group" ? "Arraste para mover o bloco inteiro" : "Arraste para mudar a ordem"}
                                              aria-label={unit.type === "group" ? "Arrastar bloco de método sem separar exercícios" : "Arrastar exercício"}
                                              aria-roledescription="alça de arrastar"
                                              aria-grabbed={isDragging}
                                              data-workout-drag-handle="true"
                                              onPointerDown={(event) => {
                                                dragPointerRef.current = { wi, unitIndex, targetIndex: unitIndex };
                                                setDragExercise({ wi, unitIndex });
                                                setDropTarget({ wi, unitIndex });
                                                event.currentTarget.setPointerCapture?.(event.pointerId);
                                              }}
                                              onKeyDown={(event) => {
                                                if (event.key === "ArrowUp") {
                                                  event.preventDefault();
                                                  moveExerciseTo(wi, unitIndex, unitIndex - 1);
                                                }
                                                if (event.key === "ArrowDown") {
                                                  event.preventDefault();
                                                  moveExerciseTo(wi, unitIndex, unitIndex + 2);
                                                }
                                                if (event.key === "End") {
                                                  event.preventDefault();
                                                  moveExerciseTo(wi, unitIndex, units.length);
                                                }
                                                if (event.key === "Home") {
                                                  event.preventDefault();
                                                  moveExerciseTo(wi, unitIndex, 0);
                                                }
                                              }}
                                            >
                                              <GripVertical className="h-4 w-4" />
                                            </button>
                                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                                              <span className="font-mono-data text-[10px] font-semibold text-slate-500">
                                                {unit.startIndex + 1}{unit.type === "group" ? `–${unit.endIndex + 1}` : ""}
                                              </span>
                                              {unit.type === "group" && (
                                                <>
                                                  <span className="rounded-full bg-[#1B2B4A] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">
                                                    {unit.method}
                                                  </span>
                                                  <span className="text-[10px] text-slate-500">
                                                    bloco inteiro · {unit.items.length} exercícios
                                                  </span>
                                                </>
                                              )}
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => moveExerciseByIndex(wi, unit.startIndex, "up")}
                                              disabled={unitIndex === 0}
                                              className="h-7 w-7 rounded border border-slate-200 text-slate-500 disabled:opacity-30"
                                              title="Mover para cima"
                                            >
                                              ↑
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => moveExerciseByIndex(wi, unit.startIndex, "down")}
                                              disabled={unitIndex === units.length - 1}
                                              className="h-7 w-7 rounded border border-slate-200 text-slate-500 disabled:opacity-30"
                                              title="Mover para baixo"
                                            >
                                              ↓
                                            </button>
                                          </div>
                                          <div className="space-y-1.5 p-1">
                                            {unit.items.map((ex: any, offset: number) => {
                                              const ei = unit.startIndex + offset;
                                              const libraryExercise = findLibraryExercise(ex);
                                              const weeklyBlocks = summarizeExerciseWeeklyProgression(ex.weekly_prescription);
                                              return (
                                                <div key={`${ex.exercise_id || ex.exercise_name || "exercise"}-${ei}`} className="rounded-lg border border-slate-100 bg-white">
                                                  <div className="grid grid-cols-12 items-center gap-1 p-1 sm:gap-1.5">
                                                    <div className="col-span-2 sm:col-span-1 flex items-center">
                                                      <span className="font-mono-data text-[10px] text-slate-400">{ei + 1}</span>
                                                    </div>
                                                    <div className="col-span-3 sm:col-span-1">
                                                      <ExerciseVideoPreview exercise={ex} libraryExercise={libraryExercise} />
                                                    </div>
                                                    <button type="button" onClick={() => { setPickerTarget({ wi, ei }); setPickerSearch(""); setPickerGroup(""); }} className="col-span-7 min-w-0 text-left text-xs font-medium hover:text-[#1B2B4A] hover:underline sm:col-span-2" title="Trocar exercício (biblioteca)">
                                                      <span className="block truncate">{ex.exercise_name || "—"} ✎</span>
                                                      {libraryExercise?.muscle_group && (
                                                        <span className="block truncate text-[10px] font-normal text-slate-400">{libraryExercise.muscle_group}</span>
                                                      )}
                                                    </button>
                                                    <Input className="col-span-4 h-8 px-2 text-xs sm:col-span-1 sm:h-7 sm:px-1" value={String(ex.sets ?? "")} onChange={e => updateExField(wi, ei, "sets", e.target.value)} placeholder="séries" aria-label="Séries" />
                                                    <Input className="col-span-4 h-8 px-2 text-xs sm:col-span-2 sm:h-7 sm:px-1" value={String(ex.reps ?? "")} onChange={e => updateExField(wi, ei, "reps", e.target.value)} placeholder="reps" aria-label="Repetições" />
                                                    <Input className="col-span-4 h-8 px-2 text-xs sm:col-span-2 sm:h-7 sm:px-1" value={String(ex.rest_seconds ?? "")} onChange={e => updateExField(wi, ei, "rest_seconds", e.target.value)} placeholder="desc(s)" aria-label="Descanso em segundos" />
                                                    <Input className="col-span-9 h-8 px-2 text-xs sm:col-span-2 sm:h-7 sm:px-1" value={ex.cues || ex.notes || ""} onChange={e => updateExField(wi, ei, "cues", e.target.value)} placeholder="obs" aria-label="Observações" />
                                                    <button type="button" onClick={() => removeExercise(wi, ei)} className="col-span-3 text-sm text-red-500 sm:col-span-1" title="Remover exercício">✕</button>
                                                  </div>
                                                  {weeklyBlocks.length > 0 && (
                                                    <div className="grid gap-1.5 border-t border-slate-100 bg-[#FAF8F2]/70 p-2 sm:grid-cols-3">
                                                      {weeklyBlocks.map((block) => (
                                                        <div key={block.weeks} className="min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                                                          <div className="flex flex-wrap items-center gap-1">
                                                            <span className="font-mono-data text-[9px] font-semibold uppercase text-[#8B7355]">
                                                              Semanas {block.weeks}
                                                            </span>
                                                            {block.method ? (
                                                              <span
                                                                className="rounded-full bg-[#1B2B4A] px-1.5 py-0.5 text-[9px] font-semibold text-white"
                                                                title={block.methodReason ? `Política: ${block.methodReason}` : undefined}
                                                              >
                                                                {block.method}
                                                              </span>
                                                            ) : (
                                                              <span className="text-[9px] text-slate-400">Séries retas</span>
                                                            )}
                                                          </div>
                                                          <p className="mt-1 text-[10px] font-medium text-[#1B2B4A]">
                                                            {block.setsReps} · Cadência {formatStudioTempo(block.tempo)} · RIR {block.rir}
                                                          </p>
                                                          <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-slate-500" title={block.instruction}>
                                                            {block.instruction}
                                                          </p>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      );
                                    }).flatMap((unitNode, unitIndex) => [unitNode, dropZone(unitIndex + 1)])}
                                  </>
                                );
                              })()}
                              <button type="button" onClick={() => { setPickerTarget(pickerTarget?.wi === wi && pickerTarget?.ei == null ? null : { wi, ei: null }); setPickerSearch(""); setPickerGroup(""); }} className="text-xs text-[#1B2B4A] underline mt-1">+ Adicionar exercício</button>
                              {pickerTarget?.wi === wi && (
                                <div className="mt-2 rounded-lg border bg-slate-50 p-2">
                                  <div className="mb-2 flex items-center justify-between gap-2">
                                    <p className="text-[11px] font-medium text-slate-600">{pickerTarget.ei == null ? "Adicionar da biblioteca" : "Trocar exercício"}</p>
                                    <button type="button" onClick={() => setPickerTarget(null)} className="text-[11px] text-slate-400">fechar</button>
                                  </div>
                                  <Input value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} placeholder="Buscar na biblioteca..." className="h-8 text-xs mb-2" />
                                  <div className="mb-2 flex max-h-20 gap-1 overflow-x-auto pb-1 sm:max-h-none sm:flex-wrap sm:overflow-visible sm:pb-0">
                                    {["", ...Array.from(new Set(library.map(l => l.muscle_group).filter(Boolean) as string[])).sort()].map(g => (
                                      <button type="button" key={g || "all"} onClick={() => setPickerGroup(g)} className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${pickerGroup === g ? "border-[#8B7355] bg-[#F5EDD8]/60 text-[#1B2B4A]" : "border-slate-200 text-slate-500"}`}>{g || "Todos"}</button>
                                    ))}
                                  </div>
                                  <div className="max-h-64 space-y-1 overflow-y-auto">
                                    {library.length === 0 && <p className="text-xs text-slate-400">Carregando biblioteca…</p>}
                                    {library
                                      .filter(l => !pickerGroup || l.muscle_group === pickerGroup)
                                      .filter(l => (l.name || "").toLowerCase().includes(pickerSearch.trim().toLowerCase()))
                                      .slice(0, 60).map(l => (
                                        <button type="button" key={l.id} onClick={() => pickExercise(l)} className="w-full text-left text-xs px-2 py-1 rounded-xl border border-transparent hover:bg-white hover:border-slate-200 flex items-center gap-2">
                                          <ExerciseVideoPreview libraryExercise={l} interactive={false} />
                                          <span className="min-w-0 flex-1">
                                            <span className="block truncate">{l.name}</span>
                                            {l.muscle_group && <span className="block text-[10px] text-slate-400 truncate">{l.muscle_group}</span>}
                                          </span>
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

                  {(["corrida", "natacao", "ciclismo"] as const).map((modality) => (
                    results[modality] ? (
                      <CardioPlanEditor
                        key={modality}
                        modality={modality}
                        plan={results[modality]}
                        saving={Boolean(savingCardio[modality])}
                        saved={Boolean(savedCardio[modality])}
                        onChange={(plan) => {
                          setResults((current) => ({ ...current, [modality]: plan }));
                          setSavedCardio((current) => ({ ...current, [modality]: false }));
                        }}
                        onSave={(plan) => void saveCardioDraft(modality, plan)}
                      />
                    ) : null
                  ))}
                  {scheduledSummaries.length > 1 && ["corrida", "natacao", "ciclismo"].some((modality) => results[modality]) && (
                    <p className="text-xs text-amber-700">
                      A edição acima corresponde ao último ciclo gerado. Os ciclos anteriores permanecem com a versão gerada.
                    </p>
                  )}

                  {activePublicationDraft && (
                    <>
                      <Button onClick={() => void publishToStudent(activePublicationDraft.bundleId)}
                        disabled={publishing || generating || savingStrength || Object.values(savingCardio).some(Boolean)}
                        variant="outline" className="w-full border-[#1B2B4A] text-[#1B2B4A] hover:bg-[#1B2B4A]/5">
                        {publishing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Publicando…</>
                          : <><Dumbbell className="h-4 w-4 mr-2" /> Publicar {activeIntegratedDraft ? "pacote completo" : "musculação"} · ciclo {activePublicationDraft.cycle.cycle_number}</>}
                      </Button>
                      {publicationError?.draftId === activePublicationDraft.bundleId && (
                        <p role="alert" className="text-sm text-destructive">{publicationError.message}</p>
                      )}
                    </>
                  )}
                  {published && (
                    <p className="text-xs text-green-600 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {published.integrated
                        ? published.scheduled ? "Pacote agendado para o início do ciclo." : "Pacote completo publicado para o ciclo."
                        : published.scheduled
                          ? `Treino agendado (${published.workoutsCreated} sessões). Ele aparecerá no app somente na data de início do ciclo.`
                          : published.current
                            ? `Treino publicado (${published.workoutsCreated} sessões) para o ciclo vigente.`
                            : `Treino registrado no ciclo encerrado (${published.workoutsCreated} sessões).`}
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
