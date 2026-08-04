import { currentWeekIndex } from "@/lib/periodization";

export interface StoredWeeklyExercisePrescription {
  week: number;
  block: "base" | "acumulacao" | "intensificacao" | string;
  sets: number;
  reps: string;
  rir: string;
  rest_seconds: number;
  tempo: string;
  method?: string | null;
  group_id?: string | null;
  method_seconds?: number | null;
  instruction?: string;
}

export interface WeeklyAwareExercise {
  sets: string;
  reps: string;
  rest: string;
  notes: string;
  method?: string | null;
  group_id?: string | null;
  method_seconds?: number | null;
  weekly_prescription?: StoredWeeklyExercisePrescription[];
  tempo?: string | null;
  rir?: string | null;
  weekly_instruction?: string | null;
}

export interface ResolvedWeekContext {
  week: number;
  block: string;
  rir: string;
  tempo: string;
  methods: string[];
  instruction: string;
}

export function resolveExerciseForWeek<T extends WeeklyAwareExercise>(exercise: T, week: number): T {
  const prescription = exercise.weekly_prescription?.find((item) => Number(item.week) === week);
  if (!prescription) return exercise;
  return {
    ...exercise,
    sets: String(prescription.sets),
    reps: String(prescription.reps),
    rest: `${prescription.rest_seconds}s`,
    method: prescription.method ?? null,
    group_id: prescription.group_id ?? null,
    method_seconds: prescription.method_seconds ?? null,
    tempo: prescription.tempo || null,
    rir: prescription.rir || null,
    weekly_instruction: prescription.instruction || null,
  };
}

export function resolveWorkoutForCycleWeek<
  TExercise extends WeeklyAwareExercise,
  TWorkout extends { exercises: TExercise[] },
>(
  workout: TWorkout | null,
  startDate?: string | null,
  durationWeeks?: number | null,
  today: Date = new Date(),
): (TWorkout & { weekly_context?: ResolvedWeekContext }) | null {
  if (!workout) return null;
  const week = currentWeekIndex(startDate, durationWeeks || 6, today) + 1;
  const exercises = workout.exercises.map((exercise) => resolveExerciseForWeek(exercise, week));
  const active = exercises
    .map((exercise) => exercise.weekly_prescription?.find((item) => Number(item.week) === week))
    .filter((item): item is StoredWeeklyExercisePrescription => Boolean(item));
  if (active.length === 0) return workout;

  const methods = [...new Set(active.map((item) => item.method).filter((method): method is string => Boolean(method)))];
  const first = active[0];
  return {
    ...workout,
    exercises,
    weekly_context: {
      week,
      block: first.block,
      rir: first.rir,
      tempo: first.tempo,
      methods,
      instruction: first.instruction || "Siga os parâmetros da semana vigente.",
    },
  };
}
