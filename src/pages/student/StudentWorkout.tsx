import { useEffect, useState } from "react";
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

interface WorkoutExercise {
  exercise_id: string;
  exercise_name: string;
  muscle_group: string;
  video_url: string | null;
  video_path: string | null;
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
  const [videoModal, setVideoModal] = useState<{ type: "path" | "url"; value: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedExercise, setExpandedExercise] = useState<number | null>(null);

  const selectedWorkout = selectedCycle?.workouts.find(w => w.id === selectedWorkoutId) || selectedCycle?.workouts[0] || null;

  useEffect(() => {
    if (studentId) loadData();
  }, [studentId]);

  const getStoragePublicUrl = (path: string) => {
    const { data } = supabase.storage.from("exercises-videos").getPublicUrl(path);
    return data.publicUrl;
  };

  const loadData = async () => {
    const { data: studentData } = await supabase
      .from("students")
      .select("full_name")
      .eq("id", studentId!)
      .single();

    const { data: enrollmentData } = await supabase
      .from("enrollments")
      .select("id, start_date, end_date, training_start_date, plan_id, plans(name)")
      .eq("student_id", studentId!)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

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
    }

    if (enrollmentData) {
      const { data: cyclesData } = await supabase
        .from("training_cycles")
        .select("id, cycle_number, start_date, end_date, status")
        .eq("enrollment_id", enrollmentData.id)
        .order("cycle_number");

      if (cyclesData && cyclesData.length > 0) {
        const { data: workoutsData } = await supabase
          .from("workouts")
          .select("id, title, description, exercises, cycle_id")
          .in("cycle_id", cyclesData.map((c) => c.id));

        // Collect exercise_ids for video enrichment
        const exerciseIds = new Set<string>();
        (workoutsData || []).forEach(w => {
          const exs = (w.exercises as unknown as WorkoutExercise[]) || [];
          exs.forEach(ex => { if (ex.exercise_id) exerciseIds.add(ex.exercise_id); });
        });

        // Fetch video data from exercise library
        let videoMap: Record<string, { video_url: string | null; video_path: string | null }> = {};
        if (exerciseIds.size > 0) {
          const { data: libraryData } = await supabase
            .from("exercise_library")
            .select("id, video_url, video_path")
            .in("id", Array.from(exerciseIds));
          if (libraryData) {
            libraryData.forEach(lib => {
              videoMap[lib.id] = { video_url: lib.video_url, video_path: lib.video_path };
            });
          }
        }

        const enriched: Cycle[] = cyclesData.map((c) => {
          const cycleWorkouts = (workoutsData || [])
            .filter((w) => w.cycle_id === c.id)
            .map((w) => ({
              id: w.id,
              title: w.title,
              description: w.description,
              exercises: ((w.exercises as unknown as WorkoutExercise[]) || []).map(ex => ({
                ...ex,
                video_url: (ex.video_url && ex.video_url.trim()) || videoMap[ex.exercise_id]?.video_url || null,
                video_path: (ex.video_path && ex.video_path.trim()) || videoMap[ex.exercise_id]?.video_path || null,
              })),
            }));
          return { ...c, workouts: cycleWorkouts };
        });
        setCycles(enriched);

        const today = new Date();
        const activeCycle = enriched.find((c) => {
          try {
            return isWithinInterval(today, { start: parseISO(c.start_date), end: parseISO(c.end_date) });
          } catch { return false; }
        });
        const chosen = activeCycle || enriched[0];
        setSelectedCycle(chosen);
        if (chosen.workouts.length > 0) setSelectedWorkoutId(chosen.workouts[0].id);
      }
    }
    setLoading(false);
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
    if (ex.video_path) setVideoModal({ type: "path", value: getStoragePublicUrl(ex.video_path) });
    else if (ex.video_url) setVideoModal({ type: "url", value: ex.video_url });
  };

  const hasVideo = (ex: WorkoutExercise) => !!(ex.video_path || ex.video_url);

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
        <p className="text-muted-foreground font-sans">Aluno não encontrado.</p>
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
            <h1 className="text-2xl sm:text-3xl text-primary font-bold tracking-tight" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
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
            {cycles.map((cycle) => {
              const isActive = selectedCycle?.id === cycle.id;
              const hasPrescription = cycle.workouts.length > 0;
              const isCurrent = (() => {
                try {
                  return isWithinInterval(new Date(), { start: parseISO(cycle.start_date), end: parseISO(cycle.end_date) });
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
                </button>
              );
            })}
            {cycles.length === 0 && (
              <p className="text-muted-foreground font-sans text-sm">Nenhum ciclo criado ainda.</p>
            )}
          </div>
        </div>

        {/* Selected Cycle Detail */}
        {selectedCycle && (
          <div className="space-y-4">
            <Card className="bg-card border-border">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-primary font-bold tracking-tight" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
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
                    {selectedWorkout.description && (
                      <p className="text-sm text-muted-foreground font-sans">{selectedWorkout.description}</p>
                    )}

                    <div className="space-y-2">
                      {selectedWorkout.exercises.map((ex, idx) => {
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
                                  <p className="font-sans font-medium text-foreground text-sm truncate">{ex.exercise_name}</p>
                                  <p className="text-xs text-muted-foreground font-sans">
                                    {ex.sets}×{ex.reps} · {ex.rest}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {hasVideo(ex) && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
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
                                        <span className="font-medium text-foreground">Obs:</span> {ex.notes}
                                      </p>
                                    </div>
                                  )}

                                  <Badge variant="outline" className="capitalize text-xs">{ex.muscle_group}</Badge>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
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
            <DialogTitle className="text-primary text-sm">DEMONSTRAÇÃO</DialogTitle>
          </DialogHeader>
          {videoModal && (
            <div className="aspect-video w-full">
              {videoModal.type === "path" ? (
                <video src={videoModal.value} controls className="w-full h-full rounded-md" />
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
    </div>
  );
}
