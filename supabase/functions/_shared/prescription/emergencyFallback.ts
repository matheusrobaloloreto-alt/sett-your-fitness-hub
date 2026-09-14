export const EMERGENCY_FALLBACK_RIR = "3-4";

type ExerciseWithPhaseAndRir = {
  phase: string;
  rir: string;
};

/**
 * Last-resort plans do not have the full weekly context of the deterministic
 * engine. Keep every strength phase conservatively away from failure.
 */
export function enforceEmergencyFallbackRir<T extends ExerciseWithPhaseAndRir>(exercise: T): T {
  if (!exercise.phase.startsWith("forca")) return exercise;
  return { ...exercise, rir: EMERGENCY_FALLBACK_RIR };
}
