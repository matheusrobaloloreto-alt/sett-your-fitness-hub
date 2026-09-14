interface TrainingLogLike {
  workout_id?: string;
  exercise_index?: number;
  set_number?: number;
  session_date?: string | null;
  completed?: boolean | null;
  deleted?: boolean | null;
}

export function mergeTrainingLogsForDisplay<T extends TrainingLogLike>(persisted: T[], local: T[], sessionDate: string): T[] {
  const key = (log: T) => `${log.workout_id}|${log.exercise_index}|${log.set_number}|${log.session_date || sessionDate}`;
  const rows = new Map(persisted.map(log => [key(log), log]));
  local.filter(log => log.deleted).forEach(log => rows.delete(key(log)));
  local.filter(log => !log.deleted).forEach(log => rows.set(key(log), { ...log, session_date: log.session_date || sessionDate }));
  return [...rows.values()];
}

export function collectTrainedDates(logs: TrainingLogLike[], sessions: CompletedSessionLike[] = []): Set<string> {
  const dates = new Set<string>();
  logs.forEach(log => {
    if (log.completed === true && !log.deleted && log.session_date) dates.add(log.session_date);
  });
  sessions.forEach(session => {
    if (session.status === "completed" && session.completed_at && session.session_date) dates.add(session.session_date);
  });
  return dates;
}

interface CompletedSessionLike {
  id?: string;
  session_date?: string | null;
  completed_at?: string | null;
  status?: string | null;
}

export function upsertCompletedWorkoutSession<T extends { id?: string }>(
  current: T[],
  session: {
    id: string;
    workoutId: string;
    completedAt: string;
    durationSeconds: number;
    totalVolume: number;
    totalSetsCompleted: number;
    totalSetsPrescribed: number;
  },
  sessionDate: string,
) {
  return [{
    id: session.id,
    workout_id: session.workoutId,
    session_date: sessionDate,
    duration_seconds: session.durationSeconds,
    total_volume: session.totalVolume,
    total_sets_completed: session.totalSetsCompleted,
    total_sets_prescribed: session.totalSetsPrescribed,
    completed_at: session.completedAt,
    status: "completed",
  }, ...current.filter((row) => row.id !== session.id)];
}

function currentMondayRange(now: Date) {
  const jsDay = now.getDay();
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  const start = new Date(now);
  start.setDate(now.getDate() + mondayOffset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function collectTrainedDaysForWeek(args: {
  now: Date;
  persistedLogs: TrainingLogLike[];
  localLogs?: TrainingLogLike[];
  localSessionDate?: string;
  completedSessions?: CompletedSessionLike[];
}): Set<number> {
  const { start, end } = currentMondayRange(args.now);
  const days = new Set<number>();
  const dates = collectTrainedDates([
    ...args.persistedLogs,
    ...(args.localLogs || []).map(log => ({ ...log, session_date: log.session_date || args.localSessionDate })),
  ], args.completedSessions);
  dates.forEach(dateYmd => {
    const date = new Date(`${dateYmd}T12:00:00`);
    if (!Number.isFinite(date.getTime()) || date < start || date > end) return;
    days.add(date.getDay());
  });
  return days;
}
