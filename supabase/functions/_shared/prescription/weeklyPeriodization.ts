import { planAdvancedMethods, type MethodId } from "./advancedMethods.ts";
import { normalizeText } from "./presets.ts";
import { hasPainContext, resolveDurationWeeks, shouldHoldProgression } from "./progressionRules.ts";
import type {
  PrescriptionInput,
  TrainingExercise,
  TrainingWorkout,
  WeeklyExercisePrescription,
  WeeklyPeriodizationWeek,
} from "./types.ts";

type WeekRule = Omit<WeeklyPeriodizationWeek, "methods">;
type PlannedExercise = Omit<TrainingExercise, "method"> & {
  method?: MethodId | null;
  group_id?: string | null;
  method_seconds?: number | null;
};

const METHOD_IDS = new Set<MethodId>([
  "biset", "triset", "superset", "giantset", "circuito",
  "dropset", "restpause", "cluster", "isometria", "pico_contracao", "pico_alongamento",
]);

const METHOD_LABELS: Record<string, string> = {
  biset: "Bi-set",
  superset: "Super-set",
  triset: "Tri-set",
  giantset: "Giant-set",
  dropset: "Drop-set",
  restpause: "Rest-pause",
  cluster: "Cluster-set",
  isometria: "Isometria",
  pico_contracao: "Pico de contração",
  pico_alongamento: "Pico de alongamento",
};

function resolveLevel(input: PrescriptionInput): "iniciante" | "intermediario" | "avancado" {
  const level = normalizeText(input.fitnessLevel);
  if (level.includes("avanc")) return "avancado";
  if (level.includes("inter")) return "intermediario";
  return "iniciante";
}

function weekRules(input: PrescriptionInput): WeekRule[] {
  const duration = resolveDurationWeeks(input);
  const safeOnly = hasPainContext(input) || shouldHoldProgression(input) || Boolean(input.deload) || resolveLevel(input) === "iniciante";
  const finalMethod = safeOnly
    ? "Sem método avançado; evoluir somente com execução estável."
    : "Bi-set e técnica de intensidade em acessórios estáveis; nunca em padrão doloroso.";
  const rules: WeekRule[] = [
    { week: 1, block: "base", stimulus: "Aprender o treino e calibrar cargas", rir: input.deload ? "4-5" : "3-4", volume_percent: input.deload ? 50 : 80, tempo_focus: "3-1-1-0", method_focus: "Séries retas", instruction: "Controle três segundos na descida, faça uma pausa curta e termine cada série com técnica limpa." },
    { week: 2, block: "base", stimulus: "Consolidar técnica e alcançar o topo das repetições", rir: input.deload ? "4-5" : "3-4", volume_percent: input.deload ? 50 : 90, tempo_focus: "3-0-1-1", method_focus: "Séries retas", instruction: "Mantenha a carga e tente avançar dentro da faixa de repetições sem perder a cadência." },
    { week: 3, block: "acumulacao", stimulus: "Aumentar volume útil com controle", rir: safeOnly ? "3" : "2-3", volume_percent: input.deload ? 50 : 100, tempo_focus: "3-0-1-0", method_focus: safeOnly ? "Séries retas" : "Rest-pause em um acessório", instruction: safeOnly ? "Progrida repetições apenas se não houver dor ou quebra técnica." : "Nos acessórios marcados, use rest-pause somente na última série." },
    { week: 4, block: "acumulacao", stimulus: "Acumular repetições de qualidade", rir: safeOnly ? "3" : "2-3", volume_percent: input.deload ? 50 : 105, tempo_focus: "2-1-1-0", method_focus: safeOnly ? "Séries retas" : "Drop-set em um acessório", instruction: safeOnly ? "Mantenha o volume e refine a execução antes de subir carga." : "Nos acessórios marcados, faça um único drop apenas na última série." },
    { week: 5, block: "intensificacao", stimulus: "Elevar densidade sem sacrificar execução", rir: safeOnly ? "3" : "2", volume_percent: input.deload ? 50 : 105, tempo_focus: "2-0-1-0", method_focus: safeOnly ? "Séries retas" : "Bi-set seguro", instruction: safeOnly ? "Sem falha e sem técnicas avançadas; respeite o limite técnico do dia." : "Faça os exercícios com a mesma marcação de bi-set em sequência e descanse ao terminar o par." },
    { week: 6, block: "intensificacao", stimulus: "Consolidar o bloco com intensidade controlada", rir: safeOnly ? "3-4" : "2", volume_percent: input.deload ? 50 : 100, tempo_focus: "2-0-1-0", method_focus: finalMethod, instruction: safeOnly ? "Consolide o treino sem forçar progressão; o feedback desta semana orienta o próximo ciclo." : "A técnica marcada vale somente para o acessório indicado e para na primeira perda de execução." },
  ];
  return rules.slice(0, duration);
}

function adjustedSets(exercise: TrainingExercise, rule: WeekRule, input: PrescriptionInput): number {
  const base = Math.max(1, Number(exercise.sets) || 1);
  if (input.deload) return Math.max(1, Math.ceil(base * 0.5));
  if (rule.week === 1 && /forca_/.test(exercise.phase)) return Math.max(1, base - 1);
  return base;
}

function methodInstruction(method: MethodId | null | undefined, base: string): string {
  if (method === "biset" || method === "superset") return "Execute em sequência com o exercício que tem a mesma marcação; descanse somente depois do par.";
  if (method === "dropset") return "Na última série, reduza a carga uma vez e continue com boa técnica, sem descanso.";
  if (method === "restpause") return "Na última série, pause 20 segundos e complete um bloco curto de repetições com técnica limpa.";
  if (method === "cluster") return "Divida a série em blocos curtos, com 15 segundos entre eles; interrompa se a velocidade ou a técnica cair.";
  return base;
}

function prescriptionForWeek(
  exercise: PlannedExercise,
  rule: WeekRule,
  input: PrescriptionInput,
): WeeklyExercisePrescription {
  return {
    week: rule.week,
    block: rule.block,
    sets: adjustedSets(exercise, rule, input),
    reps: exercise.reps,
    rir: rule.rir,
    rest_seconds: rule.week >= 5 && exercise.method ? Math.max(45, exercise.rest_seconds - 15) : exercise.rest_seconds,
    tempo: rule.tempo_focus.replaceAll("-", ""),
    method: exercise.method ?? null,
    group_id: exercise.group_id ?? null,
    method_seconds: exercise.method_seconds ?? null,
    instruction: methodInstruction(exercise.method, rule.instruction),
  };
}

export function buildWeeklyPeriodization(
  workouts: TrainingWorkout[],
  input: PrescriptionInput,
): { workouts: TrainingWorkout[]; weeks: WeeklyPeriodizationWeek[] } {
  const rules = weekRules(input);
  const level = resolveLevel(input);
  const blocked = hasPainContext(input) || shouldHoldProgression(input) || Boolean(input.deload);
  const methodSets = new Map<number, Set<string>>(rules.map((rule) => [rule.week, new Set<string>()]));

  const nextWorkouts = workouts.map((workout, workoutIndex) => {
    const methodReadyExercises: PlannedExercise[] = workout.exercises.map((exercise) => ({
      ...exercise,
      method: exercise.method && METHOD_IDS.has(exercise.method as MethodId)
        ? exercise.method as MethodId
        : null,
    }));
    const prescriptions = new Map<number, PlannedExercise[]>();
    for (const rule of rules) {
      prescriptions.set(rule.week, planAdvancedMethods(methodReadyExercises, {
        mesocycle: rule.block,
        level,
        microcycle: rule.block === "intensificacao" ? "choque" : "ordinario",
        week: rule.week,
        hasPain: blocked,
        sessionKey: `w${workoutIndex + 1}`,
      }));
    }

    return {
      ...workout,
      exercises: workout.exercises.map((exercise, exerciseIndex) => ({
        ...exercise,
        method: null,
        group_id: null,
        method_seconds: null,
        weekly_prescription: rules.map((rule) => {
          const planned = prescriptions.get(rule.week)?.[exerciseIndex] || methodReadyExercises[exerciseIndex];
          if (planned.method) methodSets.get(rule.week)?.add(planned.method);
          return prescriptionForWeek(planned, rule, input);
        }),
      })),
    };
  });

  const weeks = rules.map((rule) => ({
    ...rule,
    methods: [...(methodSets.get(rule.week) || new Set<string>())].map((method) => METHOD_LABELS[method] || method),
  }));
  return { workouts: nextWorkouts, weeks };
}
