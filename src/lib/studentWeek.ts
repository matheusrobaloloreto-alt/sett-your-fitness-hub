interface TrainingLogLike {
  session_date?: string | null;
  completed?: boolean | null;
  deleted?: boolean | null;
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
  const collect = (log: TrainingLogLike, fallbackDate?: string) => {
    if (log.deleted || log.completed !== true) return;
    const dateYmd = log.session_date || fallbackDate;
    if (!dateYmd) return;
    const date = new Date(`${dateYmd}T12:00:00`);
    if (!Number.isFinite(date.getTime()) || date < start || date > end) return;
    days.add(date.getDay());
  };
  args.persistedLogs.forEach(log => collect(log));
  (args.localLogs || []).forEach(log => collect(log, args.localSessionDate));
  (args.completedSessions || []).forEach(session => {
    if (session.status !== "completed" || !session.completed_at) return;
    collect({ session_date: session.session_date, completed: true });
  });
  return days;
}
