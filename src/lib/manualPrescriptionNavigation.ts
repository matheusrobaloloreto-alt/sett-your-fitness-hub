export interface ManualPrescriptionCycle {
  id: string;
  cycle_number: number;
  start_date: string;
  end_date: string;
  has_workout?: boolean;
  has_workouts?: boolean;
}

export function routeBasePathForRole(role: string | null | undefined): "/admin" | "/coordinator" | "/trainer" {
  if (role === "coordinator") return "/coordinator";
  if (role === "trainer") return "/trainer";
  return "/admin";
}

export function studentProfileReturnPath(role: string | null | undefined, studentId: string): string {
  return `${routeBasePathForRole(role)}/students/${studentId}`;
}

export function workoutBuilderUrl(args: {
  role: string | null | undefined;
  studentId: string;
  cycleId: string;
}): string {
  return `${routeBasePathForRole(args.role)}/workout/${args.cycleId}?returnTo=${encodeURIComponent(
    studentProfileReturnPath(args.role, args.studentId),
  )}`;
}

export function cycleHasManualWorkout(cycle: ManualPrescriptionCycle): boolean {
  return Boolean(cycle.has_workout || cycle.has_workouts);
}

export function resolveManualPrescriptionTargetCycle<T extends ManualPrescriptionCycle>(
  selectedCycle: T,
  visibleCycle: T | null,
  todayYmd: string,
): T {
  if (
    cycleHasManualWorkout(selectedCycle)
    && selectedCycle.start_date <= todayYmd
    && visibleCycle
    && visibleCycle.id !== selectedCycle.id
  ) {
    return visibleCycle;
  }
  return selectedCycle;
}
