// Agregações de volume de treino reutilizáveis (aluno e admin leem do mesmo jeito).
// Fonte: workout_logs (weight * reps_done = volume-load). O muscle_group vem dos ciclos
// (workout_id + exercise_index → exercise.muscle_group), igual ao StatsCharts.
import { differenceInCalendarDays, format, parseISO, startOfWeek, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { canonicalAnatomicalMuscleGroup } from "@/lib/anatomicalMuscleGroups";

export interface VolumeLogLike {
  completed?: boolean | null;
  weight?: number | string | null;
  reps_done?: number | string | null;
  session_date?: string | null;
  workout_id?: string;
  exercise_index?: number;
}

export interface ExerciseMeta {
  workoutId: string;
  index: number;
  exerciseId?: string;
  name: string;
  muscleGroup: string;
}

export interface CycleLike {
  workouts: { id: string; exercises: { exercise_id?: string; exerciseId?: string; exercise_name: string; muscle_group: string }[] }[];
}

export interface ExerciseMuscleTarget {
  exerciseId: string;
  muscleGroup: string;
  role?: string | null;
  isPrimary?: boolean | null;
  volumePercentage?: number | null;
}

export interface WeeklyVolumePoint {
  weekStart: string; // ISO date (segunda-feira)
  label: string;     // "dd/MM"
  volume: number;    // kg (volume-load)
  sessions: number;  // nº de dias treinados na semana
}

export interface MuscleSeriesPoint {
  group: string;
  sets: number;
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v)) || 0;

export function effectiveCoverageWindow(args: {
  today: string;
  requestedDays: number;
  cycleStart?: string | null;
  cycleEnd?: string | null;
}) {
  const today = parseISO(args.today);
  if (Number.isNaN(today.getTime())) throw new Error("Invalid coverage date");
  const requestedStart = subDays(today, Math.max(1, args.requestedDays) - 1);
  const parsedCycleStart = args.cycleStart ? parseISO(args.cycleStart) : null;
  const parsedCycleEnd = args.cycleEnd ? parseISO(args.cycleEnd) : null;
  const start = parsedCycleStart && !Number.isNaN(parsedCycleStart.getTime()) && parsedCycleStart > requestedStart
    ? parsedCycleStart
    : requestedStart;
  const end = parsedCycleEnd && !Number.isNaN(parsedCycleEnd.getTime()) && parsedCycleEnd < today
    ? parsedCycleEnd
    : today;
  const coveredDays = Math.max(1, differenceInCalendarDays(end, start) + 1);
  return {
    start: format(start, "yyyy-MM-dd"),
    end: format(end, "yyyy-MM-dd"),
    coveredDays,
    coveredWeeks: coveredDays / 7,
  };
}

/** Constrói o índice (workout_id, exercise_index) → metadados, a partir dos ciclos. */
export function buildExerciseMeta(cycles: CycleLike[] | undefined | null): ExerciseMeta[] {
  const meta: ExerciseMeta[] = [];
  (cycles ?? []).forEach((c) =>
    c.workouts?.forEach((w) =>
      (w.exercises ?? []).forEach((ex, idx) =>
        meta.push({
          workoutId: w.id,
          index: idx,
          exerciseId: ex.exercise_id || ex.exerciseId,
          name: ex.exercise_name,
          muscleGroup: ex.muscle_group,
        })
      )
    )
  );
  return meta;
}

/** Volume-load (kg) somado por semana ISO (segunda a domingo). */
export function volumeLoadByWeek(logs: VolumeLogLike[]): WeeklyVolumePoint[] {
  const byWeek: Record<string, { volume: number; days: Set<string> }> = {};
  for (const l of logs) {
    if (!l.session_date) continue;
    const d = parseISO(l.session_date);
    if (isNaN(d.getTime())) continue;
    const ws = format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const vol = num(l.weight) * num(l.reps_done);
    if (!byWeek[ws]) byWeek[ws] = { volume: 0, days: new Set() };
    byWeek[ws].volume += vol;
    byWeek[ws].days.add(l.session_date);
  }
  return Object.entries(byWeek)
    .map(([weekStart, v]) => ({
      weekStart,
      label: format(parseISO(weekStart), "dd/MM", { locale: ptBR }),
      volume: Math.round(v.volume),
      sessions: v.days.size,
    }))
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
}

/** Normaliza a escala histórica mista: 0..1 = fração; >1 = percentual. */
export function normalizeTargetWeight(target: Pick<ExerciseMuscleTarget, "role" | "isPrimary" | "volumePercentage">) {
  if (target.role && target.isPrimary !== null && target.isPrimary !== undefined) {
    const roleIsPrimary = target.role === "primary";
    if (roleIsPrimary !== target.isPrimary) {
      throw new TypeError("target role conflicts with isPrimary");
    }
  }
  const raw = target.volumePercentage;
  if (raw !== null && raw !== undefined) {
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > 100) {
      throw new RangeError("volumePercentage must be a finite number between 0 and 100");
    }
    return raw <= 1 ? raw : raw / 100;
  }
  if (target.role === "primary" || target.isPrimary === true) return 1;
  if (target.role === "secondary" || target.isPrimary === false) return 0.5;
  throw new TypeError("target role is required when volumePercentage is absent");
}

/**
 * Séries de trabalho concluídas, fracionadas pela exposição de cada alvo muscular.
 * Cada workout_log representa uma série; LOAD externo permanece uma métrica separada.
 */
export function fractionalSetsByMuscleGroup(
  logs: VolumeLogLike[],
  meta: ExerciseMeta[],
  targets: ExerciseMuscleTarget[] = [],
): MuscleSeriesPoint[] {
  const metaByLogKey = new Map(meta.map((item) => [`${item.workoutId}:${item.index}`, item]));
  const targetsByExercise = new Map<string, ExerciseMuscleTarget[]>();
  for (const target of targets) {
    const current = targetsByExercise.get(target.exerciseId) || [];
    current.push(target);
    targetsByExercise.set(target.exerciseId, current);
  }
  const sets: Record<string, number> = {};
  for (const log of logs) {
    const exercise = metaByLogKey.get(`${log.workout_id}:${log.exercise_index}`);
    if (!exercise) continue;
    const exerciseTargets = exercise.exerciseId ? targetsByExercise.get(exercise.exerciseId) : undefined;
    if (exerciseTargets?.length) {
      for (const target of exerciseTargets) {
        const group = canonicalAnatomicalMuscleGroup(target.muscleGroup);
        if (!group) continue;
        sets[group] = (sets[group] || 0) + normalizeTargetWeight(target);
      }
    } else {
      const group = canonicalAnatomicalMuscleGroup(exercise.muscleGroup);
      if (group) sets[group] = (sets[group] || 0) + 1;
    }
  }
  return Object.entries(sets)
    .map(([group, value]) => ({ group, sets: Math.round(value * 10) / 10 }))
    .sort((a, b) => b.sets - a.sets);
}
