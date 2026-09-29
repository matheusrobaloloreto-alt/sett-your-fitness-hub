import type { WorkoutTemplateDraftExercise, WorkoutTemplateDraftWorkout } from "@/lib/workoutTemplateDraft";

export type HistoricalExercise = WorkoutTemplateDraftExercise & Record<string, unknown>;
export type HistoricalWorkout = Omit<WorkoutTemplateDraftWorkout, "exercises"> & { exercises: HistoricalExercise[] };

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function historicalText(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function readPlanVersionWorkouts(plan: unknown): {
  workouts: HistoricalWorkout[];
  error: string | null;
} {
  if (!record(plan) || !Array.isArray(plan.workouts)) {
    return { workouts: [], error: "Esta versão não contém um conjunto de treinos legível." };
  }
  if (plan.workouts.some((workout) => !record(workout) || !Array.isArray(workout.exercises)
    || workout.exercises.some((exercise) => !record(exercise)))) {
    return { workouts: [], error: "Esta versão contém dados de treino incompletos ou inválidos." };
  }
  // Consultar o histórico nunca normaliza nem migra uma prescrição antiga.
  return { workouts: JSON.parse(JSON.stringify(plan.workouts)) as HistoricalWorkout[], error: null };
}

export function historicalWeeks(workouts: HistoricalWorkout[]): number[] {
  return [...new Set(workouts.flatMap((workout) => workout.exercises.flatMap((exercise) => (
    Array.isArray(exercise.weekly_prescription)
      ? exercise.weekly_prescription.filter(record).map((week) => Number(week.week))
      : []
  ))).filter((week) => Number.isInteger(week) && week > 0))].sort((a, b) => a - b);
}

export function historicalExerciseMetrics(exercise: HistoricalExercise, week: number | null) {
  const weekly = Array.isArray(exercise.weekly_prescription) && week !== null
    ? exercise.weekly_prescription.filter(record).find((item) => Number(item.week) === week)
    : undefined;
  const metrics = weekly || exercise;
  const text = historicalText;
  const restSeconds = text(metrics.rest_seconds);
  const rest = restSeconds ? `${restSeconds}s` : text(metrics.rest);
  return {
    sets: text(metrics.sets),
    reps: text(metrics.reps),
    rest,
    tempo: text(metrics.tempo),
    rir: text(metrics.rir),
    method: text(metrics.method),
    methodSeconds: text(metrics.method_seconds),
    group: text(metrics.group_id),
    notes: text(weekly ? weekly.instruction : exercise.notes),
    baseNotes: weekly && text(exercise.notes) !== text(weekly.instruction) ? text(exercise.notes) : "",
    cues: text(exercise.notes).includes(text(exercise.cues) || text(exercise.biomechanical_note))
      ? "" : text(exercise.cues) || text(exercise.biomechanical_note),
    setTypes: Array.isArray(metrics.set_types) ? metrics.set_types.map(text) : [],
    missingWeek: week !== null && Array.isArray(exercise.weekly_prescription)
      && exercise.weekly_prescription.length > 0 && !weekly,
  };
}
