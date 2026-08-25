export interface ReloadWorkoutLike {
  id: string;
  day_of_week: number | null;
}

/** Background refreshes must not move an athlete away from the workout they are using. */
export function resolveWorkoutSelectionAfterReload<T extends ReloadWorkoutLike>(
  currentWorkoutId: string | null,
  workouts: T[],
  currentDayOfWeek: number,
) {
  if (currentWorkoutId && workouts.some((workout) => workout.id === currentWorkoutId)) {
    return currentWorkoutId;
  }
  return workouts.find((workout) => workout.day_of_week === currentDayOfWeek)?.id
    ?? workouts[0]?.id
    ?? null;
}
