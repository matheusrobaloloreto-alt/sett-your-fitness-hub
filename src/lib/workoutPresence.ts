type WorkoutLike = {
  exercises?: unknown;
};

type OrderedWorkoutLike = {
  sort_order?: number | null;
  title?: string | null;
  name?: string | null;
};

export function getWorkoutExerciseCount(workout: WorkoutLike | null | undefined): number {
  return Array.isArray(workout?.exercises) ? workout.exercises.length : 0;
}

export function hasWorkoutExercises(workout: WorkoutLike | null | undefined): boolean {
  return getWorkoutExerciseCount(workout) > 0;
}

export function filterMaterializedWorkouts<T extends WorkoutLike>(workouts: T[] | null | undefined): T[] {
  return (workouts || []).filter(hasWorkoutExercises);
}

export function hasMaterializedWorkout(workouts: WorkoutLike[] | null | undefined): boolean {
  return filterMaterializedWorkouts(workouts).length > 0;
}

/** Keeps the explicit prescription/import order. Legacy rows stay stable. */
export function orderWorkoutsByPrescription<T extends OrderedWorkoutLike>(
  workouts: T[] | null | undefined,
): T[] {
  return (workouts || [])
    .map((workout, inputIndex) => ({ workout, inputIndex }))
    .sort((left, right) => {
      const leftOrder = Number.isFinite(Number(left.workout.sort_order))
        ? Number(left.workout.sort_order)
        : Number.MAX_SAFE_INTEGER;
      const rightOrder = Number.isFinite(Number(right.workout.sort_order))
        ? Number(right.workout.sort_order)
        : Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.inputIndex - right.inputIndex;
    })
    .map(({ workout }) => workout);
}
