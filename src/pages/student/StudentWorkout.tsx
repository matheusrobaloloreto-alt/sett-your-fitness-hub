import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Dumbbell, Play, Clock, RotateCcw, ChevronDown, ChevronUp, Timer, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { format, parseISO, differenceInDays, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { filterMaterializedWorkouts, orderWorkoutsByPrescription } from "@/lib/workoutPresence";
import { businessDateYmd } from "@/lib/businessDate";
import { MethodBadge } from "@/components/workout/MethodBadge";
import { StudentMethodGroup } from "@/components/student/StudentMethodGroup";
import { ExerciseVideoPlayer } from "@/components/student/ExerciseVideoPlayer";
import { buildYouTubeSearchUrl, type ExerciseVideoModalState } from "@/lib/exerciseVideoPlayer";
import { STUDENT_EFFORT_HELP_TEXT, hasIndividualWeeklyPrescription, studentEffortLabel, studentFacingEffortText, resolveWorkoutForCycleWeek, type StoredWeeklyExercisePrescription } from "@/lib/weeklyStrengthPeriodization";
import { groupWorkoutExercises, WORKOUT_METHODS, type MethodId } from "@/lib/workoutMethods";
import { sanitizeStudentWorkoutDescription } from "@/lib/studentWorkoutDescription";
import { recordAppPerformanceSample } from "@/lib/appPerformanceTelemetry";
import { selectStudentPrescriptionEnrollment } from "@/lib/studentEnrollmentContinuity";
import { useAuth } from "@/hooks/useAuth";
import { useStudentPrescriptionPolicy } from "@/hooks/useStudentPrescriptionPolicy";
import { canAccessStudentWorkout } from "@/lib/studentAccess";
import { selectStudentDigitalContinuity, selectStudentWorkoutCycleWindow } from "@/lib/prescriptionSchedule";
import { currentWeekIndex } from "@/lib/periodization";
import { StudentWeekSelector } from "@/components/student/StudentWeekSelector";
import { toast } from "sonner";

interface WorkoutExercise {
  exercise_id: string;
  exercise_name: string;
  muscle_group: string;
  video_url: string | null;
  video_path: string | null;
  youtube_video_id?: string | null;
  method?: string | null;
  group_id?: string | null;
  method_seconds?: number | null;
  tempo?: string | null;
  rir?: string | null;
  weekly_instruction?: string | null;
  weekly_prescription?: StoredWeeklyExercisePrescription[];
  sets: string;
  reps: string;
  rest: string;
  notes: string;
}

interface WorkoutData {
  id: string;
  title: string;
  description: string | null;
  sort_order?: number | null;
  exercises: WorkoutExercise[];
}

interface Cycle {
  id: string;
  enrollment_id?: string | null;
  student_id?: string | null;
  company_id?: string | null;
  cycle_number: number;
  start_date: string;
  end_date: string;
  status: string;
  superseded_by_cycle_id?: string | null;
  duration_weeks?: number | null;
  delivery_status?: string | null;
  prescription_cleared_at?: string | null;
  workouts: WorkoutData[];
}

interface StudentInfo {
  full_name: string;
  company_id?: string | null;
  enrollment: {
    plan_name: string;
    start_date: string;
    end_date: string;
    training_start_date: string | null;
  } | null;
}

export default function StudentWorkout() {
  const { studentId } = useParams<{ studentId: string }>();
  const { user, role, companyId: authCompanyId, loading: authLoading } = useAuth();
  const actorId = user?.id;
  const scopeKey = `${actorId || ""}:${role || ""}:${authCompanyId || ""}:${studentId || ""}`;
  const scopeRef = useRef(scopeKey); scopeRef.current = scopeKey;
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [currentCycleId, setCurrentCycleId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [selectedCycleData, setSelectedCycle] = useState<Cycle | null>(null);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [selectedWeekStart, setSelectedWeekStart] = useState<number | null>(null);
  const [videoModal, setVideoModal] = useState<ExerciseVideoModalState | null>(null);
  const [loading, setLoading] = useState(true);
  const [workoutsLoading, setWorkoutsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [expandedExercise, setExpandedExercise] = useState<number | null>(null);
  const loadRevision = useRef(0);
  const performanceStartedAt = useRef(0);
  const performanceCompanyId = useRef<string | null>(null);
  const recordedPerformanceMetrics = useRef(new Set<"shell_ready" | "content_ready">());

  const todayStr = businessDateYmd();
  const sameScope = loadedScope === scopeKey && !authLoading;
  const prescriptionPolicy = useStudentPrescriptionPolicy(sameScope && actorId && studentId && student?.company_id
    ? { userId: actorId, studentId, companyId: student.company_id } : null);
  const needsKeep = (cycle: Cycle) => Boolean((cycle.end_date && cycle.end_date < todayStr)
    || (student?.enrollment?.end_date && student.enrollment.end_date < todayStr));
  const selectedCycle = sameScope && selectedCycleData
    && (historyOpen || !needsKeep(selectedCycleData) || prescriptionPolicy.allowContinuity) ? selectedCycleData : null;
  const selectedWorkoutBase = selectedCycle?.workouts.find(w => w.id === selectedWorkoutId) || selectedCycle?.workouts[0] || null;
  const currentCycleWeek = selectedCycle
    ? currentWeekIndex(selectedCycle.start_date, selectedCycle.duration_weeks || 6) + 1
    : 1;
  const effectiveWeekStart = selectedWeekStart && selectedWeekStart <= (selectedCycle?.duration_weeks || 6)
    ? selectedWeekStart
    : currentCycleWeek;
  const selectedWeek = effectiveWeekStart;
  const hasWeeklyPrescriptions = hasIndividualWeeklyPrescription(selectedWorkoutBase?.exercises);
  const selectedWorkout = useMemo(
    () => resolveWorkoutForCycleWeek(selectedWorkoutBase, selectedCycle?.start_date, selectedCycle?.duration_weeks, undefined, selectedWeek),
    [selectedWorkoutBase, selectedCycle?.start_date, selectedCycle?.duration_weeks, selectedWeek],
  );
  const selectedWorkoutDescription = useMemo(
    () => sanitizeStudentWorkoutDescription(selectedWorkout?.description),
    [selectedWorkout?.description],
  );


  const getStoragePublicUrl = (path: string) => {
    const { data } = supabase.storage.from("exercises-videos").getPublicUrl(path);
    return data.publicUrl;
  };

  const recordLoadPerformance = useCallback((metric: "shell_ready" | "content_ready") => {
    if (recordedPerformanceMetrics.current.has(metric)) return;
    recordedPerformanceMetrics.current.add(metric);
    void recordAppPerformanceSample({
      routeGroup: "student_workout",
      metric,
      durationMs: performance.now() - performanceStartedAt.current,
      companyId: performanceCompanyId.current,
    });
  }, []);

  const loadData = useCallback(async () => {
    const revision = ++loadRevision.current;
    const capturedScope = scopeKey;
    const isCurrentLoad = () => loadRevision.current === revision && scopeRef.current === capturedScope;
    performanceStartedAt.current = performance.now(); performanceCompanyId.current = null;
    recordedPerformanceMetrics.current.clear();
    setLoading(true); setWorkoutsLoading(true); setLoadError(""); setLoadedScope(null);
    setStudent(null); setCycles([]); setSelectedCycle(null); setCurrentCycleId(null);
    setSelectedWorkoutId(null); setSelectedWeekStart(null); setExpandedExercise(null); setHistoryOpen(false); setVideoModal(null);
    try {
      if (authLoading || !actorId || !role || !studentId || (!["master", "student"].includes(role) && !authCompanyId)) throw new Error("Missing actor scope");
      // Defense in depth only. The router's StudentWorkoutAccessGuard remains mandatory.
      let studentRequest = supabase.from("students").select("id, user_id, full_name, company_id, status").eq("id", studentId);
      if (role === "student") studentRequest = studentRequest.eq("user_id", actorId);
      if (role !== "master" && authCompanyId) studentRequest = studentRequest.eq("company_id", authCompanyId);
      const readEnrollments = (company: string) => supabase.from("enrollments")
        .select("id, student_id, company_id, start_date, end_date, training_start_date, plan_id, status, created_at, carried_over_cycle_id, plans(name, duration_days, duration_weeks, cycle_duration_days)", { count: "exact" })
        .eq("student_id", studentId).eq("company_id", company).order("created_at", { ascending: false }).limit(201);
      const canReadInParallel = role !== "master" && Boolean(authCompanyId);
      const [studentResult, parallelEnrollments] = await Promise.all([
        studentRequest.single(), canReadInParallel ? readEnrollments(authCompanyId!) : Promise.resolve(null),
      ]);
      if (!isCurrentLoad()) return;
      const studentData = studentResult.data;
      if (studentResult.error || !studentData || studentData.id !== studentId || !studentData.company_id
        || (role !== "master" && authCompanyId && studentData.company_id !== authCompanyId)
        || !canAccessStudentWorkout({ role, userId: actorId, companyId: authCompanyId, studentUserId: studentData.user_id,
          studentCompanyId: studentData.company_id, studentStatus: studentData.status })
        || (role === "student" && studentData.status === "archived")) throw new Error("Student scope not authorized");
      const targetCompany = studentData.company_id;
      const enrollmentResult = parallelEnrollments ?? await readEnrollments(targetCompany);
      if (!isCurrentLoad()) return;
      const rows = enrollmentResult.data || [];
      if (enrollmentResult.error || rows.length >= 201 || (!Number.isSafeInteger(enrollmentResult.count) || enrollmentResult.count !== rows.length)
        || rows.some(row => row.student_id !== studentId || row.company_id !== targetCompany)) throw new Error("Incomplete or foreign enrollment history");
      const today = businessDateYmd();
      const businessToday = new Date(`${today}T12:00:00`);
      // Student-facing pedagogical selection only; never changes commercial eligibility.
      const enrollment = selectStudentPrescriptionEnrollment(rows, { today, expectedStudentId: studentId, expectedCompanyId: targetCompany });
      const plan = rows.find(row => row.id === enrollment?.id)?.plans as { name?: string; duration_days?: number; duration_weeks?: number; cycle_duration_days?: number } | null;
      const planDurationDays = Math.max(1, Number(plan?.duration_days) || Number(plan?.duration_weeks) * 7 || 42);
      const cycleDurationDays = Math.max(1, Number(plan?.cycle_duration_days) || 42);
      performanceCompanyId.current = targetCompany;
      setStudent({ full_name: studentData.full_name, company_id: targetCompany,
        enrollment: enrollment ? { plan_name: plan?.name || "Plano", start_date: enrollment.start_date,
          end_date: enrollment.end_date, training_start_date: enrollment.training_start_date } : null });
      setLoadedScope(capturedScope); setLoading(false); recordLoadPerformance("shell_ready");
      if (!enrollment) { setWorkoutsLoading(false); recordLoadPerformance("content_ready"); return; }
      const cycleSelect = "id, enrollment_id, student_id, company_id, cycle_number, start_date, end_date, status, superseded_by_cycle_id, superseded_at, duration_weeks, delivery_status, prescription_cleared_at";
      const cycleResult = await supabase.from("training_cycles").select(cycleSelect, { count: "exact" })
        .eq("enrollment_id", enrollment.id).eq("student_id", studentId).eq("company_id", targetCompany).limit(501).order("cycle_number");
      if (!isCurrentLoad()) return;
      const cyclesData = cycleResult.data || [];
      if (cycleResult.error || cyclesData.length >= 501 || (!Number.isSafeInteger(cycleResult.count) || cycleResult.count !== cyclesData.length)
        || cyclesData.some(cycle => cycle.enrollment_id !== enrollment.id || cycle.student_id !== studentId || cycle.company_id !== targetCompany)) throw new Error("Incomplete or foreign cycle history");
      const carryId = enrollment.carried_over_cycle_id;
      const carriedResult = carryId ? await supabase.from("training_cycles").select(cycleSelect)
        .eq("id", carryId).eq("student_id", studentId).eq("company_id", targetCompany).maybeSingle() : { data: null, error: null };
      if (!isCurrentLoad()) return;
      const carried = carriedResult.data;
      if (carriedResult.error || (carried && (carried.id !== carryId || carried.student_id !== studentId || carried.company_id !== targetCompany))) throw new Error("Foreign carried prescription");
      const readable = [...cyclesData, ...(carried ? [carried] : [])].filter((cycle, index, all) =>
        ["active", "completed", "pending"].includes(cycle.status || "") && !cycle.superseded_at && !cycle.superseded_by_cycle_id
        && all.findIndex(item => item.id === cycle.id) === index);
      const readableIds = new Set(readable.filter(cycle => !cycle.prescription_cleared_at).map(cycle => cycle.id));
      const workoutResult = readableIds.size ? await supabase.from("workouts")
        .select("id, title, description, exercises, cycle_id, sort_order, company_id, superseded_at, superseded_by_revision_id, student_profile_archive_event_id", { count: "exact" })
        .or(`company_id.eq.${targetCompany},company_id.is.null`).is("superseded_at", null).is("superseded_by_revision_id", null)
        .is("student_profile_archive_event_id", null).limit(1001).in("cycle_id", [...readableIds]) : { data: [], error: null, count: 0 };
      if (!isCurrentLoad()) return;
      const workoutRows = workoutResult.data || [];
      if (workoutResult.error || workoutRows.length >= 1000 || (!Number.isSafeInteger(workoutResult.count) || workoutResult.count !== workoutRows.length)
        || workoutRows.some(row => !readableIds.has(row.cycle_id) || (row.company_id !== null && row.company_id !== targetCompany))) throw new Error("Incomplete or foreign workout history");
      const materialized = filterMaterializedWorkouts(workoutRows).filter(row => !row.superseded_at && !row.superseded_by_revision_id && !row.student_profile_archive_event_id);
      const withContent = new Set(materialized.map(row => row.cycle_id));
      const signaledCycles = cyclesData.map(cycle => ({ ...cycle, has_usable_workouts: !cycle.prescription_cleared_at && withContent.has(cycle.id), has_workouts: !cycle.prescription_cleared_at && withContent.has(cycle.id) }));
      const { cycles: operational, preferredCycle } = selectStudentWorkoutCycleWindow(signaledCycles, {
        enrollment, expectedStudentId: studentId, expectedCompanyId: targetCompany, planDurationDays, cycleDurationDays, today: businessToday,
        carriedOverCycle: carried ? { ...carried, has_usable_workouts: !carried.prescription_cleared_at && withContent.has(carried.id), has_workouts: !carried.prescription_cleared_at && withContent.has(carried.id) } : null,
      });
      const continuation = selectStudentDigitalContinuity(signaledCycles, { enrollment, expectedStudentId: studentId,
        expectedCompanyId: targetCompany, today: businessToday, allowExpiredEnrollment: true });
      const candidate = continuation ?? (preferredCycle && (!withContent.has(preferredCycle.id) || preferredCycle.id === carried?.id)
        ? preferredCycle : null);
      const available = [...operational, ...(continuation && !operational.some(cycle => cycle.id === continuation.id) ? [continuation] : [])];
      // Retain already-readable completed cycles for explicit consultation, never as an automatic fallback.
      const displayRows = [...available, ...readable.filter(cycle => cycle.status === "completed" && !cycle.prescription_cleared_at)]
        .filter((cycle, index, all) => all.findIndex(item => item.id === cycle.id) === index);
      const enriched: Cycle[] = displayRows.map(cycle => ({ ...cycle, workouts: cycle.prescription_cleared_at || cycle.start_date > today ? []
        : orderWorkoutsByPrescription(materialized.filter(row => row.cycle_id === cycle.id).map(row => ({ id: row.id, title: row.title,
          description: row.description, sort_order: row.sort_order, exercises: (row.exercises as unknown as WorkoutExercise[]) || [] }))) })) as Cycle[];
      const selected = enriched.find(cycle => cycle.id === candidate?.id) ?? null;
      setCycles(enriched.sort((a, b) => (a.start_date || "").localeCompare(b.start_date || "") || a.cycle_number - b.cycle_number));
      setCurrentCycleId(selected?.id || null); setSelectedCycle(selected); setSelectedWorkoutId(selected?.workouts[0]?.id || null);
      setWorkoutsLoading(false); recordLoadPerformance("content_ready");
      const exerciseIds = new Set(materialized.flatMap(row => ((row.exercises as unknown as WorkoutExercise[]) || []).map(exercise => exercise.exercise_id)).filter(Boolean));
      if (exerciseIds.size) {
        try {
          const { data: library } = await supabase.from("exercise_library").select("id, video_url, video_path, youtube_video_id, thumbnail_url").in("id", [...exerciseIds]);
          if (!isCurrentLoad()) return;
          const videos = new Map((library || []).filter(item => exerciseIds.has(item.id)).map(item => [item.id, item]));
          const enrich = (cycle: Cycle): Cycle => ({ ...cycle, workouts: cycle.workouts.map(workout => ({ ...workout, exercises: workout.exercises.map(exercise => ({ ...exercise,
            video_url: exercise.video_url?.trim() || videos.get(exercise.exercise_id)?.video_url || null,
            video_path: exercise.video_path?.trim() || videos.get(exercise.exercise_id)?.video_path || null,
            youtube_video_id: exercise.youtube_video_id || videos.get(exercise.exercise_id)?.youtube_video_id || null,
          })) })) });
          setCycles(current => current.map(enrich)); setSelectedCycle(current => current ? enrich(current) : null);
        } catch { /* Optional media metadata cannot revoke a verified prescription. */ }
      }
    } catch {
      if (!isCurrentLoad()) return;
      setStudent(null); setCycles([]); setSelectedCycle(null); setCurrentCycleId(null); setLoadedScope(capturedScope);
      setLoadError("Não foi possível carregar os treinos com segurança. Atualize a página ou fale com seu treinador.");
      setWorkoutsLoading(false);
    } finally { if (isCurrentLoad()) setLoading(false); }
  }, [actorId, role, authCompanyId, authLoading, studentId, scopeKey, recordLoadPerformance]);

  useEffect(() => {
    void loadData();
    return () => { loadRevision.current += 1; };
  }, [loadData]);

  const visibleMediaScope = selectedWorkout ? `${scopeKey}:${selectedCycle?.id}:${selectedWorkout.id}:${historyOpen}` : "";
  const mediaScopeRef = useRef(visibleMediaScope); mediaScopeRef.current = visibleMediaScope;
  useEffect(() => { setVideoModal(null); }, [visibleMediaScope]);

  const openVideoForExercise = async (ex: WorkoutExercise) => {
    const mediaScope = mediaScopeRef.current;
    if (!mediaScope) return;
    if (ex.video_path) { setVideoModal({ type: "path", value: getStoragePublicUrl(ex.video_path), title: ex.exercise_name }); return; }
    if (ex.video_url) { setVideoModal({ type: "url", value: ex.video_url, title: ex.exercise_name }); return; }
    if (ex.youtube_video_id) {
      setVideoModal({ type: "url", value: `https://www.youtube.com/watch?v=${ex.youtube_video_id}`, title: ex.exercise_name });
      return;
    }
    if (!ex.exercise_id) return;
    setVideoModal({ type: "loading", value: "", title: ex.exercise_name });
    try {
      const { data, error } = await supabase.functions.invoke("youtube-exercise-video", {
        body: { exercise_id: ex.exercise_id, name: ex.exercise_name },
      });
      if (mediaScopeRef.current !== mediaScope) return;
      const videoId = (data as { video_id?: string } | null)?.video_id;
      if (error || !videoId) throw error || new Error("Vídeo não encontrado");
      setVideoModal({ type: "url", value: `https://www.youtube.com/watch?v=${videoId}`, title: ex.exercise_name });
    } catch {
      if (mediaScopeRef.current !== mediaScope) return;
      setVideoModal({ type: "unavailable", value: buildYouTubeSearchUrl(ex.exercise_name), title: ex.exercise_name });
    }
  };

  const hasVideo = (ex: WorkoutExercise) => !!(ex.video_path || ex.video_url || ex.youtube_video_id || ex.exercise_id);

  const getCycleProgress = (cycle: Cycle) => {
    const today = new Date();
    const start = parseISO(cycle.start_date);
    const end = parseISO(cycle.end_date);
    const total = differenceInDays(end, start);
    const elapsed = differenceInDays(today, start);
    if (elapsed < 0) return 0;
    if (elapsed > total) return 100;
    return Math.round((elapsed / total) * 100);
  };

  const getOverallProgress = () => {
    if (!student?.enrollment) return 0;
    const today = new Date();
    const start = parseISO(student.enrollment.start_date);
    const end = parseISO(student.enrollment.end_date);
    const total = differenceInDays(end, start);
    const elapsed = differenceInDays(today, start);
    if (elapsed < 0) return 0;
    if (elapsed > total) return 100;
    return Math.round((elapsed / total) * 100);
  };

  const getWorkoutLabel = (index: number) => String.fromCharCode(65 + index);

  if (loading || authLoading || loadedScope !== scopeKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p role="alert" className="text-muted-foreground font-sans">{loadError || "Aluno não encontrado."}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 py-6 sm:px-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <Dumbbell className="h-6 w-6 text-primary" />
            <h1 className="text-xl sm:text-2xl text-primary font-mono-data font-semibold tracking-wide">
              MEU TREINO
            </h1>
          </div>
          <p className="text-foreground font-sans text-lg">{student.full_name}</p>
          {student.enrollment && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-sans">{student.enrollment.plan_name}</span>
                <span className="text-muted-foreground font-sans">
                  {format(parseISO(student.enrollment.start_date), "dd/MM/yy")} — {format(parseISO(student.enrollment.end_date), "dd/MM/yy")}
                </span>
              </div>
              <Progress value={getOverallProgress()} className="h-2" />
              <p className="text-xs text-muted-foreground font-sans text-right">{getOverallProgress()}% do plano concluído</p>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {!historyOpen && selectedCycleData && needsKeep(selectedCycleData) && !prescriptionPolicy.allowContinuity && (
          <div className="space-y-2" role={prescriptionPolicy.error ? "alert" : "status"}>
            <p>{prescriptionPolicy.loading ? "Confirmando a disponibilidade do treino…" : prescriptionPolicy.error ? "Não foi possível confirmar a disponibilidade do treino." : "Aguardando nova prescrição."}</p>
            {prescriptionPolicy.error && <Button variant="outline" onClick={() => void prescriptionPolicy.retry()}>Tentar novamente</Button>}
          </div>
        )}
        {cycles.some(cycle => cycle.workouts.length > 0) && <Button variant="outline" onClick={() => {
          const next = !historyOpen; setHistoryOpen(next);
          if (next && !selectedCycleData) { const historical = cycles.find(cycle => cycle.workouts.length > 0); setSelectedCycle(historical || null); setSelectedWorkoutId(historical?.workouts[0]?.id || null); }
          if (!next) { const current = cycles.find(cycle => cycle.id === currentCycleId); setSelectedCycle(current || null); setSelectedWorkoutId(current?.workouts[0]?.id || null); }
        }}>{historyOpen ? "Voltar à prescrição atual" : "Consultar histórico"}</Button>}
        {historyOpen && <p className="text-sm text-muted-foreground">Histórico — somente consulta. Não libera sessões nem altera matrícula, cargas ou prescrição.</p>}
        {!historyOpen && selectedCycle && needsKeep(selectedCycle) && prescriptionPolicy.allowContinuity && <p className="text-sm text-muted-foreground">Mantido até substituição. O período original permanece encerrado.</p>}
        {loadError && <p role="alert">{loadError}</p>}
        {/* Cycle Timeline */}
        <div>
          <h2 className="text-sm font-sans font-semibold text-muted-foreground uppercase tracking-wider mb-3">Ciclos de Treino</h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {workoutsLoading ? (
              <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground font-sans" role="status">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Carregando ciclos e treinos…
              </div>
            ) : cycles.map((cycle) => {
              const isActive = selectedCycle?.id === cycle.id;
              const hasPrescription = cycle.workouts.length > 0;
              const isFutureCycle = Boolean(cycle.start_date && cycle.start_date > businessDateYmd());
              const isCurrent = (() => {
                try {
                  return !isFutureCycle && cycle.status === "active" && isWithinInterval(new Date(), { start: parseISO(cycle.start_date), end: parseISO(cycle.end_date) });
                } catch { return false; }
              })();

              return (
                <button
                  key={cycle.id}
                  onClick={() => {
                    setHistoryOpen(needsKeep(cycle) && (cycle.id !== currentCycleId || !prescriptionPolicy.allowContinuity));
                    setSelectedCycle(cycle);
                    setSelectedWorkoutId(cycle.workouts[0]?.id || null);
                    setExpandedExercise(null);
                  }}
                  className={`flex-shrink-0 flex flex-col items-center gap-1 px-4 py-3 rounded-lg border transition-all font-sans ${
                    isActive
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40"
                  }`}
                >
                  <span className="text-xs font-medium">Ciclo {cycle.cycle_number}</span>
                  {hasPrescription ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground/40" />
                  )}
                  {isCurrent && !historyOpen && !needsKeep(cycle) && cycle.id === currentCycleId && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/50 text-primary">
                      Atual
                    </Badge>
                  )}
                  {needsKeep(cycle) && <span className="text-[10px] text-muted-foreground">Histórico</span>}
                  {!isCurrent && cycle.status === "completed" && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                      Concluído
                    </Badge>
                  )}
                  {!isCurrent && (cycle.status === "pending" || isFutureCycle) && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                      Próximo
                    </Badge>
                  )}
                </button>
              );
            })}
            {!workoutsLoading && cycles.length === 0 && (
              <p className="text-muted-foreground font-sans text-sm">
                {loadError || "Nenhuma prescrição atual disponível."}
              </p>
            )}
          </div>
        </div>

        {/* Selected Cycle Detail */}
        {selectedCycle && (
          <div className="space-y-4">
            <Card className="bg-card border-border">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-primary font-mono-data text-sm font-semibold uppercase tracking-[0.12em]">
                    CICLO {selectedCycle.cycle_number}
                  </h3>
                  <span className="text-xs text-muted-foreground font-sans">
                    {format(parseISO(selectedCycle.start_date), "dd/MM", { locale: ptBR })} — {format(parseISO(selectedCycle.end_date), "dd/MM", { locale: ptBR })}
                  </span>
                </div>
                <Progress value={getCycleProgress(selectedCycle)} className="h-1.5" />
                <p className="text-xs text-muted-foreground font-sans">{getCycleProgress(selectedCycle)}% do ciclo</p>
              </CardContent>
            </Card>

            {selectedCycle.workouts.length > 0 ? (
              <div className="space-y-3">
                {/* Workout tabs */}
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
                    {hasWeeklyPrescriptions && (
                      <Card className="bg-card border-border">
                        <CardContent className="flex min-w-0 items-center justify-between gap-3 p-3">
                          <StudentWeekSelector
                            currentWeek={currentCycleWeek}
                            durationWeeks={selectedCycle.duration_weeks}
                            selectedStartWeek={effectiveWeekStart}
                            hasWeeklyPrescriptions={hasWeeklyPrescriptions}
                            onChange={setSelectedWeekStart}
                            onBlocked={(message) => toast.error(message)}
                            className="w-full"
                          />
                        </CardContent>
                      </Card>
                    )}
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg text-foreground font-sans font-semibold">{selectedWorkout.title}</h3>
                      <Badge variant="secondary" className="font-sans">
                        {selectedWorkout.exercises.length} exercícios
                      </Badge>
                    </div>
                    {selectedWorkoutDescription && (
                      <p className="text-sm text-muted-foreground font-sans">{selectedWorkoutDescription}</p>
                    )}

                    <div className="space-y-3">
                      {(() => {
                        const workoutGroups = groupWorkoutExercises(selectedWorkout.exercises);
                        const firstGroupedKey = workoutGroups.find((group) => group.grouping)?.key;
                        let methodBlockNumber = 0;
                        return workoutGroups.map((group) => {
                          const cards = group.items.map(({ ex, idx }) => {
                              const isExpanded = expandedExercise === idx;
                              return (
                          <Card
                            key={idx}
                            className="bg-card border-border overflow-hidden cursor-pointer"
                            onClick={() => setExpandedExercise(isExpanded ? null : idx)}
                          >
                            <CardContent className="p-0">
                              <div className="flex items-center gap-3 p-3">
                                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary text-sm font-bold font-sans flex-shrink-0">
                                  {idx + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="break-words font-sans text-sm font-medium leading-snug text-foreground">{ex.exercise_name}</p>
                                  <p className="text-xs text-muted-foreground font-sans">
                                    {ex.sets}×{ex.reps} · {ex.rest}
                                  </p>
                                  {ex.method && <MethodBadge method={ex.method} seconds={ex.method_seconds} tone="amber" />}
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {hasVideo(ex) && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      aria-label={`Ver demonstração de ${ex.exercise_name}`}
                                      title={`Ver demonstração de ${ex.exercise_name}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openVideoForExercise(ex);
                                      }}
                                    >
                                      <Play className="h-4 w-4 text-primary" />
                                    </Button>
                                  )}
                                  {isExpanded ? (
                                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </div>
                              </div>

                              {isExpanded && (
                                <div className="border-t border-border px-3 py-3 bg-secondary/30 space-y-3">
                                  <div className="grid grid-cols-3 gap-3 text-center">
                                    <div className="space-y-0.5">
                                      <div className="flex items-center justify-center gap-1 text-primary">
                                        <RotateCcw className="h-3.5 w-3.5" />
                                        <span className="text-lg font-bold font-sans">{ex.sets}</span>
                                      </div>
                                      <p className="text-[10px] text-muted-foreground font-sans uppercase">Séries</p>
                                    </div>
                                    <div className="space-y-0.5">
                                      <div className="flex items-center justify-center gap-1 text-primary">
                                        <Dumbbell className="h-3.5 w-3.5" />
                                        <span className="text-lg font-bold font-sans">{ex.reps}</span>
                                      </div>
                                      <p className="text-[10px] text-muted-foreground font-sans uppercase">Repetições</p>
                                    </div>
                                    <div className="space-y-0.5">
                                      <div className="flex items-center justify-center gap-1 text-primary">
                                        <Timer className="h-3.5 w-3.5" />
                                        <span className="text-lg font-bold font-sans">{ex.rest}</span>
                                      </div>
                                      <p className="text-[10px] text-muted-foreground font-sans uppercase">Descanso</p>
                                    </div>
                                  </div>

                                  {ex.notes && (
                                    <div className="bg-card rounded-md p-2">
                                      <p className="text-xs text-muted-foreground font-sans whitespace-pre-wrap">
                                        <span className="font-medium text-foreground">Obs:</span> {studentFacingEffortText(ex.notes)}
                                      </p>
                                    </div>
                                  )}

                                  {(ex.tempo || ex.rir || ex.weekly_instruction) && (
                                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-2">
                                      <p className="font-mono-data text-[11px] font-semibold text-primary">
                                        {ex.tempo ? `Cadência ${ex.tempo.split("").join("-")}` : ""}{ex.tempo && ex.rir ? " · " : ""}{ex.rir ? studentEffortLabel(ex.rir) || "Esforço controlado" : ""}
                                      </p>
                                      {ex.rir && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{STUDENT_EFFORT_HELP_TEXT}</p>}
                                      {ex.weekly_instruction && <p className="mt-1 text-xs text-foreground">{studentFacingEffortText(ex.weekly_instruction)}</p>}
                                    </div>
                                  )}

                                  <Badge variant="outline" className="capitalize text-xs">{ex.muscle_group}</Badge>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                              );
                            });

                          if (group.grouping) {
                            methodBlockNumber += 1;
                            const rounds = parseInt(String(group.items[0]?.ex.sets ?? ""), 10) || null;
                            const blockRest = group.items[group.items.length - 1]?.ex.rest;
                            const isCircuit = group.method === "circuito";
                            const groupInstruction =
                              group.items.find(({ ex }) => ex.weekly_instruction?.trim())?.ex.weekly_instruction ||
                              WORKOUT_METHODS[group.method as MethodId]?.hint;

                            return (
                              <StudentMethodGroup
                                key={group.key}
                                blockName={`Bloco ${methodBlockNumber}`}
                                method={group.method}
                                instruction={groupInstruction}
                                summary={isCircuit && rounds ? `×${rounds} voltas` : `${group.items.length} exercícios em sequência`}
                                defaultOpen={group.key === firstGroupedKey}
                                footer={blockRest ? (
                                  <div className="flex items-center gap-1.5 px-1 pb-0.5 text-[11px] text-muted-foreground">
                                    <Clock className="h-3 w-3" /> Descanso ao fim do bloco:
                                    <span className="font-medium text-foreground">{blockRest}</span>
                                  </div>
                                ) : null}
                              >
                                {cards}
                              </StudentMethodGroup>
                            );
                          }

                          return <Fragment key={group.key}>{cards}</Fragment>;
                        });
                      })()}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Card className="bg-card border-border border-dashed">
                <CardContent className="p-8 text-center">
                  <Clock className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground font-sans">
                    Treino ainda não prescrito para este ciclo.
                  </p>
                  <p className="text-xs text-muted-foreground/60 font-sans mt-1">
                    Aguarde seu treinador montar a prescrição.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Video Modal */}
      <Dialog open={!!videoModal} onOpenChange={() => setVideoModal(null)}>
        <DialogContent className="bg-card border-border max-w-lg sm:max-w-2xl p-2 sm:p-4">
          <DialogHeader>
            <DialogTitle className="pr-8 text-left text-base leading-snug text-primary break-words">
              {videoModal?.title || "Demonstração do exercício"}
            </DialogTitle>
          </DialogHeader>
          {videoModal && (
            <ExerciseVideoPlayer video={videoModal} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
