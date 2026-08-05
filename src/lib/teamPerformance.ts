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

interface ResolveManualPerformanceTrainerInput extends ResolvePerformanceTrainerInput {
  exercisesSummary: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function manualSessionTrainerId(exercisesSummary: unknown): string | null {
  const records = Array.isArray(exercisesSummary)
    ? exercisesSummary.map(asRecord).filter(Boolean) as Record<string, unknown>[]
    : [asRecord(exercisesSummary)].filter(Boolean) as Record<string, unknown>[];
  const metadata = records.find((item) => item.source === "team_performance_manual") || records[0];
  return typeof metadata?.trainer_id === "string" && metadata.trainer_id.length > 0
    ? metadata.trainer_id
    : null;
}

export function buildManualSessionSummary(trainerId: string) {
  return {
    source: "team_performance_manual",
    trainer_id: trainerId,
  };
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

/**
 * New manual entries carry the selected trainer explicitly. Old entries keep
 * the historical fallback so the existing performance history is preserved.
 */
export function resolveManualPerformanceTrainerId({
  exercisesSummary,
  activeTrainerIds,
  ...legacy
}: ResolveManualPerformanceTrainerInput): string | null {
  const explicitTrainerId = manualSessionTrainerId(exercisesSummary);
  if (explicitTrainerId) {
    return activeTrainerIds.has(explicitTrainerId) ? explicitTrainerId : null;
  }
  return resolvePerformanceTrainerId({ ...legacy, activeTrainerIds });
}
