import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, AlertTriangle, CheckCircle, TrendingUp, Activity } from "lucide-react";
import { MuscleRadar } from "@/components/student/MuscleRadar";
import { BnitoContextButton } from "@/components/BnitoFloatingAssistant";
import { businessDateYmd } from "@/lib/businessDate";
import { filterMaterializedWorkouts } from "@/lib/workoutPresence";
import { effectiveCoverageWindow, normalizeTargetWeight } from "@/lib/volumeStats";
import { canonicalAnatomicalMuscleGroup } from "@/lib/anatomicalMuscleGroups";

interface Props {
  studentId: string;
}

interface MuscleGroupVolume {
  name: string;
  prescribedSets: number;
  executedSets: number;
}

interface SessionSummary {
  total: number;
  completed: number;
  abandoned: number;
  avgDuration: number;
  totalVolume: number;
}

export function WorkoutAnalysis({ studentId }: Props) {
  const [period, setPeriod] = useState("30");
  const [muscleData, setMuscleData] = useState<MuscleGroupVolume[]>([]);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary>({ total: 0, completed: 0, abandoned: 0, avgDuration: 0, totalVolume: 0 });
  const [coveredWeeks, setCoveredWeeks] = useState(1);
  const [loading, setLoading] = useState(true);

  const loadAnalysis = useCallback(async () => {
    setLoading(true);

    // Load all workouts for this student (via enrollments -> cycles -> workouts)
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("id")
      .eq("student_id", studentId);

    if (!enrollments || enrollments.length === 0) {
      setMuscleData([]);
      setLoading(false);
      return;
    }

    const enrollIds = enrollments.map(e => e.id);
    const today = businessDateYmd();
    const { data: cyclesData } = await supabase
      .from("training_cycles")
      .select("id, start_date, end_date, created_at")
      .in("enrollment_id", enrollIds)
      .eq("status", "active")
      .or(`start_date.is.null,start_date.lte.${today}`)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order("start_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1);

    if (!cyclesData || cyclesData.length === 0) {
      setMuscleData([]);
      setLoading(false);
      return;
    }

    const activeCycle = cyclesData[0];
    const coverage = effectiveCoverageWindow({
      today,
      requestedDays: parseInt(period),
      cycleStart: activeCycle.start_date,
      cycleEnd: activeCycle.end_date,
    });
    setCoveredWeeks(coverage.coveredWeeks);

    // Sessions and logs use the same effective cycle window.
    const { data: sessions } = await supabase
      .from("workout_sessions")
      .select("*")
      .eq("student_id", studentId)
      .gte("session_date", coverage.start)
      .lte("session_date", coverage.end);
    const allSessions = sessions || [];
    const completedSessions = allSessions.filter(s => s.status === "completed");
    const abandonedSessions = allSessions.filter(s => s.status === "abandoned");

    const cycleIds = cyclesData.map(c => c.id);
    const { data: workouts } = await supabase
      .from("workouts")
      .select("id, exercises")
      .in("cycle_id", cycleIds);

    const materializedWorkouts = filterMaterializedWorkouts(workouts || []);
    const workoutIds = materializedWorkouts.map(w => w.id);

    // Load workout logs for this period - use session_date for filtering
    const { data: logs } = await supabase
      .from("workout_logs")
      .select("workout_id, exercise_index, weight, reps_done, set_number, session_date, completed")
      .eq("student_id", studentId)
      .in("workout_id", workoutIds)
      .eq("completed", true)
      .gte("session_date", coverage.start)
      .lte("session_date", coverage.end);

    const filteredLogs = logs || [];

    // Get all exercise IDs from workouts — support both exercise_id and exerciseId
    const exerciseIds = new Set<string>();
    const prescribedByExercise: Record<string, number> = {};

    materializedWorkouts.forEach(w => {
      const exercises = (w.exercises as any[]) || [];
      exercises.forEach(ex => {
        const exId = ex.exercise_id || ex.exerciseId;
        if (exId) {
          exerciseIds.add(exId);
          const sets = parseInt(ex.sets) || 0;
          prescribedByExercise[exId] = (prescribedByExercise[exId] || 0) + sets;
        }
      });
    });

    // Map workout_id + exercise_index to exerciseId
    const workoutExerciseMap: Record<string, string> = {};
    materializedWorkouts.forEach(w => {
      const exercises = (w.exercises as any[]) || [];
      exercises.forEach((ex, idx) => {
        const exId = ex.exercise_id || ex.exerciseId;
        if (exId) {
          workoutExerciseMap[`${w.id}_${idx}`] = exId;
        }
      });
    });

    // Count executed sets and volume per exercise from logs
    const executedByExercise: Record<string, number> = {};
    const volumeByExercise: Record<string, number> = {};

    filteredLogs.forEach(log => {
      const key = `${log.workout_id}_${log.exercise_index}`;
      const exId = workoutExerciseMap[key];
      if (exId) {
        executedByExercise[exId] = (executedByExercise[exId] || 0) + 1;
        volumeByExercise[exId] = (volumeByExercise[exId] || 0) + (Number(log.weight) || 0) * (Number(log.reps_done) || 0);
      }
    });

    // Derive session summary from logs when no workout_sessions exist
    const totalVolumeFromLogs = Object.values(volumeByExercise).reduce((s, v) => s + v, 0);
    const uniqueSessionDates = new Set(filteredLogs.map(l => l.session_date).filter(Boolean));

    if (allSessions.length > 0) {
      const totalDuration = completedSessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
      const totalVolume = completedSessions.reduce((sum, s) => sum + Number(s.total_volume || 0), 0);
      setSessionSummary({
        total: allSessions.length,
        completed: completedSessions.length,
        abandoned: abandonedSessions.length,
        avgDuration: completedSessions.length > 0 ? Math.round(totalDuration / completedSessions.length) : 0,
        totalVolume,
      });
    } else {
      // Fallback: derive from workout_logs
      setSessionSummary({
        total: uniqueSessionDates.size,
        completed: uniqueSessionDates.size,
        abandoned: 0,
        avgDuration: 0,
        totalVolume: Math.round(totalVolumeFromLogs),
      });
    }

    if (exerciseIds.size === 0) {
      setMuscleData([]);
      setLoading(false);
      return;
    }

    const { data: targets, error: targetsError } = await (supabase as any).rpc("get_effective_exercise_targets", {
      p_student_id: studentId,
      p_exercise_ids: Array.from(exerciseIds),
    });
    if (targetsError || !targets?.length) {
      if (targetsError) console.error("effective exercise targets:", targetsError.message);
      setMuscleData([]);
      setLoading(false);
      return;
    }

    // Aggregate by muscle group
    const mgData: Record<string, MuscleGroupVolume> = {};

    (targets || []).forEach(t => {
      const mgName = canonicalAnatomicalMuscleGroup(t.muscle_group_name);
      if (!mgName) return;
      if (!mgData[mgName]) {
        mgData[mgName] = { name: mgName, prescribedSets: 0, executedSets: 0 };
      }
      const factor = normalizeTargetWeight({
        role: t.role,
        isPrimary: t.is_primary,
        volumePercentage: t.volume_percentage,
      });
      mgData[mgName].prescribedSets += (prescribedByExercise[t.exercise_id] || 0) * factor;
      mgData[mgName].executedSets += (executedByExercise[t.exercise_id] || 0) * factor;
    });

    setMuscleData(Object.values(mgData).sort((a, b) => b.prescribedSets - a.prescribedSets));
    setLoading(false);
  }, [period, studentId]);

  useEffect(() => {
    void loadAnalysis();
  }, [loadAnalysis]);

  const adherencePercent = sessionSummary.total > 0
    ? Math.round((sessionSummary.completed / sessionSummary.total) * 100)
    : 0;

  const formatDuration = (seconds: number) => {
    if (seconds === 0) return "—";
    const m = Math.floor(seconds / 60);
    return `${m}min`;
  };

  const getVolumeAlert = (mg: MuscleGroupVolume) => {
    const weeklyExecuted = coveredWeeks > 0 ? mg.executedSets / coveredWeeks : 0;
    if (weeklyExecuted < 10 && mg.prescribedSets > 0) return "sub";
    if (weeklyExecuted > 20) return "over";
    return "ok";
  };

  if (loading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-8 flex justify-center">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-primary text-lg flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          ANÁLISE DE TREINO
          <BnitoContextButton
            label="analise de treino"
            context={`Analise de treino por periodo de ${period} dias: aderencia, volume executado, grupos musculares e alertas de sub/over volume.`}
            question="Como devo interpretar esta analise e ajustar a prescricao?"
            className="ml-auto"
          />
        </CardTitle>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[140px] bg-secondary border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Última semana</SelectItem>
            <SelectItem value="14">Últimos 14 dias</SelectItem>
            <SelectItem value="30">Último mês</SelectItem>
            <SelectItem value="60">Últimos 2 meses</SelectItem>
            <SelectItem value="90">Últimos 3 meses</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-secondary/50 border border-border text-center">
            <p className="text-2xl font-bold text-foreground">{sessionSummary.completed}</p>
            <p className="text-xs text-muted-foreground font-sans">Sessões completas</p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50 border border-border text-center">
            <p className="text-2xl font-bold text-foreground">{adherencePercent}%</p>
            <p className="text-xs text-muted-foreground font-sans">Aderência</p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50 border border-border text-center">
            <p className="text-2xl font-bold text-foreground">{formatDuration(sessionSummary.avgDuration)}</p>
            <p className="text-xs text-muted-foreground font-sans">Duração média</p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50 border border-border text-center">
            <p className="text-2xl font-bold text-foreground">
              {sessionSummary.totalVolume >= 1000
                ? `${(sessionSummary.totalVolume / 1000).toFixed(1)}t`
                : `${sessionSummary.totalVolume}kg`}
            </p>
            <p className="text-xs text-muted-foreground font-sans">Volume total</p>
          </div>
        </div>

        {/* Adherence bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm font-sans">
            <span className="text-muted-foreground">Aderência ao treino</span>
            <span className="text-foreground font-medium">{sessionSummary.completed}/{sessionSummary.total} sessões</span>
          </div>
          <Progress value={adherencePercent} className="h-2" />
          {sessionSummary.abandoned > 0 && (
            <p className="text-xs text-warning font-sans flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {sessionSummary.abandoned} sessão(ões) abandonada(s)
            </p>
          )}
        </div>

        {/* Muscle group BodyMap */}
        {muscleData.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-sm font-sans font-medium text-foreground flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Distribuição Muscular
            </h3>
            <div className="w-full">
              <MuscleRadar muscleVolumes={muscleData.map(mg => ({ muscleGroup: mg.name, volume: mg.executedSets }))} />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {muscleData.map((mg) => (
                <div key={mg.name} className="rounded-lg border border-border bg-secondary/30 p-3 text-xs font-sans">
                  <p className="font-medium text-foreground">{mg.name}</p>
                  <p className="text-muted-foreground">
                    {mg.prescribedSets.toFixed(1)} séries prescritas/sem · {(mg.executedSets / coveredWeeks).toFixed(1)} séries realizadas/sem
                  </p>
                </div>
              ))}
            </div>

            {/* Alerts */}
            {muscleData.some(mg => getVolumeAlert(mg) !== "ok") && (
              <div className="space-y-2 mt-3">
                {muscleData.filter(mg => getVolumeAlert(mg) === "sub").map(mg => (
                  <div key={mg.name} className="flex items-center gap-2 p-2 rounded-lg bg-warning/10 border border-warning/20 text-xs font-sans">
                    <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                    <span className="text-warning"><strong>{mg.name}</strong>: sub-treinado ({(mg.executedSets / coveredWeeks).toFixed(1)} séries/semana — recomendado ≥10)</span>
                  </div>
                ))}
                {muscleData.filter(mg => getVolumeAlert(mg) === "over").map(mg => (
                  <div key={mg.name} className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs font-sans">
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                    <span className="text-destructive"><strong>{mg.name}</strong>: volume excessivo ({(mg.executedSets / coveredWeeks).toFixed(1)} séries/semana — recomendado ≤20)</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground font-sans text-center py-4">
            Nenhum dado de treino encontrado para este período.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
