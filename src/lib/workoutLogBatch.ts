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

export interface CanonicalWorkoutLogBatchResult {
  rows: WorkoutLogBatchRow[];
  error: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const canonicalUuid = (value: unknown) => {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase();
};

const canonicalInteger = (value: unknown, minimum: number) => {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value)
      ? Number(value)
      : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : null;
};

const canonicalDate = (value: unknown) => {
  if (typeof value !== "string") return null;
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day) return null;
  return `${yearText}-${monthText}-${dayText}`;
};

const identityKey = (row: WorkoutLogBatchRow) => [
  row.student_id,
  row.workout_id,
  row.exercise_index,
  row.set_number,
  row.session_date,
].join("|");

const canonicalPairError = (rows: WorkoutLogBatchRow[]) => {
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
};

/** Canonicalizes the identity exactly once before client preflight and RPC. */
export function canonicalizeWorkoutLogBatchRows(rows: readonly unknown[]): CanonicalWorkoutLogBatchResult {
  const canonicalRows: WorkoutLogBatchRow[] = [];
  for (const candidate of rows) {
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
      return { rows: [], error: "invalid workout log identity in batch" };
    }
    const row = candidate as Record<string, unknown>;
    const studentId = canonicalUuid(row.student_id);
    const workoutId = canonicalUuid(row.workout_id);
    const exerciseIndex = canonicalInteger(row.exercise_index, 0);
    const setNumber = canonicalInteger(row.set_number, 1);
    const sessionDate = canonicalDate(row.session_date);
    if (studentId === null || workoutId === null || exerciseIndex === null
      || setNumber === null || sessionDate === null) {
      return { rows: [], error: "invalid workout log identity in batch" };
    }
    canonicalRows.push({
      ...row,
      student_id: studentId,
      workout_id: workoutId,
      exercise_index: exerciseIndex,
      set_number: setNumber,
      session_date: sessionDate,
    } as WorkoutLogBatchRow);
  }
  return { rows: canonicalRows, error: canonicalPairError(canonicalRows) };
}

/** Mirrors the RPC pair preflight so invalid batches never leave the client. */
export function workoutLogBatchPairError(rows: readonly unknown[]) {
  return canonicalizeWorkoutLogBatchRows(rows).error;
}
