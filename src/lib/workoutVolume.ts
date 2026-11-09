import { differenceInCalendarDays, parseISO } from "date-fns";
import { canonicalAnatomicalMuscleGroup } from "@/lib/anatomicalMuscleGroups";
import { normalizeTargetWeight, type ExerciseMuscleTarget } from "@/lib/volumeStats";

export interface WorkoutVolumeExercise {
  exercise_id?: string | null;
  exerciseId?: string | null;
  muscle_group?: string | null;
  sets?: string | number | null;
  weekly_ui_version?: string | null;
  weekly_prescription?: Array<{ week: number | string; sets?: number | string | null }> | null;
}

export interface WorkoutVolumeTarget {
  exercise_id: string;
  muscle_group_id: string;
  role?: string | null;
  is_primary?: boolean | null;
  volume_percentage?: number | null;
}

export interface WorkoutVolumeMuscleGroup {
  id: string;
  name: string;
}

function workoutVolumeExercises(value: unknown): WorkoutVolumeExercise[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
}

const exerciseIdForVolume = (exercise: WorkoutVolumeExercise) =>
  exercise.exercise_id || exercise.exerciseId || "";

export function workoutVolumeExerciseIds(workouts: Array<{ exercises: unknown }>): string[] {
  return workouts.flatMap(({ exercises }) => workoutVolumeExercises(exercises)
    .map(exerciseIdForVolume)
    // The effective-targets RPC accepts uuid[]. Keep legacy IDs eligible for the muscle-name fallback.
    .filter((id) => /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(id)));
}

export function workoutVolumeTargetConfig(effectiveTargets: ExerciseMuscleTarget[]) {
  return {
    targets: effectiveTargets.map((target) => ({
      exercise_id: target.exerciseId, muscle_group_id: target.muscleGroup,
      role: target.role, is_primary: target.isPrimary,
    })),
    muscleGroups: [...new Set(effectiveTargets.map((target) => target.muscleGroup))]
      .map((name) => ({ id: name, name })),
  };
}

function savedVolumeWeeks(exercise: WorkoutVolumeExercise) {
  return Array.isArray(exercise.weekly_prescription) ? exercise.weekly_prescription.filter(Boolean) : [];
}

export function hasPlannedVolumeWeeks(workouts: Array<{ exercises: unknown }>): boolean {
  return workouts.some(({ exercises }) => workoutVolumeExercises(exercises)
    .some((exercise) => savedVolumeWeeks(exercise).length > 0));
}

export function plannedVolumeCycleWeek(startDate: string | null, endDate: string | null, today: string) {
  const start = parseISO(startDate ?? "");
  const durationDays = differenceInCalendarDays(parseISO(endDate ?? ""), start) + 1;
  const weekCount = Math.max(1, Math.ceil(durationDays / 7) || 6);
  const elapsedDays = differenceInCalendarDays(parseISO(today), start);
  const currentWeek = Math.floor(elapsedDays / 7) + 1 || 1;
  return { weekCount, week: Math.min(weekCount, Math.max(1, currentWeek)) };
}

function prescribedSetsForWeek(exercise: WorkoutVolumeExercise, week?: number) {
  if (week == null) return exercise.sets;
  const entries = savedVolumeWeeks(exercise);
  const exact = entries.find((entry) => Number(entry.week) === week);
  if (exact) return exact.sets ?? exercise.sets;

  // Old unversioned blocks could store only the opening week of each pair.
  // Exact rows always win, and gaps in individual prescriptions use the base.
  const usesLegacyPairs = !exercise.weekly_ui_version
    && entries.some((entry) => Number(entry.week) === 1)
    && entries.some((entry) => Number(entry.week) > 1)
    && entries.every((entry) => [1, 3, 5].includes(Number(entry.week)));
  const paired = usesLegacyPairs && week % 2 === 0
    ? entries.find((entry) => Number(entry.week) === week - 1)
    : undefined;
  return paired?.sets ?? exercise.sets;
}

export function calculateWeeklyMuscleVolume(args: {
  workouts: Array<{ exercises: unknown }>;
  week?: number;
  targets: WorkoutVolumeTarget[];
  muscleGroups: WorkoutVolumeMuscleGroup[];
}): { volume: Record<string, number>; uncoveredExerciseIds: string[] } {
  const muscleNameById = new Map(args.muscleGroups.map((group) => [group.id, group.name]));
  const targetsByExercise = new Map<string, WorkoutVolumeTarget[]>();
  for (const target of args.targets) {
    const current = targetsByExercise.get(target.exercise_id) || [];
    current.push(target);
    targetsByExercise.set(target.exercise_id, current);
  }

  const volume: Record<string, number> = {};
  const uncoveredExerciseIds = new Set<string>();

  for (const workout of args.workouts) {
    for (const exercise of workoutVolumeExercises(workout.exercises)) {
      const exerciseId = exerciseIdForVolume(exercise);
      const sets = Math.max(0, Number.parseFloat(String(prescribedSetsForWeek(exercise, args.week))) || 0);
      if (sets === 0 || !Number.isFinite(sets)) continue;

      const factors = new Map<string, number>();
      for (const target of targetsByExercise.get(exerciseId) || []) {
        const anatomicalGroup = canonicalAnatomicalMuscleGroup(muscleNameById.get(target.muscle_group_id));
        if (!anatomicalGroup) continue;
        const factor = normalizeTargetWeight({
          role: target.role,
          isPrimary: target.is_primary,
        });
        factors.set(anatomicalGroup, Math.max(factors.get(anatomicalGroup) || 0, factor));
      }

      if (factors.size === 0) {
        const fallbackGroup = canonicalAnatomicalMuscleGroup(exercise.muscle_group);
        if (fallbackGroup) factors.set(fallbackGroup, 1);
        else uncoveredExerciseIds.add(exerciseId);
      }

      for (const [group, factor] of factors) {
        volume[group] = (volume[group] || 0) + sets * factor;
      }
    }
  }

  return { volume, uncoveredExerciseIds: [...uncoveredExerciseIds] };
}
