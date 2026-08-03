export interface TrainerAssignmentPeriod {
  student_id: string;
  trainer_id: string | null;
  assigned_at: string;
  unassigned_at: string | null;
}

interface ResolvePerformanceTrainerInput {
  studentId: string;
  at: Date;
  history: TrainerAssignmentPeriod[];
  currentTrainerId: string | null | undefined;
  activeTrainerIds: ReadonlySet<string>;
}

/**
 * Keeps valid historical attribution, but never lets a removed legacy account
 * make an Agenda cycle disappear from every active team member's performance.
 */
export function resolvePerformanceTrainerId({
  studentId,
  at,
  history,
  currentTrainerId,
  activeTrainerIds,
}: ResolvePerformanceTrainerInput): string | null {
  const instant = at.getTime();
  const historicalTrainerId = history
    .filter((row) => {
      if (row.student_id !== studentId) return false;
      const assignedAt = new Date(row.assigned_at).getTime();
      const unassignedAt = row.unassigned_at ? new Date(row.unassigned_at).getTime() : Infinity;
      return instant >= assignedAt && instant <= unassignedAt;
    })
    .sort((a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime())[0]
    ?.trainer_id;

  if (historicalTrainerId && activeTrainerIds.has(historicalTrainerId)) {
    return historicalTrainerId;
  }
  if (currentTrainerId && activeTrainerIds.has(currentTrainerId)) {
    return currentTrainerId;
  }
  return null;
}
