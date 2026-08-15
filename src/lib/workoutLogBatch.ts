export interface WorkoutLogBatchRow {
  student_id: string;
  workout_id: string;
  exercise_index: number;
  set_number: number;
  session_date: string;
  deleted?: boolean;
  base_revision?: number | null;
  id?: string | null;
  base_id?: string | null;
  revision?: number | null;
}

const identityKey = (row: WorkoutLogBatchRow) => [
  row.student_id,
  row.workout_id,
  row.exercise_index,
  row.set_number,
  row.session_date,
].join("|");

/** Mirrors the RPC pair preflight so invalid batches never leave the client. */
export function workoutLogBatchPairError(rows: WorkoutLogBatchRow[]) {
  const grouped = new Map<string, WorkoutLogBatchRow[]>();
  for (const row of rows) {
    const key = identityKey(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  for (const batch of grouped.values()) {
    if (batch.length === 1) continue;
    const tombstones = batch.filter(row => row.deleted === true);
    const replacements = batch.filter(row => row.deleted !== true);
    if (batch.length !== 2 || tombstones.length !== 1 || replacements.length !== 1) {
      return "duplicate workout log identity in batch";
    }
    const replacement = replacements[0];
    if (replacement.base_revision != null || replacement.id != null
      || replacement.base_id != null || replacement.revision != null) {
      return "replacement paired with tombstone must be a new insert";
    }
  }
  return null;
}
