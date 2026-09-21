import { planAdvancedMethods, type MethodId } from "./advancedMethods.ts";
import { DELOAD_RULES } from "./methodology.ts";
import { normalizeText } from "./presets.ts";
import { resolveDurationWeeks, shouldHoldProgression } from "./progressionRules.ts";
import { resolveSequenceNumber } from "./longitudinalRules.ts";
import { deriveRestrictionRules, exerciseConflictsWithRestrictions } from "./restrictionRules.ts";
import { exerciseGroupFactors, getVolumeRangeForGroup } from "./volumeRules.ts";
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
  method_reason?: string | null;
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
  giantset: "Série gigante",
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

function resolveLevel(input: PrescriptionInput): "iniciante" | "intermediario" | "avancado" {
  const level = normalizeText(input.fitnessLevel);
  if (level.includes("avanc")) return "avancado";
  if (level.includes("inter")) return "intermediario";
  return "iniciante";
}

function weekRules(input: PrescriptionInput): WeekRule[] {
  const duration = resolveDurationWeeks(input);
  const deload = Boolean(input.deload);
  if (deload) {
    const tempos = ["3-1-1-0", "3-0-1-1", "3-0-1-0", "2-1-1-0", "2-0-1-0", "2-0-1-0"];
    return tempos.slice(0, duration).map((tempo_focus, index) => ({
      week: index + 1,
      block: "deload",
      stimulus: "Recuperação técnica e redução de fadiga",
      rir: DELOAD_RULES.rir,
      volume_percent: 50,
      tempo_focus,
      method_focus: index % 2 === 0 ? "Isometria técnica de baixa fadiga" : "Pico de contração controlado",
      instruction: `Mantenha execução confortável, RIR ${DELOAD_RULES.rir} e o volume reduzido; siga a sinalização W/Normal/F sem ampliar o número de séries.`,
    }));
  }

  const rules: WeekRule[] = [
    { week: 1, block: "base", stimulus: "Aprender o treino e calibrar cargas", rir: "3-4", volume_percent: 80, tempo_focus: "3-1-1-0", method_focus: "Método técnico de baixa fadiga", instruction: "Controle três segundos na descida, faça uma pausa curta e termine cada série com técnica limpa." },
    { week: 2, block: "base", stimulus: "Consolidar técnica e alcançar o topo das repetições", rir: "3-4", volume_percent: 90, tempo_focus: "3-0-1-1", method_focus: "Método técnico de baixa fadiga", instruction: "Mantenha a carga e tente avançar dentro da faixa de repetições sem perder a cadência." },
    { week: 3, block: "acumulacao", stimulus: "Aumentar volume útil com controle", rir: "2-3", volume_percent: 100, tempo_focus: "3-0-1-0", method_focus: "Métodos de tensão e agrupamento", instruction: "Progrida repetições e use o método sinalizado sem ultrapassar o volume planejado." },
    { week: 4, block: "acumulacao", stimulus: "Acumular repetições de qualidade", rir: "2-3", volume_percent: 105, tempo_focus: "2-1-1-0", method_focus: "Métodos de tensão e agrupamento", instruction: "Aplique o método sinalizado somente com execução estável." },
    { week: 5, block: "intensificacao", stimulus: "Elevar densidade sem sacrificar execução", rir: "2", volume_percent: 105, tempo_focus: "2-0-1-0", method_focus: "Agrupamento e intensidade controlada", instruction: "Execute os métodos sinalizados e preserve a técnica nas duas séries finais." },
    { week: 6, block: "intensificacao", stimulus: "Consolidar o bloco com intensidade controlada", rir: "2", volume_percent: 100, tempo_focus: "2-0-1-0", method_focus: "Variação final de método", instruction: "Consolide o bloco e registre o desempenho para orientar a renovação." },
  ];
  return rules.slice(0, duration);
}

const LOW_VOLUME_PHASES = new Set(["mobilidade", "autoliberacao", "alongamento", "fisioterapia"]);

function allocateWeeklySets(exercises: TrainingExercise[], rule: WeekRule, input: PrescriptionInput): number[] {
  const base = exercises.map((exercise) => Math.max(1, Number(exercise.sets) || 1));
  if (input.deload) return base;
  const minimums = exercises.map((exercise) => {
    if (LOW_VOLUME_PHASES.has(exercise.phase)) return 1;
    if (exercise.phase === "ativacao_core") return Math.min(3, Math.max(1, Number(exercise.sets) || 1));
    return Math.min(2, Math.max(1, Number(exercise.sets) || 1));
  });
  const baseTotal = base.reduce((sum, sets) => sum + sets, 0);
  const minimumTotal = minimums.reduce((sum, sets) => sum + sets, 0);
  const targetTotal = Math.max(minimumTotal, Math.round(baseTotal * rule.volume_percent / 100));
  const sets = [...base];

  const reductionOrder = exercises.map((exercise, index) => ({ exercise, index }))
    .sort((left, right) => {
      const priority = (phase: string) => phase === "forca_especifica" ? 3 : phase === "forca_global" ? 2 : LOW_VOLUME_PHASES.has(phase) ? 1 : 0;
      return priority(right.exercise.phase) - priority(left.exercise.phase) || right.index - left.index;
    });
  while (sets.reduce((sum, value) => sum + value, 0) > targetTotal) {
    const candidate = reductionOrder.find(({ index }) => sets[index] > minimums[index]);
    if (!candidate) break;
    sets[candidate.index] -= 1;
  }

  const growthOrder = exercises.map((exercise, index) => ({ exercise, index }))
    .filter(({ exercise }) => exercise.phase === "forca_global" || exercise.phase === "forca_especifica")
    .map(({ index }) => index);
  let cursor = 0;
  while (growthOrder.length && sets.reduce((sum, value) => sum + value, 0) < targetTotal) {
    sets[growthOrder[cursor % growthOrder.length]] += 1;
    cursor += 1;
  }
  return sets;
}

function methodInstruction(method: MethodId | null | undefined, base: string): string {
  if (method === "biset" || method === "superset") return "Execute em sequência com o exercício que tem a mesma marcação; descanse somente depois do par.";
  if (method === "triset") return "Execute os três exercícios com a mesma marcação em sequência; descanse somente ao concluir a volta.";
  if (method === "giantset") return "Execute os quatro exercícios com a mesma marcação em sequência; descanse somente ao concluir a série gigante.";
  if (method === "circuito") return "Complete os exercícios com a mesma marcação em circuito técnico, sem pressa e sem chegar à falha.";
  if (method === "dropset") return "Na última série, reduza a carga uma vez e continue com boa técnica, sem descanso.";
  if (method === "restpause") return "Na última série, pause 20 segundos e complete um bloco curto de repetições com técnica limpa.";
  if (method === "cluster") return "Divida a série em blocos curtos, com 15 segundos entre eles; interrompa se a velocidade ou a técnica cair.";
  if (method === "isometria") return "Mantenha a posição indicada por 20 segundos, respirando e sem deixar a técnica se perder.";
  if (method === "pico_contracao") return "Segure por 2 segundos no ponto de maior contração em cada repetição, sem compensar.";
  if (method === "pico_alongamento") return "Segure por 2 segundos no ponto de maior alongamento tolerado, sem dor e sem perder tensão.";
  return base;
}

function hasRedFlags(input: PrescriptionInput) {
  const context = [input.restrictions, input.anamneseContext, input.assessmentContext, input.prescriptionIntegration];
  return /red flag|bandeira vermelha|desmaio|dor no peito|falta de ar|tontura|febre|perda de forca|formigamento progressivo/i
    .test(context.map((value) => typeof value === "string" ? value : JSON.stringify(value || {})).join(" "));
}

function hasHighFatigue(input: PrescriptionInput) {
  const readiness = normalizeText((input.prescriptionIntegration as { readiness?: { status?: unknown } } | null)?.readiness?.status);
  if (/baixa|low|cautela|bloque/.test(readiness)) return true;
  return /fadiga alta|fadiga extrema|exaust|sono ruim|recuperacao ruim|recuperação ruim|overreaching/i
    .test([input.restrictions, input.notes, input.anamneseContext, input.previousPerformanceContext]
      .map((value) => typeof value === "string" ? value : JSON.stringify(value || {})).join(" "));
}

function isFailureEligible(exercise: PlannedExercise, input: PrescriptionInput) {
  const name = normalizeText(exercise.exercise_name);
  return !exercise.painful
    && !LOW_VOLUME_PHASES.has(exercise.phase)
    && !/(agachamento livre|terra|levantamento|good morning|clean|snatch|thruster)/.test(name);
}

function buildSetTypes(
  exercise: PlannedExercise,
  sets: number,
  rule: WeekRule,
  input: PrescriptionInput,
): Array<"warmup" | "normal" | "failure"> {
  const types: Array<"warmup" | "normal" | "failure"> = Array.from(
    { length: Math.max(1, sets) },
    () => "normal",
  );
  if (PREPARATION_PHASES.has(exercise.phase)) return types;

  if (exercise.phase === "forca_global" && types.length > 1) types[0] = "warmup";
  return types;
}

function applySessionSetTypePolicy(exercises: PlannedExercise[], week: number, input: PrescriptionInput) {
  const prescriptions = exercises.map((exercise) => exercise.weekly_prescription?.find((item) => item.week === week));
  prescriptions.forEach((prescription) => {
    if (prescription) prescription.set_types = Array.from({ length: prescription.sets }, () => "normal");
  });
  const warmupIndex = exercises.findIndex((exercise) => exercise.phase === "forca_global") >= 0
    ? exercises.findIndex((exercise) => exercise.phase === "forca_global")
    : exercises.findIndex((exercise) => !LOW_VOLUME_PHASES.has(exercise.phase));
  if (warmupIndex >= 0 && prescriptions[warmupIndex]?.set_types?.length) {
    prescriptions[warmupIndex]!.set_types![0] = "warmup";
  }

  const failureCandidates = exercises.map((exercise, index) => ({ exercise, index }))
    .filter(({ exercise, index }) => isFailureEligible(exercise, input) && (prescriptions[index]?.sets || 0) >= 2);
  const failure = [...failureCandidates].reverse().find(({ index }) => index !== warmupIndex)
    || [...failureCandidates].reverse().find(({ index }) => index === warmupIndex && (prescriptions[index]?.sets || 0) >= 3);
  if (failure) {
    const types = prescriptions[failure.index]?.set_types;
    if (types) {
      for (let index = Math.max(0, types.length - 2); index < types.length; index += 1) types[index] = "failure";
    }
  }
}

function prescriptionForWeek(
  exercise: PlannedExercise,
  rule: WeekRule,
  input: PrescriptionInput,
  sets: number,
): WeeklyExercisePrescription {
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
    method_reason: exercise.method_reason ?? null,
    set_types: buildSetTypes(exercise, sets, rule, input),
    instruction: methodInstruction(exercise.method, rule.instruction),
  };
}

function enforceWeeklyPeriodizationCaps(
  workouts: Array<TrainingWorkout & { exercises: PlannedExercise[] }>,
  rules: WeekRule[],
  input: PrescriptionInput,
) {
  const reductionPriority = (phase: string) => phase === "forca_especifica" ? 3 : phase === "forca_global" ? 2 : 1;
  const exercises = workouts.flatMap((workout) => workout.exercises).map((exercise) => ({
    exercise,
    factors: exerciseGroupFactors(exercise),
  }));
  for (const rule of rules) {
    const candidates = exercises.map(({ exercise, factors }) => ({
      exercise,
      factors,
      prescription: exercise.weekly_prescription?.find((week) => week.week === rule.week),
    }));
    const counts = new Map<string, number>();
    let totalSets = 0;
    for (const candidate of candidates) {
      const sets = candidate.prescription?.sets || 0;
      totalSets += sets;
      for (const [group, factor] of candidate.factors) {
        counts.set(group, (counts.get(group) || 0) + sets * factor);
      }
    }

    for (let iteration = 0; iteration < totalSets; iteration += 1) {
      let over: { group: string; excess: number } | null = null;
      for (const [group, sets] of counts) {
        const excess = sets - getVolumeRangeForGroup(group, input.fitnessLevel, input).mrv;
        if (excess > 1e-9 && (!over || excess > over.excess)) over = { group, excess };
      }
      if (!over) break;

      let candidate: typeof candidates[number] | null = null;
      for (const current of candidates) {
        if ((current.factors.get(over.group) || 0) <= 0 || (current.prescription?.sets || 0) <= 1) continue;
        if (!candidate || reductionPriority(current.exercise.phase) > reductionPriority(candidate.exercise.phase) ||
          (reductionPriority(current.exercise.phase) === reductionPriority(candidate.exercise.phase) &&
            (current.prescription?.sets || 0) > (candidate.prescription?.sets || 0))) {
          candidate = current;
        }
      }
      if (!candidate?.prescription) break;
      candidate.prescription.sets -= 1;
      candidate.prescription.set_types = Array.from({ length: candidate.prescription.sets }, () => "normal");
      for (const [group, factor] of candidate.factors) {
        counts.set(group, Math.max(0, (counts.get(group) || 0) - factor));
      }
    }
  }
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
            mesocycle: rule.block === "deload" ? "base" : rule.block,
            level,
            microcycle: rule.block === "deload" ? "regenerativo" : rule.block === "intensificacao" ? "choque" : "ordinario",
            week: rule.week,
            hasPain: blocked,
            hasRedFlags: hasRedFlags(input),
            fatigueHigh: hasHighFatigue(input),
            isEnduranceAthlete: Boolean(input.isEnduranceAthlete || input.runningDaysContext),
            objective: String(input.objective || ""),
            sequenceNumber: resolveSequenceNumber(input),
            sessionIndex: workoutIndex + 1,
            equipment: String(input.equipment || ""),
            sessionKey: `w${workoutIndex + 1}`,
          });
      prescriptions.set(
        rule.week,
        planned,
      );
    }

    const setsByWeek = new Map(rules.map((rule) => [rule.week, allocateWeeklySets(methodReadyExercises, rule, input)]));
    const exercisesWithWeeks = workout.exercises.map((exercise, exerciseIndex) => {
      const weeklyPrescription = rules.map((rule) => {
        const planned = prescriptions.get(rule.week)?.[exerciseIndex] || methodReadyExercises[exerciseIndex];
        if (planned.method) methodSets.get(rule.week)?.add(planned.method);
        return prescriptionForWeek(planned, rule, input, setsByWeek.get(rule.week)?.[exerciseIndex] || 1);
      });
      return {
        ...exercise,
        method: null,
        group_id: null,
        method_seconds: null,
        set_types: weeklyPrescription[0]?.set_types || exercise.set_types,
        weekly_prescription: weeklyPrescription,
      } as PlannedExercise;
    });
    return {
      ...workout,
      exercises: exercisesWithWeeks,
    };
  });

  enforceWeeklyPeriodizationCaps(nextWorkouts, rules, input);
  for (const workout of nextWorkouts) {
    for (const rule of rules) applySessionSetTypePolicy(workout.exercises, rule.week, input);
    for (const exercise of workout.exercises) {
      exercise.set_types = exercise.weekly_prescription?.[0]?.set_types || exercise.set_types;
    }
  }

  const weeks = rules.map((rule) => ({
    ...rule,
    methods: [...(methodSets.get(rule.week) || new Set<string>())].map((method) => METHOD_LABELS[method] || method),
  }));
  return { workouts: nextWorkouts, weeks };
}
