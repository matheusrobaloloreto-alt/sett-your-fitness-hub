import { canonicalAnatomicalMuscleGroup } from "@/lib/anatomicalMuscleGroups";
import { normalizeTargetWeight } from "@/lib/volumeStats";

export interface WorkoutVolumeExercise {
  exercise_id: string;
  muscle_group?: string | null;
  sets: string | number;
}

export interface WorkoutVolumeTarget {
  exercise_id: string;
  muscle_group_id: string;
  role?: string | null;
  volume_percentage?: number | null;
}

export interface WorkoutVolumeMuscleGroup {
  id: string;
  name: string;
}

export function calculateWeeklyMuscleVolume(args: {
  workouts: Array<{ exercises: WorkoutVolumeExercise[] }>;
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
    for (const exercise of workout.exercises) {
      const sets = Math.max(0, Number.parseFloat(String(exercise.sets)) || 0);
      if (sets === 0) continue;

      const factors = new Map<string, number>();
      for (const target of targetsByExercise.get(exercise.exercise_id) || []) {
        const anatomicalGroup = canonicalAnatomicalMuscleGroup(muscleNameById.get(target.muscle_group_id));
        if (!anatomicalGroup) continue;
        const rawPercentage = target.volume_percentage;
        const factor = normalizeTargetWeight({
          role: target.role,
          volumePercentage: rawPercentage === null || rawPercentage === undefined
            ? null
            : Number(rawPercentage),
        });
        factors.set(anatomicalGroup, Math.max(factors.get(anatomicalGroup) || 0, factor));
      }

      if (factors.size === 0) {
        const fallbackGroup = canonicalAnatomicalMuscleGroup(exercise.muscle_group);
        if (fallbackGroup) factors.set(fallbackGroup, 1);
        else uncoveredExerciseIds.add(exercise.exercise_id);
      }

      for (const [group, factor] of factors) {
        volume[group] = (volume[group] || 0) + sets * factor;
      }
    }
  }

  return { volume, uncoveredExerciseIds: [...uncoveredExerciseIds] };
}
