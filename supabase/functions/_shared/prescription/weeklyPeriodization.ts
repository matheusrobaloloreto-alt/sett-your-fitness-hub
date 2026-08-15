import { planAdvancedMethods, type MethodId } from "./advancedMethods.ts";
import { DELOAD_RULES } from "./methodology.ts";
import { normalizeText } from "./presets.ts";
import { resolveDurationWeeks, shouldHoldProgression } from "./progressionRules.ts";
import { deriveRestrictionRules, exerciseConflictsWithRestrictions } from "./restrictionRules.ts";
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
  painful?: boolean;
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
  circuito: "Circuito técnico",
  dropset: "Drop-set",
  restpause: "Rest-pause",
  cluster: "Cluster-set",
  isometria: "Isometria",
  pico_contracao: "Pico de contração",
  pico_alongamento: "Pico de alongamento",
};

const PREPARATION_PHASES = new Set([
  "mobilidade",
  "autoliberacao",
  "alongamento",
  "fisioterapia",
  "controle_motor",
  "ativacao_core",
  "ativacao_especifica",
]);

// O bloco preparatório inteiro é técnico e de baixa fadiga. Agrupá-lo mantém
// mobilidade -> controle motor -> core -> ativação específica na ordem BN e
// evita que mobilidades/fisio virem exercícios soltos no treino do aluno.
const GROUPABLE_PREPARATION_PHASES = new Set([
  "mobilidade",
  "autoliberacao",
  "alongamento",
  "fisioterapia",
  "controle_motor",
  "ativacao_core",
  "ativacao_especifica",
]);

function resolveLevel(input: PrescriptionInput): "iniciante" | "intermediario" | "avancado" {
  const level = normalizeText(input.fitnessLevel);
  if (level.includes("avanc")) return "avancado";
  if (level.includes("inter")) return "intermediario";
  return "iniciante";
}

function weekRules(input: PrescriptionInput): WeekRule[] {
  const duration = resolveDurationWeeks(input);
  const deload = Boolean(input.deload);
  const safeOnly = shouldHoldProgression(input) || deload || resolveLevel(input) === "iniciante";
  const safeRir = (fallback: string) => deload ? DELOAD_RULES.rir : fallback;
  const finalMethod = safeOnly
    ? "Sem método avançado; evoluir somente com execução estável."
    : "Bi-set e técnica de intensidade em acessórios estáveis; nunca em padrão doloroso.";
  const rules: WeekRule[] = [
    { week: 1, block: "base", stimulus: "Aprender o treino e calibrar cargas", rir: safeRir("3-4"), volume_percent: deload ? 50 : 80, tempo_focus: "3-1-1-0", method_focus: "Séries retas", instruction: "Controle três segundos na descida, faça uma pausa curta e termine cada série com técnica limpa." },
    { week: 2, block: "base", stimulus: "Consolidar técnica e alcançar o topo das repetições", rir: safeRir("3-4"), volume_percent: deload ? 50 : 90, tempo_focus: "3-0-1-1", method_focus: "Séries retas", instruction: "Mantenha a carga e tente avançar dentro da faixa de repetições sem perder a cadência." },
    { week: 3, block: "acumulacao", stimulus: "Aumentar volume útil com controle", rir: safeRir(safeOnly ? "3" : "2-3"), volume_percent: deload ? 50 : 100, tempo_focus: "3-0-1-0", method_focus: safeOnly ? "Séries retas" : "Rest-pause em um acessório", instruction: safeOnly ? "Progrida repetições apenas se não houver dor ou quebra técnica." : "Nos acessórios marcados, use rest-pause somente na última série." },
    { week: 4, block: "acumulacao", stimulus: "Acumular repetições de qualidade", rir: safeRir(safeOnly ? "3" : "2-3"), volume_percent: deload ? 50 : 105, tempo_focus: "2-1-1-0", method_focus: safeOnly ? "Séries retas" : "Drop-set em um acessório", instruction: safeOnly ? "Mantenha o volume e refine a execução antes de subir carga." : "Nos acessórios marcados, faça um único drop apenas na última série." },
    { week: 5, block: "intensificacao", stimulus: "Elevar densidade sem sacrificar execução", rir: safeRir(safeOnly ? "3" : "2"), volume_percent: deload ? 50 : 105, tempo_focus: "2-0-1-0", method_focus: safeOnly ? "Séries retas" : "Bi-set seguro", instruction: safeOnly ? "Sem falha e sem técnicas avançadas; respeite o limite técnico do dia." : "Faça os exercícios com a mesma marcação de bi-set em sequência e descanse ao terminar o par." },
    { week: 6, block: "intensificacao", stimulus: "Consolidar o bloco com intensidade controlada", rir: safeRir(safeOnly ? "3-4" : "2"), volume_percent: deload ? 50 : 100, tempo_focus: "2-0-1-0", method_focus: finalMethod, instruction: safeOnly ? "Consolide o treino sem forçar progressão; o feedback desta semana orienta o próximo ciclo." : "A técnica marcada vale somente para o acessório indicado e para na primeira perda de execução." },
  ];
  return rules.slice(0, duration);
}

function adjustedSets(exercise: TrainingExercise, rule: WeekRule, input: PrescriptionInput): number {
  const base = Math.max(1, Number(exercise.sets) || 1);
  // O volume de deload já foi reduzido quando o exercício-base foi criado.
  // Reduzir novamente aqui faria o treino publicado cair para ~25% do volume normal.
  if (input.deload) return base;
  if (rule.week === 1 && /forca_/.test(exercise.phase)) return Math.max(1, base - 1);
  return base;
}

function methodInstruction(method: MethodId | null | undefined, base: string): string {
  if (method === "biset" || method === "superset") return "Execute em sequência com o exercício que tem a mesma marcação; descanse somente depois do par.";
  if (method === "triset") return "Execute os três exercícios com a mesma marcação em sequência; descanse somente ao concluir a volta.";
  if (method === "circuito") return "Complete os exercícios com a mesma marcação em circuito técnico, sem pressa e sem chegar à falha.";
  if (method === "dropset") return "Na última série, reduza a carga uma vez e continue com boa técnica, sem descanso.";
  if (method === "restpause") return "Na última série, pause 20 segundos e complete um bloco curto de repetições com técnica limpa.";
  if (method === "cluster") return "Divida a série em blocos curtos, com 15 segundos entre eles; interrompa se a velocidade ou a técnica cair.";
  return base;
}

function groupPreparationExercises(
  exercises: PlannedExercise[],
  sessionKey: string,
  week: number,
): PlannedExercise[] {
  const preparationIndexes = exercises
    .map((exercise, index) => GROUPABLE_PREPARATION_PHASES.has(exercise.phase) ? index : -1)
    .filter((index) => index >= 0);
  if (preparationIndexes.length < 2) return exercises;

  const method: MethodId = preparationIndexes.length >= 4
    ? "circuito"
    : preparationIndexes.length === 3
      ? "triset"
      : "biset";
  const grouped = new Set(preparationIndexes);
  const groupId = `preparo-${sessionKey}-s${week}`;
  return exercises.map((exercise, index) => grouped.has(index)
    ? { ...exercise, method, group_id: groupId, method_seconds: null }
    : exercise);
}

function buildSetTypes(
  exercise: PlannedExercise,
  sets: number,
  rule: WeekRule,
  input: PrescriptionInput,
): Array<"warmup" | "normal" | "failure" | "drop"> {
  const types: Array<"warmup" | "normal" | "failure" | "drop"> = Array.from(
    { length: Math.max(1, sets) },
    () => "normal",
  );
  if (PREPARATION_PHASES.has(exercise.phase)) return types;

  const safeOnly = shouldHoldProgression(input) || Boolean(input.deload) || resolveLevel(input) === "iniciante";
  if (exercise.phase === "forca_global" && types.length > 1) types[0] = "warmup";
  if (safeOnly) return types;

  if (exercise.method === "dropset") {
    types[types.length - 1] = "drop";
  } else if (exercise.method === "restpause") {
    types[types.length - 1] = "failure";
  } else if (rule.week >= 5 && exercise.phase === "forca_especifica") {
    types[types.length - 1] = "failure";
  }
  return types;
}

function prescriptionForWeek(
  exercise: PlannedExercise,
  rule: WeekRule,
  input: PrescriptionInput,
): WeeklyExercisePrescription {
  const sets = adjustedSets(exercise, rule, input);
  return {
    week: rule.week,
    block: rule.block,
    sets,
    reps: exercise.reps,
    rir: rule.rir,
    rest_seconds: rule.week >= 5 && exercise.method ? Math.max(45, exercise.rest_seconds - 15) : exercise.rest_seconds,
    tempo: rule.tempo_focus.replaceAll("-", ""),
    method: exercise.method ?? null,
    group_id: exercise.group_id ?? null,
    method_seconds: exercise.method_seconds ?? null,
    set_types: buildSetTypes(exercise, sets, rule, input),
    instruction: methodInstruction(exercise.method, rule.instruction),
  };
}

export function buildWeeklyPeriodization(
  workouts: TrainingWorkout[],
  input: PrescriptionInput,
): { workouts: TrainingWorkout[]; weeks: WeeklyPeriodizationWeek[] } {
  const rules = weekRules(input);
  const level = resolveLevel(input);
  const blocked = shouldHoldProgression(input) || Boolean(input.deload);
  const restrictions = deriveRestrictionRules(input);
  const methodSets = new Map<number, Set<string>>(rules.map((rule) => [rule.week, new Set<string>()]));

  const nextWorkouts = workouts.map((workout, workoutIndex) => {
    const methodReadyExercises: PlannedExercise[] = workout.exercises.map((exercise) => ({
      ...exercise,
      painful: exerciseConflictsWithRestrictions(exercise, restrictions),
      method: exercise.method && METHOD_IDS.has(exercise.method as MethodId)
        ? exercise.method as MethodId
        : null,
    }));
    const prescriptions = new Map<number, PlannedExercise[]>();
    for (const rule of rules) {
      const planned = planAdvancedMethods(methodReadyExercises, {
        mesocycle: rule.block,
        level,
        microcycle: rule.block === "intensificacao" ? "choque" : "ordinario",
        week: rule.week,
        hasPain: blocked,
        sessionKey: `w${workoutIndex + 1}`,
      });
      prescriptions.set(
        rule.week,
        input.deload ? planned : groupPreparationExercises(planned, `w${workoutIndex + 1}`, rule.week),
      );
    }

    return {
      ...workout,
      exercises: workout.exercises.map((exercise, exerciseIndex) => {
        const weeklyPrescription = rules.map((rule) => {
          const planned = prescriptions.get(rule.week)?.[exerciseIndex] || methodReadyExercises[exerciseIndex];
          if (planned.method) methodSets.get(rule.week)?.add(planned.method);
          return prescriptionForWeek(planned, rule, input);
        });
        return {
          ...exercise,
          method: null,
          group_id: null,
          method_seconds: null,
          set_types: weeklyPrescription[0]?.set_types || exercise.set_types,
          weekly_prescription: weeklyPrescription,
        };
      }),
    };
  });

  const weeks = rules.map((rule) => ({
    ...rule,
    methods: [...(methodSets.get(rule.week) || new Set<string>())].map((method) => METHOD_LABELS[method] || method),
  }));
  return { workouts: nextWorkouts, weeks };
}
