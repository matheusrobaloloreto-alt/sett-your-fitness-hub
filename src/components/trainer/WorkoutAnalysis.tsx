import { eachDayOfInterval, format, isValid, parseISO } from "date-fns";
import { useCallback, useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, AlertTriangle, Activity } from "lucide-react";
import { MuscleRadar } from "@/components/student/MuscleRadar";
import { BnitoContextButton } from "@/components/BnitoFloatingAssistant";
import { businessDateYmd } from "@/lib/businessDate";
import { resolveWorkoutForCycleWeek, type StoredWeeklyExercisePrescription } from "@/lib/weeklyStrengthPeriodization";
import { calculateWeeklyMuscleVolume } from "@/lib/workoutVolume";
import { selectPrescriptionEnrollment } from "@/lib/prescriptionSchedule";
import { filterMaterializedWorkouts } from "@/lib/workoutPresence";
import { canonicalAnatomicalMuscleGroup } from "@/lib/anatomicalMuscleGroups";
import { normalizeSearchText } from "@/lib/normalizeSearchText";
import type { ExerciseSummaryItem } from "@/hooks/useWorkoutSession";
import { foreignSnapshot as foreign, snapshotRecord as record, summarizeRealizedTraining } from "@/lib/realizedTraining";
import { loadStudentTrainingHistory } from "@/lib/studentTrainingHistory";
import { effectiveCoverageWindow } from "@/lib/volumeStats";

interface Props {
  studentId: string;
  companyId: string | null;
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
  totalVolume: number | null;
}

function formatPrescriptionDate(value: string | null): string {
  if (!value) return "não informada";
  const date = parseISO(value);
  return isValid(date) ? format(date, "dd/MM/yyyy") : "não informada";
}

type SnapshotSession = {
  status: string | null; workout_id: string | null; session_date: string | null;
  exercises_summary: unknown; total_sets_completed: number | null; total_sets_prescribed: number | null;
};
type PrescriptionContext = { volume: Record<string, number>; source: string; compatible: boolean; error: boolean };
const emptyPrescription = (): PrescriptionContext => ({ volume: {}, source: "Sem prescrição atual disponível.", compatible: false, error: false });
// The snapshot stores name/muscleGroup/sets, not exercise IDs or prescribed sets per exercise.
// Never use exercise_index to recover historical identity from a mutable current array.
function completeSnapshot(value: unknown, studentId: string, companyId: string): value is ExerciseSummaryItem[] {
  return Array.isArray(value) && value.length > 0 && value.every(item => {
    const row = record(item);
    return row && !foreign(row, studentId, companyId) && typeof row.name === "string" && row.name.trim() && canonicalAnatomicalMuscleGroup(row.muscleGroup)
      && Array.isArray(row.sets) && row.sets.every(set => {
        const entry = record(set);
        return entry && !foreign(entry, studentId, companyId) && typeof entry.weight === "number" && Number.isFinite(entry.weight) && entry.weight >= 0
          && typeof entry.reps === "number" && Number.isFinite(entry.reps) && entry.reps >= 0;
      });
  });
}

async function readPrescriptionContext(studentId: string, companyId: string, today: string,
  window: { start: string; end: string }, sessions: SnapshotSession[]): Promise<PrescriptionContext> {
  const enrollmentRead = await supabase.from("enrollments").select("id, student_id, company_id, status, start_date, end_date, training_start_date, created_at")
    .eq("student_id", studentId).eq("company_id", companyId);
  if (enrollmentRead.error || (enrollmentRead.data || []).some(row => row.student_id !== studentId || row.company_id !== companyId)) throw new Error("Enrollment scope unavailable");
  const enrollment = selectPrescriptionEnrollment(enrollmentRead.data || [], { today, expectedStudentId: studentId, expectedCompanyId: companyId });
  if (!enrollment) return emptyPrescription();
  const cycleRead = await supabase.from("training_cycles").select("id, cycle_number, duration_weeks, enrollment_id, student_id, company_id, status, start_date, end_date, superseded_by_cycle_id, prescription_cleared_at")
    .eq("enrollment_id", enrollment.id).eq("student_id", studentId).eq("company_id", companyId).eq("status", "active")
    .or(`start_date.is.null,start_date.lte.${today}`).or(`end_date.is.null,end_date.gte.${today}`)
    .order("start_date", { ascending: false }).limit(1);
  if (cycleRead.error || (cycleRead.data || []).some(row => row.enrollment_id !== enrollment.id || row.student_id !== studentId || row.company_id !== companyId)) throw new Error("Cycle scope unavailable");
  const cycle = (cycleRead.data || []).find(row => row.status === "active" && !row.superseded_by_cycle_id && !row.prescription_cleared_at
    && (!row.start_date || row.start_date <= today) && (!row.end_date || row.end_date >= today));
  if (!cycle) return emptyPrescription();
  const workoutRead = await supabase.from("workouts").select("id, cycle_id, company_id, exercises, updated_at, superseded_at")
    .eq("cycle_id", cycle.id).or(`company_id.eq.${companyId},company_id.is.null`).is("superseded_at", null);
  if (workoutRead.error || (workoutRead.data || []).some(row => row.cycle_id !== cycle.id || (row.company_id != null && row.company_id !== companyId))) throw new Error("Workout scope unavailable");
  const storedWorkouts = filterMaterializedWorkouts(workoutRead.data || []).filter(row => !row.superseded_at).map(workout => ({
    ...workout,
    exercises: (workout.exercises as unknown[]).map(value => {
      const exercise = record(value);
      if (!exercise || foreign(exercise, studentId, companyId)) throw new Error("Nested exercise scope unavailable");
      const weekly = exercise.weekly_prescription;
      if (weekly != null && (!Array.isArray(weekly) || weekly.some(value => {
        const entry = record(value);
        return !entry || foreign(entry, studentId, companyId) || !Number.isInteger(entry.week)
          || typeof entry.sets !== "number" || !Number.isFinite(entry.sets) || entry.sets < 0
          || typeof entry.reps !== "string" || typeof entry.block !== "string" || typeof entry.rir !== "string"
          || typeof entry.rest_seconds !== "number" || !Number.isFinite(entry.rest_seconds) || entry.rest_seconds < 0
          || typeof entry.tempo !== "string";
      }))) throw new Error("Weekly prescription unavailable");
      return { ...exercise, exercise_id: String(exercise.exercise_id || exercise.exerciseId || ""),
        exercise_name: typeof exercise.exercise_name === "string" ? exercise.exercise_name : "",
        muscle_group: typeof exercise.muscle_group === "string" ? exercise.muscle_group : "",
        sets: typeof exercise.sets === "string" || typeof exercise.sets === "number" ? String(exercise.sets) : "0",
        reps: typeof exercise.reps === "string" ? exercise.reps : "",
        rest: typeof exercise.rest === "string" ? exercise.rest : "",
        notes: typeof exercise.notes === "string" ? exercise.notes : "",
        weekly_prescription: weekly as StoredWeeklyExercisePrescription[] | undefined };
    }),
  }));
  if (!storedWorkouts.length) return emptyPrescription();
  const resolveOnDate = (date: string) => storedWorkouts.map(workout => resolveWorkoutForCycleWeek(
    workout, cycle.start_date, cycle.duration_weeks, parseISO(`${date}T12:00:00`),
  ) || workout);
  const workouts = resolveOnDate(today);
  const hasWeekly = storedWorkouts.some(workout => workout.exercises.some(exercise => exercise.weekly_prescription?.length));
  const prescriptionSignature = (resolved: typeof workouts) => JSON.stringify(resolved.map(workout => ({ id: workout.id, exercises: workout.exercises })));
  // A current-week denominator is not valid for a window containing different weekly metrics.
  const uniformWindow = !hasWeekly || Boolean(cycle.start_date && cycle.duration_weeks
    && eachDayOfInterval({ start: parseISO(window.start), end: parseISO(window.end) }).every(day =>
      prescriptionSignature(resolveOnDate(format(day, "yyyy-MM-dd"))) === prescriptionSignature(workouts)));
  const week = workouts.map(workout => record(record(workout)?.weekly_context)?.week)
    .find(value => typeof value === "number");
  const weekLabel = typeof week === "number" ? ` · semana ${week}` : hasWeekly ? " · parâmetros base (sem semana específica resolvida)" : "";
  const ids = [...new Set(workouts.flatMap(workout => workout.exercises.map(exercise => exercise.exercise_id)).filter(Boolean))];
  const targetsRead = ids.length ? await supabase.rpc("get_effective_exercise_targets", { p_student_id: studentId, p_exercise_ids: ids }) : { data: [], error: null };
  if (targetsRead.error) throw new Error("Targets unavailable");
  const targets = targetsRead.data || [];
  if (targets.some(target => !ids.includes(target.exercise_id) || foreign(target as unknown as Record<string, unknown>, studentId, companyId))) throw new Error("Target scope unavailable");
  const result = calculateWeeklyMuscleVolume({ workouts,
    targets: targets.map(target => ({ ...target, muscle_group_id: target.muscle_group_name })),
    muscleGroups: targets.map(target => ({ id: target.muscle_group_name, name: target.muscle_group_name })) });
  // Snapshot primary-group counts cannot be compared with fractional secondary-target counts.
  const singleGroupBasis = workouts.every(workout => workout.exercises.every(exercise => {
    const group = canonicalAnatomicalMuscleGroup(exercise.muscle_group);
    return group && Number.isInteger(Number.parseFloat(String(exercise.sets))) && Number.parseFloat(String(exercise.sets)) > 0 && targets.filter(target => target.exercise_id === exercise.exercise_id).every(target =>
      canonicalAnatomicalMuscleGroup(target.muscle_group_name) === group && (target.is_primary || target.role === "primary"));
  }));
  const primaryBasis = calculateWeeklyMuscleVolume({ workouts, targets: [], muscleGroups: [] }).volume;
  const sameUnits = Object.keys(primaryBasis).length === Object.keys(result.volume).length
    && Object.entries(primaryBasis).every(([group, sets]) => result.volume[group] === sets);
  const completed = sessions.filter(session => session.status === "completed");
  const compatible = completed.length > 0 && completed.length === sessions.length && !result.uncoveredExerciseIds.length && singleGroupBasis && sameUnits && uniformWindow
    && Boolean(cycle.start_date && cycle.start_date <= window.start && cycle.end_date && cycle.end_date >= window.end)
    && workouts.every(workout => workout.updated_at && workout.updated_at.slice(0, 10) < window.start)
    && completed.every(session => {
      const workout = session.session_date ? resolveOnDate(session.session_date).find(row => row.id === session.workout_id) : undefined;
      if (!workout || !session.session_date || session.session_date < window.start || session.session_date > window.end
        || !completeSnapshot(session.exercises_summary, studentId, companyId)) return false;
      const snapshot = session.exercises_summary;
      const signature = (name: string, group: string) => `${normalizeSearchText(name)}:${canonicalAnatomicalMuscleGroup(group)}`;
      const currentSignatures = workout.exercises.map(exercise => signature(exercise.exercise_name, exercise.muscle_group)).sort();
      const snapshotSignatures = snapshot.map(exercise => signature(exercise.name, exercise.muscleGroup)).sort();
      return JSON.stringify(currentSignatures) === JSON.stringify(snapshotSignatures)
        && session.total_sets_completed === snapshot.reduce((sum, exercise) => sum + exercise.sets.length, 0)
        && session.total_sets_prescribed === workout.exercises.reduce((sum, exercise) => sum + (Number.parseInt(String(exercise.sets)) || 3), 0);
    });
  return { volume: result.volume, source: `Ciclo ${cycle.cycle_number ?? "atual"}${weekLabel} · vigência ${formatPrescriptionDate(cycle.start_date)} a ${formatPrescriptionDate(cycle.end_date)} · uma passagem por treino/semana`, compatible, error: false };
}

export function WorkoutAnalysis({ studentId, companyId }: Props) {
  const requestRef = useRef(0);
  const [prescription, setPrescription] = useState<PrescriptionContext>(emptyPrescription);
  const [showAllVolumeAlerts, setShowAllVolumeAlerts] = useState(false);
  const [coverageNote, setCoverageNote] = useState("");
  const [legacyLogs, setLegacyLogs] = useState(0);
  const [readError, setReadError] = useState(false);
  const [period, setPeriod] = useState("30");
  const [muscleData, setMuscleData] = useState<MuscleGroupVolume[]>([]);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary>({ total: 0, completed: 0, abandoned: 0, avgDuration: 0, totalVolume: 0 });
  const [coveredWeeks, setCoveredWeeks] = useState(1);
  const [loading, setLoading] = useState(true);

  const loadAnalysis = useCallback(async () => {
    setLoading(true);

    const request = ++requestRef.current;
    setMuscleData([]);
    setSessionSummary({ total: 0, completed: 0, abandoned: 0, avgDuration: 0, totalVolume: 0 });
    setCoveredWeeks(1);
    setReadError(false);
    setLegacyLogs(0);
    setCoverageNote("");
    setPrescription(emptyPrescription());
    setShowAllVolumeAlerts(false);
    try {
      if (!companyId || !studentId) throw new Error("Missing analysis scope");
      const scope = await supabase.from("students").select("id, company_id")
        .eq("id", studentId).eq("company_id", companyId).maybeSingle();
      if (request !== requestRef.current) return;
      if (scope.error || scope.data?.id !== studentId || scope.data.company_id !== companyId) throw new Error("Analysis scope unavailable");
      const today = businessDateYmd();
      const coverage = effectiveCoverageWindow({ today, requestedDays: Number(period) });
      const history = await loadStudentTrainingHistory(supabase, studentId, { companyId, ...coverage });
      if (request !== requestRef.current) return;
      const realized = summarizeRealizedTraining({ ...history, studentId, companyId, ...coverage });
      const { sessions, completed } = realized;
      setCoveredWeeks(coverage.coveredWeeks);
      setSessionSummary({ total: sessions.length, completed: completed.length,
        abandoned: sessions.filter(session => session.status === "abandoned").length,
        avgDuration: completed.length ? Math.round(completed.reduce((sum, session) => sum + Number(session.duration_seconds || 0), 0) / completed.length) : 0,
        totalVolume: (realized.incompleteLoad || realized.overlappingLogs > 0) && !realized.knownDays ? null : realized.totalVolume });
      setLegacyLogs(realized.legacyLogs);
      setCoverageNote([
        realized.incompleteLoad && "Há registros sem carga ou repetições verificáveis.",
        realized.overlappingLogs > 0 && "Séries do mesmo treino e dia de uma sessão não são somadas separadamente.",
      ].filter(Boolean).join(" "));
      setMuscleData(realized.muscles.map(({ group: name, sets: executedSets }) => ({ name, executedSets, prescribedSets: 0 })));
      try {
        const current = await readPrescriptionContext(studentId, companyId, today, coverage, sessions);
        if (request !== requestRef.current) return;
        setPrescription({ ...current, compatible: current.compatible && !realized.incompleteMuscles && !realized.incompleteLoad });
        setMuscleData(existing => {
          const combined = new Map(existing.map(row => [row.name, row]));
          for (const [name, prescribedSets] of Object.entries(current.volume)) {
            combined.set(name, { name, prescribedSets, executedSets: combined.get(name)?.executedSets || 0 });
          }
          return [...combined.values()].sort((a, b) => b.prescribedSets - a.prescribedSets);
        });
      } catch {
        if (request === requestRef.current) setPrescription({ ...emptyPrescription(), error: true });
      }
      // exercise_index alone cannot identify the executed historical exercise.
      // Keep session evidence; distribution requires a verified execution snapshot.
    } catch {
      if (request === requestRef.current) {
        setReadError(true);
        setMuscleData([]);
        setLegacyLogs(0);
        setPrescription(emptyPrescription());
        setShowAllVolumeAlerts(false);
        setCoveredWeeks(1);
        setSessionSummary({ total: 0, completed: 0, abandoned: 0, avgDuration: 0, totalVolume: 0 });
      }
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [period, studentId, companyId]);

  useEffect(() => {
    void loadAnalysis();
    return () => { requestRef.current += 1; };
  }, [loadAnalysis]);

  const adherencePercent = sessionSummary.total > 0
    ? Math.round((sessionSummary.completed / sessionSummary.total) * 100)
    : 0;

  const volumeAlerts = prescription.compatible ? muscleData.filter(row =>
    (row.prescribedSets > 0 && row.executedSets / coveredWeeks < 10) || row.executedSets / coveredWeeks > 20) : [];
  const visibleVolumeAlerts = showAllVolumeAlerts ? volumeAlerts : volumeAlerts.slice(0, 2);
  const formatDuration = (seconds: number) => {
    if (seconds === 0) return "—";
    const m = Math.floor(seconds / 60);
    return `${m}min`;
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

  if (readError) return <Card><CardContent className="py-6 space-y-3">
    <p role="alert">Não foi possível carregar a análise de treino.</p>
    <Button variant="outline" onClick={() => void loadAnalysis()}>Tentar novamente</Button>
  </CardContent></Card>;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-primary text-lg flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          ANÁLISE DE TREINO
          <BnitoContextButton
            label="analise de treino"
            context={`Análise nos últimos ${period} dias: conclusão das sessões iniciadas e volume. Distribuição apenas dos snapshots históricos disponíveis, possivelmente parcial. Sem denominador para adesão à meta; não inferir sub ou sobretreino.`}
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
        <p className="text-xs text-muted-foreground">Janela: últimos {period} dias, incluindo hoje. Distribuição parcial por músculo principal, conforme o registro da sessão concluída. Adesão à meta não calculada.</p>
        {coverageNote && <p className="text-xs text-muted-foreground">{coverageNote}</p>}
        {legacyLogs > 0 && <p className="text-xs text-muted-foreground">{legacyLogs} registros de séries sem total de sessão aproveitável. A carga foi preservada sem inferir conclusão de sessão.</p>}
        <section aria-label="Prescrição atual e comparação" className="space-y-2 text-sm">
          <h3 className="font-medium">Volume prescrito semanal atual</h3>
          <p>{prescription.error ? "Prescrição atual indisponível: falha de leitura ou vínculo não confirmado." : prescription.source}</p>
          <p>{prescription.compatible ? "Comparação disponível: snapshots completos e compatíveis com a prescrição atual e a janela exibida." : "Comparação e alertas indisponíveis: histórico, snapshots incompletos, mudança de prescrição ou bases musculares diferentes não permitem comparação confiável."}</p>
        </section>
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-secondary/50 border border-border text-center">
            <p className="text-2xl font-bold text-foreground">{sessionSummary.completed}</p>
            <p className="text-xs text-muted-foreground font-sans">Sessões completas</p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50 border border-border text-center">
            <p className="text-2xl font-bold text-foreground">{sessionSummary.total ? `${adherencePercent}%` : "—"}</p>
            <p className="text-xs text-muted-foreground font-sans">Conclusão</p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50 border border-border text-center">
            <p className="text-2xl font-bold text-foreground">{formatDuration(sessionSummary.avgDuration)}</p>
            <p className="text-xs text-muted-foreground font-sans">Duração média</p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50 border border-border text-center">
            <p className="text-2xl font-bold text-foreground">
              {sessionSummary.totalVolume === null ? "—" : `${sessionSummary.totalVolume.toLocaleString("pt-BR")}kg`}
            </p>
            <p className="text-xs text-muted-foreground font-sans">Carga × repetições realizadas</p>
          </div>
        </div>

        {/* Adherence bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm font-sans">
            <span className="text-muted-foreground">Conclusão das sessões iniciadas</span>
            <span className="text-foreground font-medium">{sessionSummary.completed}/{sessionSummary.total} sessões</span>
          </div>
          <Progress value={adherencePercent} className="h-2" />
          {sessionSummary.abandoned > 0 && (
            <p className="text-xs text-warning font-sans flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {sessionSummary.abandoned} {sessionSummary.abandoned === 1 ? "sessão abandonada" : "sessões abandonadas"}
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
              <MuscleRadar muscleVolumes={muscleData.filter(row => row.executedSets > 0).map(mg => ({ muscleGroup: mg.name, volume: mg.executedSets }))} unit="sets" />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {muscleData.map((mg) => (
                <div key={mg.name} className="rounded-lg border border-border bg-secondary/30 p-3 text-xs font-sans">
                  <p className="font-medium text-foreground">{mg.name}</p>
                  <p className="text-muted-foreground">
                    {Object.prototype.hasOwnProperty.call(prescription.volume, mg.name) && <span>{mg.prescribedSets.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} séries prescritas/sem · prescrição atual<br /></span>}
                    {mg.executedSets > 0 || prescription.compatible ? <span>{(mg.executedSets / coveredWeeks).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} séries realizadas/sem · snapshot da sessão</span> : <span>Distribuição executada indisponível para este grupo.</span>}
                  </p>
                </div>
              ))}
            </div>

            {volumeAlerts.length > 0 && <div className="space-y-2">
              {visibleVolumeAlerts.map(row => <p key={row.name} className="text-xs text-warning">
                <strong>{row.name}</strong>: {row.executedSets / coveredWeeks < 10 ? "sub-treinado" : "volume excessivo"} ({(row.executedSets / coveredWeeks).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} séries/semana; referência de volume {row.executedSets / coveredWeeks < 10 ? "≥10" : "≤20"}). Indicador de volume, não diagnóstico clínico.
              </p>)}
              {volumeAlerts.length > 2 && <Button variant="ghost" size="sm" onClick={() => setShowAllVolumeAlerts(value => !value)}>{showAllVolumeAlerts ? "Ocultar alertas" : `Ver mais alertas (${volumeAlerts.length - visibleVolumeAlerts.length})`}</Button>}
            </div>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground font-sans text-center py-4">
            {readError ? "Não foi possível carregar a análise de treino." : "Sem dados para distribuição muscular neste período. Adesão à meta indisponível sem denominador confiável."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
