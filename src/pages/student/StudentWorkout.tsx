import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Dumbbell, Play, Clock, RotateCcw, ChevronDown, ChevronUp, Timer, CheckCircle2, Circle, ExternalLink, Loader2 } from "lucide-react";
import { format, parseISO, differenceInDays, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { filterMaterializedWorkouts } from "@/lib/workoutPresence";
import { businessDateYmd } from "@/lib/businessDate";
import { MethodBadge } from "@/components/workout/MethodBadge";
import { StudentMethodGroup } from "@/components/student/StudentMethodGroup";
import { formatBiweeklyProgressionForDisplay, STUDENT_EFFORT_HELP_TEXT, studentEffortLabel, studentFacingEffortText, resolveWorkoutForCycleWeek, type StoredWeeklyExercisePrescription } from "@/lib/weeklyStrengthPeriodization";
import { groupWorkoutExercises, WORKOUT_METHODS, type MethodId } from "@/lib/workoutMethods";
import { sanitizeStudentWorkoutDescription } from "@/lib/studentWorkoutDescription";

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
  exercises: WorkoutExercise[];
}

interface Cycle {
  id: string;
  cycle_number: number;
  start_date: string;
  end_date: string;
  status: string;
  duration_weeks?: number | null;
  workouts: WorkoutData[];
}

interface StudentInfo {
  full_name: string;
  enrollment: {
    plan_name: string;
    start_date: string;
    end_date: string;
    training_start_date: string | null;
  } | null;
}

export default function StudentWorkout() {
  const { studentId } = useParams<{ studentId: string }>();
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<Cycle | null>(null);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [videoModal, setVideoModal] = useState<{ type: "path" | "url" | "loading"; value: string; title: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [workoutsLoading, setWorkoutsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [expandedExercise, setExpandedExercise] = useState<number | null>(null);
  const loadRevision = useRef(0);

  const selectedWorkoutBase = selectedCycle?.workouts.find(w => w.id === selectedWorkoutId) || selectedCycle?.workouts[0] || null;
  const selectedWorkout = useMemo(
    () => resolveWorkoutForCycleWeek(selectedWorkoutBase, selectedCycle?.start_date, selectedCycle?.duration_weeks),
    [selectedWorkoutBase, selectedCycle?.start_date, selectedCycle?.duration_weeks],
  );
  const selectedWorkoutDescription = useMemo(
    () => sanitizeStudentWorkoutDescription(selectedWorkout?.description),
    [selectedWorkout?.description],
  );

  useEffect(() => {
    if (studentId) loadData();
    return () => { loadRevision.current += 1; };
  }, [studentId]);

  const getStoragePublicUrl = (path: string) => {
    const { data } = supabase.storage.from("exercises-videos").getPublicUrl(path);
    return data.publicUrl;
  };

  const loadData = async () => {
    const revision = ++loadRevision.current;
    const isCurrentLoad = () => loadRevision.current === revision;
    setLoading(true);
    setWorkoutsLoading(true);
    setLoadError("");
    setStudent(null);
    setCycles([]);
    setSelectedCycle(null);
    setSelectedWorkoutId(null);
    setExpandedExercise(null);
    try {
    const studentRequest = supabase
      .from("students")
      .select("full_name")
      .eq("id", studentId!)
      .single();
    const enrollmentRequest = supabase
      .from("enrollments")
      .select("id, start_date, end_date, training_start_date, plan_id, status, plans(name)")
      .eq("student_id", studentId!)
      .order("created_at", { ascending: false })
      .limit(20);

    const [
      { data: studentData, error: studentError },
      { data: enrollmentRows, error: enrollmentError },
    ] = await Promise.all([studentRequest, enrollmentRequest]);
    if (!isCurrentLoad()) return;
    if (studentError) throw studentError;
    if (enrollmentError) throw enrollmentError;
    const enrollmentData =
      enrollmentRows?.find((enrollment) => enrollment.status === "active") ||
      enrollmentRows?.[0] ||
      null;

    if (studentData) {
      setStudent({
        full_name: studentData.full_name,
        enrollment: enrollmentData
          ? {
              plan_name: (enrollmentData.plans as any)?.name || "Plano",
              start_date: enrollmentData.start_date,
              end_date: enrollmentData.end_date,
              training_start_date: enrollmentData.training_start_date,
            }
          : null,
      });
      // Identity and plan are enough to render the page shell. Cycles and
      // workouts continue loading below instead of blocking the whole screen.
      setLoading(false);
    }

    if (enrollmentData) {
      const { data: cyclesData, error: cyclesError } = await supabase
        .from("training_cycles")
        .select("id, cycle_number, start_date, end_date, status, duration_weeks")
        .eq("enrollment_id", enrollmentData.id)
        .order("cycle_number");
      if (!isCurrentLoad()) return;
      if (cyclesError) throw cyclesError;

      if (cyclesData && cyclesData.length > 0) {
        const { data: workoutsData, error: workoutsError } = await supabase
          .from("workouts")
          .select("id, title, description, exercises, cycle_id")
          .in("cycle_id", cyclesData.map((c) => c.id));
        if (!isCurrentLoad()) return;
        if (workoutsError) throw workoutsError;

        const materializedWorkouts = filterMaterializedWorkouts(workoutsData || []);

        // Collect exercise_ids for video enrichment
        const exerciseIds = new Set<string>();
        materializedWorkouts.forEach(w => {
          const exs = (w.exercises as unknown as WorkoutExercise[]) || [];
          exs.forEach(ex => { if (ex.exercise_id) exerciseIds.add(ex.exercise_id); });
        });

        const enrichCyclesWithVideos = (
          sourceCycles: Cycle[],
          videoMap: Record<string, { video_url: string | null; video_path: string | null; youtube_video_id: string | null }>,
        ): Cycle[] => sourceCycles.map((cycle) => ({
          ...cycle,
          workouts: cycle.workouts.map((workout) => ({
            ...workout,
            exercises: workout.exercises.map((ex) => ({
              ...ex,
              video_url: (ex.video_url && ex.video_url.trim()) || videoMap[ex.exercise_id]?.video_url || null,
              video_path: (ex.video_path && ex.video_path.trim()) || videoMap[ex.exercise_id]?.video_path || null,
              youtube_video_id: ex.youtube_video_id || videoMap[ex.exercise_id]?.youtube_video_id || null,
            })),
          })),
        }));

        const enriched: Cycle[] = cyclesData.map((c) => {
          const cycleWorkouts = materializedWorkouts
            .filter((w) => w.cycle_id === c.id)
            .map((w) => ({
              id: w.id,
              title: w.title,
              description: w.description,
              exercises: (w.exercises as unknown as WorkoutExercise[]) || [],
            }));
          return { ...c, workouts: cycleWorkouts };
        });

        const today = new Date();
        const inRange = (cycle: Cycle) => {
          try {
            return isWithinInterval(today, { start: parseISO(cycle.start_date), end: parseISO(cycle.end_date) });
          } catch { return false; }
        };
        const todayYmd = businessDateYmd(today);
        const isFuture = (cycle: Cycle) => Boolean(cycle.start_date && cycle.start_date > todayYmd);
        const hasStarted = (cycle: Cycle) => !cycle.start_date || cycle.start_date <= todayYmd;

        const currentCandidates = enriched
          .filter((cycle) => inRange(cycle) && cycle.workouts.length > 0)
          .sort((left, right) =>
            Number(right.status === "active") - Number(left.status === "active") ||
            right.cycle_number - left.cycle_number ||
            (right.start_date || "").localeCompare(left.start_date || "")
          );
        const startedWithWorkout = enriched
          .filter((cycle) => hasStarted(cycle) && cycle.workouts.length > 0)
          .sort((left, right) =>
            (right.start_date || "").localeCompare(left.start_date || "") ||
            right.cycle_number - left.cycle_number
          );
        const currentWithoutWorkout = enriched
          .filter((cycle) => inRange(cycle))
          .sort((left, right) => left.cycle_number - right.cycle_number);

        const chosen =
          currentCandidates[0] ||
          startedWithWorkout[0] ||
          currentWithoutWorkout[0] ||
          null;

        const visibleCycles = enriched
          .filter((cycle) => {
            if (chosen?.id === cycle.id) return true;
            if (cycle.status === "completed") return true;
            if (isFuture(cycle)) return true;
            return false;
          })
          .map((cycle) => isFuture(cycle) ? { ...cycle, workouts: [] } : cycle)
          .sort((left, right) =>
            (left.start_date || "").localeCompare(right.start_date || "") ||
            left.cycle_number - right.cycle_number
        );

        setCycles(visibleCycles);
        const visibleChosen = visibleCycles.find((cycle) => cycle.id === chosen?.id) || visibleCycles[0] || null;
        setSelectedCycle(visibleChosen);
        if (visibleChosen?.workouts.length) setSelectedWorkoutId(visibleChosen.workouts[0].id);
        else setSelectedWorkoutId(null);
        setWorkoutsLoading(false);

        // The stored workout is complete enough to render immediately. Library
        // metadata only fills missing video fields and must not block the page.
        setLoading(false);
        if (exerciseIds.size > 0) {
          const { data: libraryData } = await supabase
            .from("exercise_library")
            .select("id, video_url, video_path, youtube_video_id, thumbnail_url")
            .in("id", Array.from(exerciseIds));
          if (!isCurrentLoad()) return;
          if (libraryData?.length) {
            const videoMap: Record<string, { video_url: string | null; video_path: string | null; youtube_video_id: string | null }> = {};
            libraryData.forEach((lib) => {
              videoMap[lib.id] = {
                video_url: lib.video_url,
                video_path: lib.video_path,
                youtube_video_id: lib.youtube_video_id ?? null,
              };
            });
            setCycles((current) => enrichCyclesWithVideos(current, videoMap));
            setSelectedCycle((current) => current ? enrichCyclesWithVideos([current], videoMap)[0] : current);
          }
        }
      } else {
        setWorkoutsLoading(false);
      }
    } else {
      setWorkoutsLoading(false);
    }
    } catch (error) {
      if (!isCurrentLoad()) return;
      console.error("student workout load failed", error);
      setLoadError("Não foi possível carregar os treinos. Atualize a página ou fale com seu treinador.");
      setWorkoutsLoading(false);
    } finally {
      if (isCurrentLoad()) setLoading(false);
    }
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

  const openVideoForExercise = async (ex: WorkoutExercise) => {
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
      const videoId = (data as { video_id?: string } | null)?.video_id;
      if (error || !videoId) throw error || new Error("Vídeo não encontrado");
      setVideoModal({ type: "url", value: `https://www.youtube.com/watch?v=${videoId}`, title: ex.exercise_name });
    } catch {
      setVideoModal(null);
      window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(`${ex.exercise_name} execução técnica`)}`, "_blank");
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground font-sans">{loadError || "Aluno não encontrado."}</p>
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
                  {isCurrent && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/50 text-primary">
                      Atual
                    </Badge>
                  )}
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
                {loadError || "Nenhum ciclo criado ainda."}
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
                              const biweeklyProgression = formatBiweeklyProgressionForDisplay(ex.weekly_prescription);
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

                                  {biweeklyProgression.length > 0 && (
                                    <div className="rounded-lg border border-border bg-card p-2">
                                      <p className="font-mono-data text-[10px] font-semibold uppercase text-muted-foreground">Progressão quinzenal</p>
                                      <div className="mt-1 space-y-1">
                                        {biweeklyProgression.map((line) => (
                                          <p key={line} className="text-[11px] leading-relaxed text-foreground">{line}</p>
                                        ))}
                                      </div>
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
            <div className="space-y-3">
              <div className="aspect-video w-full">
                {videoModal.type === "loading" ? (
                  <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
                    <Loader2 className="h-7 w-7 animate-spin text-primary" />
                    <p className="text-sm">Buscando demonstração de {videoModal.title}…</p>
                  </div>
                ) : videoModal.type === "path" ? (
                  <video src={videoModal.value} controls className="w-full h-full rounded-md" />
                ) : (
                  <iframe
                    src={getEmbedUrl(videoModal.value)}
                    title="Demonstração do exercício"
                    className="w-full h-full rounded-md"
                    allowFullScreen
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  />
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
    </div>
  );
}
