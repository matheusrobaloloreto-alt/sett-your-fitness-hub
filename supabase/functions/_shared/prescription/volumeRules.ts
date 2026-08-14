import { normalizeText } from "./presets.ts";
import type {
  MethodologyPreset,
  PrescriptionInput,
  TrainingProgram,
  TrainingWorkout,
  VolumeReview,
} from "./types.ts";
import { LARGE_GROUPS, SMALL_GROUPS, VOLUME_RULES } from "./methodology.ts";
import { classifyPainSeverity } from "./restrictionRules.ts";
import { clinicalRiskText } from "./clinicalContext.ts";

/**
 * Normalizes the two historical scales found in exercise_muscle_targets:
 * 0..1 is a fraction and values above 1 are percentages (0..100).
 * Missing values preserve the documented primary/secondary defaults.
 */
export function targetVolumeFactor(
  target: { role?: string | null; volume_percentage?: number | null },
) {
  const raw = target.volume_percentage;
  if (raw !== null && raw !== undefined) {
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > 100) {
      throw new RangeError("volume_percentage must be a finite number between 0 and 100");
    }
    return raw <= 1 ? raw : raw / 100;
  }
  if (target.role === "primary") return 1;
  if (target.role === "secondary") return 0.5;
  throw new TypeError("target role is required when volume_percentage is absent");
}

export const IMPORTANT_GROUPS = ["quadriceps", "posterior", "gluteos", "costas", "peitoral", "core"];

export function normalizeMuscleGroup(group: unknown) {
  const text = normalizeText(group);
  if (/quad|coxa anterior/.test(text)) return "quadriceps";
  if (/posterior|isquio|hamstring/.test(text)) return "posterior";
  if (/glut/.test(text)) return "gluteos";
  if (/costas|dorsal|remada|lat/.test(text)) return "costas";
  if (/peit|chest|supino/.test(text)) return "peitoral";
  if (/core|abd|lombar/.test(text)) return "core";
  if (/ombro|delto/.test(text)) return "ombros";
  if (/panturr|calf/.test(text)) return "panturrilhas";
  return text || "geral";
}

export function isSmallGroup(group: unknown) {
  const normalized = normalizeMuscleGroup(group);
  return (SMALL_GROUPS as readonly string[]).includes(normalized);
}

export function isLargeGroup(group: unknown) {
  const normalized = normalizeMuscleGroup(group);
  return (LARGE_GROUPS as readonly string[]).includes(normalized);
}

function normalizedLevel(level: unknown): "iniciante" | "intermediario" | "avancado" {
  const text = normalizeText(level);
  if (text.includes("avanc")) return "avancado";
  if (text.includes("inter")) return "intermediario";
  return "iniciante";
}

// F2: redução por endurance só quando frequência >= 3x/semana e SÓ em MMII.
// Membros superiores (peito, costas, ombro, bíceps, tríceps, antebraço) não são reduzidos.
const MMII_GROUPS = ["quadriceps", "posterior", "gluteos", "panturrilhas", "adutores", "adductors"];

function enduranceDaysPerWeek(input?: PrescriptionInput) {
  if (!input) return 0;
  const fromContext = Number(input.runningDaysContext?.days_per_week);
  if (fromContext > 0) return fromContext;
  // Flag de endurance sem frequência: trata como 3 (conservador); o validador ainda
  // emite endurance_agenda_missing pedindo a agenda das sessões.
  return input.isEnduranceAthlete ? 3 : 0;
}

function enduranceFactorForGroup(group: unknown, input?: PrescriptionInput) {
  if (enduranceDaysPerWeek(input) < 3) return 1;
  return MMII_GROUPS.includes(normalizeMuscleGroup(group)) ? 0.75 : 1; // -25% (faixa 20-30%) só em MMII
}

function objectiveMultiplier(input: PrescriptionInput) {
  const text = `${normalizeText(input.objective)} ${clinicalRiskText(input)}`;
  if (/forca/.test(text)) return 0.7;
  if (/saude/.test(text)) return 0.7;
  if (/retorno|lesao|dor|joelho|lombar|ombro|valgo|butt/.test(text)) return 0.5;
  if (/emagrec/.test(text)) return 0.9;
  return 1;
}

export function getVolumeRangeForGroup(group: unknown, level: unknown, input?: PrescriptionInput) {
  const base = VOLUME_RULES.largeGroups[normalizedLevel(level)];
  const smallFactor = isSmallGroup(group) ? VOLUME_RULES.smallGroupFactor : 1;
  const objectiveFactor = input ? objectiveMultiplier(input) : 1;
  const enduranceFactor = enduranceFactorForGroup(group, input);
  const painSeverity = input ? classifyPainSeverity(input, normalizeMuscleGroup(group)) : "leve";
  const painFactor = painSeverity === "severa" ? 0.5 : painSeverity === "moderada" ? 0.67 : 1;
  const rawMev = base.mev * smallFactor * objectiveFactor * enduranceFactor * painFactor;
  const rawMav = base.mavMax * smallFactor * objectiveFactor * enduranceFactor * painFactor;
  const rawMrv = base.mrv * smallFactor * objectiveFactor * enduranceFactor * painFactor;
  const technicalMinimum = objectiveFactor <= 0.5 ? (isSmallGroup(group) ? 3 : 4) : (isSmallGroup(group) ? 4 : 6);
  const levelCap = VOLUME_RULES.hardCapsByLevel[normalizedLevel(level)];
  const hardCap = Math.min(
    levelCap,
    isSmallGroup(group) ? Math.ceil(levelCap * VOLUME_RULES.smallGroupFactor) : levelCap,
  );
  return {
    mev: Math.max(technicalMinimum, Math.round(rawMev)),
    mavMin: Math.max(technicalMinimum, Math.round(base.mavMin * smallFactor * objectiveFactor * enduranceFactor * painFactor)),
    mavMax: Math.max(technicalMinimum, Math.round(rawMav)),
    mrv: Math.max(technicalMinimum, Math.min(hardCap, Math.round(rawMrv))),
    isSmall: isSmallGroup(group),
  };
}

export function targetVolumeRange(input: PrescriptionInput, preset: MethodologyPreset) {
  const level = normalizeText(input.fitnessLevel);
  const days = Math.min(6, Math.max(1, Number(input.daysPerWeek) || 3));
  const enduranceFactor = input.isEnduranceAthlete || input.runningDaysContext ? 0.8 : 1;
  const dayFactor = days <= 2 ? 0.85 : days >= 5 ? 1.1 : 1;
  const max = Math.round((level.includes("inic") ? preset.weeklySetRange.beginnerMax || preset.weeklySetRange.max : preset.weeklySetRange.max) * enduranceFactor * dayFactor);
  const min = Math.max(4, Math.round(preset.weeklySetRange.min * enduranceFactor * (days <= 2 ? 0.85 : 1)));
  return { min, max: Math.max(min, max) };
}

export function countWeeklySets(program: Pick<TrainingProgram, "workouts">) {
  const out = new Map<string, number>();
  for (const workout of program.workouts || []) {
    for (const exercise of workout.exercises || []) {
      for (const [group, factor] of exerciseGroupFactors(exercise)) {
        const contribution = Number(exercise.sets || 0) * factor;
        out.set(group, (out.get(group) || 0) + contribution);
      }
    }
  }
  return out;
}

function exerciseGroupFactors(exercise: TrainingWorkout["exercises"][number]) {
  const explicitTargets = exercise.targets?.filter((target) =>
    target.role === "primary" || target.role === "secondary" || target.volume_percentage !== null && target.volume_percentage !== undefined
  );
  const targets = explicitTargets?.length
    ? explicitTargets
    : [{ muscle_group: exercise.muscle_group, role: "primary", volume_percentage: 1 }];
  const factors = new Map<string, number>();
  for (const target of targets) {
    const group = normalizeMuscleGroup(target.muscle_group);
    // Parent/child aliases that collapse to the same reporting group represent
    // one exposure for the set, not two independent sets.
    factors.set(group, Math.max(factors.get(group) || 0, targetVolumeFactor(target)));
  }
  return factors;
}

const REDUCTION_PRIORITY: Record<string, number> = {
  forca_especifica: 100,
  ativacao_especifica: 80,
  fisioterapia: 70,
  alongamento: 70,
  autoliberacao: 70,
  mobilidade: 60,
  ativacao_core: 50,
  controle_motor: 30,
  pliometria: 20,
  forca_global: 10,
};

export function enforceVolumeCaps(
  workouts: TrainingWorkout[],
  input: PrescriptionInput,
): {
  workouts: TrainingWorkout[];
  adjustments: Array<{ muscle_group: string; before: number; after: number; cap: number }>;
} {
  const nextWorkouts = workouts.map((workout) => ({
    ...workout,
    exercises: workout.exercises.map((exercise) => ({
      ...exercise,
      set_types: exercise.set_types ? [...exercise.set_types] : undefined,
    })),
  }));
  const beforeCounts = countWeeklySets({ workouts: nextWorkouts });
  const totalInitialSets = nextWorkouts.flatMap((workout) => workout.exercises)
    .reduce((sum, exercise) => sum + Math.max(0, Number(exercise.sets) || 0), 0);

  // Reduce one physical set per iteration, then recompute every affected target.
  // This prevents a secondary target from remaining above its cap after its
  // exercise's primary group has already been processed.
  for (let iteration = 0; iteration < totalInitialSets; iteration += 1) {
    const counts = countWeeklySets({ workouts: nextWorkouts });
    const overGroups = [...counts.entries()]
      .map(([group, count]) => ({
        group,
        count,
        cap: getVolumeRangeForGroup(group, input.fitnessLevel, input).mrv,
      }))
      .filter((item) => item.count > item.cap + 1e-9)
      .sort((a, b) => (b.count - b.cap) - (a.count - a.cap));
    if (!overGroups.length) break;

    let reduced = false;
    for (const over of overGroups) {
      const candidates: Array<{ workoutIndex: number; exerciseIndex: number; factor: number }> = [];
      nextWorkouts.forEach((workout, workoutIndex) => {
        workout.exercises.forEach((exercise, exerciseIndex) => {
          const factor = exerciseGroupFactors(exercise).get(over.group) || 0;
          if (factor > 0 && exercise.sets > 0) candidates.push({ workoutIndex, exerciseIndex, factor });
        });
      });
      candidates.sort((a, b) => {
        const exerciseA = nextWorkouts[a.workoutIndex].exercises[a.exerciseIndex];
        const exerciseB = nextWorkouts[b.workoutIndex].exercises[b.exerciseIndex];
        const removableA = exerciseA.sets > 1 || exerciseA.phase === "forca_especifica" ? 1 : 0;
        const removableB = exerciseB.sets > 1 || exerciseB.phase === "forca_especifica" ? 1 : 0;
        return removableB - removableA
          || (REDUCTION_PRIORITY[exerciseB.phase] || 0) - (REDUCTION_PRIORITY[exerciseA.phase] || 0)
          || b.factor - a.factor
          || exerciseB.sets - exerciseA.sets;
      });

      const candidate = candidates.find(({ workoutIndex, exerciseIndex }) => {
        const exercise = nextWorkouts[workoutIndex].exercises[exerciseIndex];
        return exercise.sets > 1 || exercise.phase === "forca_especifica";
      });
      if (!candidate) continue;
      const exercise = nextWorkouts[candidate.workoutIndex].exercises[candidate.exerciseIndex];
      exercise.sets -= 1;
      if (exercise.set_types) exercise.set_types = exercise.set_types.slice(0, exercise.sets);
      reduced = true;
      break;
    }
    if (!reduced) break;
  }

  nextWorkouts.forEach((workout) => {
    workout.exercises = workout.exercises.filter((exercise) => exercise.sets > 0);
    workout.exercises.forEach((exercise, index) => {
      exercise.exercise_order = index + 1;
    });
  });

  const afterCounts = countWeeklySets({ workouts: nextWorkouts });
  const adjustments = [...beforeCounts.entries()].flatMap(([muscle_group, before]) => {
    const cap = getVolumeRangeForGroup(muscle_group, input.fitnessLevel, input).mrv;
    if (before <= cap) return [];
    return [{ muscle_group, before, after: afterCounts.get(muscle_group) || 0, cap }];
  });

  return { workouts: nextWorkouts, adjustments };
}

export function reviewVolume(program: Pick<TrainingProgram, "workouts">, input: PrescriptionInput, preset: MethodologyPreset): VolumeReview[] {
  const counts = countWeeklySets(program);
  const groups = new Set([...IMPORTANT_GROUPS, ...counts.keys()]);
  return [...groups].map((muscle_group) => {
    const range = getVolumeRangeForGroup(muscle_group, input.fitnessLevel, input);
    const weekly_sets = Math.round((counts.get(muscle_group) || 0) * 10) / 10;
    const status = weekly_sets === 0 || weekly_sets < Math.max(3, range.mev - 2) ? "baixo" : weekly_sets > range.mrv ? "alto" : "ok";
    return {
      muscle_group,
      weekly_sets,
      status,
      note: status === "alto"
        ? `Acima do MRV conservador (${range.mrv}) para o contexto.`
        : status === "baixo"
          ? "Volume baixo ou ausente; revisar se este grupo deveria entrar no ciclo."
          : "Volume dentro da faixa planejada.",
    };
  });
}
