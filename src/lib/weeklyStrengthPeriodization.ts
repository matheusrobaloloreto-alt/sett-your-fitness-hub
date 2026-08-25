import {
  buildPeriodizationPlan,
  currentWeekIndex,
  MESOCYCLES,
  weeksBetweenDates,
} from "@/lib/periodization";
import { sanitizeSetTypes } from "@/lib/setTypes";

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
  method_reason?: string | null;
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
  method_reason?: string | null;
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

export interface StudentProgressionHighlight {
  source: "prescribed_week" | "periodization_fallback";
  eyebrow: string;
  title: string;
  body: string;
}

export interface StudentHomeWorkoutLike {
  id: string;
  title: string;
  day_of_week: number | null;
}

export interface StudentHomeWorkoutTarget<TWorkout extends StudentHomeWorkoutLike> {
  kind: "active" | "today" | "stale_active";
  workout: TWorkout | null;
}

export type ActiveWorkoutInCycles<TCycle, TWorkout> =
  | { kind: "none" }
  | { kind: "resolved"; cycle: TCycle; workout: TWorkout }
  | { kind: "stale"; workoutId: string };

export interface WeeklyProgressionSummary {
  weeks: string;
  setsReps: string;
  tempo: string;
  rir: string;
  method: string | null;
  methodReason: string | null;
  instruction: string;
}

const METHOD_LABELS: Record<string, string> = {
  biset: "Bi-set",
  superset: "Super-set",
  triset: "Tri-set",
  giantset: "Série gigante",
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

function blockLabel(block: string) {
  if (block === "acumulacao") return "acumulação";
  if (block === "intensificacao") return "intensificação";
  if (block === "base") return "base";
  return block.replaceAll("_", " ");
}

function biweeklyEyebrow(week: number, durationWeeks?: number | null) {
  const duration = Math.max(1, Math.round(Number(durationWeeks) || 6));
  const start = Math.floor((Math.max(1, week) - 1) / 2) * 2 + 1;
  const end = Math.min(duration, start + 1);
  return `Semanas ${start}-${end}`;
}

export const STUDENT_EFFORT_HELP_TEXT = "Quantas repetições você ainda conseguiria fazer mantendo a técnica.";

function studentEffortValue(rir?: string | null) {
  const withoutAcronym = String(rir || "")
    .replace(/\bRIR\b/gi, "")
    .replace(/[–—]/g, "-")
    .replace(/(\d)\s+a\s+(\d)/gi, "$1-$2")
    .trim();
  if (!/^\d+(?:\s*-\s*\d+)?(?:\s*→\s*\d+(?:\s*-\s*\d+)?)*$/.test(withoutAcronym)) return null;
  return withoutAcronym.replace(/\s*-\s*/g, "-").replace(/\s*→\s*/g, " → ");
}

function normalizedRirValue(rir?: string | null) {
  return studentEffortValue(rir)?.split(" → ")[0] ?? null;
}

export function studentEffortLabel(rir?: string | null, options: { compact?: boolean } = {}) {
  const value = studentEffortValue(rir);
  if (!value) return null;
  const label = options.compact ? "Repetições restantes" : "Repetições que ainda conseguiria fazer";
  return `${label}: ${value}`;
}

export function studentFacingEffortText(value?: string | null) {
  return String(value || "")
    .replace(
      /\bRIR\b\s*~?\s*(\d+(?:\s*(?:-|–|—|a)\s*\d+)?)/gi,
      (_, range: string) => `Repetições restantes: ${range.replace(/\s*(?:-|–|—|a)\s*/gi, "-")}`,
    )
    .replace(/\bRIR\b/gi, "repetições restantes");
}

export function studentEffortCue(rir?: string | null) {
  const normalized = normalizedRirValue(rir);
  return normalized ? `cerca de ${normalized} repetições ainda possíveis mantendo a técnica` : "esforço controlado conforme as séries do treino";
}

function studentRirText(rir?: string | null) {
  const normalized = normalizedRirValue(rir);
  if (!normalized) return "Mantenha esforço controlado conforme as séries do treino.";
  return `Termine as séries com ${studentEffortCue(rir)}.`;
}

function prescribedWeekOpening(block: string, hasMethods: boolean) {
  if (block === "intensificacao") return hasMethods ? "Esta quinzena fica mais intensa" : "Esta quinzena fica mais intensa com séries retas";
  if (block === "acumulacao") return hasMethods ? "Esta quinzena aumenta o volume" : "Esta quinzena aumenta o volume com séries retas";
  if (block === "base") return hasMethods ? "Esta quinzena constrói base técnica" : "Esta quinzena constrói base técnica com séries retas";
  return `Esta quinzena entra em ${blockLabel(block)}`;
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
    const methodReasons = [...new Set(period
      .map((item) => item.method_reason)
      .filter((reason): reason is string => Boolean(reason)))];

    return [{
      weeks: `${start}-${Math.min(end, period.at(-1)?.week || end)}`,
      setsReps: compactPair(period.map((item) => `${item.sets}x${item.reps}`)),
      tempo: compactPair(period.map((item) => item.tempo)),
      rir: compactPair(period.map((item) => item.rir)),
      method: methods.length ? methods.join(" + ") : null,
      methodReason: methodReasons.length ? methodReasons.join(" + ") : null,
      instruction: instructions.at(-1) || period.at(-1)?.instruction || "Siga os parâmetros do bloco.",
    }];
  });
}

export function formatBiweeklyProgressionForDisplay(
  items?: StoredWeeklyExercisePrescription[] | null,
): string[] {
  return summarizeExerciseWeeklyProgression(items).map((block) => {
    const method = block.method || "Séries retas";
    return `Semanas ${block.weeks}: ${block.setsReps} · Cadência ${block.tempo} · ${studentEffortLabel(block.rir, { compact: true }) || "Esforço controlado"} · ${method}. ${studentFacingEffortText(block.instruction)}`;
  });
}

export function studentPeriodizationFocus(focus: string) {
  const plainFocus = focus
    .replace(/\s*\(\s*RIR\s*[^)]*\)/gi, "")
    .replace(/\bRIR\b\s*~?\s*\d+(?:\s*-\s*\d+)?/gi, "")
    .replace(/\s+([;,.])/g, "$1")
    .replace(/;\s*;/g, ";")
    .trim();
  return studentFacingEffortText(plainFocus);
}

export function buildStudentProgressionHighlight({
  prescribedWeek,
  objective,
  durationWeeks,
  startDate,
  endDate,
  today = new Date(),
}: {
  prescribedWeek?: ResolvedWeekContext | null;
  objective?: string | null;
  durationWeeks?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  today?: Date;
}): StudentProgressionHighlight {
  const duration = durationWeeks || weeksBetweenDates(startDate, endDate) || 6;

  if (prescribedWeek) {
    const methods = prescribedWeek.methods
      .map((method) => weeklyMethodLabel(method))
      .filter((method): method is string => Boolean(method));
    const methodText = methods.length ? ` com ${methods.join(" + ")}` : "";
    return {
      source: "prescribed_week",
      eyebrow: biweeklyEyebrow(prescribedWeek.week, duration),
      title: "O que muda agora",
      body: `${prescribedWeekOpening(prescribedWeek.block, methods.length > 0)}${methodText}. ${studentRirText(prescribedWeek.rir)} ${studentFacingEffortText(prescribedWeek.instruction)}`,
    };
  }

  const plan = buildPeriodizationPlan(objective, duration);
  const weekIndex = currentWeekIndex(startDate, plan.durationWeeks, today);
  const week = plan.weeks[weekIndex] || plan.weeks[0];
  const mesoLabel = week ? blockLabel(week.mesocycle) : blockLabel("base");
  const mesoDescription = week?.mesocycle === "intensificacao"
    ? "mais intensidade e proximidade da falha, mantendo a execução controlada."
    : week ? MESOCYCLES[week.mesocycle].description.split("(")[0].trim() : "adaptação e técnica.";
  return {
    source: "periodization_fallback",
    eyebrow: biweeklyEyebrow((week?.week ?? 1), plan.durationWeeks),
    title: "O que muda agora",
    body: `Esta quinzena entra em ${mesoLabel}: ${mesoDescription.charAt(0).toLowerCase()}${mesoDescription.slice(1).replace(/\.$/, "")}. Sem técnica especial publicada para esta semana; siga as séries do treino.`,
  };
}

export function resolveStudentHomeWorkoutTarget<TWorkout extends StudentHomeWorkoutLike>(
  workouts: TWorkout[] | undefined | null,
  currentDayOfWeek: number,
  activeWorkoutId?: string | null,
): StudentHomeWorkoutTarget<TWorkout> | null {
  const activeWorkout = workouts?.find((w) => w.id === activeWorkoutId) ?? null;
  if (activeWorkout) return { kind: "active", workout: activeWorkout };
  if (activeWorkoutId) return { kind: "stale_active", workout: null };
  const todayWorkout = workouts?.find((w) => w.day_of_week === currentDayOfWeek) ?? null;
  if (todayWorkout) return { kind: "today", workout: todayWorkout };
  return null;
}

export function resolveActiveWorkoutInCycles<
  TWorkout extends { id: string },
  TCycle extends { workouts: TWorkout[] },
>(
  cycles: TCycle[] | undefined | null,
  activeWorkoutId?: string | null,
): ActiveWorkoutInCycles<TCycle, TWorkout> {
  if (!activeWorkoutId) return { kind: "none" };
  for (const cycle of cycles ?? []) {
    const workout = cycle.workouts.find((item) => item.id === activeWorkoutId);
    if (workout) return { kind: "resolved", cycle, workout };
  }
  return { kind: "stale", workoutId: activeWorkoutId };
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
    method_reason: prescription.method_reason ?? null,
    set_types: sanitizeSetTypes(prescription.set_types) ?? sanitizeSetTypes(exercise.set_types),
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
