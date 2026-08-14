// ============================================================================
// UnifiedPrescriber — Prescrição Integrada com IA
//   1. Seleciona aluno → carrega anamnese salva (se houver)
//   2. Preenche/edita a anamnese (uma vez, usada por todas as IAs)
//   3. Marca quais prescrições gerar (musculação e/ou corrida)
//   4. "Gerar" roda em sequência passando contexto entre as IAs:
//      Musculação → Corrida (recebe o plano de força para anti-interferência)
// ============================================================================
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2, CheckCircle2, Circle, AlertCircle, Dumbbell, Activity,
  ChevronDown, ChevronUp, ClipboardCheck, MessageCircle,
} from "lucide-react";
import { BnitoContextButton } from "@/components/BnitoFloatingAssistant";
import { useAssistantName } from "@/hooks/useAssistantName";
import {
  buildBnitoOrchestrationPlan,
  buildPrescriptionIntegration,
  formatPrescriptionIntegrationSummary,
} from "@/lib/prescriptionIntegration";

interface Student { id: string; full_name: string; }
interface Anamnese {
  age: string; body_fat_percent: string;
  objective: string; activity_level: string;
  is_endurance_athlete: boolean;
  training_modality: string;
  days_per_week_strength: string; days_per_week_cardio: string;
  session_duration_min: string; endurance_session_duration_min: string; equipment: string; experience_months: string;
  sport: string; fcmax: string; fcrep: string;
  current_volume_weekly: string; cardio_goal: string;
  stress_score: string; sleep_quality: string; injuries: string;
  notes: string;
}
type Modality = "musculacao" | "corrida";
type GenStatus = "idle" | "generating" | "done" | "error";
interface ValidationWarning {
  severity?: "info" | "warning" | "blocker";
  code?: string;
  message?: string;
  recommendation?: string;
  source?: string;
}
interface PrescriptionValidationResult {
  status?: "ok" | "warnings" | "blocked";
  blockers?: ValidationWarning[];
  warnings?: ValidationWarning[];
  volume_review?: Array<{ muscle_group?: string; weekly_sets?: number; status?: string; note?: string }>;
}

const DEFAULT_ANAMNESE: Anamnese = {
  age: "", body_fat_percent: "", objective: "performance",
  activity_level: "moderado", is_endurance_athlete: false,
  training_modality: "", days_per_week_strength: "3",
  days_per_week_cardio: "0", session_duration_min: "60", endurance_session_duration_min: "60",
  equipment: "academia_completa", experience_months: "",
  sport: "corrida", fcmax: "", fcrep: "",
  current_volume_weekly: "", cardio_goal: "",
  stress_score: "", sleep_quality: "", injuries: "", notes: "",
};

// supabase.functions.invoke entrega erro non-2xx como FunctionsHttpError com o body em err.context
// (uma Response). Aqui lemos esse body p/ mostrar a causa real — e, quando é um BLOQUEIO do validador
// (ex.: a IA usou exercício fora da biblioteca), uma mensagem amigável em vez de "Edge Function non-2xx".
async function describeInvokeFailure(
  e: any, data: any,
): Promise<{ message: string; validator?: PrescriptionValidationResult } | null> {
  if (!e && !data?.error) return null;
  let body: any = null;
  try { if (e?.context && typeof e.context.json === "function") body = await e.context.json(); } catch { /* ignore */ }
  const validator = (body?.validator ?? data?.validator) as PrescriptionValidationResult | undefined;
  const blockers = validator?.blockers ?? [];
  if (validator?.status === "blocked" || blockers.length > 0) {
    const reasons = blockers.map((b) => b.message || b.recommendation || b.code).filter(Boolean);
    return {
      message: `Prescrição bloqueada pelo validador: ${reasons.join(" · ") || "a IA usou exercício(s) fora da biblioteca cadastrada"}. Gere novamente ou ajuste a biblioteca de exercícios.`,
      validator,
    };
  }
  return { message: body?.error || data?.error || e?.message || "Falha na geração." };
}

export default function UnifiedPrescriber() {
  const assistantName = useAssistantName();
  const [companyId, setCompanyId]   = useState<string | null>(null);
  const [students, setStudents]     = useState<Student[]>([]);
  const [studentId, setStudentId]   = useState("");
  const [anamnese, setAnamnese]     = useState<Anamnese>(DEFAULT_ANAMNESE);
  const [anamneseId, setAnamneseId] = useState<string | null>(null);
  const [assessmentExists, setAssessmentExists] = useState(false);
  const [assessment, setAssessment] = useState<any>(null);
  const [modalities, setModalities] = useState<Set<Modality>>(new Set(["musculacao"]));
  const [open, setOpen]             = useState({ personal: true, training: true, cardio: false, health: false });
  const [status, setStatus]         = useState<Record<Modality, GenStatus>>({ musculacao: "idle", corrida: "idle" });
  const [results, setResults]       = useState<Record<Modality, any>>({ musculacao: null, corrida: null });
  const [generating, setGenerating] = useState(false);
  const [error, setError]           = useState("");
  const [validationResult, setValidationResult] = useState<PrescriptionValidationResult | null>(null);
  const [notifyingStudent, setNotifyingStudent] = useState(false);

  // Empresa efetiva: master usa a empresa que está visualizando (MasterContext); staff usa a sua.
  // (Antes filtrava por company_members → master sem linha ficava travado, telas não carregavam.)
  const { companyId: authCompanyId, role } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id ?? null : null) : authCompanyId ?? null;

  useEffect(() => {
    if (!effectiveCompanyId) { setCompanyId(null); setStudents([]); return; }
    setCompanyId(effectiveCompanyId);
    (async () => {
      const { data: list } = await supabase.from("students")
        .select("id, full_name").eq("company_id", effectiveCompanyId).order("full_name");
      setStudents(list || []);
    })();
  }, [effectiveCompanyId]);

  useEffect(() => {
    if (!studentId) return;
    (async () => {
      const { data } = await supabase.from("student_anamneses")
        .select("*").eq("student_id", studentId).maybeSingle();
      if (data) {
        setAnamneseId(data.id);
        setAnamnese({
          age: data.age?.toString() ?? "",
          body_fat_percent: data.body_fat_percent?.toString() ?? "",
          objective: data.objective ?? "performance",
          activity_level: data.activity_level ?? "moderado",
          is_endurance_athlete: data.is_endurance_athlete ?? false,
          training_modality: data.training_modality ?? "",
          days_per_week_strength: data.days_per_week_strength?.toString() ?? "3",
          days_per_week_cardio: data.days_per_week_cardio?.toString() ?? "0",
          session_duration_min: data.session_duration_min?.toString() ?? "60",
          endurance_session_duration_min: data.endurance_session_duration_min?.toString()
            ?? data.session_duration_min?.toString()
            ?? "60",
          equipment: data.equipment ?? "academia_completa",
          experience_months: data.experience_months?.toString() ?? "",
          sport: data.sport ?? "corrida",
          fcmax: data.fcmax?.toString() ?? "",
          fcrep: data.fcrep?.toString() ?? "",
          current_volume_weekly: data.current_volume_weekly?.toString() ?? "",
          cardio_goal: data.cardio_goal ?? "",
          stress_score: data.stress_score?.toString() ?? "",
          sleep_quality: data.sleep_quality?.toString() ?? "",
          injuries: data.injuries ?? "",
          notes: data.notes ?? "",
        });
      } else {
        setAnamneseId(null);
        setAnamnese(DEFAULT_ANAMNESE);
      }
      const { data: assess } = await supabase.from("functional_assessments")
        .select("id, assessment_json, report_text, created_at")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      setAssessment(assess);
      setAssessmentExists(!!assess);
    })();
  }, [studentId]);

  useEffect(() => {
    if (modalities.has("corrida")) setOpen(o => ({ ...o, cardio: true }));
  }, [modalities]);

  const set = (k: keyof Anamnese, v: any) => setAnamnese(a => ({ ...a, [k]: v }));
  const toggleMod = (m: Modality) => setModalities(prev => {
    const next = new Set(prev);
    if (next.has(m)) next.delete(m);
    else next.add(m);
    return next;
  });
  const student = students.find(s => s.id === studentId);
  const assessmentContext = assessment?.assessment_json
    ? { ...assessment.assessment_json, report_text: assessment.report_text, id: assessment.id, created_at: assessment.created_at }
    : null;
  const prescriptionIntegration = useMemo(
    () => buildPrescriptionIntegration({
      anamnese: anamneseId ? { ...anamnese, id: anamneseId } : anamnese,
      assessment: assessmentContext,
      assessmentId: assessment?.id,
      assessmentCreatedAt: assessment?.created_at,
    }),
    [anamnese, anamneseId, assessmentContext, assessment?.id, assessment?.created_at],
  );
  const bnitoOrchestration = useMemo(
    () => buildBnitoOrchestrationPlan(prescriptionIntegration),
    [prescriptionIntegration],
  );

  async function saveAnamnese(): Promise<string> {
    const payload = {
      student_id: studentId, company_id: companyId,
      age: anamnese.age ? Number(anamnese.age) : null,
      body_fat_percent: anamnese.body_fat_percent ? Number(anamnese.body_fat_percent) : null,
      objective: anamnese.objective, activity_level: anamnese.activity_level,
      is_endurance_athlete: anamnese.is_endurance_athlete,
      training_modality: anamnese.training_modality,
      days_per_week_strength: Number(anamnese.days_per_week_strength) || null,
      days_per_week_cardio: Number(anamnese.days_per_week_cardio) || null,
      session_duration_min: Number(anamnese.session_duration_min) || null,
      endurance_session_duration_min: Number(anamnese.endurance_session_duration_min) || null,
      equipment: anamnese.equipment,
      experience_months: anamnese.experience_months ? Number(anamnese.experience_months) : null,
      sport: anamnese.sport, fcmax: anamnese.fcmax ? Number(anamnese.fcmax) : null,
      fcrep: anamnese.fcrep ? Number(anamnese.fcrep) : null,
      current_volume_weekly: anamnese.current_volume_weekly ? Number(anamnese.current_volume_weekly) : null,
      cardio_goal: anamnese.cardio_goal,
      stress_score: anamnese.stress_score ? Number(anamnese.stress_score) : null,
      sleep_quality: anamnese.sleep_quality ? Number(anamnese.sleep_quality) : null,
      injuries: anamnese.injuries, notes: anamnese.notes,
    };
    if (anamneseId) {
      await supabase.from("student_anamneses").update(payload).eq("id", anamneseId);
      return anamneseId;
    }
    const { data, error: e } = await supabase.from("student_anamneses").insert(payload).select("id").single();
    if (e) throw new Error(e.message);
    setAnamneseId(data.id);
    return data.id;
  }

  async function validateStrengthPlan(plan: any, anamneseContext: any, functionalAssessmentContext: any): Promise<PrescriptionValidationResult | null> {
    const { data, error: e } = await supabase.functions.invoke<{ result?: PrescriptionValidationResult; error?: string }>("ai-validate-prescription", {
      body: {
        company_id: companyId,
        student_id: studentId,
        objective: anamnese.objective,
        fitness_level: undefined,
        experience_months: anamnese.experience_months ? Number(anamnese.experience_months) : null,
        block_number: 1,
        plan,
        anamnese_context: anamneseContext,
        assessment_context: functionalAssessmentContext,
      },
    });
    if (e || data?.error) {
      const f = await describeInvokeFailure(e, data);
      if (f?.validator) setValidationResult(f.validator);
      throw new Error(f?.message || data?.error || e?.message || "Falha na geração.");
    }
    const result = data?.result || { status: "ok", warnings: [], blockers: [] };
    setValidationResult(result);
    return result;
  }

  async function notifyStudent(message?: string) {
    if (!studentId || !companyId) return;
    setNotifyingStudent(true);
    setError("");
    try {
      const { data: chat, error: chatError } = await (supabase as any)
        .from("whatsapp_chats")
        .select("id, remote_jid")
        .eq("company_id", companyId)
        .eq("student_id", studentId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (chatError) throw new Error(chatError.message);
      if (!chat?.remote_jid) throw new Error("Aluno sem chat do WhatsApp vinculado.");
      const content = message || `Oi, ${student?.full_name || "tudo bem"}! Sua prescrição nova já está pronta no app. Dá uma olhada e me chama se quiser tirar dúvida de execução.`;
      const { data, error } = await supabase.functions.invoke("whatsapp-manager", {
        body: {
          action: "send-message",
          companyId,
          chatId: chat.id,
          remoteJid: chat.remote_jid,
          content,
        },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.details || (data as any)?.error || error?.message);
    } catch (err: any) {
      setError(err.message || "Erro ao avisar aluno.");
    } finally {
      setNotifyingStudent(false);
    }
  }

  async function generate() {
    if (!studentId || !companyId) { setError("Selecione um aluno."); return; }
    if (modalities.size === 0) { setError("Selecione ao menos uma prescrição."); return; }
    setGenerating(true); setError(""); setValidationResult(null);
    setStatus({ musculacao: "idle", corrida: "idle" });
    setResults({ musculacao: null, corrida: null });

    let strengthPlan: any = null;
    let strengthPlanId: string | null = null;
    let runningPlanId: string | null = null;
    const bundleId = crypto.randomUUID();

    try {
      const savedAnamneseId = await saveAnamnese();

      const { data: latestAssessment } = await supabase
        .from("functional_assessments").select("id, assessment_json, report_text, created_at")
        .eq("student_id", studentId).order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      const assessmentJson = latestAssessment?.assessment_json;
      const assessmentCtx = assessmentJson && typeof assessmentJson === "object" && !Array.isArray(assessmentJson)
        ? {
            ...(assessmentJson as Record<string, unknown>),
            report_text: latestAssessment.report_text,
            id: latestAssessment.id,
            created_at: latestAssessment.created_at,
          }
        : null;
      const integrationCtx = buildPrescriptionIntegration({
        anamnese: { ...anamnese, id: savedAnamneseId },
        assessment: assessmentCtx,
        assessmentId: latestAssessment?.id,
        assessmentCreatedAt: latestAssessment?.created_at,
      });
      const orchestrationCtx = buildBnitoOrchestrationPlan(integrationCtx);

      // 1) Musculação
      if (modalities.has("musculacao")) {
        setStatus(s => ({ ...s, musculacao: "generating" }));
        const { data, error: e } = await supabase.functions.invoke("ai-prescribe-workout", {
          body: {
            student_id: studentId, student_name: student?.full_name, company_id: companyId,
            anamnese_id: savedAnamneseId, bundle_id: bundleId,
            objective: anamnese.objective, fitness_level: undefined,
            experience_months: anamnese.experience_months ? Number(anamnese.experience_months) : null,
            days_per_week: Number(anamnese.days_per_week_strength),
            duration_weeks: 6, equipment: anamnese.equipment, block_number: 1,
            is_endurance_athlete: anamnese.is_endurance_athlete,
            restrictions: anamnese.injuries, notes: anamnese.notes,
            running_days_context: modalities.has("corrida") ? {
              days_per_week: Number(anamnese.days_per_week_cardio),
              sport: anamnese.sport,
            } : null,
            assessment_context: assessmentCtx,
            anamnese_context: { ...anamnese, id: savedAnamneseId },
            prescription_integration: integrationCtx,
            bnito_orchestration: orchestrationCtx,
          },
        });
        if (e || data?.error) {
      const f = await describeInvokeFailure(e, data);
      if (f?.validator) setValidationResult(f.validator);
      throw new Error(f?.message || data?.error || e?.message || "Falha na geração.");
    }
        strengthPlan = data?.plan; strengthPlanId = data?.id ?? null;
        const validation = await validateStrengthPlan(
          strengthPlan,
          { ...anamnese, id: savedAnamneseId },
          assessmentCtx,
        );
        if (validation?.status === "blocked" || (validation?.blockers || []).length > 0) {
          const reasons = (validation?.blockers || []).map((b) => b.message || b.recommendation || b.code).filter(Boolean);
          throw new Error(`Prescrição de musculação bloqueada pelo validador: ${reasons.join(" · ") || "revise os pontos críticos"}.`);
        }
        setResults(r => ({ ...r, musculacao: data?.plan }));
        setStatus(s => ({ ...s, musculacao: "done" }));
      }

      // 2) Corrida
      if (modalities.has("corrida")) {
        setStatus(s => ({ ...s, corrida: "generating" }));
        const { data, error: e } = await supabase.functions.invoke("ai-running-plan", {
          body: {
            student_id: studentId, student_name: student?.full_name, company_id: companyId,
            anamnese_id: savedAnamneseId, bundle_id: bundleId,
            sport: anamnese.sport, goal: anamnese.cardio_goal || "Melhora de performance geral",
            duration_weeks: 6,
            days_per_week: Number(anamnese.days_per_week_cardio),
            session_duration: Number(anamnese.endurance_session_duration_min || anamnese.session_duration_min),
            current_volume: anamnese.current_volume_weekly ? Number(anamnese.current_volume_weekly) : null,
            fcmax: anamnese.fcmax ? Number(anamnese.fcmax) : null,
            fcrep: anamnese.fcrep ? Number(anamnese.fcrep) : null,
            experience_months: anamnese.experience_months ? Number(anamnese.experience_months) : null,
            tsb: null, eva: {}, injuries: anamnese.injuries,
            diet_type: anamnese.objective,
            strength_plan_context: strengthPlan ? {
              days_per_week: Number(anamnese.days_per_week_strength),
              workouts: strengthPlan.workouts?.map((w: any) => ({
                day: w.day_of_week,
                focus: w.split_focus,
                has_heavy_legs: w.exercises?.some((ex: any) =>
                  ["forca_global", "controle_motor"].includes(ex.phase) &&
                  ["quadríceps", "posterior", "glúteos"].some(m => ex.muscle_group?.toLowerCase().includes(m))
                ),
              })) ?? [],
            } : null,
            assessment_context: assessmentCtx,
            anamnese_context: { ...anamnese, id: savedAnamneseId },
            prescription_integration: integrationCtx,
            bnito_orchestration: orchestrationCtx,
          },
        });
        if (e || data?.error) {
      const f = await describeInvokeFailure(e, data);
      if (f?.validator) setValidationResult(f.validator);
      throw new Error(f?.message || data?.error || e?.message || "Falha na geração.");
    }
        runningPlanId = data?.id ?? null;
        setResults(r => ({ ...r, corrida: data?.plan }));
        setStatus(s => ({ ...s, corrida: "done" }));
      }

      await supabase.from("prescription_bundles").insert({
        id: bundleId, company_id: companyId, student_id: studentId,
        anamnese_id: savedAnamneseId,
        assessment_id: integrationCtx.sources.assessment_id,
        strength_plan_id: strengthPlanId,
        running_plan_id: runningPlanId,
        has_strength: modalities.has("musculacao"),
        has_cardio: modalities.has("corrida"),
        notes: [
          formatPrescriptionIntegrationSummary(integrationCtx),
          `BNITO: periodizacao de ${orchestrationCtx.duration_weeks} semanas em blocos de ${orchestrationCtx.block_length_weeks} semanas.`,
        ].join("\n"),
        status: "active",
      });
    } catch (err: any) {
      setError(err.message || "Erro ao gerar prescrições.");
      setStatus(s => ({
        musculacao: s.musculacao === "generating" ? "error" : s.musculacao,
        corrida: s.corrida === "generating" ? "error" : s.corrida,
      }));
    }
    setGenerating(false);
  }

  // ── UI helpers ──
  const inputCls = "h-9 text-sm";
  const Section = ({ id, label, children }: { id: keyof typeof open; label: string; children: React.ReactNode }) => (
    <div className="border border-line rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 hover:bg-muted/50">
        <button
          type="button"
          className="flex flex-1 items-center justify-between text-left text-sm font-medium"
          onClick={() => setOpen(o => ({ ...o, [id]: !o[id] }))}
        >
          {label}
          {open[id] ? <ChevronUp className="h-4 w-4 opacity-50" /> : <ChevronDown className="h-4 w-4 opacity-50" />}
        </button>
        <BnitoContextButton
          label={`prescricao integrada: ${label}`}
          context={`Secao ${label} dentro da prescricao integrada. Campos atuais ajudam a IA a decidir objetivo, carga, restricoes e modalidade.`}
          question={`Como devo preencher e interpretar a secao ${label} para uma prescricao mais segura?`}
        />
      </div>
      {open[id] && <div className="px-4 pb-4 pt-2 grid gap-3 grid-cols-2 md:grid-cols-3 border-t border-line">{children}</div>}
    </div>
  );
  const F = ({ label, span, children }: { label: string; span?: string; children: React.ReactNode }) => (
    <div className={span}>
      <Label className="text-xs text-muted-foreground mb-1">{label}</Label>
      {children}
    </div>
  );
  const SI = (props: any) => <Input {...props} className={inputCls} />;
  const SS = ({ value, onChange, opts, placeholder = "Selecione..." }: any) => (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className={inputCls}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {opts
          .filter(([v]: [string, string]) => v !== "")
          .map(([v, l]: [string, string]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
      </SelectContent>
    </Select>
  );
  const genStatusIcon = (s: GenStatus) => {
    if (s === "generating") return <Loader2 className="h-4 w-4 animate-spin text-navy" />;
    if (s === "done")       return <CheckCircle2 className="h-4 w-4 text-navy" />;
    if (s === "error")      return <AlertCircle className="h-4 w-4 text-destructive" />;
    return <Circle className="h-4 w-4 text-muted-foreground" />;
  };
  const allValidationWarnings = [
    ...(validationResult?.blockers || []),
    ...(validationResult?.warnings || []),
  ];
  const validationWarningsBySource = allValidationWarnings.reduce<Record<string, ValidationWarning[]>>((acc, warning) => {
    const source = warning.source || "geral";
    acc[source] = acc[source] || [];
    acc[source].push(warning);
    return acc;
  }, {});
  const noticeIntent = results.musculacao?.bnito_after_generation;
  const shouldOfferStudentNotice = noticeIntent?.intent === "notify_student_prescription_ready";

  return (
    <>
      <div className="max-w-3xl mx-auto space-y-5">
        <div>
          <p className="text-eyebrow">Prescrição</p>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl">Prescrição Integrada com IA</h1>
            <BnitoContextButton
              label="prescricao integrada com IA"
              context="Fluxo que junta anamnese, avaliacao funcional, musculacao e corrida em uma prescricao sincronizada."
              question="Me ajuda a decidir se devo gerar musculacao, corrida ou ambos para este aluno?"
            />
          </div>
          <p className="text-sm text-muted-foreground">Anamnese única · IAs em sequência · periodização sincronizada</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              Aluno
              <BnitoContextButton
                label="aluno da prescricao integrada"
                context="Selecao de aluno para carregar anamnese e avaliacao funcional antes da geracao integrada."
                question="O que devo conferir neste aluno antes de gerar uma prescricao integrada?"
                className="ml-auto"
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SS value={studentId} onChange={setStudentId} opts={[["", "Selecione..."], ...students.map(s => [s.id, s.full_name])]} />
            {anamneseId && <p className="text-xs text-navy mt-1">Anamnese salva carregada — edite se necessário.</p>}
            {studentId && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <ClipboardCheck className="h-3 w-3" />
                {assessmentExists
                  ? "Avaliação funcional disponível — será usada como contexto."
                  : "Sem avaliação funcional. Gere uma na aba Avaliação Funcional para refinar a prescrição."}
              </p>
            )}
          </CardContent>
        </Card>

        {studentId && (
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  Anamnese
                  <BnitoContextButton
                    label="anamnese da prescricao integrada"
                    context="Campos de objetivo, nivel, restricoes, endurance, frequencia, equipamento e saude usados por todas as IAs."
                    question="Quais pontos desta anamnese podem mudar a montagem do treino?"
                    className="ml-auto"
                  />
                </CardTitle>
                <p className="text-xs text-muted-foreground">Preenchida uma vez — usada por todas as IAs selecionadas.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <Section id="personal" label="Dados pessoais">
                  <F label="Idade"><SI type="number" value={anamnese.age} onChange={(e: any) => set("age", e.target.value)} /></F>
                  <F label="% Gordura corporal"><SI type="number" step="0.1" value={anamnese.body_fat_percent} onChange={(e: any) => set("body_fat_percent", e.target.value)} placeholder="opc." /></F>
                  <F label="Objetivo">
                    <SS value={anamnese.objective} onChange={(v: string) => set("objective", v)}
                      opts={[["emagrecimento","Emagrecimento"],["hipertrofia","Hipertrofia"],["performance","Performance"]]} />
                  </F>
                  <F label="Nível de atividade">
                    <SS value={anamnese.activity_level} onChange={(v: string) => set("activity_level", v)}
                      opts={[["sedentario","Sedentário"],["leve","Leve"],["moderado","Moderado"],["muito_ativo","Muito ativo"],["extremo","Extremo"]]} />
                  </F>
                  <F label="Lesões / restrições" span="col-span-2 md:col-span-3">
                    <Textarea className="text-sm min-h-[60px]" value={anamnese.injuries} onChange={(e: any) => set("injuries", e.target.value)} placeholder="Ex: dor lombar EVA 2, ombro D sensível" />
                  </F>
                </Section>

                <Section id="training" label="Treino">
                  <F label="Dias musculação/semana"><SI type="number" min="0" max="6" value={anamnese.days_per_week_strength} onChange={(e: any) => set("days_per_week_strength", e.target.value)} /></F>
                  <F label="Dias cardio/semana"><SI type="number" min="0" max="7" value={anamnese.days_per_week_cardio} onChange={(e: any) => set("days_per_week_cardio", e.target.value)} /></F>
                  <F label="Duração sessão (min)"><SI type="number" value={anamnese.session_duration_min} onChange={(e: any) => set("session_duration_min", e.target.value)} /></F>
                  <F label="Experiência (meses)"><SI type="number" value={anamnese.experience_months} onChange={(e: any) => set("experience_months", e.target.value)} /></F>
                  <F label="Equipamento">
                    <SS value={anamnese.equipment} onChange={(v: string) => set("equipment", v)}
                      opts={[["academia_completa","Academia completa"],["casa_halteres","Casa (halteres)"],["funcional","Funcional"]]} />
                  </F>
                  <F label="Modalidade principal"><SI value={anamnese.training_modality} onChange={(e: any) => set("training_modality", e.target.value)} placeholder="Ex: corrida + musculação" /></F>
                  <div className="col-span-2 md:col-span-3 flex items-center gap-2 pt-1">
                    <Checkbox checked={anamnese.is_endurance_athlete} onCheckedChange={v => set("is_endurance_athlete", !!v)} id="endurance" />
                    <label htmlFor="endurance" className="text-sm cursor-pointer">Atleta de endurance (corrida / triathlon)</label>
                  </div>
                </Section>

                {(modalities.has("corrida") || open.cardio) && (
                  <Section id="cardio" label="Específico corrida / pedal / natação">
                    <F label="Modalidade">
                      <SS value={anamnese.sport} onChange={(v: string) => set("sport", v)}
                        opts={[["corrida","Corrida"],["ciclismo","Ciclismo"],["natacao","Natação"],["triathlon","Triathlon"]]} />
                    </F>
                    <F label="Objetivo / prova"><SI value={anamnese.cardio_goal} onChange={(e: any) => set("cardio_goal", e.target.value)} placeholder="Ex: Meia maratona em 8 sem." /></F>
                    <F label="Volume atual (km ou h/sem)"><SI type="number" value={anamnese.current_volume_weekly} onChange={(e: any) => set("current_volume_weekly", e.target.value)} /></F>
                    <F label="Duração sessão endurance (min)"><SI type="number" value={anamnese.endurance_session_duration_min} onChange={(e: any) => set("endurance_session_duration_min", e.target.value)} /></F>
                    <F label="FC máx (bpm)"><SI type="number" value={anamnese.fcmax} onChange={(e: any) => set("fcmax", e.target.value)} placeholder="vazio = 220-idade" /></F>
                    <F label="FC repouso (bpm)"><SI type="number" value={anamnese.fcrep} onChange={(e: any) => set("fcrep", e.target.value)} placeholder="vazio = 65" /></F>
                  </Section>
                )}

                <Section id="health" label="Saúde e bem-estar">
                  <F label="Estresse (0-10)"><SI type="number" min="0" max="10" value={anamnese.stress_score} onChange={(e: any) => set("stress_score", e.target.value)} /></F>
                  <F label="Qualidade do sono (0-10)"><SI type="number" min="0" max="10" value={anamnese.sleep_quality} onChange={(e: any) => set("sleep_quality", e.target.value)} /></F>
                </Section>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  Resultado integrado para prescrição
                  <Badge variant={prescriptionIntegration.readiness.status === "pronto" ? "default" : "outline"} className="text-xs">
                    {prescriptionIntegration.readiness.status}
                  </Badge>
                  <BnitoContextButton
                    label="resultado integrado da prescricao"
                    context="Resumo tecnico que cruza anamnese, avaliacao funcional, objetivo, restricoes e regras para gerar musculacao/corrida."
                    question="Revise este resultado integrado e aponte cuidados para a prescricao."
                    className="ml-auto"
                  />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">{prescriptionIntegration.readiness.reason}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border border-line p-2">
                    Anamnese: {prescriptionIntegration.sources.has_anamnese ? "ok" : "pendente"}
                  </div>
                  <div className="rounded border border-line p-2">
                    Avaliação: {prescriptionIntegration.sources.has_assessment ? "ok" : "pendente"}
                  </div>
                </div>
                {prescriptionIntegration.functional_findings.priorities.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Prioridades funcionais</p>
                    <ul className="space-y-1 text-muted-foreground">
                      {prescriptionIntegration.functional_findings.priorities.slice(0, 4).map((item, index) => (
                        <li key={index}>- {item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {prescriptionIntegration.prescription_decision.exercise_selection_rules.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Regras para a IA</p>
                    <ul className="space-y-1 text-muted-foreground">
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
                <CardTitle className="flex items-center gap-2 text-base">
                  Orquestração {assistantName}
                  <Badge variant="outline" className="text-xs">6 semanas</Badge>
                  <BnitoContextButton
                    label="orquestracao BNITO integrada"
                    context="BNITO coordena os agentes de musculacao, corrida e nutricao em 6 semanas, com mudanca de estimulo a cada 2 semanas."
                    question="Revise esta periodizacao e me diga se os blocos estao coerentes com o aluno."
                    className="ml-auto"
                  />
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                {bnitoOrchestration.blocks.map((block) => (
                  <div key={block.block} className="rounded border border-line p-3">
                    <p className="font-medium text-foreground">Semanas {block.weeks[0]}-{block.weeks[1]}</p>
                    <p className="mt-1">{block.name}</p>
                    <p className="mt-2">{block.advanced_methods.join(", ")}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  Quais prescrições gerar?
                  <BnitoContextButton
                    label="modalidades da prescricao"
                    context="Escolha entre musculacao e corrida/cardio, considerando interferencia, objetivo e restricoes."
                    question="Com base em objetivo, rotina e restricoes, quais prescricoes devo gerar e como sincronizar?"
                    className="ml-auto"
                  />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    ["musculacao", Dumbbell, "Musculação", "Força + biomecânica"],
                    ["corrida", Activity, "Corrida / Pedal / Natação", "Zonas FC + periodização"],
                  ] as [Modality, any, string, string][]).map(([mod, Icon, label, sub]) => (
                    <button
                      key={mod}
                      type="button"
                      onClick={() => toggleMod(mod)}
                      className={`rounded-lg border-2 p-3 text-left transition ${
                        modalities.has(mod) ? "border-navy bg-navy/5" : "border-line hover:border-navy/40"
                      }`}
                    >
                      <Icon className="h-5 w-5 mb-1 text-navy" />
                      <div className="text-sm font-medium">{label}</div>
                      <div className="text-xs text-muted-foreground">{sub}</div>
                    </button>
                  ))}
                </div>

                {(generating || Object.values(status).some(s => s !== "idle")) && (
                  <div className="mt-4 space-y-2 border border-line rounded-lg p-4 bg-muted/30">
                    <p className="text-eyebrow mb-2">Progresso</p>
                    {modalities.has("musculacao") && (
                      <div className="flex items-center gap-2 text-sm">
                        {genStatusIcon(status.musculacao)}
                        <span>Musculação {status.musculacao === "generating" ? "— gerando plano de força…" : status.musculacao === "done" ? "— concluído" : ""}</span>
                      </div>
                    )}
                    {modalities.has("corrida") && (
                      <div className="flex items-center gap-2 text-sm">
                        {genStatusIcon(status.corrida)}
                        <span>Corrida {status.corrida === "generating" ? "— calculando zonas FC e periodização…" : status.corrida === "done" ? "— concluído" : ""}</span>
                        {modalities.has("musculacao") && status.corrida !== "idle" && (
                          <Badge variant="outline" className="text-xs">sincroniza com musculação</Badge>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {error && <p className="text-sm text-destructive mt-3">{error}</p>}

                {allValidationWarnings.length > 0 && (
                  <div className="mt-4 rounded-lg border border-line p-3 text-xs">
                    <p className="mb-2 font-medium text-foreground">Validador pré-salvar</p>
                    <div className="space-y-2">
                      {Object.entries(validationWarningsBySource).map(([source, warnings]) => (
                        <div key={source} className="rounded border border-line p-2">
                          <p className="text-eyebrow">{source}</p>
                          <div className="mt-1 space-y-2">
                            {warnings.map((warning, idx) => (
                              <div key={`${warning.code || warning.message}-${idx}`}>
                                <Badge variant={warning.severity === "blocker" ? "destructive" : "outline"} className="mb-1 text-[10px]">
                                  {warning.severity || "warning"}
                                </Badge>
                                <p className="text-foreground">{warning.message}</p>
                                {warning.recommendation && <p className="text-muted-foreground">{warning.recommendation}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button className="w-full mt-4" onClick={generate} disabled={generating || modalities.size === 0}>
                  {generating
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando prescrições…</>
                    : `Gerar ${modalities.size} prescriç${modalities.size > 1 ? "ões" : "ão"} integrada${modalities.size > 1 ? "s" : ""}`}
                </Button>
              </CardContent>
            </Card>

            {Object.values(results).some(Boolean) && (
              <div className="space-y-4">
                <h2 className="font-display text-xl">Prescrições geradas</h2>
                {results.musculacao && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Dumbbell className="h-4 w-4 text-navy" /> Musculação — {results.musculacao.cycle_name}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">{results.musculacao.objective} · {results.musculacao.duration_weeks} semanas</p>
                    </CardHeader>
                    <CardContent>
                      {results.musculacao.biomechanical_notes && (
                        <p className="text-xs bg-muted rounded p-2 mb-3">{results.musculacao.biomechanical_notes}</p>
                      )}
                      <div className="space-y-2">
                        {results.musculacao.workouts?.map((w: any, i: number) => (
                          <div key={i} className="text-sm border-l-2 border-navy pl-3">
                            <span className="font-medium">{w.name}</span>
                            <span className="text-muted-foreground text-xs ml-2">{w.split_focus} · {w.duration_min}min</span>
                          </div>
                        ))}
                      </div>
                      {shouldOfferStudentNotice && (
                        <div className="mt-3 rounded border border-navy/20 bg-navy/5 p-3">
                          <p className="text-xs font-medium text-foreground">
                            {noticeIntent?.question_to_teacher || "Quer que eu avise o aluno que a prescrição foi feita?"}
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            className="mt-2"
                            onClick={() => notifyStudent(noticeIntent?.suggested_message)}
                            disabled={notifyingStudent}
                          >
                            {notifyingStudent ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
                            Avisar aluno
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
                {results.corrida && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Activity className="h-4 w-4 text-navy" /> {results.corrida.plan_name}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">{results.corrida.sport} · modelo {results.corrida.model} · {results.corrida.duration_weeks} semanas</p>
                    </CardHeader>
                    <CardContent>
                      {results.corrida.fc_zones && (
                        <div className="grid grid-cols-5 gap-1 text-xs text-center mb-3">
                          {["z1","z2","z3","z4","z5"].map(z => results.corrida.fc_zones[z] && (
                            <div key={z} className="border border-line rounded p-1">
                              <div className="font-medium uppercase">{z}</div>
                              <div className="text-muted-foreground">{results.corrida.fc_zones[z].min}–{results.corrida.fc_zones[z].max}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {results.corrida.warnings?.length > 0 && (
                        <p className="text-xs text-navy bg-navy/5 rounded p-2 mb-2">{results.corrida.warnings[0]}</p>
                      )}
                      {results.corrida.general_tips && (
                        <p className="text-xs text-muted-foreground whitespace-pre-line">{results.corrida.general_tips}</p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
