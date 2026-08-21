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
  set_types?: string[];
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
  set_types?: string[];
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

export interface WeeklyProgressionSummary {
  weeks: string;
  setsReps: string;
  tempo: string;
  rir: string;
  method: string | null;
  instruction: string;
}

const METHOD_LABELS: Record<string, string> = {
  biset: "Bi-set",
  superset: "Super-set",
  triset: "Tri-set",
  giantset: "Giant-set",
  circuito: "Circuito",
  dropset: "Drop-set",
  restpause: "Rest-pause",
  cluster: "Cluster-set",
  isometria: "Isometria",
  pico_contracao: "Pico de contração",
  pico_alongamento: "Pico de alongamento",
};

export function weeklyMethodLabel(method?: string | null, seconds?: number | null) {
  if (!method) return null;
  const label = METHOD_LABELS[method] || method.replaceAll("_", " ");
  return seconds ? `${label} (${seconds}s)` : label;
}

function compactPair(values: string[]) {
  const unique = [...new Set(values.filter(Boolean))];
  return unique.join(" → ");
}

export function summarizeExerciseWeeklyProgression(
  items?: StoredWeeklyExercisePrescription[] | null,
): WeeklyProgressionSummary[] {
  if (!items?.length) return [];
  const ordered = [...items].sort((a, b) => Number(a.week) - Number(b.week));
  const blocks: Array<[number, number]> = [[1, 2], [3, 4], [5, 6]];

  return blocks.flatMap(([start, end]) => {
    const period = ordered.filter((item) => item.week >= start && item.week <= end);
    if (!period.length) return [];
    const methods = [...new Set(period
      .map((item) => weeklyMethodLabel(item.method, item.method_seconds))
      .filter((method): method is string => Boolean(method)))];
    const instructions = period
      .filter((item) => item.method)
      .map((item) => item.instruction)
      .filter(Boolean);

    return [{
      weeks: `${start}-${Math.min(end, period.at(-1)?.week || end)}`,
      setsReps: compactPair(period.map((item) => `${item.sets}x${item.reps}`)),
      tempo: compactPair(period.map((item) => item.tempo)),
      rir: compactPair(period.map((item) => item.rir)),
      method: methods.length ? methods.join(" + ") : null,
      instruction: instructions.at(-1) || period.at(-1)?.instruction || "Siga os parâmetros do bloco.",
    }];
  });
}

export function formatBiweeklyProgressionForDisplay(
  items?: StoredWeeklyExercisePrescription[] | null,
): string[] {
  return summarizeExerciseWeeklyProgression(items).map((block) => {
    const method = block.method || "Séries retas";
    return `Semanas ${block.weeks}: ${block.setsReps} · Cadência ${block.tempo} · RIR ${block.rir} · ${method}. ${block.instruction}`;
  });
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
    set_types: Array.isArray(prescription.set_types) ? prescription.set_types : exercise.set_types,
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
