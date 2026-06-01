// ============================================================================
// UnifiedPrescriber.tsx — BN Performance Training
// Cole em: src/pages/admin/UnifiedPrescriber.tsx
//
// FLUXO:
//   1. Seleciona aluno → carrega anamnese salva (se houver)
//   2. Preenche/edita anamnese UMA VEZ
//   3. Marca quais IAs gerar (qualquer combinação)
//   4. "Gerar Prescrições" → roda em sequência passando contexto
//      Musculação → Corrida (recebe plano de força) → Nutrição (recebe ambos)
// ============================================================================
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { Loader2, CheckCircle2, Circle, AlertCircle, Dumbbell, Activity, Apple, ChevronDown, ChevronUp } from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────────────────
interface Student { id: string; name: string; }
interface Anamnese {
  age: string; body_fat_percent: string;
  objective: string; activity_level: string;
  is_endurance_athlete: boolean;
  training_modality: string;
  days_per_week_strength: string; days_per_week_cardio: string;
  session_duration_min: string; equipment: string; experience_months: string;
  sport: string; fcmax: string; fcrep: string;
  current_volume_weekly: string; cardio_goal: string;
  stress_score: string; sleep_quality: string; injuries: string;
  food_restrictions: string; budget_food: string;
  meals_per_day: string; has_kitchen: boolean; notes: string;
}
type Modality = "musculacao" | "corrida" | "nutricao";
type GenStatus = "idle" | "generating" | "done" | "error";

const DEFAULT_ANAMNESE: Anamnese = {
  age: "", body_fat_percent: "", objective: "performance",
  activity_level: "moderado", is_endurance_athlete: false,
  training_modality: "", days_per_week_strength: "3",
  days_per_week_cardio: "0", session_duration_min: "60",
  equipment: "academia_completa", experience_months: "",
  sport: "corrida", fcmax: "", fcrep: "",
  current_volume_weekly: "", cardio_goal: "",
  stress_score: "", sleep_quality: "", injuries: "",
  food_restrictions: "", budget_food: "moderado",
  meals_per_day: "5", has_kitchen: true, notes: "",
};

// ── Componente principal ──────────────────────────────────────────────────
export default function UnifiedPrescriber() {
  const [companyId, setCompanyId]   = useState<string | null>(null);
  const [students, setStudents]     = useState<Student[]>([]);
  const [studentId, setStudentId]   = useState("");
  const [anamnese, setAnamnese]     = useState<Anamnese>(DEFAULT_ANAMNESE);
  const [anamneseId, setAnamneseId] = useState<string | null>(null);
  const [modalities, setModalities] = useState<Set<Modality>>(new Set(["musculacao"]));
  const [open, setOpen]             = useState({ personal: true, training: true, cardio: false, health: false, nutri: false });
  const [status, setStatus]         = useState<Record<Modality, GenStatus>>({ musculacao: "idle", corrida: "idle", nutricao: "idle" });
  const [results, setResults]       = useState<Record<Modality, any>>({ musculacao: null, corrida: null, nutricao: null });
  const [generating, setGenerating] = useState(false);
  const [bundleId, setBundleId]     = useState<string | null>(null);
  const [error, setError]           = useState("");

  // Carrega company + alunos
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: m } = await supabase.from("company_members").select("company_id").eq("user_id", user.id).limit(1).maybeSingle();
      if (!m) return;
      setCompanyId(m.company_id);
      const { data: list } = await supabase.from("students").select("id, name").eq("company_id", m.company_id).order("name");
      setStudents(list || []);
    })();
  }, []);

  // Carrega anamnese salva quando troca de aluno
  useEffect(() => {
    if (!studentId) return;
    (async () => {
      const { data } = await supabase.from("student_anamneses").select("*").eq("student_id", studentId).maybeSingle();
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
          food_restrictions: data.food_restrictions ?? "",
          budget_food: data.budget_food ?? "moderado",
          meals_per_day: data.meals_per_day?.toString() ?? "5",
          has_kitchen: data.has_kitchen ?? true,
          notes: data.notes ?? "",
        });
      } else {
        setAnamneseId(null);
        setAnamnese(DEFAULT_ANAMNESE);
      }
    })();
  }, [studentId]);

  // Sincroniza seção cardio quando seleciona corrida
  useEffect(() => {
    if (modalities.has("corrida")) setOpen(o => ({ ...o, cardio: true }));
    if (modalities.has("nutricao")) setOpen(o => ({ ...o, nutri: true }));
  }, [modalities]);

  const set = (k: keyof Anamnese, v: any) => setAnamnese(a => ({ ...a, [k]: v }));
  const toggleMod = (m: Modality) => setModalities(prev => {
    const next = new Set(prev);
    next.has(m) ? next.delete(m) : next.add(m);
    return next;
  });
  const student = students.find(s => s.id === studentId);

  // ── Salvar anamnese no banco ────────────────────────────────────────────
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
      equipment: anamnese.equipment,
      experience_months: anamnese.experience_months ? Number(anamnese.experience_months) : null,
      sport: anamnese.sport, fcmax: anamnese.fcmax ? Number(anamnese.fcmax) : null,
      fcrep: anamnese.fcrep ? Number(anamnese.fcrep) : null,
      current_volume_weekly: anamnese.current_volume_weekly ? Number(anamnese.current_volume_weekly) : null,
      cardio_goal: anamnese.cardio_goal,
      stress_score: anamnese.stress_score ? Number(anamnese.stress_score) : null,
      sleep_quality: anamnese.sleep_quality ? Number(anamnese.sleep_quality) : null,
      injuries: anamnese.injuries, food_restrictions: anamnese.food_restrictions,
      budget_food: anamnese.budget_food,
      meals_per_day: Number(anamnese.meals_per_day) || 5,
      has_kitchen: anamnese.has_kitchen, notes: anamnese.notes,
      updated_at: new Date().toISOString(),
    };
    if (anamneseId) {
      await supabase.from("student_anamneses").update(payload).eq("id", anamneseId);
      return anamneseId;
    } else {
      const { data } = await supabase.from("student_anamneses").insert(payload).select("id").single();
      setAnamneseId(data.id);
      return data.id;
    }
  }

  // ── Geração sequencial integrada ────────────────────────────────────────
  async function generate() {
    if (!studentId || !companyId) { setError("Selecione um aluno."); return; }
    if (modalities.size === 0) { setError("Selecione ao menos uma prescrição."); return; }
    setGenerating(true); setError("");
    setStatus({ musculacao: "idle", corrida: "idle", nutricao: "idle" });
    setResults({ musculacao: null, corrida: null, nutricao: null });

    let strengthPlan: any = null;
    let runningPlan: any  = null;
    let newBundleId       = crypto.randomUUID();
    setBundleId(newBundleId);

    try {
      // Salva anamnese
      const savedAnamneseId = await saveAnamnese();

      // Busca avaliação funcional mais recente
      const { data: assessment } = await supabase
        .from("functional_assessments").select("assessment_json")
        .eq("student_id", studentId).order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      const assessmentCtx = assessment?.assessment_json ?? null;

      // ── 1. MUSCULAÇÃO ────────────────────────────────────────────────
      if (modalities.has("musculacao")) {
        setStatus(s => ({ ...s, musculacao: "generating" }));
        const { data, error: e } = await supabase.functions.invoke("ai-prescribe-workout", {
          body: {
            student_id: studentId, student_name: student?.name, company_id: companyId,
            anamnese_id: savedAnamneseId,
            // Anamnese
            objective: anamnese.objective, fitness_level: anamnese.activity_level,
            days_per_week: Number(anamnese.days_per_week_strength),
            duration_weeks: 6, equipment: anamnese.equipment,
            block_number: 1,
            is_endurance_athlete: anamnese.is_endurance_athlete,
            restrictions: anamnese.injuries, notes: anamnese.notes,
            // Contexto integrado: dias de corrida pra evitar interferência
            running_days_context: modalities.has("corrida") ? {
              days_per_week: Number(anamnese.days_per_week_cardio),
              sport: anamnese.sport,
            } : null,
            assessment_context: assessmentCtx,
          },
        });
        if (e || data?.error) throw new Error(e?.message || data?.error);
        strengthPlan = data?.plan;
        setResults(r => ({ ...r, musculacao: data?.plan }));
        setStatus(s => ({ ...s, musculacao: "done" }));
      }

      // ── 2. CORRIDA ───────────────────────────────────────────────────
      if (modalities.has("corrida")) {
        setStatus(s => ({ ...s, corrida: "generating" }));
        const { data, error: e } = await supabase.functions.invoke("ai-running-plan", {
          body: {
            student_id: studentId, student_name: student?.name, company_id: companyId,
            anamnese_id: savedAnamneseId,
            sport: anamnese.sport, goal: anamnese.cardio_goal || "Melhora de performance geral",
            duration_weeks: 8,
            days_per_week: Number(anamnese.days_per_week_cardio),
            session_duration: Number(anamnese.session_duration_min),
            current_volume: anamnese.current_volume_weekly ? Number(anamnese.current_volume_weekly) : null,
            fcmax: anamnese.fcmax ? Number(anamnese.fcmax) : null,
            fcrep: anamnese.fcrep ? Number(anamnese.fcrep) : null,
            experience_months: anamnese.experience_months ? Number(anamnese.experience_months) : null,
            tsb: null, eva: {}, injuries: anamnese.injuries,
            diet_type: anamnese.objective,
            // Contexto integrado: plano de força para sincronizar periodização
            strength_plan_context: strengthPlan ? {
              days_per_week: Number(anamnese.days_per_week_strength),
              workouts: strengthPlan.workouts?.map((w: any) => ({
                day: w.day_of_week,
                focus: w.split_focus,
                has_heavy_legs: w.exercises?.some((e: any) =>
                  ["forca_global", "controle_motor"].includes(e.phase) &&
                  ["quadríceps", "posterior", "glúteos"].some(m => e.muscle_group?.toLowerCase().includes(m))
                ),
              })) ?? [],
            } : null,
            assessment_context: assessmentCtx,
          },
        });
        if (e || data?.error) throw new Error(e?.message || data?.error);
        runningPlan = data?.plan;
        setResults(r => ({ ...r, corrida: data?.plan }));
        setStatus(s => ({ ...s, corrida: "done" }));
      }

      // ── 3. NUTRIÇÃO ──────────────────────────────────────────────────
      if (modalities.has("nutricao")) {
        setStatus(s => ({ ...s, nutricao: "generating" }));

        // Busca dados de peso/altura do perfil do aluno
        const { data: studentData } = await supabase
          .from("students").select("weight_kg, height_cm, gender, birth_date")
          .eq("id", studentId).maybeSingle();

        const age = anamnese.age
          ? Number(anamnese.age)
          : studentData?.birth_date
            ? Math.floor((Date.now() - new Date(studentData.birth_date).getTime()) / 31557600000)
            : null;

        const { data, error: e } = await supabase.functions.invoke("ai-nutrition-plan", {
          body: {
            student_id: studentId, student_name: student?.name, company_id: companyId,
            anamnese_id: savedAnamneseId,
            age, gender: studentData?.gender ?? "M",
            weight_kg: studentData?.weight_kg ?? null,
            height_cm: studentData?.height_cm ?? null,
            body_fat_percent: anamnese.body_fat_percent ? Number(anamnese.body_fat_percent) : null,
            objective: anamnese.objective, activity_level: anamnese.activity_level,
            is_endurance_athlete: anamnese.is_endurance_athlete,
            training_hours_per_day: (
              (Number(anamnese.days_per_week_strength) * Number(anamnese.session_duration_min) / 60) +
              (Number(anamnese.days_per_week_cardio) * Number(anamnese.session_duration_min) / 60)
            ) / 7,
            training_modality: anamnese.training_modality || [
              modalities.has("musculacao") ? "musculação" : "",
              modalities.has("corrida") ? anamnese.sport : "",
            ].filter(Boolean).join(" + "),
            meals_per_day: Number(anamnese.meals_per_day),
            food_restrictions: anamnese.food_restrictions,
            stress_score: anamnese.stress_score ? Number(anamnese.stress_score) : null,
            sleep_quality: anamnese.sleep_quality ? Number(anamnese.sleep_quality) : null,
            budget: anamnese.budget_food,
            has_microwave: anamnese.has_kitchen,
            // Contexto integrado: carga total real para cálculo do GET correto
            strength_plan_context: strengthPlan ? {
              sessions_per_week: Number(anamnese.days_per_week_strength),
              session_duration_min: Number(anamnese.session_duration_min),
              estimated_weekly_kcal: Number(anamnese.days_per_week_strength) * Number(anamnese.session_duration_min) / 60 * 450,
            } : null,
            running_plan_context: runningPlan ? {
              sport: anamnese.sport,
              model: runningPlan.model,
              volume_weekly_hours: runningPlan.volume_weekly_hours,
              estimated_weekly_kcal: (runningPlan.volume_weekly_hours ?? 0) * 700,
            } : null,
          },
        });
        if (e || data?.error) throw new Error(e?.message || data?.error);
        setResults(r => ({ ...r, nutricao: data?.plan }));
        setStatus(s => ({ ...s, nutricao: "done" }));
      }

      // Salva bundle de integração
      await supabase.from("prescription_bundles").insert({
        id: newBundleId, company_id: companyId, student_id: studentId,
        anamnese_id: savedAnamneseId,
        has_strength: modalities.has("musculacao"),
        has_cardio:   modalities.has("corrida"),
        has_nutrition: modalities.has("nutricao"),
        status: "active",
      });

    } catch (err: any) {
      setError(err.message);
    }
    setGenerating(false);
  }

  // ── UI helpers ────────────────────────────────────────────────────────
  const inputCls = "h-9 text-sm";
  const Section = ({ id, label, children }: { id: keyof typeof open; label: string; children: React.ReactNode }) => (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-left hover:bg-muted/50"
        onClick={() => setOpen(o => ({ ...o, [id]: !o[id] }))}
      >
        {label}
        {open[id] ? <ChevronUp className="h-4 w-4 opacity-50" /> : <ChevronDown className="h-4 w-4 opacity-50" />}
      </button>
      {open[id] && <div className="px-4 pb-4 pt-2 grid gap-3 grid-cols-2 md:grid-cols-3 border-t">{children}</div>}
    </div>
  );
  const F = ({ label, span, children }: { label: string; span?: string; children: React.ReactNode }) => (
    <div className={span}>
      <Label className="text-xs text-muted-foreground mb-1">{label}</Label>
      {children}
    </div>
  );
  const SI = (props: any) => <Input {...props} className={inputCls} />;
  const SS = ({ value, onChange, opts }: any) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
      <SelectContent>{opts.map(([v, l]: [string, string]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );

  const genStatusIcon = (s: GenStatus) => {
    if (s === "generating") return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    if (s === "done")       return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (s === "error")      return <AlertCircle className="h-4 w-4 text-destructive" />;
    return <Circle className="h-4 w-4 text-muted-foreground" />;
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-5 p-4">
      <div>
        <h1 className="text-2xl font-bold">Prescrição Integrada</h1>
        <p className="text-sm text-muted-foreground">Anamnese única · IAs em sequência · Periodização sincronizada</p>
      </div>

      {/* ── Aluno ── */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Aluno</CardTitle></CardHeader>
        <CardContent>
          <SS value={studentId} onChange={setStudentId} opts={[["", "Selecione..."], ...students.map(s => [s.id, s.name])]} />
          {anamneseId && <p className="text-xs text-green-600 mt-1">✓ Anamnese salva carregada — edite se necessário</p>}
        </CardContent>
      </Card>

      {studentId && (
        <>
          {/* ── Anamnese ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Anamnese</CardTitle>
              <p className="text-xs text-muted-foreground">Preenchida uma vez — usada por todas as IAs selecionadas</p>
            </CardHeader>
            <CardContent className="space-y-3">

              <Section id="personal" label="📋 Dados Pessoais">
                <F label="Idade"><SI type="number" value={anamnese.age} onChange={e => set("age", e.target.value)} /></F>
                <F label="% Gordura corporal"><SI type="number" step="0.1" value={anamnese.body_fat_percent} onChange={e => set("body_fat_percent", e.target.value)} placeholder="opc." /></F>
                <F label="Objetivo">
                  <SS value={anamnese.objective} onChange={(v: string) => set("objective", v)}
                    opts={[["emagrecimento","Emagrecimento"],["hipertrofia","Hipertrofia"],["performance","Performance"]]} />
                </F>
                <F label="Nível de atividade">
                  <SS value={anamnese.activity_level} onChange={(v: string) => set("activity_level", v)}
                    opts={[["sedentario","Sedentário"],["leve","Leve"],["moderado","Moderado"],["muito_ativo","Muito ativo"],["extremo","Extremo"]]} />
                </F>
                <F label="Lesões / restrições" span="col-span-2 md:col-span-3">
                  <Textarea className="text-sm min-h-[60px]" value={anamnese.injuries} onChange={e => set("injuries", e.target.value)} placeholder="Ex: dor lombar EVA 2, ombro D sensível" />
                </F>
              </Section>

              <Section id="training" label="🏋️ Treino">
                <F label="Dias musculação/semana"><SI type="number" min="0" max="6" value={anamnese.days_per_week_strength} onChange={e => set("days_per_week_strength", e.target.value)} /></F>
                <F label="Dias cardio/semana"><SI type="number" min="0" max="7" value={anamnese.days_per_week_cardio} onChange={e => set("days_per_week_cardio", e.target.value)} /></F>
                <F label="Duração sessão (min)"><SI type="number" value={anamnese.session_duration_min} onChange={e => set("session_duration_min", e.target.value)} /></F>
                <F label="Experiência (meses)"><SI type="number" value={anamnese.experience_months} onChange={e => set("experience_months", e.target.value)} /></F>
                <F label="Equipamento">
                  <SS value={anamnese.equipment} onChange={(v: string) => set("equipment", v)}
                    opts={[["academia_completa","Academia completa"],["casa_halteres","Casa (halteres)"],["funcional","Funcional"]]} />
                </F>
                <F label="Modalidade principal"><SI value={anamnese.training_modality} onChange={e => set("training_modality", e.target.value)} placeholder="Ex: corrida + musculação" /></F>
                <div className="col-span-2 md:col-span-3 flex items-center gap-2 pt-1">
                  <Checkbox checked={anamnese.is_endurance_athlete} onCheckedChange={v => set("is_endurance_athlete", !!v)} id="endurance" />
                  <label htmlFor="endurance" className="text-sm cursor-pointer">Atleta de endurance (corrida / triathlon)</label>
                </div>
              </Section>

              {/* Seção Cardio — aparece quando corrida está selecionado */}
              {(modalities.has("corrida") || open.cardio) && (
                <Section id="cardio" label="🏃 Especifico Corrida / Pedal / Natação">
                  <F label="Modalidade">
                    <SS value={anamnese.sport} onChange={(v: string) => set("sport", v)}
                      opts={[["corrida","Corrida"],["ciclismo","Ciclismo"],["natacao","Natação"],["triathlon","Triathlon"]]} />
                  </F>
                  <F label="Objetivo / prova"><SI value={anamnese.cardio_goal} onChange={e => set("cardio_goal", e.target.value)} placeholder="Ex: Meia maratona em 8 sem." /></F>
                  <F label="Volume atual (km ou h/sem)"><SI type="number" value={anamnese.current_volume_weekly} onChange={e => set("current_volume_weekly", e.target.value)} /></F>
                  <F label="FC máx (bpm)" ><SI type="number" value={anamnese.fcmax} onChange={e => set("fcmax", e.target.value)} placeholder="vazio=220-idade" /></F>
                  <F label="FC repouso (bpm)"><SI type="number" value={anamnese.fcrep} onChange={e => set("fcrep", e.target.value)} placeholder="vazio=65" /></F>
                </Section>
              )}

              <Section id="health" label="💊 Saúde e Bem-Estar">
                <F label="Estresse (0-10)"><SI type="number" min="0" max="10" value={anamnese.stress_score} onChange={e => set("stress_score", e.target.value)} /></F>
                <F label="Qualidade sono (0-10)"><SI type="number" min="0" max="10" value={anamnese.sleep_quality} onChange={e => set("sleep_quality", e.target.value)} /></F>
              </Section>

              {/* Seção Nutrição — aparece quando nutrição está selecionado */}
              {(modalities.has("nutricao") || open.nutri) && (
                <Section id="nutri" label="🍎 Nutrição">
                  <F label="Orçamento alimentar">
                    <SS value={anamnese.budget_food} onChange={(v: string) => set("budget_food", v)}
                      opts={[["economico","Econômico"],["moderado","Moderado"],["premium","Premium"]]} />
                  </F>
                  <F label="Refeições/dia">
                    <SS value={anamnese.meals_per_day} onChange={(v: string) => set("meals_per_day", v)}
                      opts={[["4","4"],["5","5"],["6","6"]]} />
                  </F>
                  <div className="flex items-center gap-2 pt-1">
                    <Checkbox checked={anamnese.has_kitchen} onCheckedChange={v => set("has_kitchen", !!v)} id="kitchen" />
                    <label htmlFor="kitchen" className="text-sm cursor-pointer">Tem cozinha / micro-ondas</label>
                  </div>
                  <F label="Restrições alimentares" span="col-span-2 md:col-span-3">
                    <Textarea className="text-sm min-h-[56px]" value={anamnese.food_restrictions} onChange={e => set("food_restrictions", e.target.value)} placeholder="Ex: intolerância à lactose, vegetariano" />
                  </F>
                </Section>
              )}

            </CardContent>
          </Card>

          {/* ── Selecionar prescrições ── */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Quais prescrições gerar?</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {([
                  ["musculacao", "🏋️", "Musculação", "Força + biomecânica BN"],
                  ["corrida",    "🏃", "Corrida / Pedal / Natação", "Zonas FC + periodização"],
                  ["nutricao",   "🍎", "Nutrição", "Macros + carb cycling"],
                ] as [Modality, string, string, string][]).map(([mod, icon, label, sub]) => (
                  <button
                    key={mod}
                    type="button"
                    onClick={() => toggleMod(mod)}
                    className={`rounded-lg border-2 p-3 text-left transition ${
                      modalities.has(mod)
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="text-xl mb-1">{icon}</div>
                    <div className="text-sm font-medium">{label}</div>
                    <div className="text-xs text-muted-foreground">{sub}</div>
                  </button>
                ))}
              </div>

              {/* Status da geração */}
              {(generating || Object.values(status).some(s => s !== "idle")) && (
                <div className="mt-4 space-y-2 border rounded-lg p-4 bg-muted/30">
                  <p className="text-xs font-medium text-muted-foreground mb-2">PROGRESSO DA GERAÇÃO</p>
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
                  {modalities.has("nutricao") && (
                    <div className="flex items-center gap-2 text-sm">
                      {genStatusIcon(status.nutricao)}
                      <span>Nutrição {status.nutricao === "generating" ? "— calculando GET total e macros…" : status.nutricao === "done" ? "— concluído" : ""}</span>
                      {(modalities.has("musculacao") || modalities.has("corrida")) && status.nutricao !== "idle" && (
                        <Badge variant="outline" className="text-xs">GET baseado na carga total</Badge>
                      )}
                    </div>
                  )}
                </div>
              )}

              {error && <p className="text-sm text-destructive mt-3">{error}</p>}

              <Button className="w-full mt-4" onClick={generate} disabled={generating || modalities.size === 0}>
                {generating
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando prescrições…</>
                  : `Gerar ${modalities.size} prescrição${modalities.size > 1 ? "ões" : ""} integrada${modalities.size > 1 ? "s" : ""}`
                }
              </Button>
            </CardContent>
          </Card>

          {/* ── Resultados ── */}
          {Object.values(results).some(Boolean) && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Prescrições Geradas</h2>
              {results.musculacao && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Dumbbell className="h-4 w-4" /> Musculação — {results.musculacao.cycle_name}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">{results.musculacao.objective} · {results.musculacao.duration_weeks} semanas · Bloco {results.musculacao.block}</p>
                  </CardHeader>
                  <CardContent>
                    {results.musculacao.biomechanical_notes && (
                      <p className="text-xs bg-muted rounded p-2 mb-3">{results.musculacao.biomechanical_notes}</p>
                    )}
                    <div className="space-y-2">
                      {results.musculacao.workouts?.map((w: any, i: number) => (
                        <div key={i} className="text-sm border-l-2 border-primary pl-3">
                          <span className="font-medium">{w.name}</span>
                          <span className="text-muted-foreground text-xs ml-2">{w.split_focus} · {w.duration_min}min</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {results.corrida && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Activity className="h-4 w-4" /> {results.corrida.plan_name}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">{results.corrida.sport} · modelo {results.corrida.model} · {results.corrida.duration_weeks} semanas</p>
                  </CardHeader>
                  <CardContent>
                    {results.corrida.fc_zones && (
                      <div className="grid grid-cols-5 gap-1 text-xs text-center mb-3">
                        {["z1","z2","z3","z4","z5"].map(z => results.corrida.fc_zones[z] && (
                          <div key={z} className="border rounded p-1">
                            <div className="font-medium uppercase">{z}</div>
                            <div className="text-muted-foreground">{results.corrida.fc_zones[z].min}–{results.corrida.fc_zones[z].max}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {results.corrida.warnings?.length > 0 && (
                      <p className="text-xs text-amber-600 bg-amber-50 rounded p-2 mb-2">{results.corrida.warnings[0]}</p>
                    )}
                  </CardContent>
                </Card>
              )}
              {results.nutricao && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Apple className="h-4 w-4" /> {results.nutricao.plan_name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {results.nutricao.energy_summary && (
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div className="border rounded p-2 text-center">
                          <div className="font-bold">{results.nutricao.energy_summary.target_kcal} kcal</div>
                          <div className="text-xs text-muted-foreground">Meta diária</div>
                        </div>
                        <div className="border rounded p-2 text-center">
                          <div className="font-bold">{results.nutricao.energy_summary.protein_total_g}g</div>
                          <div className="text-xs text-muted-foreground">Proteína</div>
                        </div>
                        <div className="border rounded p-2 text-center">
                          <div className="font-bold">{results.nutricao.energy_summary.carbs_total_g}g</div>
                          <div className="text-xs text-muted-foreground">Carboidrato</div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

