type WorkoutLike = {
  exercises?: unknown;
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
