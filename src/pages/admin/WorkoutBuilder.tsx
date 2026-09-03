import { useEffect, useState, useMemo, useRef, Fragment } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Search, Save, Play, ChevronUp, ChevronDown, BarChart3, BrainCircuit, Sparkles, MessageCircle, Loader2, AlertCircle, Dumbbell, PersonStanding, Clock, ClipboardList } from "lucide-react";
import { BnitoContextButton } from "@/components/BnitoFloatingAssistant";
import { useAssistantName } from "@/hooks/useAssistantName";
import { BodyMap } from "@/components/body/BodyMap";
import { regionForLibraryGroup, normalizeGender, BODY_REGION_LABELS, type BodyRegionId } from "@/lib/bodyMap";
import { exerciseThumb, youtubeIdFromUrl, EXERCISE_CATEGORIES, normalizedExerciseCategories } from "@/lib/exerciseCover";
import { canonicalAnatomicalMuscleGroup } from "@/lib/anatomicalMuscleGroups";
import { Checkbox } from "@/components/ui/checkbox";
import { groupWorkoutExercises, WORKOUT_METHODS, GROUPING_METHODS, SINGLE_METHODS, isGroupingMethod, methodNeedsSeconds, type MethodId } from "@/lib/workoutMethods";
import { normalizeSetType, sanitizeSetTypes, sanitizeWorkoutSetTypes } from "@/lib/setTypes";
import { MethodBadge } from "@/components/workout/MethodBadge";
import { useMaster } from "@/contexts/MasterContext";
import { PreRegistrationDetails } from "@/components/admin/PreRegistrationDetails";
import { loadStudentPreRegistration } from "@/lib/preRegistrationData";
import type { PreRegistrationData } from "@/lib/preRegistration";

interface Exercise {
  id: string;
  name: string;
  muscle_group: string;
  category: string | null;
  categories: string[] | null;
  body_regions: string[] | null;
  youtube_video_id?: string | null;
  video_url: string | null;
  video_path: string | null;
  description: string | null;
}

interface WorkoutExercise {
  exercise_id: string;
  exercise_name: string;
  muscle_group: string;
  video_url: string | null;
  video_path: string | null;
  group_id?: string | null;
  method?: string | null;
  method_seconds?: number | null;
  sets: string;
  reps: string;
  rest: string;
  notes: string;
  set_types?: string[];
}

interface Workout {
  id?: string;
  title: string;
  description: string;
  exercises: WorkoutExercise[];
}

interface BnitoSuggestion {
  priority?: string;
  type?: string;
  target?: string;
  issue?: string;
  recommendation?: string;
  rationale?: string;
}

interface BnitoResult {
  summary?: string;
  score?: number;
  risk_level?: string;
  answer?: string;
  suggestions?: BnitoSuggestion[];
  context_flags?: Array<{ source?: string; flag?: string; impact?: string }>;
  volume_review?: Array<{ muscle_group?: string; weekly_sets?: number; status?: string; note?: string }>;
  questions_to_professor?: string[];
  next_intent?: {
    type?: string;
    question_to_teacher?: string | null;
  };
}

interface BnitoResponse {
  result?: BnitoResult;
  error?: string;
  details?: string;
  model_tier?: string;
  context_loaded?: {
    has_cycle?: boolean;
    has_anamnese?: boolean;
    has_assessment?: boolean;
  };
}

interface MuscleGroup {
  id: string;
  name: string;
}

interface MuscleTarget {
  exercise_id: string;
  muscle_group_id: string;
  role: string;
  volume_percentage: number;
}

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

const WORKOUT_LABELS = ["A", "B", "C", "D", "E", "F", "G"];

type CycleInfo = {
  cycle_number: number;
  student_name: string;
  student_id: string;
  company_id: string;
  gender?: "male" | "female";
};

const useMuscleGroups = () => {
  const [groups, setGroups] = useState<MuscleGroup[]>([]);
  useEffect(() => {
    const load = async () => {
      const { data } = await (supabase as any).from("muscle_groups").select("id, name").order("name");
      setGroups((data as MuscleGroup[]) || []);
    };
    load();
  }, []);
  return groups;
};

export default function WorkoutBuilder() {
  const { cycleId } = useParams<{ cycleId: string }>();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/admin/students";
  const navigate = useNavigate();
  const { user, companyId: authCompanyId, role } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const { toast } = useToast();
  const assistantName = useAssistantName();
  const muscleGroupsList = useMuscleGroups();
  const MUSCLE_GROUP_NAMES = muscleGroupsList.map(g => g.name);
  // Modo BIBLIOTECA DE TREINOS: ?tpl=<id> edita um template em vez de um ciclo de aluno.
  const tplId = searchParams.get("tpl");
  const isTemplate = !!tplId;
  const effectiveCompanyId = role === "master" ? (isViewingCompany ? viewingCompany?.id ?? null : null) : authCompanyId ?? null;
  const [templateName, setTemplateName] = useState("");

  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [activeTab, setActiveTab] = useState("0");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryExercises, setLibraryExercises] = useState<Exercise[]>([]);
  const [libSearch, setLibSearch] = useState("");
  const [libGroup, setLibGroup] = useState("all");
  const [libCats, setLibCats] = useState<string[]>([]);
  const [bodyRegions, setBodyRegions] = useState<BodyRegionId[]>([]);
  const [showBoneco, setShowBoneco] = useState(false);
  const toggleInArray = <T,>(arr: T[], v: T): T[] => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  // Capas resolvidas sob demanda (exercícios antigos sem youtube_video_id): id -> youtube id
  const [covers, setCovers] = useState<Record<string, string>>({});
  const coverRequested = useRef<Set<string>>(new Set());

  // Métodos avançados (bi-set/tri-set/circuito/drop-set…): seleção por "wIdx-exIdx".
  const [methodSel, setMethodSel] = useState<Record<string, boolean>>({});
  const selKey = (wIdx: number, exIdx: number) => `${wIdx}-${exIdx}`;
  const toggleMethodSel = (wIdx: number, exIdx: number) =>
    setMethodSel((s) => ({ ...s, [selKey(wIdx, exIdx)]: !s[selKey(wIdx, exIdx)] }));
  const clearMethodSel = (wIdx: number) =>
    setMethodSel((s) => { const n = { ...s }; Object.keys(n).forEach((k) => { if (k.startsWith(`${wIdx}-`)) delete n[k]; }); return n; });

  const applyMethod = (wIdx: number, method: MethodId) => {
    const meta = WORKOUT_METHODS[method];
    // Técnicas com sustentação (isometria, pico de contração/alongamento) pedem o tempo em segundos.
    let methodSeconds: number | null = null;
    if (methodNeedsSeconds(method)) {
      const input = window.prompt(`Quantos segundos de sustentação no ${meta.label.toLowerCase()}?`, "3");
      if (input === null) return; // cancelado
      methodSeconds = Math.max(1, Math.min(600, parseInt(input) || 3));
    }
    setWorkouts((prev) => prev.map((w, i) => {
      if (i !== wIdx) return w;
      const sel = w.exercises.map((_, k) => k).filter((k) => methodSel[selKey(wIdx, k)]);
      if (sel.length === 0) return w;
      if (meta.grouping) {
        if (sel.length < meta.minItems) return w;
        const gid = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `g${sel.join("")}${w.exercises[sel[0]].exercise_id}`;
        const picked = sel.map((k) => ({ ...w.exercises[k], group_id: gid, method, method_seconds: null }));
        const out: WorkoutExercise[] = []; let inserted = false;
        w.exercises.forEach((e, k) => {
          if (sel.includes(k)) { if (!inserted) { out.push(...picked); inserted = true; } }
          else out.push(e);
        });
        return { ...w, exercises: out };
      }
      return { ...w, exercises: w.exercises.map((e, k) => sel.includes(k) ? { ...e, method, group_id: null, method_seconds: methodSeconds } : e) };
    }));
    clearMethodSel(wIdx);
    // P7 — doutrina método×fase: técnicas intensas rendem mais na intensificação/choque, não na base.
    const INTENSITY = new Set<MethodId>(["dropset", "restpause", "cluster", "giantset"]);
    if (INTENSITY.has(method)) {
      toast({ title: `${meta.label} aplicado`, description: "Técnica intensa: rende mais nas semanas de intensificação/choque (evite na base). O aluno verá a explicação no marcador do exercício." });
    }
  };

  const ungroupBlock = (wIdx: number, idxs: number[]) =>
    setWorkouts((prev) => prev.map((w, i) => i !== wIdx ? w : ({ ...w, exercises: w.exercises.map((e, k) => idxs.includes(k) ? { ...e, group_id: null, method: null, method_seconds: null } : e) })));
  const [videoModal, setVideoModal] = useState<{ type: "path" | "url"; value: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [cycleInfo, setCycleInfo] = useState<CycleInfo | null>(null);
  const [preRegistration, setPreRegistration] = useState<PreRegistrationData | null>(null);
  const [preRegistrationLoading, setPreRegistrationLoading] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [bnitoQuestion, setBnitoQuestion] = useState("");
  const [bnitoLoading, setBnitoLoading] = useState<"review" | "ask" | null>(null);
  const [bnitoResponse, setBnitoResponse] = useState<BnitoResponse | null>(null);
  const [validationResult, setValidationResult] = useState<PrescriptionValidationResult | null>(null);
  const [notifyingStudent, setNotifyingStudent] = useState(false);

  // Muscle targets for all exercises in library (cached)
  const [muscleTargets, setMuscleTargets] = useState<MuscleTarget[]>([]);

  useEffect(() => {
    if (isTemplate) {
      if (tplId && tplId !== "new") loadTemplate(tplId);
      else setWorkouts([{ title: "Treino A", description: "", exercises: [] }]);
    } else if (cycleId) {
      loadExisting();
      loadCycleInfo();
    }
    loadLibrary();
    loadMuscleTargets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId, tplId]);

  const loadTemplate = async (id: string) => {
    const { data } = await (supabase as any).from("workout_templates").select("name, workouts").eq("id", id).maybeSingle();
    if (data) {
      setTemplateName(data.name || "");
      const ws = Array.isArray(data.workouts) ? data.workouts : [];
      setWorkouts(ws.length ? sanitizeWorkoutSetTypes(ws) : [{ title: "Treino A", description: "", exercises: [] }]);
    }
  };

  const saveTemplate = async () => {
    const name = (templateName || "").trim();
    if (!name) { toast({ title: "Dê um nome ao treino da biblioteca", variant: "destructive" }); return; }
    if (workouts.some((w) => !w.title)) { toast({ title: "Preencha o título de todos os treinos", variant: "destructive" }); return; }
    setSaving(true);
    const { error } = await (supabase as any).from("workout_templates")
      .update({ name, workouts: sanitizeWorkoutSetTypes(workouts) as any, updated_at: new Date().toISOString() }).eq("id", tplId);
    setSaving(false);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Treino salvo na biblioteca!" });
    const prefix = window.location.pathname.split("/").filter(Boolean)[0] || "admin";
    navigate(`/${prefix}/biblioteca?tab=treinos`);
  };

  const saveAsTemplate = async () => {
    const name = window.prompt("Salvar na biblioteca de treinos como:", templateName || (cycleInfo ? `Treino — ${cycleInfo.student_name}` : "Novo treino"));
    if (!name || !name.trim()) return;
    if (!effectiveCompanyId) { toast({ title: "Sem empresa em foco para salvar o template", variant: "destructive" }); return; }
    const { error } = await (supabase as any).from("workout_templates").insert({
      company_id: effectiveCompanyId, name: name.trim(), workouts: sanitizeWorkoutSetTypes(workouts) as any, created_by: user?.id || null,
    });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Salvo na biblioteca de treinos!" });
  };

  const resolveCycleInfo = async (): Promise<CycleInfo> => {
    if (!cycleId) throw new Error("Ciclo nao informado para salvar o treino.");

    const { data, error: cycleError } = await supabase
      .from("training_cycles")
      .select("cycle_number, enrollment_id, company_id, status")
      .eq("id", cycleId!)
      .maybeSingle();
    if (cycleError) throw cycleError;
    if (!data) throw new Error("Ciclo de treino nao encontrado.");
    if (data.status === "superseded") throw new Error("Este ciclo foi substituido por uma prescricao mais recente.");

    const { data: enrollment, error: enrollmentError } = await supabase
      .from("enrollments")
      .select("student_id, company_id")
      .eq("id", data.enrollment_id)
      .maybeSingle();
    if (enrollmentError) throw enrollmentError;
    if (!enrollment?.student_id) throw new Error("Matricula do ciclo nao encontrada.");

    const companyId = data.company_id || enrollment.company_id;
    if (!companyId) {
      throw new Error("Empresa do ciclo nao encontrada. Reabra a matricula antes de salvar o treino.");
    }

    const { data: student } = await supabase
      .from("students")
      .select("full_name, gender")
      .eq("id", enrollment.student_id)
      .maybeSingle();

    const info: CycleInfo = {
      cycle_number: data.cycle_number,
      student_name: student?.full_name || "Aluno",
      student_id: enrollment.student_id,
      company_id: companyId,
      gender: normalizeGender((student as any)?.gender) ?? "male",
    };
    setCycleInfo(info);
    return info;
  };

  const loadCycleInfo = async () => {
    setPreRegistrationLoading(true);
    try {
      const info = await resolveCycleInfo();
      const data = await loadStudentPreRegistration({
        studentId: info.student_id,
        companyId: info.company_id,
      });
      setPreRegistration(data);
    } catch (error) {
      console.warn("Nao foi possivel carregar contexto do ciclo", error);
      setPreRegistration(null);
    } finally {
      setPreRegistrationLoading(false);
    }
  };

  const loadExisting = async () => {
    const { data } = await supabase
      .from("workouts")
      .select("*")
      .eq("cycle_id", cycleId!)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    
    if (data && data.length > 0) {
      setWorkouts(sanitizeWorkoutSetTypes(data.map(w => ({
        id: w.id,
        title: w.title,
        description: w.description || "",
        exercises: (w.exercises as unknown as WorkoutExercise[]) || [],
      }))));
    } else {
      // Start with one empty workout
      setWorkouts([{ title: "Treino A", description: "", exercises: [] }]);
    }
  };

  const loadLibrary = async () => {
    const { data } = await supabase
      .from("exercise_library")
      .select("id, name, muscle_group, category, categories, video_url, video_path, description, thumbnail_url, youtube_video_id")
      .order("muscle_group")
      .order("name");
    setLibraryExercises(((data || []) as unknown as Exercise[]).map((exercise) => ({
      ...exercise,
      body_regions: exercise.body_regions ?? null,
      youtube_video_id: exercise.youtube_video_id ?? null,
    })));
  };

  const loadMuscleTargets = async () => {
    const { data } = await (supabase as any)
      .from("exercise_muscle_targets")
      .select("exercise_id, muscle_group_id, role, volume_percentage");
    setMuscleTargets((data as MuscleTarget[]) || []);
  };

  const getStoragePublicUrl = (path: string) => {
    const { data } = supabase.storage.from("exercises-videos").getPublicUrl(path);
    return data.publicUrl;
  };

  const addWorkout = () => {
    const nextLabel = WORKOUT_LABELS[workouts.length] || `Treino ${workouts.length + 1}`;
    setWorkouts(prev => [...prev, { title: `Treino ${nextLabel}`, description: "", exercises: [] }]);
    setActiveTab(String(workouts.length));
  };

  const removeWorkout = async (idx: number) => {
    const workout = workouts[idx];
    if (workout.id) {
      await supabase.from("workouts").delete().eq("id", workout.id);
    }
    const newWorkouts = workouts.filter((_, i) => i !== idx);
    if (newWorkouts.length === 0) {
      newWorkouts.push({ title: "Treino A", description: "", exercises: [] });
    }
    setWorkouts(newWorkouts);
    setActiveTab("0");
    toast({ title: "Treino removido" });
  };

  const updateWorkout = (idx: number, field: keyof Workout, value: any) => {
    setWorkouts(prev => prev.map((w, i) => i === idx ? { ...w, [field]: value } : w));
  };

  const addExercise = (ex: Exercise) => {
    const idx = parseInt(activeTab);
    setWorkouts(prev => prev.map((w, i) => {
      if (i !== idx) return w;
      return {
        ...w,
        exercises: [...w.exercises, {
          exercise_id: ex.id,
          exercise_name: ex.name,
          muscle_group: ex.muscle_group,
          video_url: ex.video_url,
          video_path: ex.video_path,
          sets: "3",
          reps: "12",
          rest: "60s",
          notes: "",
        }],
      };
    }));
    // Mantém a biblioteca aberta para adicionar vários — só fecha em "Ver treino completo".
    toast({ title: "Adicionado ao treino", description: ex.name });
  };

  const removeExercise = (workoutIdx: number, exIdx: number) => {
    setWorkouts(prev => prev.map((w, i) => {
      if (i !== workoutIdx) return w;
      return { ...w, exercises: w.exercises.filter((_, j) => j !== exIdx) };
    }));
  };

  const updateExercise = (workoutIdx: number, exIdx: number, field: keyof WorkoutExercise, value: any) => {
    setWorkouts(prev => prev.map((w, i) => {
      if (i !== workoutIdx) return w;
      return {
        ...w,
        exercises: w.exercises.map((ex, j) => j === exIdx ? { ...ex, [field]: value } : ex),
      };
    }));
  };

  const moveExercise = (workoutIdx: number, exIdx: number, direction: "up" | "down") => {
    const newIdx = direction === "up" ? exIdx - 1 : exIdx + 1;
    setWorkouts(prev => prev.map((w, i) => {
      if (i !== workoutIdx) return w;
      if (newIdx < 0 || newIdx >= w.exercises.length) return w;
      const arr = [...w.exercises];
      [arr[exIdx], arr[newIdx]] = [arr[newIdx], arr[exIdx]];
      return { ...w, exercises: arr };
    }));
  };

  const handleSaveAll = async () => {
    if (isTemplate) { await saveTemplate(); return; }
    const hasEmpty = workouts.some(w => !w.title);
    if (hasEmpty) {
      toast({ title: "Preencha o título de todos os treinos", variant: "destructive" });
      return;
    }
    setSaving(true);
    setValidationResult(null);

    let saveContext: CycleInfo;
    try {
      saveContext = await resolveCycleInfo();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel carregar o contexto do ciclo.";
      toast({ title: "Erro ao preparar salvamento", description: message, variant: "destructive" });
      setSaving(false);
      return;
    }

    const validation = await validateBeforeSave(saveContext);
    if (!validation) {
      setSaving(false);
      return;
    }
    const blockerCount = (validation.blockers || []).length;
    if (blockerCount > 0 || validation.status === "blocked") {
      setSaving(false);
      toast({
        title: `${assistantName} bloqueou o salvamento`,
        description: "Resolva os pontos críticos do validador antes de salvar.",
        variant: "destructive",
      });
      return;
    }

    for (const [workoutIndex, workout] of workouts.entries()) {
      const persistedWorkout = sanitizeWorkoutSetTypes([workout])[0];
      const payload = {
        name: workout.title || `Treino ${WORKOUT_LABELS[workoutIndex] || workoutIndex + 1}`,
        title: workout.title,
        description: workout.description || null,
        cycle_id: cycleId!,
        company_id: saveContext.company_id,
        day_of_week: workoutIndex + 1,
        sort_order: workoutIndex + 1,
        exercises: persistedWorkout.exercises as any,
        created_by: user!.id,
        updated_at: new Date().toISOString(),
      };

      if (workout.id) {
        const { error } = await supabase.from("workouts").update(payload).eq("id", workout.id);
        if (error) {
          toast({ title: "Erro", description: error.message, variant: "destructive" });
          setSaving(false);
          return;
        }
      } else {
        const { data, error } = await supabase.from("workouts").insert(payload).select("id").single();
        if (error) {
          toast({ title: "Erro", description: error.message, variant: "destructive" });
          setSaving(false);
          return;
        }
        workout.id = data.id;
      }
    }

    setSaving(false);
    toast({ title: "Todos os treinos salvos!" });
    navigate(returnTo);
  };

  const validateBeforeSave = async (context: CycleInfo | null = cycleInfo): Promise<PrescriptionValidationResult | null> => {
    try {
      let objective = "manual";
      let fitnessLevel = "intermediario";
      let anamneseContext: any = null;
      let assessmentContext: any = null;

      if (context?.student_id) {
        const [{ data: anamnese }, { data: assessment }] = await Promise.all([
          supabase
            .from("student_anamneses")
            .select("*")
            .eq("student_id", context.student_id)
            .maybeSingle(),
          supabase
            .from("functional_assessments")
            .select("nivel, assessment_json, report_text, created_at")
            .eq("student_id", context.student_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        anamneseContext = anamnese ?? null;
        assessmentContext = assessment?.assessment_json
          ? { assessment_json: assessment.assessment_json, report_text: assessment.report_text, nivel: assessment.nivel }
          : null;
        objective = (anamnese as any)?.objective || (anamnese as any)?.cardio_goal || "manual";
        const months = Number((anamnese as any)?.experience_months ?? 0);
        fitnessLevel = assessment?.nivel || (months > 0 && months < 6 ? "iniciante" : months >= 18 ? "avancado" : "intermediario");
      }

      const plan = {
        cycle_name: context ? `Ciclo ${context.cycle_number}` : "Treino manual",
        duration_weeks: 6,
        objective,
        workouts: workouts.map((workout, workoutIndex) => ({
          name: workout.title,
          description: workout.description,
          day_of_week: workoutIndex + 1,
          exercises: workout.exercises.map((exercise, exerciseIndex) => ({
            phase: "forca_global",
            exercise_id: exercise.exercise_id,
            exercise_name: exercise.exercise_name,
            muscle_group: exercise.muscle_group,
            sets: Number.parseInt(exercise.sets, 10) || 0,
            reps: exercise.reps,
            rest_seconds: Number.parseInt(exercise.rest, 10) || 0,
            exercise_order: exerciseIndex + 1,
            notes: exercise.notes,
            set_types: sanitizeSetTypes(exercise.set_types) || [],
          })),
        })),
      };
      const { data, error } = await supabase.functions.invoke<{ result?: PrescriptionValidationResult; error?: string }>("ai-validate-prescription", {
        body: {
          company_id: context?.company_id,
          student_id: context?.student_id,
          objective,
          fitness_level: fitnessLevel,
          anamnese_context: anamneseContext,
          assessment_context: assessmentContext,
          block_number: 1,
          plan,
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      const result = data?.result || { status: "ok", warnings: [], blockers: [] };
      setValidationResult(result);
      const warningsCount = (result.warnings || []).length;
      if (warningsCount > 0) {
        toast({
          title: "Validador encontrou avisos",
          description: `${warningsCount} ponto(s) para revisar antes/depois de salvar.`,
        });
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro inesperado";
      toast({ title: "Falha no validador", description: message, variant: "destructive" });
      return null;
    }
  };

  // Volume calculation
  const weeklyVolume = useMemo(() => {
    const volume: Record<string, number> = {};
    
    workouts.forEach(workout => {
      workout.exercises.forEach(ex => {
        const sets = parseInt(ex.sets) || 0;
        const targets = muscleTargets.filter(t => t.exercise_id === ex.exercise_id);
        
        targets.forEach(target => {
          const mg = muscleGroupsList.find(g => g.id === target.muscle_group_id);
          const anatomicalGroup = canonicalAnatomicalMuscleGroup(mg?.name);
          if (anatomicalGroup) {
            const weighted = sets * (target.volume_percentage / 100);
            volume[anatomicalGroup] = (volume[anatomicalGroup] || 0) + weighted;
          }
        });
      });
    });

    return volume;
  }, [workouts, muscleTargets, muscleGroupsList]);

  const maxVolume = Math.max(...Object.values(weeklyVolume), 1);

  const getVolumeColor = (sets: number) => {
    if (sets <= 10) return "bg-emerald-500";
    if (sets <= 16) return "bg-yellow-500";
    return "bg-red-500";
  };

  const filteredLib = useMemo(() => libraryExercises.filter((ex) => {
    const matchSearch = ex.name.toLowerCase().includes(libSearch.toLowerCase());
    const exCats = normalizedExerciseCategories(ex);
    const matchCategory = libCats.length === 0 || exCats.some((c) => libCats.includes(c));
    const matchGroup = libGroup === "all" || ex.muscle_group === libGroup;
    const exRegions = ex.body_regions || [];
    const legacyRegion = regionForLibraryGroup(ex.muscle_group);
    const matchRegion = bodyRegions.length === 0
      || exRegions.some((r) => bodyRegions.includes(r as BodyRegionId))
      || (legacyRegion ? bodyRegions.includes(legacyRegion) : false);
    return matchSearch && matchCategory && matchGroup && matchRegion;
  }), [libraryExercises, libSearch, libCats, libGroup, bodyRegions]);

  // Capa do exercício: thumbnail do YouTube (direto, ou resolvida sob demanda).
  const coverFor = (ex: Exercise): string | null => {
    const direct = exerciseThumb(ex);
    if (direct) return direct;
    const resolved = covers[ex.id];
    return resolved ? `https://i.ytimg.com/vi/${resolved}/hqdefault.jpg` : null;
  };

  // Resolve capas dos exercícios visíveis que ainda não têm vídeo (lote pequeno, 1x cada).
  useEffect(() => {
    if (!libraryOpen) return;
    const need = filteredLib
      .filter((ex) => !exerciseThumb(ex) && !covers[ex.id] && !coverRequested.current.has(ex.id) && !ex.video_path)
      .slice(0, 24);
    need.forEach((ex) => {
      coverRequested.current.add(ex.id);
      supabase.functions
        .invoke("youtube-exercise-video", { body: { exercise_id: ex.id, name: ex.name } })
        .then(({ data }) => {
          const vid = (data as { video_id?: string } | null)?.video_id;
          if (vid) setCovers((c) => ({ ...c, [ex.id]: vid }));
        })
        .catch(() => {});
    });
  }, [filteredLib, libraryOpen, covers]);

  const openPickerVideo = (ex: Exercise) => {
    const id = ex.youtube_video_id || youtubeIdFromUrl(ex.video_url) || covers[ex.id];
    if (ex.video_path) setVideoModal({ type: "path", value: getStoragePublicUrl(ex.video_path) });
    else if (id) setVideoModal({ type: "url", value: `https://www.youtube.com/watch?v=${id}` });
    else if (ex.video_url) setVideoModal({ type: "url", value: ex.video_url });
  };

  const getEmbedUrl = (url: string) => {
    if (url.includes("youtube.com/watch")) {
      const vid = new URL(url).searchParams.get("v");
      return vid ? `https://www.youtube.com/embed/${vid}` : url;
    }
    if (url.includes("youtu.be/")) {
      const vid = url.split("youtu.be/")[1]?.split("?")[0];
      return vid ? `https://www.youtube.com/embed/${vid}` : url;
    }
    if (url.includes("vimeo.com/")) {
      const vid = url.split("vimeo.com/")[1]?.split("?")[0];
      return vid ? `https://player.vimeo.com/video/${vid}` : url;
    }
    return url;
  };

  const openVideoForExercise = (ex: WorkoutExercise) => {
    if (ex.video_path) {
      setVideoModal({ type: "path", value: getStoragePublicUrl(ex.video_path) });
    } else if (ex.video_url) {
      setVideoModal({ type: "url", value: ex.video_url });
    }
  };

  const hasVideo = (ex: WorkoutExercise) => !!(ex.video_path || ex.video_url);

  const currentWorkout = workouts[parseInt(activeTab)] || workouts[0];
  const currentIdx = parseInt(activeTab);

  const callBnito = async (action: "review" | "ask") => {
    if (action === "ask" && !bnitoQuestion.trim()) {
      toast({ title: `Digite uma pergunta para o ${assistantName}`, variant: "destructive" });
      return;
    }
    setBnitoLoading(action);
    try {
      const { data, error } = await supabase.functions.invoke<BnitoResponse>("ai-bnito-coach", {
        body: {
          action,
          cycle_id: cycleId,
          workouts,
          volume_summary: weeklyVolume,
          question: action === "ask" ? bnitoQuestion : "Audite tecnicamente este treino manual antes de salvar.",
          page_context: {
            active_workout: currentWorkout?.title,
            active_workout_index: currentIdx,
            cycle_info: cycleInfo,
          },
        },
      });

      if (error) throw new Error(error.message);
      if (!data) throw new Error(`O ${assistantName} não retornou dados.`);
      if (data.error) throw new Error(data.details || data.error);
      setBnitoResponse(data);
      toast({
        title: action === "review" ? `${assistantName} auditou o treino` : `${assistantName} respondeu`,
        description: data.context_loaded?.has_anamnese ? "Contexto da anamnese carregado" : "Resposta gerada com o contexto disponível",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro inesperado";
      toast({ title: `Falha no ${assistantName}`, description: message, variant: "destructive" });
    } finally {
      setBnitoLoading(null);
    }
  };

  const bnitoResult = bnitoResponse?.result;
  const anatomicalBnitoVolumeReview = Array.isArray(bnitoResult?.volume_review)
    ? bnitoResult.volume_review.flatMap((item) => {
      const muscleGroup = canonicalAnatomicalMuscleGroup(item.muscle_group);
      return muscleGroup ? [{ ...item, muscle_group: muscleGroup }] : [];
    })
    : [];
  const shouldOfferStudentNotice = bnitoResult?.next_intent?.type === "notify_student_prescription_ready";
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

  const notifyStudent = async (message?: string) => {
    if (!cycleInfo?.student_id || !cycleInfo.company_id) {
      toast({ title: "Aluno sem contexto de WhatsApp", variant: "destructive" });
      return;
    }
    setNotifyingStudent(true);
    try {
      const { data: chat, error: chatError } = await (supabase as any)
        .from("whatsapp_chats")
        .select("id, remote_jid")
        .eq("company_id", cycleInfo.company_id)
        .eq("student_id", cycleInfo.student_id)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (chatError) throw new Error(chatError.message);
      if (!chat?.remote_jid) throw new Error("Aluno sem chat do WhatsApp vinculado.");
      const content = message || `Oi, ${cycleInfo.student_name}! Sua prescrição foi atualizada no app. Dá uma olhada e me chama se quiser tirar dúvida de execução.`;
      const { data, error } = await supabase.functions.invoke("whatsapp-manager", {
        body: {
          action: "send-message",
          companyId: cycleInfo.company_id,
          chatId: chat.id,
          remoteJid: chat.remote_jid,
          content,
        },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.details || (data as any)?.error || error?.message);
      toast({ title: "Aluno avisado", description: "Mensagem enviada pelo WhatsApp." });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erro inesperado";
      toast({ title: "Falha ao avisar aluno", description: errorMessage, variant: "destructive" });
    } finally {
      setNotifyingStudent(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(returnTo)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl text-primary">{isTemplate ? "TREINO DA BIBLIOTECA" : "PRESCRIÇÃO DE TREINO"}</h1>
                <BnitoContextButton
                  label="builder manual de treino"
                  context={`Montagem manual de treino. ${cycleInfo ? `Aluno: ${cycleInfo.student_name}; ciclo ${cycleInfo.cycle_number}.` : "Ciclo ainda carregando."}`}
                  question="Me ajuda a revisar a estrutura deste treino manual antes de salvar?"
                />
              </div>
              {isTemplate ? (
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Nome do treino (ex.: Full Body Iniciante A/B)"
                  className="mt-1 h-9 max-w-md bg-secondary border-border"
                />
              ) : cycleInfo && (
                <p className="text-muted-foreground font-sans">
                  {cycleInfo.student_name} — Ciclo {cycleInfo.cycle_number}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isTemplate && cycleInfo && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <ClipboardList className="mr-2 h-4 w-4" />Pré-cadastro
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  sideOffset={8}
                  className="w-[min(92vw,34rem)] overflow-hidden rounded-3xl border-border bg-card p-0 shadow-xl"
                >
                  <div className="border-b border-border px-4 py-3">
                    <p className="font-display text-lg text-primary">Pré-cadastro de {cycleInfo.student_name}</p>
                    <p className="text-xs text-muted-foreground">Objetivos, rotina, dores e restrições usadas na prescrição.</p>
                  </div>
                  <ScrollArea className="max-h-[70vh]">
                    <PreRegistrationDetails
                      data={preRegistration}
                      loading={preRegistrationLoading}
                      compact
                      className="p-4"
                    />
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            )}
            <Button variant="outline" size="sm" onClick={() => callBnito("review")} disabled={!!bnitoLoading}>
              {bnitoLoading === "review" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BrainCircuit className="h-4 w-4 mr-2" />}
              {assistantName}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowVolume(!showVolume)}>
              <BarChart3 className="h-4 w-4 mr-2" />Volume
            </Button>
            <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
              {!isTemplate && (
                <Button variant="outline" size="sm" onClick={saveAsTemplate} disabled={workouts.length === 0}>
                  <Save className="h-4 w-4 mr-2" />Salvar na biblioteca
                </Button>
              )}
              <Button onClick={handleSaveAll} disabled={saving} size="sm">
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Salvando..." : isTemplate ? "Salvar na Biblioteca" : "Salvar Tudo"}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Main content */}
          <div className="flex-1 space-y-4">
            {/* Workout Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="flex items-center gap-2">
                <TabsList className="flex-1 flex-wrap h-auto">
                  {workouts.map((w, idx) => (
                    <TabsTrigger key={idx} value={String(idx)} className="text-sm">
                      {w.title || `Treino ${WORKOUT_LABELS[idx] || idx + 1}`}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {workouts.length < 7 && (
                  <Button variant="outline" size="sm" onClick={addWorkout}>
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {workouts.map((workout, wIdx) => (
                <TabsContent key={wIdx} value={String(wIdx)} className="space-y-4">
                  {/* Workout details */}
                  <Card className="bg-card border-border">
                    <CardContent className="p-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="font-sans">Título do Treino *</Label>
                          <Input
                            value={workout.title}
                            onChange={(e) => updateWorkout(wIdx, "title", e.target.value)}
                            placeholder="Ex: Treino A - Superior"
                            className="bg-secondary border-border"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="font-sans">Descrição</Label>
                          <Input
                            value={workout.description}
                            onChange={(e) => updateWorkout(wIdx, "description", e.target.value)}
                            placeholder="Observações gerais..."
                            className="bg-secondary border-border"
                          />
                        </div>
                      </div>
                      {workouts.length > 1 && (
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeWorkout(wIdx)}>
                          <Trash2 className="h-4 w-4 mr-1" />Remover este treino
                        </Button>
                      )}
                    </CardContent>
                  </Card>

                  {/* Exercises list */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl text-primary">EXERCÍCIOS ({workout.exercises.length})</h2>
                      <BnitoContextButton
                        label={`exercicios do ${workout.title || `treino ${wIdx + 1}`}`}
                        context={`Treino atual: ${workout.title || `Treino ${wIdx + 1}`}. Exercicios: ${workout.exercises.map((ex) => ex.exercise_name).join(", ") || "nenhum"}.`}
                        question="A ordem, selecao e volume destes exercicios fazem sentido para o objetivo do aluno?"
                      />
                    </div>
                    <Button onClick={() => setLibraryOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />Adicionar
                    </Button>
                  </div>

                  {workout.exercises.length === 0 && (
                    <Card className="bg-card border-border border-dashed">
                      <CardContent className="p-8 text-center">
                        <p className="text-muted-foreground font-sans">Nenhum exercício adicionado</p>
                        <Button variant="outline" className="mt-4" onClick={() => setLibraryOpen(true)}>
                          <Plus className="h-4 w-4 mr-2" />Buscar na Biblioteca
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {/* Toolbar de métodos avançados (aparece com seleção) */}
                  {(() => {
                    const selN = workout.exercises.filter((_, k) => methodSel[selKey(wIdx, k)]).length;
                    if (selN === 0) return null;
                    return (
                      <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 p-2">
                        <span className="text-xs font-medium text-primary">{selN} selecionado(s) — agrupar:</span>
                        {GROUPING_METHODS.map((m) => (
                          <Button key={m} size="sm" variant="outline" className="h-7 text-xs" disabled={selN < WORKOUT_METHODS[m].minItems} onClick={() => applyMethod(wIdx, m)}>
                            {WORKOUT_METHODS[m].label}
                          </Button>
                        ))}
                        <span className="mx-1 text-xs text-muted-foreground">técnica:</span>
                        {SINGLE_METHODS.map((m) => (
                          <Button key={m} size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyMethod(wIdx, m)}>
                            {WORKOUT_METHODS[m].label}
                          </Button>
                        ))}
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => clearMethodSel(wIdx)}>Cancelar</Button>
                      </div>
                    );
                  })()}

                  <div className="space-y-3">
                    {groupWorkoutExercises(workout.exercises).map((grp) => {
                      const cards = grp.items.map(({ ex, idx: exIdx }) => (
                      <Card key={exIdx} className="bg-card border-border">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex flex-col items-center gap-0.5 pt-1">
                              <Checkbox className="mb-1" checked={!!methodSel[selKey(wIdx, exIdx)]} onCheckedChange={() => toggleMethodSel(wIdx, exIdx)} />
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveExercise(wIdx, exIdx, "up")} disabled={exIdx === 0}>
                                <ChevronUp className="h-3.5 w-3.5" />
                              </Button>
                              <span className="text-xs text-muted-foreground text-center font-sans">{exIdx + 1}</span>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveExercise(wIdx, exIdx, "down")} disabled={exIdx === workout.exercises.length - 1}>
                                <ChevronDown className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            {/* Capa do exercício (vídeo) */}
                            {(() => {
                              const lib = libraryExercises.find((l) => l.id === ex.exercise_id);
                              const cover = lib ? coverFor(lib) : null;
                              return (
                                <button
                                  type="button"
                                  onClick={() => (hasVideo(ex) ? openVideoForExercise(ex) : lib ? openPickerVideo(lib) : undefined)}
                                  className="relative mt-1 h-12 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-secondary"
                                  aria-label="Ver vídeo"
                                >
                                  {cover ? (
                                    <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                                  ) : (
                                    <span className="flex h-full w-full items-center justify-center"><Dumbbell className="h-4 w-4 text-muted-foreground/50" /></span>
                                  )}
                                  <span className="absolute inset-0 flex items-center justify-center bg-black/15"><Play className="h-3.5 w-3.5 text-white" /></span>
                                </button>
                              );
                            })()}
                            <div className="flex-1 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <p className="font-sans font-medium text-foreground">{ex.exercise_name}</p>
                                  <Badge variant="outline" className="capitalize text-xs">{ex.muscle_group}</Badge>
                                  {ex.method && !isGroupingMethod(ex.method) && (
                                    <MethodBadge method={ex.method} seconds={(ex as any).method_seconds} tone="amber" />
                                  )}
                                  {hasVideo(ex) && (
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openVideoForExercise(ex)}>
                                      <Play className="h-3.5 w-3.5 text-primary" />
                                    </Button>
                                  )}
                                </div>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeExercise(wIdx, exIdx)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground font-sans">Séries</Label>
                                  <Input
                                    value={ex.sets}
                                    onChange={(e) => updateExercise(wIdx, exIdx, "sets", e.target.value)}
                                    className="bg-secondary border-border h-8 text-sm"
                                    placeholder="3"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground font-sans">Repetições</Label>
                                  <Input
                                    value={ex.reps}
                                    onChange={(e) => updateExercise(wIdx, exIdx, "reps", e.target.value)}
                                    className="bg-secondary border-border h-8 text-sm"
                                    placeholder="12"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground font-sans">Descanso</Label>
                                  <Input
                                    value={ex.rest}
                                    onChange={(e) => updateExercise(wIdx, exIdx, "rest", e.target.value)}
                                    className="bg-secondary border-border h-8 text-sm"
                                    placeholder="60s"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground font-sans">Observação</Label>
                                  <Textarea
                                    value={ex.notes}
                                    onChange={(e) => updateExercise(wIdx, exIdx, "notes", e.target.value)}
                                    className="bg-secondary border-border text-sm min-h-[60px]"
                                    rows={2}
                                    placeholder="Cadência 3-1-2"
                                  />
                                </div>
                              </div>

                              {/* Set Types Config */}
                              {(() => {
                                const numSets = parseInt(ex.sets) || 3;
                                const currentTypes: string[] = (ex as any).set_types || [];
                                return (
                                  <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground font-sans">Tipos de Série</Label>
                                    <div className="flex flex-wrap gap-1.5">
                                      {Array.from({ length: numSets }, (_, s) => {
                                        const type = normalizeSetType(currentTypes[s]);
                                        const config: Record<string, { label: string; color: string }> = {
                                          warmup: { label: 'W', color: 'bg-yellow-400/20 text-yellow-400 border-yellow-400/40' },
                                          normal: { label: `${s + 1}`, color: 'bg-muted text-foreground border-border' },
                                          failure: { label: 'F', color: 'bg-red-400/20 text-red-400 border-red-400/40' },
                                        };
                                        const c = config[type] || config.normal;
                                        return (
                                          <Select
                                            key={s}
                                            value={type}
                                            onValueChange={(val) => {
                                              const newTypes = [...currentTypes];
                                              while (newTypes.length < numSets) newTypes.push('normal');
                                              newTypes[s] = val;
                                              updateExercise(wIdx, exIdx, "set_types" as any, newTypes as any);
                                            }}
                                          >
                                            <SelectTrigger className={`h-7 w-10 text-xs font-bold border ${c.color} px-0 justify-center`}>
                                              <span>{c.label}</span>
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="warmup">W — Aquecimento</SelectItem>
                                              <SelectItem value="normal">Normal</SelectItem>
                                              <SelectItem value="failure">F — Falha</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      ));
                      if (grp.grouping) {
                        const meta = WORKOUT_METHODS[grp.method as MethodId];
                        const rounds = parseInt(String(grp.items[0]?.ex.sets ?? "")) || null;
                        const blockRest = grp.items[grp.items.length - 1]?.ex.rest;
                        const isCircuit = grp.method === "circuito";
                        return (
                          <div key={grp.key} className="space-y-2 rounded-2xl border-2 border-primary/50 bg-primary/5 p-2 shadow-sm">
                            <div className="flex flex-wrap items-center gap-2 px-1">
                              <MethodBadge method={grp.method} tone="primary" />
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                {isCircuit && rounds ? `×${rounds} voltas` : `${grp.items.length} exercícios em sequência`}
                              </span>
                              <span className="text-xs text-muted-foreground">{meta?.hint}</span>
                              <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={() => ungroupBlock(wIdx, grp.items.map((it) => it.idx))}>Desagrupar</Button>
                            </div>
                            {cards}
                            {blockRest && (
                              <div className="flex items-center gap-1.5 px-1 pb-0.5 text-[11px] text-muted-foreground">
                                <Clock className="h-3 w-3" /> Descanso ao fim do bloco:
                                <span className="font-medium text-foreground">{blockRest}</span>
                              </div>
                            )}
                          </div>
                        );
                      }
                      return <Fragment key={grp.key}>{cards}</Fragment>;
                    })}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>

          {/* Assistive sidebar */}
          <div className="lg:w-80 shrink-0 space-y-4">
            {showVolume && (
              <Card className="bg-card border-border sticky top-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-primary text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    VOLUME SEMANAL
                    <BnitoContextButton
                      label="volume semanal do treino"
                      context={`Resumo de volume semanal por grupos musculares: ${JSON.stringify(weeklyVolume)}`}
                      question="Esse volume semanal esta alto, baixo ou adequado para o contexto do aluno?"
                      className="ml-auto"
                    />
                  </CardTitle>
                  <p className="text-xs text-muted-foreground font-sans">
                    Séries totais por grupo muscular (todos os treinos)
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.keys(weeklyVolume).length === 0 ? (
                    <p className="text-xs text-muted-foreground font-sans text-center py-4">
                      Configure os músculos dos exercícios na Biblioteca para ver o volume
                    </p>
                  ) : (
                    Object.entries(weeklyVolume)
                      .sort((a, b) => b[1] - a[1])
                      .map(([muscle, sets]) => (
                        <div key={muscle} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-sans text-foreground">{muscle}</span>
                            <span className="text-xs font-sans font-medium text-foreground">
                              {sets % 1 === 0 ? sets : sets.toFixed(1)}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-secondary overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${getVolumeColor(sets)}`}
                              style={{ width: `${Math.min((sets / 20) * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      ))
                  )}
                  {Object.keys(weeklyVolume).length > 0 && (
                    <div className="pt-2 border-t border-border">
                      <div className="flex items-center gap-2 text-xs font-sans text-muted-foreground">
                        <div className="h-2 w-2 rounded-full bg-emerald-500" /> ≤10
                        <div className="h-2 w-2 rounded-full bg-yellow-500 ml-2" /> 11-16
                        <div className="h-2 w-2 rounded-full bg-red-500 ml-2" /> &gt;16
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-primary text-sm flex items-center gap-2">
                  <BrainCircuit className="h-4 w-4" />
                  {assistantName}
                </CardTitle>
                <p className="text-xs text-muted-foreground font-sans">
                  Copiloto técnico para revisar o treino manual antes de salvar.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  variant="default"
                  size="sm"
                  className="w-full"
                  onClick={() => callBnito("review")}
                  disabled={!!bnitoLoading}
                >
                  {bnitoLoading === "review" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Auditar treino
                </Button>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground font-sans">Pergunta técnica</Label>
                  <Textarea
                    value={bnitoQuestion}
                    onChange={(event) => setBnitoQuestion(event.target.value)}
                    placeholder="Ex: apareceu dor no joelho na anamnese, como ajusto esse treino?"
                    className="bg-secondary border-border text-sm min-h-[96px]"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => callBnito("ask")}
                    disabled={!!bnitoLoading || !bnitoQuestion.trim()}
                  >
                    {bnitoLoading === "ask" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MessageCircle className="h-4 w-4 mr-2" />}
                    Perguntar ao {assistantName}
                  </Button>
                </div>

                {!bnitoResult ? (
                  <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground font-sans">
                    O {assistantName} considera o rascunho atual, volume semanal, anamnese e avaliação funcional disponíveis.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-primary">Resumo</span>
                        {bnitoResult.risk_level && (
                          <Badge variant="outline" className="text-[10px] capitalize">
                            risco {bnitoResult.risk_level}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-primary font-sans">
                        {bnitoResult.summary || bnitoResult.answer || "Análise gerada."}
                      </p>
                    </div>

                    {bnitoResult.answer && bnitoResult.answer !== bnitoResult.summary && (
                      <p className="rounded-md bg-secondary p-3 text-xs leading-relaxed font-sans text-foreground">
                        {bnitoResult.answer}
                      </p>
                    )}

                    {Array.isArray(bnitoResult.suggestions) && bnitoResult.suggestions.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-foreground font-sans">Sugestões</p>
                        {bnitoResult.suggestions.slice(0, 4).map((item, idx) => (
                          <div key={`${item.target || "sugestao"}-${idx}`} className="rounded-md border border-border p-2 text-xs font-sans">
                            <div className="flex items-center gap-2">
                              <Badge variant={item.priority === "alta" ? "destructive" : "secondary"} className="text-[10px]">
                                {item.priority || "media"}
                              </Badge>
                              <span className="font-medium text-foreground">{item.target || item.type || "Ajuste"}</span>
                            </div>
                            {item.issue && <p className="mt-1 text-muted-foreground">{item.issue}</p>}
                            {item.recommendation && <p className="mt-1 text-foreground">{item.recommendation}</p>}
                          </div>
                        ))}
                      </div>
                    )}

                    {anatomicalBnitoVolumeReview.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-foreground font-sans">Volume</p>
                        {anatomicalBnitoVolumeReview.slice(0, 5).map((item, idx) => (
                          <div key={`${item.muscle_group || "volume"}-${idx}`} className="flex items-center justify-between gap-2 text-xs font-sans">
                            <span className="text-muted-foreground">{item.muscle_group || "Grupo"}</span>
                            <span className="text-foreground">
                              {item.weekly_sets ?? "?"} · {item.status || "incerto"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {Array.isArray(bnitoResult.questions_to_professor) && bnitoResult.questions_to_professor.length > 0 && (
                      <div className="rounded-md bg-secondary p-3 text-xs font-sans">
                        <p className="font-semibold text-foreground">Faltou saber</p>
                        <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                          {bnitoResult.questions_to_professor.slice(0, 3).map((question, idx) => (
                            <li key={`${question}-${idx}`}>{question}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {shouldOfferStudentNotice && (
                      <div className="rounded-md border border-navy/20 bg-navy/5 p-3 text-xs font-sans">
                        <p className="font-semibold text-foreground">
                          {bnitoResult.next_intent?.question_to_teacher || "Quer que eu avise o aluno que a prescrição foi feita?"}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          className="mt-2 w-full"
                          onClick={() => notifyStudent()}
                          disabled={notifyingStudent}
                        >
                          {notifyingStudent ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MessageCircle className="h-4 w-4 mr-2" />}
                          Avisar aluno
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {allValidationWarnings.length > 0 && (
              <Card className="bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-primary text-sm flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Validador pré-salvar
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.entries(validationWarningsBySource).map(([source, warnings]) => (
                    <div key={source} className="rounded-md border border-border p-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground font-sans">{source}</p>
                      <div className="mt-2 space-y-2">
                        {warnings.map((warning, idx) => (
                          <div key={`${warning.code || warning.message}-${idx}`} className="text-xs font-sans">
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
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Library picker dialog */}
      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DialogContent className="bg-card border-border max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle className="text-primary">Biblioteca de exercícios</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 border-b border-border px-5 pb-3 pt-3">
            {/* Chips de categoria */}
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              <button
                type="button"
                onClick={() => setLibCats([])}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${libCats.length === 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
              >
                Todos
              </button>
              {EXERCISE_CATEGORIES.map((c) => {
                const active = libCats.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setLibCats((cur) => toggleInArray(cur, c.id))}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>

            {/* Busca + filtro por músculo (boneco) */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={libSearch} onChange={(e) => setLibSearch(e.target.value)} placeholder="Buscar exercício..." className="pl-10 bg-secondary border-border" />
              </div>
              <Button
                type="button"
                variant={bodyRegions.length || showBoneco ? "default" : "outline"}
                size="sm"
                onClick={() => setShowBoneco((v) => !v)}
                className="shrink-0"
              >
                <PersonStanding className="mr-1 h-4 w-4" />
                {bodyRegions.length === 0
                  ? "Músculo"
                  : bodyRegions.length === 1
                    ? BODY_REGION_LABELS[bodyRegions[0]]
                    : `${bodyRegions.length} músculos`}
              </Button>
              {bodyRegions.length > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setBodyRegions([])} className="shrink-0 text-xs">
                  Limpar
                </Button>
              )}
            </div>

            {showBoneco && (
              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                <BodyMap
                  gender={cycleInfo?.gender ?? "male"}
                  onRegionClick={(id) => setBodyRegions((cur) => toggleInArray(cur, id))}
                  activeRegions={bodyRegions}
                  getRegionFill={(id) => (bodyRegions.includes(id) ? "hsl(var(--primary))" : undefined)}
                  svgClassName="h-[300px] w-auto"
                  footer={<span className="text-[11px] text-muted-foreground">Clique em um ou mais músculos para filtrar (pode selecionar vários).</span>}
                />
              </div>
            )}

            <p className="font-sans text-xs text-muted-foreground">{filteredLib.length} exercícios</p>
          </div>

          {/* Grid de cards com "capa" em vídeo */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {filteredLib.length === 0 ? (
              <p className="py-10 text-center font-sans text-muted-foreground">Nenhum exercício encontrado</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {filteredLib.map((ex) => {
                  const currentExercises = currentWorkout?.exercises || [];
                  const alreadyAdded = currentExercises.some((w) => w.exercise_id === ex.id);
                  const cover = coverFor(ex);
                  return (
                    <button
                      key={ex.id}
                      type="button"
                      disabled={alreadyAdded}
                      onClick={() => addExercise(ex)}
                      title={ex.name}
                      className={`group relative aspect-[4/3] overflow-hidden rounded-xl border text-left transition ${alreadyAdded ? "border-primary/60 opacity-80" : "border-border hover:-translate-y-0.5 hover:border-primary"}`}
                    >
                      {cover ? (
                        <img src={cover} alt={ex.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-secondary to-muted">
                          <Dumbbell className="h-8 w-8 text-muted-foreground/50" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
                      <span
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => { e.stopPropagation(); openPickerVideo(ex); }}
                        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition hover:bg-black/80 group-hover:opacity-100"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </span>
                      {alreadyAdded && (
                        <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">Adicionado</span>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <p className="line-clamp-2 text-[11px] font-medium leading-tight text-white">{ex.name}</p>
                        <p className="mt-0.5 text-[9px] uppercase tracking-wide text-white/60">{ex.muscle_group}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Rodapé: continua na seleção; só vai para a prescrição em "Ver treino completo" */}
          <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
            <span className="font-sans text-sm text-muted-foreground">
              {(currentWorkout?.exercises?.length || 0)} exercício(s) no treino
            </span>
            <Button onClick={() => setLibraryOpen(false)}>
              Ver treino completo
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Video Modal */}
      <Dialog open={!!videoModal} onOpenChange={() => setVideoModal(null)}>
        <DialogContent className="bg-card border-border max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-primary">VÍDEO</DialogTitle>
          </DialogHeader>
          {videoModal && (
            <div className="aspect-video w-full">
              {videoModal.type === "path" ? (
                <video
                  src={videoModal.value}
                  controls
                  className="w-full h-full rounded-md"
                />
              ) : (
                <iframe
                  src={getEmbedUrl(videoModal.value)}
                  className="w-full h-full rounded-md"
                  allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
