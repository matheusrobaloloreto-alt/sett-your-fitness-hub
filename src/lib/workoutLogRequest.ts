import type { VersionedWorkoutLog } from "./workoutDraft";

type RequestLog = VersionedWorkoutLog & { workout_id: string; weight?: number; reps_done?: number; completed?: boolean };

export function workoutLogForDate<T extends VersionedWorkoutLog>(log: T, sessionDate: string): T & { session_date: string } {
  const next = { ...log, session_date: sessionDate };
  if (log.session_date && log.session_date !== sessionDate) {
    delete next.id;
    delete next.revision;
    delete next.updated_at;
    delete next.created_at;
  }
  return next;
}

export function isWorkoutLogAwaitingConfirmation(log: RequestLog, workoutId: string, sessionDate: string) {
  return log.workout_id === workoutId && (!log.session_date || log.session_date === sessionDate)
    && log.dirty === true && log.server_missing === true;
}

export function shouldSaveWorkoutLog(
  log: RequestLog,
  workoutId: string,
  sessionDate: string,
  allowMissingServerRow = false,
) {
  if (!allowMissingServerRow && isWorkoutLogAwaitingConfirmation(log, workoutId, sessionDate)) return false;
  return log.workout_id === workoutId
    && (!log.session_date || log.session_date === sessionDate)
    && (log.dirty === true || !log.id)
    && (log.deleted === true || (log.weight ?? 0) > 0 || (log.reps_done ?? 0) > 0 || log.completed === true
      || (log.dirty === true && (!!log.id || log.server_missing === true)));
}
