import { useEffect, useState, useCallback, useMemo, useRef, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Dumbbell, Play, Clock, CheckCircle2, Circle, Loader2, LogOut, Save, CalendarDays, History, BarChart3, ArrowLeft, ExternalLink, Flame } from "lucide-react";
import { format, parseISO, differenceInDays, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useWorkoutSession } from "@/hooks/useWorkoutSession";
import { WorkoutTimer } from "@/components/student/WorkoutTimer";
import { WorkoutSummary } from "@/components/student/WorkoutSummary";
import { ExerciseCard } from "@/components/student/ExerciseCard";
import { groupWorkoutExercises, WORKOUT_METHODS, type MethodId } from "@/lib/workoutMethods";
import { MethodBadge } from "@/components/workout/MethodBadge";
import { PeriodizationBanner } from "@/components/student/PeriodizationBanner";
import { WhySafetyCard } from "@/components/student/WhySafetyCard";
import { CheckinCard } from "@/components/student/CheckinCard";
import { PushBanner } from "@/components/student/PushBanner";
import { StatsCharts } from "@/components/student/StatsCharts";
import { VolumeInsights } from "@/components/student/VolumeInsights";
import { WarmupGuide } from "@/components/student/WarmupGuide";
import { useRestTimer } from "@/components/student/RestTimer";
import { useWakeLock } from "@/hooks/useWakeLock";
import { WeeklyBar } from "@/components/student/WeeklyBar";
import { AnnouncementsBell } from "@/components/student/AnnouncementsBell";
import { StudentHome } from "@/components/student/StudentHome";
import { businessDateYmd } from "@/lib/businessDate";
import { NutritionPlanView } from "@/components/student/NutritionPlanView";
import { CardioPlanView } from "@/components/student/CardioPlanView";
import { WearableIntegrations } from "@/components/student/WearableIntegrations";
import { PlatformAdSlot } from "@/components/PlatformAdSlot";
import { StudentCalendar } from "@/components/student/StudentCalendar";
import { StudentHistory } from "@/components/student/StudentHistory";
import { WorkoutHeader } from "@/components/student/WorkoutHeader";
import { WeeklyGoalEditor } from "@/components/student/WeeklyGoalEditor";
import { AchievementsPanel } from "@/components/student/AchievementsPanel";
import { MonthlyLeaderboard } from "@/components/student/MonthlyLeaderboard";
import { resolveWorkoutForCycleWeek, type ResolvedWeekContext, type StoredWeeklyExercisePrescription } from "@/lib/weeklyStrengthPeriodization";

import { CycleFeedbackBanner } from "@/components/student/CycleFeedbackBanner";
import { calculateStreak } from "@/lib/streakCalculator";
import { ExternalActivitiesList } from "@/components/student/ExternalActivitiesList";
import { AnnouncementsFeed } from "@/components/student/AnnouncementsFeed";
import { BodyMeasurements } from "@/components/student/BodyMeasurements";
import type { Gender } from "@/components/student/BodyMeasurements";
import { Megaphone, Activity } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { filterMaterializedWorkouts } from "@/lib/workoutPresence";
import { canonicalizeWorkoutLogBatchRows } from "@/lib/workoutLogBatch";
import {
  inferExtraSetsFromPersistedLogs,
  mergeWorkoutDraftLogs,
  readWorkoutUiDraft,
  reconcileWorkoutLogResponse,
  removeAndRenumberWorkoutSet,
  resolveWorkoutResumeTarget,
  workoutUiDraftKey,
  writeWorkoutUiDraft,
  workoutLogTombstoneKey,
} from "@/lib/workoutDraft";


type ActiveView = "home" | "treino" | "stats" | "calendario" | "historico" | "atividades" | "avisos" | "medidas" | "nutricao" | "corrida" | "natacao" | "ciclismo" | "integracoes";
const MAX_EXTRA_SETS = 5;


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
  tempo?: string | null;
  rir?: string | null;
  weekly_instruction?: string | null;
  weekly_prescription?: StoredWeeklyExercisePrescription[];
  youtube_video_id?: string | null;
  thumbnail_url?: string | null;
}

interface WorkoutData {
  id: string;
  title: string;
  description: string | null;
  exercises: WorkoutExercise[];
  day_of_week: number | null;
  weekly_context?: ResolvedWeekContext;
}

interface Cycle {
  id: string;
  cycle_number: number;
  start_date: string;
  end_date: string;
  status: string;
  objective?: string | null;
  duration_weeks?: number | null;
  workouts: WorkoutData[];
}

interface WorkoutLog {
  id?: string;
  workout_id: string;
  exercise_index: number;
  set_number: number;
  weight: number;
  reps_done: number;
  session_date?: string;
  set_type?: string;
  rpe?: number;
  completed?: boolean;
  revision?: number;
  updated_at?: string;
  created_at?: string;
  client_updated_at?: string;
  dirty?: boolean;
  deleted?: boolean;
}

export default function StudentPortal() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [activeView, setActiveView] = useState<ActiveView>("home");
  const [studentId, setStudentId] = useState<string | null>(null);
  const [studentName, setStudentName] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [gender, setGender] = useState<Gender | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<Cycle | null>(null);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [videoModal, setVideoModal] = useState<{ type: "path" | "url" | "loading"; value: string; title: string } | null>(null);
  // Feedback pós-treino — persiste no painel; WhatsApp é um canal adicional.
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackRating, setFeedbackRating] = useState<string | null>(null);
  const [feedbackWorkoutTitle, setFeedbackWorkoutTitle] = useState("");
  const [feedbackSessionId, setFeedbackSessionId] = useState<string | null>(null);
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedExercise, setExpandedExercise] = useState<number | null>(null);
  const [warmupOpen, setWarmupOpen] = useState(false);
  const [logs, setLogs] = useState<Record<string, WorkoutLog>>({});
  const [previousLogs, setPreviousLogs] = useState<Record<string, WorkoutLog>>({});
  const [savingLogs, setSavingLogs] = useState(false);
  const [enrollmentInfo, setEnrollmentInfo] = useState<{ plan_name: string; start_date: string; end_date: string } | null>(null);
  const [allLogs, setAllLogs] = useState<any[]>([]);
  const [studentGoals, setStudentGoals] = useState<any[]>([]);
  const [extraSets, setExtraSets] = useState<Record<number, number>>({});
  const [workoutSessions, setWorkoutSessions] = useState<any[]>([]);
  const [weeklyGoal, setWeeklyGoal] = useState<number>(3);
  const [activeEnrollmentId, setActiveEnrollmentId] = useState<string | null>(null);
  // Prescrições por modalidade (abas condicionais): nutrição + esportes de cardio existentes.
  const [hasNutrition, setHasNutrition] = useState(false);
  const [runningSports, setRunningSports] = useState<Set<string>>(new Set());
  

  const selectedWorkoutBase = selectedCycle?.workouts.find(w => w.id === selectedWorkoutId) || selectedCycle?.workouts[0] || null;
  const selectedWorkout = useMemo(
    () => resolveWorkoutForCycleWeek(
      selectedWorkoutBase,
      selectedCycle?.start_date,
      selectedCycle?.duration_weeks,
    ),
    [selectedWorkoutBase, selectedCycle?.start_date, selectedCycle?.duration_weeks],
  );
  const todayStr = businessDateYmd();

  const session = useWorkoutSession(studentId, companyId);
  const workoutUiDraftStorageKey = studentId ? workoutUiDraftKey(studentId, todayStr) : null;
  const workoutUiRestoredKeyRef = useRef<string | null>(null);
  const extraSetsWorkoutRef = useRef<string | null>(null);
  const extraSetsByWorkoutRef = useRef<Record<string, Record<number, number>>>({});

  // Mantém a tela acesa durante o treino (academia: evita destravar de mão suada).
  useWakeLock(session.isActive);

  // Restauração ordenada: espera a sessão local hidratar e resolve uma única
  // fonte. Sessão ativa vence rascunho antigo; o rascunho só complementa a UI
  // quando pertence ao mesmo treino iniciado.
  useEffect(() => {
    if (loading || !session.isHydrated || !workoutUiDraftStorageKey || cycles.length === 0) return;
    const activeWorkoutId = session.activeSession?.workoutId ?? null;
    const alreadyRestored = workoutUiRestoredKeyRef.current === workoutUiDraftStorageKey;
    if (alreadyRestored && !activeWorkoutId) return;
    const draft = readWorkoutUiDraft(localStorage, workoutUiDraftStorageKey);
    const target = resolveWorkoutResumeTarget(activeWorkoutId, draft);
    workoutUiRestoredKeyRef.current = workoutUiDraftStorageKey;
    if (!target) return;
    const cycle = cycles.find(item => item.id === target.cycleId && item.workouts.some(workout => workout.id === target.workoutId))
      || cycles.find(item => item.workouts.some(workout => workout.id === target.workoutId));
    if (!cycle) return;
    setSelectedCycle(cycle);
    setSelectedWorkoutId(target.workoutId);
    setExpandedExercise(target.expandedExercise);
    extraSetsWorkoutRef.current = target.workoutId;
    extraSetsByWorkoutRef.current[target.workoutId] = target.extraSets;
    setExtraSets(target.extraSets);
    setActiveView("treino");
  }, [cycles, loading, session.activeSession?.workoutId, session.isHydrated, workoutUiDraftStorageKey]);

  useEffect(() => {
    if (!session.isHydrated || workoutUiRestoredKeyRef.current !== workoutUiDraftStorageKey) return;
    if (!workoutUiDraftStorageKey || !selectedWorkoutId) return;
    try {
      writeWorkoutUiDraft(localStorage, workoutUiDraftStorageKey, {
        cycleId: selectedCycle?.id ?? null,
        workoutId: selectedWorkoutId,
        expandedExercise,
        activeView,
        extraSets,
      });
    } catch { /* quota/private mode */ }
  }, [activeView, expandedExercise, extraSets, selectedCycle?.id, selectedWorkoutId, session.isHydrated, workoutUiDraftStorageKey]);

  // Em um aparelho novo não há rascunho de UI. O maior set_number persistido
  // hoje reconstrói as séries extras de cada exercício, sempre limitado a 5.
  useEffect(() => {
    if (!selectedWorkout) return;
    const workoutId = selectedWorkout.id;
    const inferred = inferExtraSetsFromPersistedLogs(allLogs, workoutId, selectedWorkout.exercises, todayStr);
    setExtraSets(current => {
      const previousWorkoutId = extraSetsWorkoutRef.current;
      if (previousWorkoutId && previousWorkoutId !== workoutId) {
        extraSetsByWorkoutRef.current[previousWorkoutId] = current;
      }
      const cached = extraSetsByWorkoutRef.current[workoutId]
        ?? (previousWorkoutId === workoutId ? current : {});
      const merged = { ...inferred };
      for (const [index, count] of Object.entries(cached)) {
        const exerciseIndex = Number(index);
        merged[exerciseIndex] = Math.min(MAX_EXTRA_SETS, Math.max(merged[exerciseIndex] || 0, count));
      }
      extraSetsWorkoutRef.current = workoutId;
      extraSetsByWorkoutRef.current[workoutId] = merged;
      const currentKeys = Object.keys(current);
      const mergedKeys = Object.keys(merged);
      if (currentKeys.length === mergedKeys.length
        && mergedKeys.every(key => current[Number(key)] === merged[Number(key)])) return current;
      return merged;
    });
  }, [allLogs, selectedWorkout, todayStr]);

  const { activeRest, startRest, clearRest } = useRestTimer();

  useEffect(() => {
    if (user) loadStudentData();
  }, [user]);

  // Provas/metas alvo do aluno (exibidas no calendário).
  useEffect(() => {
    if (!studentId) return;
    (supabase as any)
      .from("student_goals")
      .select("id, target_date, title, kind, status, description, metric")
      .eq("student_id", studentId)
      .order("target_date")
      .then(({ data }: any) => setStudentGoals(data || []));
  }, [studentId]);

  const loadStudentData = async () => {
    try {
    const { data: student } = await supabase
      .from("students")
      .select("id, full_name, company_id, weekly_workout_goal, gender")
      .eq("user_id", user!.id)
      .maybeSingle();

    if (!student) { return; }
    setStudentId(student.id);
    setStudentName(student.full_name);
    setCompanyId(student.company_id);
    setGender((student as any).gender === "male" || (student as any).gender === "female" ? (student as any).gender : null);
    setWeeklyGoal((student as any).weekly_workout_goal || 3);

    // Detecta quais prescrições existem para mostrar as abas condicionais (nutrição/corrida/natação/ciclismo).
    // RLS já permite o aluno ler nutrition_plans e running_plans próprios.
    {
      const [{ data: nutritionRows }, { data: runs }, { data: anamnese }] = await Promise.all([
        (supabase as any).from("nutrition_plans").select("id, start_date, end_date").eq("student_id", student.id),
        (supabase as any).from("running_plans").select("sport, start_date, end_date").eq("student_id", student.id),
        (supabase as any).from("student_anamneses").select("wants_nutrition, has_nutritionist").eq("student_id", student.id).maybeSingle(),
      ]);
      const isVisibleToday = (row: any) => (!row.start_date || row.start_date <= todayStr) && (!row.end_date || row.end_date >= todayStr);
      setHasNutrition((nutritionRows ?? []).some(isVisibleToday) || (!!(anamnese as any)?.wants_nutrition && !!(anamnese as any)?.has_nutritionist));
      const sports = new Set<string>();
      (runs ?? []).filter(isVisibleToday).forEach((r: any) => { if (r.sport) sports.add(String(r.sport).toLowerCase()); });
      setRunningSports(sports);
    }


    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("id, start_date, end_date, plan_id")
      .eq("student_id", student.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (enrollment) {
      setActiveEnrollmentId(enrollment.id);
      // Nome do plano em query separada (sem o embed plans(name), que podia dar 400 por divergência de schema/FK
      // e derrubar TODA a carga do treino junto).
      let planName = "Plano";
      const planId = (enrollment as any).plan_id;
      if (planId) {
        const { data: planRow } = await supabase.from("plans").select("name").eq("id", planId).maybeSingle();
        if ((planRow as any)?.name) planName = (planRow as any).name;
      }
      setEnrollmentInfo({
        plan_name: planName,
        start_date: enrollment.start_date,
        end_date: enrollment.end_date,
      });
    }

    // CICLOS direto por student_id (RLS "students_read_own_cycles") — INDEPENDE da matrícula/plano,
    // pra o treino aparecer mesmo se a query de matrícula falhar.
    {
      // (supabase as any): o types.ts local de training_cycles está defasado e não lista student_id,
      // que EXISTE no banco vivo (zshrcg). O cast evita o erro de tipo.
      const { data: cyclesData } = await (supabase as any)
        .from("training_cycles")
        .select("id, cycle_number, start_date, end_date, status, objective, duration_weeks, delivery_status")
        .eq("student_id", student.id)
        .order("cycle_number");

      if (cyclesData && cyclesData.length > 0) {
        const { data: workoutsData } = await supabase
          .from("workouts")
          .select("id, name, title, description, exercises, cycle_id, day_of_week")
          .in("cycle_id", cyclesData.map(c => c.id));

        const materializedWorkouts = filterMaterializedWorkouts(workoutsData || []);

        const exerciseIds = new Set<string>();
        materializedWorkouts.forEach(w => {
          const exs = (w.exercises as unknown as WorkoutExercise[]) || [];
          exs.forEach(ex => { if (ex.exercise_id) exerciseIds.add(ex.exercise_id); });
        });

        const videoMap: Record<string, { video_url: string | null; video_path: string | null; youtube_video_id: string | null; thumbnail_url: string | null }> = {};
        if (exerciseIds.size > 0) {
          const { data: libraryData } = await (supabase as any)
            .from("exercise_library")
            .select("id, video_url, video_path, youtube_video_id, thumbnail_url")
            .in("id", Array.from(exerciseIds));
          if (libraryData) {
            libraryData.forEach((lib: any) => {
              videoMap[lib.id] = { video_url: lib.video_url, video_path: lib.video_path, youtube_video_id: lib.youtube_video_id ?? null, thumbnail_url: lib.thumbnail_url ?? null };
            });
          }
        }

        const enriched: Cycle[] = cyclesData.map(c => {
          const cycleWorkouts = materializedWorkouts
            .filter(w => w.cycle_id === c.id)
            .map(w => ({
              id: w.id,
              title: w.title || w.name || "Treino",
              description: w.description,
              day_of_week: (w as any).day_of_week as number | null,
              exercises: ((w.exercises as unknown as WorkoutExercise[]) || []).map(ex => ({
                ...ex,
                video_url: (ex.video_url && ex.video_url.trim()) || videoMap[ex.exercise_id]?.video_url || null,
                video_path: (ex.video_path && ex.video_path.trim()) || videoMap[ex.exercise_id]?.video_path || null,
                youtube_video_id: (ex as any).youtube_video_id || videoMap[ex.exercise_id]?.youtube_video_id || null,
                thumbnail_url: (ex as any).thumbnail_url || videoMap[ex.exercise_id]?.thumbnail_url || null,
              })),
            }))
            .sort((a, b) => (a.title || "").localeCompare(b.title || ""))
            .map((workout) => resolveWorkoutForCycleWeek(
              workout,
              c.start_date,
              (c as any).duration_weeks,
            ) || workout);
          return { ...c, workouts: cycleWorkouts };
        });
        setCycles(enriched);

        const today = new Date();
        const inRange = (c: Cycle) => {
          try { return isWithinInterval(today, { start: parseISO(c.start_date), end: parseISO(c.end_date) }); }
          catch { return false; }
        };
        const hasStarted = (c: Cycle) => !c.start_date || c.start_date <= todayStr;
        // Vários ciclos podem ter períodos sobrepostos (re-publicações). Prioriza ciclo vigente com treino real.
        const byNewest = [...enriched].sort((a, b) => (b.cycle_number || 0) - (a.cycle_number || 0));
        // Prescrição futura nunca vaza antes da data. O status ajuda, mas a
        // vigência é a fonte de verdade para o que o aluno enxerga hoje.
        const chosen =
          byNewest.find(c => c.status === "active" && inRange(c) && c.workouts.length > 0) ||
          byNewest.find(c => inRange(c) && c.workouts.length > 0) ||
          byNewest.find(c => c.status === "active" && c.workouts.length > 0 && (!c.start_date || !c.end_date)) ||
          byNewest.find(c => hasStarted(c) && c.workouts.length > 0) ||
          byNewest.find(c => inRange(c)) ||
          byNewest.find(c => c.status === "active" && (!c.start_date || !c.end_date)) ||
          null;
        setSelectedCycle(chosen);
        // P6 — marca a prescrição como vista assim que o aluno abre o ciclo escolhido.
        if (chosen?.id && (chosen as any).delivery_status !== "viewed") {
          void (supabase as any).rpc("mark_training_cycle_viewed", { _cycle_id: chosen.id });
        }
        const todayDow = new Date().getDay();
        const todaysWorkout = chosen?.workouts.find(w => w.day_of_week === todayDow);
        if (todaysWorkout) {
          setSelectedWorkoutId(todaysWorkout.id);
        } else if (chosen?.workouts.length) {
          setSelectedWorkoutId(chosen.workouts[0].id);
        } else {
          setSelectedWorkoutId(null);
        }

        const workoutIds = materializedWorkouts.map(w => w.id);
        if (workoutIds.length > 0) {
          const { data: logsData } = await supabase
            .from("workout_logs")
            .select("*")
            .eq("student_id", student.id)
            .in("workout_id", workoutIds);

          // Load workout sessions for history
          const { data: sessionsData } = await supabase
            .from("workout_sessions")
            .select("*")
            .eq("student_id", student.id)
            .in("workout_id", workoutIds);

          if (sessionsData) setWorkoutSessions(sessionsData);

          if (logsData) {
            setAllLogs(logsData);
            const todayLogMap: Record<string, WorkoutLog> = {};
            const prevLogMap: Record<string, WorkoutLog> = {};
            const grouped: Record<string, any[]> = {};

            logsData.forEach((l: any) => {
              const key = `${l.workout_id}-${l.exercise_index}-${l.set_number}`;
              if (!grouped[key]) grouped[key] = [];
              grouped[key].push(l);
            });

            Object.entries(grouped).forEach(([key, entries]) => {
              entries.sort((a, b) => (b.session_date || "").localeCompare(a.session_date || ""));
              const todayEntry = entries.find(e => e.session_date === todayStr);
              if (todayEntry) todayLogMap[key] = todayEntry;
              const prevEntry = entries.find(e => e.session_date !== todayStr);
              if (prevEntry) prevLogMap[key] = prevEntry;
            });

            setLogs(todayLogMap);
            setPreviousLogs(prevLogMap);
          }
        }
      }
    }
    } catch (err) {
      console.error("Erro ao carregar dados do aluno:", err);
      toast({ title: "Erro ao carregar seus dados", description: "Tente recarregar a página.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const getLogKey = (workoutId: string, exIdx: number, setNum: number) =>
    `${workoutId}-${exIdx}-${setNum}`;

  const updateLog = (exIdx: number, setNum: number, field: string, value: number | string | boolean) => {
    if (!selectedWorkout) return;
    const workoutId = selectedWorkout.id;
    const key = getLogKey(workoutId, exIdx, setNum);
    setLogs(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        workout_id: workoutId,
        exercise_index: exIdx,
        set_number: setNum,
        weight: prev[key]?.weight ?? null,
        reps_done: prev[key]?.reps_done ?? null,
        [field]: value,
        client_updated_at: new Date().toISOString(),
        dirty: true,
      },
    }));
  };

  const getTotalSets = (exIdx: number) => {
    const baseSets = parseInt(selectedWorkout?.exercises[exIdx]?.sets || "3") || 3;
    return baseSets + (extraSets[exIdx] || 0);
  };

  const handleAddSet = (exIdx: number) => {
    if (!selectedWorkout) return;
    const workoutId = selectedWorkout.id;
    setExtraSets(prev => {
      const current = prev[exIdx] || 0;
      if (current >= MAX_EXTRA_SETS) {
        toast({
          title: "Limite de séries extras atingido",
          description: "Você pode adicionar até 5 séries além da prescrição.",
        });
        return prev;
      }
      const next = { ...prev, [exIdx]: current + 1 };
      extraSetsWorkoutRef.current = workoutId;
      extraSetsByWorkoutRef.current[workoutId] = next;
      return next;
    });
  };

  const handleRemoveSet = (exIdx: number, setNum: number) => {
    if (!selectedWorkout) return;
    const workoutId = selectedWorkout.id;
    const total = getTotalSets(exIdx);
    const baseSets = parseInt(selectedWorkout.exercises[exIdx]?.sets || "3") || 3;
    const currentExtra = extraSets[exIdx] || 0;
    if (total <= 1 || currentExtra <= 0 || setNum <= baseSets) return;

    setLogs(prev => removeAndRenumberWorkoutSet(
      prev, workoutId, exIdx, setNum, total, new Date().toISOString(),
    ));

    setExtraSets(prev => {
      const next = { ...prev, [exIdx]: currentExtra - 1 };
      extraSetsWorkoutRef.current = workoutId;
      extraSetsByWorkoutRef.current[workoutId] = next;
      return next;
    });
  };

  const saveCurrentLogs = async (opts?: { silent?: boolean }) => {
    if (!selectedWorkout || !studentId) return;
    const silent = opts?.silent === true;
    if (!silent) setSavingLogs(true);
    const workoutId = selectedWorkout.id;
    // Inclui séries marcadas como concluídas mesmo sem carga/reps (ex.: peso corporal, abdominal).
    const logsToSave = Object.values(logs).filter(l =>
      l.workout_id === workoutId
      && (l.deleted === true || l.weight > 0 || l.reps_done > 0 || l.completed)
      && (l.dirty === true || !l.id)
    );

    let hadError = false;
    // O índice identifica a série; base_revision impede que um autosave antigo
    // atualize essa série depois de outro aparelho já ter salvo uma revisão nova.
    const rows = logsToSave.map(log => ({
      student_id: studentId,
      workout_id: log.workout_id,
      exercise_index: log.exercise_index,
      set_number: log.set_number,
      session_date: todayStr,
      weight: log.weight ?? 0,
      reps_done: log.reps_done ?? 0,
      set_type: log.set_type || 'normal',
      rpe: log.rpe || null,
      completed: log.completed || false,
      base_revision: log.revision ?? null,
      client_updated_at: log.client_updated_at ?? null,
      deleted: log.deleted === true,
    }));
    const canonicalBatch = canonicalizeWorkoutLogBatchRows(rows);
    if (canonicalBatch.error) {
      console.error("Lote de séries rejeitado antes do envio:", canonicalBatch.error);
      if (!silent) {
        setSavingLogs(false);
        toast({ title: "As séries não foram salvas", description: "Recarregue o treino e tente novamente.", variant: "destructive" });
      }
      return;
    }
    const canonicalRows = canonicalBatch.rows;
    if (canonicalRows.length > 0) {
      const sentByKey = new Map(canonicalRows.filter(row => !row.deleted).map(row => [getLogKey(row.workout_id, row.exercise_index, row.set_number), row]));
      // RPC com compare-and-swap por revisão: outro dispositivo não pode ser
      // sobrescrito por um autosave baseado numa versão antiga.
      let error: any = null;
      let result: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await (supabase as any).rpc("save_workout_logs_if_current", { _rows: canonicalRows });
        error = res.error;
        result = res.data;
        if (!error) break;
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
      if (error) { hadError = true; console.error("Erro ao salvar carga:", error); }
      else {
        const allSavedRows = (Array.isArray(result?.saved) ? result.saved : [])
          .filter((row: WorkoutLog | null) => !!row?.workout_id);
        const deletedRows = allSavedRows.filter((row: WorkoutLog) => row.deleted === true);
        const savedRows = allSavedRows.filter((row: WorkoutLog) => row.deleted !== true);
        const rawConflicts = Array.isArray(result?.conflicts) ? result.conflicts : [];
        const deletionConflict = rawConflicts.some((row: WorkoutLog & { requested_deleted?: boolean }) => row?.requested_deleted === true);
        const conflictRows = rawConflicts
          .filter((row: WorkoutLog | null) => !!row?.workout_id);
        if (rawConflicts.length > 0) hadError = true;
        const authoritativeRows = [...savedRows, ...conflictRows] as WorkoutLog[];
        if (deletionConflict) {
          // Não permita que um reload imediato reaplique a transação local que
          // acabou de perder o CAS para uma edição mais nova de outro aparelho.
          if (logsBackupKey) localStorage.removeItem(logsBackupKey);
          await loadStudentData();
        } else {
          setLogs(prev => {
            const next = { ...prev };
            for (const deletedRow of deletedRows) {
              const key = getLogKey(deletedRow.workout_id, deletedRow.exercise_index, deletedRow.set_number);
              delete next[workoutLogTombstoneKey(key)];
            }
            for (const serverRow of authoritativeRows) {
              const key = getLogKey(serverRow.workout_id, serverRow.exercise_index, serverRow.set_number);
              const current = next[key];
              const sent = sentByKey.get(key);
              next[key] = reconcileWorkoutLogResponse(current, sent, serverRow);
            }
            return next;
          });
          setAllLogs((prev) => {
            const keyOf = (r: any) => `${r.workout_id}|${r.exercise_index}|${r.set_number}|${r.session_date}`;
            const map = new Map((prev || []).map((r: any) => [keyOf(r), r]));
            for (const r of deletedRows) map.delete(keyOf(r));
            for (const r of authoritativeRows) map.set(keyOf(r), { ...(map.get(keyOf(r)) || {}), ...r });
            return Array.from(map.values());
          });
        }
        if (rawConflicts.length > 0 && silent) {
          toast({
            title: "Treino atualizado em outro dispositivo",
            description: "Mantivemos a versão mais recente para evitar perder progresso.",
          });
        }
      }
    }
    if (!silent) setSavingLogs(false);
    if (silent) return; // autosave: sem toast para não poluir
    if (hadError) {
      toast({ title: "Algumas cargas não foram salvas", description: "Verifique sua conexão e tente novamente.", variant: "destructive" });
    } else {
      toast({ title: "Cargas salvas!" });
    }
  };

  // ---- Autosave + backup local dos logs do dia (resiliência a wifi ruim / reload) ----
  const logsBackupKey = studentId ? `sett_logs_${studentId}_${todayStr}` : null;
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logsRestoredKeyRef = useRef<string | null>(null);

  // Backup local a cada mudança. Espera o restore deste aluno/dia para não
  // sobrescrever um rascunho offline com a versão antiga recém-lida do banco.
  useEffect(() => {
    if (logsRestoredKeyRef.current !== logsBackupKey) return;
    if (!logsBackupKey || Object.keys(logs).length === 0) return;
    try { localStorage.setItem(logsBackupKey, JSON.stringify(logs)); } catch { /* quota */ }
  }, [logs, logsBackupKey]);

  // Restaura, uma vez após o load, entradas locais que o banco não trouxe (edições offline).
  useEffect(() => {
    if (loading || !logsBackupKey || logsRestoredKeyRef.current === logsBackupKey) return;
    logsRestoredKeyRef.current = logsBackupKey;
    try {
      const raw = localStorage.getItem(logsBackupKey);
      if (!raw) return;
      const local = JSON.parse(raw) as Record<string, WorkoutLog>;
      setLogs(prev => mergeWorkoutDraftLogs(prev, local));
    } catch { /* ignore */ }
  }, [loading, logsBackupKey]);

  // Autosave com debounce (silencioso) — o atleta não depende mais de lembrar de salvar.
  useEffect(() => {
    if (!studentId || !selectedWorkout || Object.keys(logs).length === 0) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => { void saveCurrentLogs({ silent: true }); }, 2000);
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); };
  }, [logs, studentId, selectedWorkout]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tenta salvar ao reconectar.
  useEffect(() => {
    const onOnline = () => { if (Object.keys(logs).length > 0) void saveCurrentLogs({ silent: true }); };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [logs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Safari pode congelar a aba sem dar tempo ao debounce. Grave o rascunho
  // local imediatamente no pagehide/visibilitychange; o envio remoto retoma depois.
  useEffect(() => {
    const persistBeforeSuspend = (event: Event) => {
      if (document.visibilityState !== "hidden" && event?.type !== "pagehide") return;
      try {
        if (logsBackupKey && Object.keys(logs).length > 0) {
          localStorage.setItem(logsBackupKey, JSON.stringify(logs));
        }
        if (workoutUiDraftStorageKey && selectedWorkoutId) {
          writeWorkoutUiDraft(localStorage, workoutUiDraftStorageKey, {
            cycleId: selectedCycle?.id ?? null,
            workoutId: selectedWorkoutId,
            expandedExercise,
            activeView,
            extraSets,
          });
        }
      } catch { /* quota/private mode */ }
    };
    document.addEventListener("visibilitychange", persistBeforeSuspend);
    window.addEventListener("pagehide", persistBeforeSuspend);
    return () => {
      document.removeEventListener("visibilitychange", persistBeforeSuspend);
      window.removeEventListener("pagehide", persistBeforeSuspend);
    };
  }, [activeView, expandedExercise, extraSets, logs, logsBackupKey, selectedCycle?.id, selectedWorkoutId, workoutUiDraftStorageKey]);

  const getStoragePublicUrl = (path: string) => {
    const { data } = supabase.storage.from("exercises-videos").getPublicUrl(path);
    return data.publicUrl;
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
    return url;
  };

  const openVideoForExercise = async (ex: WorkoutExercise) => {
    if (ex.video_path) { setVideoModal({ type: "path", value: getStoragePublicUrl(ex.video_path), title: ex.exercise_name }); return; }
    if (ex.video_url) { setVideoModal({ type: "url", value: ex.video_url, title: ex.exercise_name }); return; }
    if (ex.youtube_video_id) { setVideoModal({ type: "url", value: `https://www.youtube.com/watch?v=${ex.youtube_video_id}`, title: ex.exercise_name }); return; }
    // Sem vídeo gravado → puxa um vídeo do YouTube pelo nome do exercício (resolvido/cacheado no servidor).
    setVideoModal({ type: "loading", value: "", title: ex.exercise_name });
    const search = () => window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(ex.exercise_name + " execução técnica")}`, "_blank");
    try {
      const { data } = await supabase.functions.invoke("youtube-exercise-video", { body: { exercise_id: ex.exercise_id, name: ex.exercise_name } });
      const vid = (data as any)?.video_id as string | null;
      if (vid) setVideoModal({ type: "url", value: `https://www.youtube.com/watch?v=${vid}`, title: ex.exercise_name });
      else { search(); setVideoModal(null); }
    } catch {
      search(); setVideoModal(null);
    }
  };

  const getOverallProgress = () => {
    if (!enrollmentInfo || !enrollmentInfo.start_date || !enrollmentInfo.end_date) return 0;
    const today = new Date();
    const start = parseISO(enrollmentInfo.start_date);
    const end = parseISO(enrollmentInfo.end_date);
    const total = differenceInDays(end, start);
    if (total <= 0) return today >= end ? 100 : 0;
    const elapsed = differenceInDays(today, start);
    return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
  };

  const getCycleProgress = (cycle: Cycle) => {
    if (!cycle?.start_date || !cycle?.end_date) return 0;
    const today = new Date();
    const start = parseISO(cycle.start_date);
    const end = parseISO(cycle.end_date);
    const total = differenceInDays(end, start);
    if (total <= 0) return today >= end ? 100 : 0;
    const elapsed = differenceInDays(today, start);
    return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
  };

  const getWorkoutLabel = (index: number) => String.fromCharCode(65 + index);

  const handleStartSession = async () => {
    if (!selectedWorkout) return;
    await session.startSession(selectedWorkout.id);
    toast({ title: "Treino iniciado!", description: "O cronômetro está rodando." });
  };

  const handleFinishSession = async () => {
    if (!selectedWorkout) return;
    await saveCurrentLogs();

    const previousBestWeights: Record<string, number> = {};
    selectedWorkout.exercises.forEach((ex, idx) => {
      const exLogs = allLogs.filter((l: any) => l.workout_id === selectedWorkout.id && l.exercise_index === idx && l.session_date !== todayStr);
      const maxW = exLogs.reduce((max: number, l: any) => Math.max(max, Number(l.weight) || 0), 0);
      previousBestWeights[`ex-${idx}`] = maxW;
    });

    const finishedSession = await session.finishSession(logs, selectedWorkout.exercises, previousBestWeights);
    toast({ title: "Treino concluído! 🎉", description: "Mandou bem — orgulho do seu progresso. Bora pro próximo!" });

    // Abre o popup "Como foi o treino?" — a resposta vai pro WhatsApp do treinador.
    setFeedbackWorkoutTitle(selectedWorkout.title);
    setFeedbackText("");
    setFeedbackRating(null);
    setFeedbackSessionId(finishedSession?.id ?? null);
    setFeedbackOpen(true);
  };

  const sendWorkoutFeedback = async () => {
    if (!studentId) return;
    setSendingFeedback(true);
    try {
      const { data, error } = await supabase.functions.invoke("student-workout-feedback", {
        body: {
          student_id: studentId,
          feedback: feedbackText,
          rating: feedbackRating,
          workout_title: feedbackWorkoutTitle,
          workout_session_id: feedbackSessionId,
        },
      });
      if (error || !data?.ok || !data?.persisted) {
        throw new Error(error?.message || data?.error || "Não foi possível registrar o feedback.");
      }
      toast({
        title: "Valeu pelo feedback! 💪",
        description: data.delivered
          ? "Registrado no app e enviado para a conversa da equipe."
          : "Registrado no painel da equipe para o seu treinador.",
      });
      setFeedbackOpen(false);
      setFeedbackSessionId(null);
    } catch (error) {
      toast({
        title: "Não foi possível enviar o feedback",
        description: error instanceof Error ? error.message : "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setSendingFeedback(false);
    }
  };


  const handleAbandonSession = async () => {
    await session.abandonSession();
    toast({ title: "Treino abandonado" });
  };

  const getExerciseHistory = (workoutId: string, idx: number) => {
    const exLogs = allLogs.filter((l: any) => l.workout_id === workoutId && l.exercise_index === idx && l.session_date !== todayStr);
    const byDate: Record<string, { weight: number; reps_done: number; set_number: number }[]> = {};
    exLogs.forEach((l: any) => {
      if (!byDate[l.session_date]) byDate[l.session_date] = [];
      byDate[l.session_date].push({ weight: l.weight, reps_done: l.reps_done, set_number: l.set_number });
    });
    return Object.entries(byDate)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 5)
      .map(([date, sets]) => ({ date, sets: sets.sort((a, b) => a.set_number - b.set_number) }));
  };

  // A2/Q5 — ponte de contexto pro BNITO: grava o treino/exercício aberto + melhor carga,
  // pra o assistente responder com base no que o aluno está fazendo agora (não genérico).
  useEffect(() => {
    try {
      if (!selectedWorkout) { sessionStorage.removeItem("sett-bnito-context"); return; }
      const ctx: any = { workout_title: selectedWorkout.title, objetivo_ciclo: selectedCycle?.objective || null };
      if (expandedExercise != null && selectedWorkout.exercises[expandedExercise]) {
        const ex = selectedWorkout.exercises[expandedExercise];
        const hist = getExerciseHistory(selectedWorkout.id, expandedExercise);
        const best = Math.max(0, ...hist.flatMap((h: any) => h.sets.map((s: any) => s.weight || 0)));
        ctx.exercicio_aberto = {
          nome: ex.exercise_name,
          grupo: ex.muscle_group,
          prescrito: `${getTotalSets(expandedExercise)}×${ex.reps}`,
          descanso: ex.rest,
          metodo: ex.method || null,
          obs: ex.notes || null,
          melhor_carga_kg: best > 0 ? best : null,
        };
      }
      sessionStorage.setItem("sett-bnito-context", JSON.stringify(ctx));
    } catch { /* noop */ }
  }, [selectedWorkout, expandedExercise, selectedCycle, logs]);

  // Computed values for Home — based on actual sessions, not day_of_week
  const trainedDays = useMemo(() => {
    const now = new Date();
    const jsDow = now.getDay();
    const mondayOffset = jsDow === 0 ? -6 : 1 - jsDow;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + mondayOffset);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const days = new Set<number>();
    allLogs.forEach((l: any) => {
      if (l.session_date) {
        const logDate = new Date(l.session_date + "T12:00:00");
        if (logDate >= weekStart && logDate <= weekEnd) days.add(logDate.getDay());
      }
    });
    return days;
  }, [allLogs]);

  const weeklySessionCount = useMemo(() => trainedDays.size, [trainedDays]);

  const workoutCount = useMemo(() => selectedCycle?.workouts.length || 0, [selectedCycle]);

  const totalSessions = useMemo(() => {
    const dates = new Set(allLogs.map((l: any) => l.session_date));
    return dates.size;
  }, [allLogs]);

  const streak = useMemo(() => {
    const dates = Array.from(new Set(allLogs.map((l: any) => l.session_date).filter(Boolean)));
    return calculateStreak(dates, weeklyGoal);
  }, [allLogs, weeklyGoal]);


  const handleNavigate = (view: ActiveView, workoutId?: string | null) => {
    if (view === "treino" && workoutId) {
      setSelectedWorkoutId(workoutId);
      setExpandedExercise(null);
    }
    setActiveView(view);
  };

  const handleCalendarSelectWorkout = (workoutId: string) => {
    setSelectedWorkoutId(workoutId);
    setActiveView("treino");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!studentId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground font-sans">Nenhum perfil de aluno vinculado à sua conta.</p>
          <Button variant="outline" onClick={signOut}><LogOut className="h-4 w-4 mr-2" />Sair</Button>
        </div>
      </div>
    );
  }

  const isSessionForCurrentWorkout = session.isActive && session.activeSession?.workoutId === selectedWorkout?.id;

  // Modalidades de cardio disponíveis (running_plans.sport). Corrida engloba triathlon.
  const hasCorrida = runningSports.has("corrida") || runningSports.has("triathlon");
  const hasNatacao = runningSports.has("natacao") || runningSports.has("natação");
  const hasCiclismo = runningSports.has("ciclismo");

  const viewTitles: Record<ActiveView, string> = {
    home: "MEU TREINO",
    treino: "TREINO",
    stats: "ESTATÍSTICAS",
    calendario: "CALENDÁRIO",
    historico: "HISTÓRICO",
    atividades: "ATIVIDADES",
    avisos: "AVISOS",
    medidas: "MEDIDAS",
    nutricao: "DICAS NUTRICIONAIS",
    corrida: "CORRIDA",
    natacao: "NATAÇÃO",
    ciclismo: "CICLISMO",
    integracoes: "INTEGRAÇÕES",
  };


  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 py-5 sm:px-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              {activeView !== "home" && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setActiveView("home")}
                  className="mr-1"
                  aria-label="Voltar ao início"
                  title="Voltar ao início"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              )}
              <Dumbbell className="h-6 w-6 text-primary" />
              <h1 className="text-xl text-primary font-mono-data font-semibold tracking-wide">
                {viewTitles[activeView]}
              </h1>
            </div>
            <div className="flex items-center gap-1">
              {studentId && companyId && <AnnouncementsBell studentId={studentId} companyId={companyId} />}
              <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair" title="Sair">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {activeView === "home" && (
            <p className="text-foreground font-sans text-lg">{studentName}</p>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        {/* Cycle renewal banner (above any view) */}
        {studentId && companyId && enrollmentInfo && (
          <div className="mb-4">
            <CycleFeedbackBanner
              studentId={studentId}
              companyId={companyId}
              enrollmentId={activeEnrollmentId}
              enrollmentEndDate={enrollmentInfo.end_date}
              cycleId={selectedCycle?.id ?? null}
            />
          </div>
        )}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
        {/* HOME VIEW */}
        {activeView === "home" && (
          <div className="space-y-3">
          {user?.id && <PushBanner userId={user.id} companyId={companyId} />}
          {studentId && <CheckinCard studentId={studentId} companyId={companyId} />}
          <PlatformAdSlot audience="student" placement="dashboard_banner" companyId={companyId} />
          <StudentHome
            studentName={studentName}
            enrollmentInfo={enrollmentInfo}
            overallProgress={getOverallProgress()}
            selectedCycle={selectedCycle}
            cycleProgress={selectedCycle ? getCycleProgress(selectedCycle) : 0}
            workoutCount={workoutCount}
            weeklySessionCount={weeklySessionCount}
            trainedDays={trainedDays}
            currentDayOfWeek={new Date().getDay()}
            totalSessions={totalSessions}
            weeklyGoal={weeklyGoal}
            streak={streak}
            activeWorkoutId={session.activeSession?.workoutId ?? null}
            goalEditor={studentId ? <WeeklyGoalEditor studentId={studentId} currentGoal={weeklyGoal} onSaved={setWeeklyGoal} /> : null}
            hasNutrition={hasNutrition}
            hasCorrida={hasCorrida}
            hasNatacao={hasNatacao}
            hasCiclismo={hasCiclismo}
            onNavigate={handleNavigate}
          />
          </div>
        )}

        {/* PRESCRIÇÕES — abas condicionais (só aparecem quando o treinador publicou a modalidade) */}
        {activeView === "nutricao" && studentId && <NutritionPlanView studentId={studentId} />}
        {activeView === "corrida" && studentId && <CardioPlanView studentId={studentId} sport="corrida" />}
        {activeView === "natacao" && studentId && <CardioPlanView studentId={studentId} sport="natacao" />}
        {activeView === "ciclismo" && studentId && <CardioPlanView studentId={studentId} sport="ciclismo" />}
        {activeView === "integracoes" && <WearableIntegrations />}


        {/* TREINO VIEW */}
        {activeView === "treino" && (
          <div className="space-y-6">
            {/* (seletor de ciclos removido — o ciclo atual já é mostrado abaixo) */}
            {!selectedCycle && (
              <div className="rounded-xl border border-border bg-card p-6 text-center space-y-2">
                <div className="text-3xl">💪</div>
                <p className="font-sans font-medium text-foreground">Seu treino está sendo preparado</p>
                <p className="text-sm text-muted-foreground font-sans">
                  Seu treinador está montando seu plano com cuidado. Assim que ficar pronto, ele aparece aqui — e você recebe um aviso no WhatsApp. Qualquer dúvida, é só chamar!
                </p>
              </div>
            )}
            {selectedCycle && (
              <div className="space-y-4">
                <Card className="bg-card border-border">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-primary font-mono-data text-sm font-semibold uppercase tracking-[0.12em]">CICLO {selectedCycle.cycle_number}</h3>
                      {selectedCycle.start_date && selectedCycle.end_date && (
                        <span className="text-xs text-muted-foreground font-sans">
                          {format(parseISO(selectedCycle.start_date), "dd/MM", { locale: ptBR })} — {format(parseISO(selectedCycle.end_date), "dd/MM", { locale: ptBR })}
                        </span>
                      )}
                    </div>
                    <Progress value={getCycleProgress(selectedCycle)} className="h-1.5" />
                  </CardContent>
                </Card>

                <PeriodizationBanner
                  objective={selectedCycle.objective}
                  durationWeeks={selectedCycle.duration_weeks}
                  startDate={selectedCycle.start_date}
                  endDate={selectedCycle.end_date}
                  prescribedWeek={selectedWorkout?.weekly_context}
                />

                <WhySafetyCard
                  objective={selectedCycle.objective}
                  startDate={selectedCycle.start_date}
                  studentId={studentId}
                  companyId={companyId}
                  studentName={studentName}
                />

                {selectedCycle.workouts.length > 0 ? (
                  <div className="space-y-3">
                    {selectedWorkout && (
                      <WorkoutHeader
                        cycleNumber={selectedCycle.cycle_number}
                        cycleStartDate={selectedCycle.start_date}
                        cycleEndDate={selectedCycle.end_date}
                        workoutTitle={selectedWorkout.title}
                        workoutDescription={selectedWorkout.description}
                      />
                    )}
                    {trainedDays.size > 0 && (
                      <WeeklyBar
                        trainedDays={trainedDays}
                        currentDayOfWeek={new Date().getDay()}
                        weeklySessionCount={weeklySessionCount}
                        weeklyGoal={weeklyGoal}
                        streak={streak}
                      />
                    )}


                    {selectedCycle.workouts.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {selectedCycle.workouts.map((w, i) => (
                          <button
                            key={w.id}
                            onClick={() => { setSelectedWorkoutId(w.id); setExpandedExercise(null); }}
                            className={`flex-shrink-0 px-4 py-2 rounded-md text-sm font-sans font-medium transition-all ${
                              selectedWorkoutId === w.id
                                ? "bg-primary text-primary-foreground"
                                : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                            }`}
                          >
                            Treino {getWorkoutLabel(i)}
                          </button>
                        ))}
                      </div>
                    )}

                    {selectedWorkout && (
                      <>
                        <WorkoutTimer
                          isActive={isSessionForCurrentWorkout}
                          elapsed={session.elapsed}
                          formatTime={session.formatTime}
                          onStart={handleStartSession}
                          onFinish={handleFinishSession}
                          onAbandon={handleAbandonSession}
                          workoutTitle={selectedWorkout.title}
                        />

                        <WarmupGuide muscleGroups={selectedWorkout.exercises.map((e) => e.muscle_group)} open={warmupOpen} onOpenChange={setWarmupOpen} />

                        {/* A4 — resumo inline do treino em andamento (volume / séries / tempo) */}
                        {isSessionForCurrentWorkout && (() => {
                          const wId = selectedWorkout.id;
                          const setLogs = Object.values(logs).filter((l: any) => l.workout_id === wId);
                          const doneSets = setLogs.filter((l: any) => l.completed).length;
                          const totalPlanned = selectedWorkout.exercises.reduce((s, _e, i) => s + getTotalSets(i), 0);
                          const vol = setLogs.filter((l: any) => l.completed).reduce((s, l: any) => s + (Number(l.weight) || 0) * (Number(l.reps_done) || 0), 0);
                          return (
                            <div className="grid grid-cols-3 gap-2">
                              {([
                                ["Volume", vol >= 1000 ? `${(vol / 1000).toFixed(1)}t` : `${Math.round(vol)}kg`],
                                ["Séries", `${doneSets}/${totalPlanned}`],
                                ["Tempo", session.formatTime(session.elapsed)],
                              ] as const).map(([label, value]) => (
                                <div key={label} className="rounded-lg border border-border bg-card p-2 text-center">
                                  <p className="text-[10px] uppercase text-muted-foreground font-sans tracking-wide">{label}</p>
                                  <p className="text-sm font-mono-data font-semibold text-foreground">{value}</p>
                                </div>
                              ))}
                            </div>
                          );
                        })()}

                        <div className="flex items-center justify-between gap-2">
                          <h3 className="min-w-0 break-words text-lg font-semibold leading-snug text-foreground font-sans">{selectedWorkout.title}</h3>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button size="sm" variant="outline" onClick={() => setWarmupOpen(true)}>
                              <Flame className="h-3.5 w-3.5 mr-1" />
                              Aquecer
                            </Button>
                            <Button size="sm" onClick={() => saveCurrentLogs()} disabled={savingLogs}>
                              <Save className="h-3.5 w-3.5 mr-1" />
                              {savingLogs ? "Salvando..." : "Salvar"}
                            </Button>
                          </div>
                        </div>

                        {(() => {
                          const workoutId = selectedWorkout.id;
                          const sessionDates = [...new Set(allLogs.filter(l => l.workout_id === workoutId).map(l => l.session_date))].sort();
                          const sessionCount = sessionDates.length;
                          const isNewSession = !sessionDates.includes(todayStr);
                          const totalSessions = isNewSession ? sessionCount + 1 : sessionCount;
                          return (
                            <div className="flex items-center gap-3 flex-wrap">
                              <Badge variant="outline" className="gap-1.5 text-xs font-sans border-primary/30 text-primary">
                                <CalendarDays className="h-3 w-3" />
                                {format(new Date(), "dd/MM/yyyy")}
                              </Badge>
                              {sessionCount > 0 && (
                                <Badge variant="secondary" className="gap-1.5 text-xs font-sans">
                                  <History className="h-3 w-3" />
                                  {totalSessions}ª sessão
                                </Badge>
                              )}
                            </div>
                          );
                        })()}

                        <div className="space-y-2">
                          {groupWorkoutExercises(selectedWorkout.exercises).map((grp) => {
                            const cards = grp.items.map(({ ex, idx }) => (
                            <ExerciseCard
                              key={idx}
                              exercise={ex}
                              index={idx}
                              workoutId={selectedWorkout.id}
                              isExpanded={expandedExercise === idx}
                              onToggle={() => setExpandedExercise(expandedExercise === idx ? null : idx)}
                              onVideoPlay={() => openVideoForExercise(ex)}
                              logs={logs}
                              previousLogs={previousLogs}
                              onUpdateLog={updateLog}
                              exerciseHistory={getExerciseHistory(selectedWorkout.id, idx)}
                              isSessionActive={isSessionForCurrentWorkout}
                              activeRest={activeRest}
                              onSetComplete={startRest}
                              onRestComplete={clearRest}
                              totalSets={getTotalSets(idx)}
                              onAddSet={handleAddSet}
                              onRemoveSet={handleRemoveSet}
                            />
                            ));
                            if (grp.grouping) {
                              const meta = WORKOUT_METHODS[grp.method as MethodId];
                              const rounds = parseInt(String(grp.items[0]?.ex.sets ?? "")) || null;
                              const blockRest = grp.items[grp.items.length - 1]?.ex.rest;
                              const isCircuit = grp.method === "circuito";
                              return (
                                <div key={grp.key} className="space-y-2 rounded-2xl border-2 border-primary/50 bg-primary/5 p-2 shadow-sm">
                                  <div className="flex flex-wrap items-center gap-2 px-1 pt-1">
                                    <MethodBadge method={grp.method} tone="primary" />
                                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                      {isCircuit && rounds ? `×${rounds} voltas` : `${grp.items.length} exercícios em sequência`}
                                    </span>
                                    <span className="text-[11px] leading-tight text-muted-foreground">{meta?.hint}</span>
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

                        <Button className="w-full" onClick={() => saveCurrentLogs()} disabled={savingLogs}>
                          <Save className="h-4 w-4 mr-2" />
                          {savingLogs ? "Salvando..." : "Salvar Todas as Cargas"}
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  <Card className="bg-card border-border border-dashed">
                    <CardContent className="p-8 text-center">
                      <Clock className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-muted-foreground font-sans">Treino ainda não prescrito para este ciclo.</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}

        {/* STATS VIEW */}
        {activeView === "stats" && (
          <div className="space-y-4">
            <VolumeInsights allLogs={allLogs} cycles={cycles} studentId={studentId} />
            <StatsCharts allLogs={allLogs} cycles={cycles} todayStr={todayStr} />
            {studentId && totalSessions > 0 && (
              <div className="space-y-4">
                <AchievementsPanel studentId={studentId} />
                <MonthlyLeaderboard companyId={companyId} />
              </div>
            )}
          </div>
        )}

        {/* CALENDARIO VIEW */}
        {activeView === "calendario" && selectedCycle && (
          <StudentCalendar
            workouts={cycles.flatMap(c => c.workouts)}
            trainedDays={trainedDays}
            currentDayOfWeek={new Date().getDay()}
            onSelectWorkout={handleCalendarSelectWorkout}
            allLogs={allLogs}
            cycleStartDate={selectedCycle.start_date}
            cycleEndDate={selectedCycle.end_date}
            workoutSessions={workoutSessions}
            goals={studentGoals}
          />
        )}

        {/* HISTORICO VIEW */}
        {activeView === "historico" && (
          <StudentHistory
            allLogs={allLogs}
            workouts={cycles.flatMap(c => c.workouts.map(w => ({ id: w.id, title: w.title })))}
            sessions={workoutSessions}
          />
        )}

        {/* ATIVIDADES VIEW */}
        {activeView === "atividades" && studentId && companyId && (
          <ExternalActivitiesList studentId={studentId} companyId={companyId} />
        )}

        {/* AVISOS VIEW */}
        {activeView === "avisos" && studentId && companyId && (
          <AnnouncementsFeed studentId={studentId} companyId={companyId} />
        )}

        {/* MEDIDAS VIEW */}
        {activeView === "medidas" && studentId && companyId && (
          <BodyMeasurements
            studentId={studentId}
            companyId={companyId}
            gender={gender}
            onGenderChange={setGender}
          />
        )}
          </motion.div>
        </AnimatePresence>
        <PlatformAdSlot audience="student" placement="footer" companyId={companyId} className="mt-8" />
      </div>

      {/* Feedback pós-treino → WhatsApp do treinador */}
      <Dialog open={feedbackOpen} onOpenChange={(o) => { if (!o) setFeedbackOpen(false); }}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-primary">Como foi o treino?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Sua resposta fica registrada no painel da equipe e também vai para a conversa quando o WhatsApp estiver conectado.</p>
            <div className="flex gap-2">
              {[{ e: "😮‍💨", l: "Difícil" }, { e: "👍", l: "Bom" }, { e: "🔥", l: "Ótimo" }].map((o) => (
                <button
                  key={o.l} type="button" onClick={() => setFeedbackRating(o.l)}
                  className={cn(
                    "flex-1 rounded-lg border p-2 text-sm transition-colors",
                    feedbackRating === o.l ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  <span className="block text-xl">{o.e}</span>{o.l}
                </button>
              ))}
            </div>
            <Textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Conta pro seu treinador: dores, dificuldade, como se sentiu… (opcional)"
              className="min-h-[90px]"
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setFeedbackOpen(false)} disabled={sendingFeedback}>Pular</Button>
              <Button className="flex-1" onClick={sendWorkoutFeedback} disabled={sendingFeedback || (!feedbackRating && !feedbackText.trim())}>
                {sendingFeedback ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Video Modal */}
      <Dialog open={!!videoModal} onOpenChange={() => setVideoModal(null)}>
        <DialogContent className="bg-card border-border max-w-lg sm:max-w-2xl p-2 sm:p-4">
          <DialogHeader>
            <DialogTitle className="pr-8 text-left text-base leading-snug text-primary break-words">
              {videoModal?.title || "Demonstração do exercício"}
            </DialogTitle>
          </DialogHeader>
          {videoModal && (
            <div className="space-y-3">
              <div className="aspect-video w-full">
                {videoModal.type === "loading" ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-md bg-muted/40">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <p className="text-xs text-muted-foreground">Buscando demonstração no YouTube…</p>
                  </div>
                ) : videoModal.type === "path" ? (
                  <video src={videoModal.value} controls className="w-full h-full rounded-md" />
                ) : (
                  <iframe src={getEmbedUrl(videoModal.value)} title="Demonstração do exercício" className="w-full h-full rounded-md" allowFullScreen />
                )}
              </div>
              {videoModal.type === "url" && (
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <a href={videoModal.value} target="_blank" rel="noreferrer">
                    Abrir vídeo original
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Workout Summary Modal */}
      {session.summary && (
        <WorkoutSummary
          open={!!session.summary}
          onClose={session.clearSummary}
          durationSeconds={session.summary.durationSeconds}
          totalVolume={session.summary.totalVolume}
          totalSetsCompleted={session.summary.totalSetsCompleted}
          totalSetsPrescribed={session.summary.totalSetsPrescribed}
          exercises={session.summary.exercisesSummary}
          formatTime={session.formatTime}
          onFeedback={() => setFeedbackOpen(true)}
        />
      )}

    </div>
  );
}
