export interface WorkoutUiDraft {
  cycleId: string | null;
  workoutId: string | null;
  expandedExercise: number | null;
  activeView: string;
  extraSets: Record<number, number>;
  updatedAt: number;
}

export interface WorkoutResumeTarget {
  source: "active_session" | "draft";
  workoutId: string;
  cycleId: string | null;
  expandedExercise: number | null;
  extraSets: Record<number, number>;
}

interface StorageReader {
  getItem(key: string): string | null;
}

interface StorageWriter {
  setItem(key: string, value: string): void;
}

export const workoutUiDraftKey = (studentId: string, dateYmd: string) =>
  `sett_workout_ui_${studentId}_${dateYmd}`;

export function readWorkoutUiDraft(storage: StorageReader, key: string): WorkoutUiDraft | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkoutUiDraft>;
    if (typeof parsed.workoutId !== "string" || !parsed.workoutId) return null;
    return {
      cycleId: typeof parsed.cycleId === "string" ? parsed.cycleId : null,
      workoutId: parsed.workoutId,
      expandedExercise: typeof parsed.expandedExercise === "number" ? parsed.expandedExercise : null,
      activeView: typeof parsed.activeView === "string" ? parsed.activeView : "treino",
      extraSets: parsed.extraSets && typeof parsed.extraSets === "object" ? parsed.extraSets : {},
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

export function writeWorkoutUiDraft(storage: StorageWriter, key: string, draft: Omit<WorkoutUiDraft, "updatedAt">) {
  storage.setItem(key, JSON.stringify({ ...draft, updatedAt: Date.now() }));
}

/** A sessão iniciada sempre vence um rascunho de outro treino. */
export function resolveWorkoutResumeTarget(
  activeWorkoutId: string | null | undefined,
  draft: WorkoutUiDraft | null,
): WorkoutResumeTarget | null {
  if (activeWorkoutId) {
    const matchingDraft = draft?.workoutId === activeWorkoutId ? draft : null;
    return {
      source: "active_session",
      workoutId: activeWorkoutId,
      cycleId: matchingDraft?.cycleId ?? null,
      expandedExercise: matchingDraft?.expandedExercise ?? null,
      extraSets: matchingDraft?.extraSets ?? {},
    };
  }
  if (!draft) return null;
  return {
    source: "draft",
    workoutId: draft.workoutId,
    cycleId: draft.cycleId,
    expandedExercise: draft.expandedExercise,
    extraSets: draft.extraSets,
  };
}

export interface VersionedWorkoutLog {
  id?: string | null;
  revision?: number | null;
  updated_at?: string | null;
  created_at?: string | null;
  client_updated_at?: string | null;
  dirty?: boolean;
  deleted?: boolean;
  session_date?: string;
  deleted_from_client_updated_at?: string | null;
  renumbered_at?: string;
  server_missing?: boolean;
}

export interface MutableWorkoutSetLog extends VersionedWorkoutLog {
  id?: string | null;
  workout_id: string;
  exercise_index: number;
  set_number: number;
}

export interface PersistedWorkoutSetIdentity {
  workout_id: string;
  exercise_index: number;
  set_number: number;
  session_date: string;
}

export interface WorkoutExerciseSetDefinition {
  sets?: string | number | null;
}

export const workoutLogTombstoneKey = (key: string) => `__deleted__:${key}`;

/** Reconstructs persisted extra rows on a fresh device, bounded to the UI limit. */
export function inferExtraSetsFromPersistedLogs(
  logs: PersistedWorkoutSetIdentity[],
  workoutId: string,
  exercises: WorkoutExerciseSetDefinition[],
  sessionDate: string,
  maxExtraSets = 5,
) {
  const extras: Record<number, number> = {};
  for (let exerciseIndex = 0; exerciseIndex < exercises.length; exerciseIndex += 1) {
    const match = String(exercises[exerciseIndex]?.sets ?? "3").match(/^\d+/);
    const prescribed = match ? Math.max(1, Math.min(20, Number(match[0]))) : 3;
    const maxPersisted = logs.reduce((max, log) => {
      if (log.workout_id !== workoutId || log.exercise_index !== exerciseIndex || log.session_date !== sessionDate) return max;
      if (!Number.isInteger(log.set_number) || log.set_number < 1) return max;
      return Math.max(max, log.set_number);
    }, 0);
    const extra = Math.min(maxExtraSets, Math.max(0, maxPersisted - prescribed));
    if (extra > 0) extras[exerciseIndex] = extra;
  }
  return extras;
}

/**
 * Removes a visible set, keeps CAS tombstones for every old server key and
 * turns shifted rows into inserts under their authoritative new set numbers.
 */
export function removeAndRenumberWorkoutSet<T extends MutableWorkoutSetLog>(
  logs: Record<string, T>,
  workoutId: string,
  exerciseIndex: number,
  removedSetNumber: number,
  totalSets: number,
  clientUpdatedAt: string,
) {
  const next: Record<string, T> = { ...logs };
  const keyFor = (setNumber: number) => `${workoutId}-${exerciseIndex}-${setNumber}`;
  for (let setNumber = removedSetNumber; setNumber <= totalSets; setNumber += 1) {
    const oldKey = keyFor(setNumber);
    const current = next[oldKey];
    if (!current) continue;
    next[workoutLogTombstoneKey(oldKey)] = {
      ...current,
      deleted: true,
      dirty: true,
      client_updated_at: clientUpdatedAt,
      deleted_from_client_updated_at: current.client_updated_at ?? null,
    };
    delete next[oldKey];
    if (setNumber > removedSetNumber) {
      const shifted = { ...current };
      delete shifted.id;
      delete shifted.revision;
      delete shifted.updated_at;
      next[keyFor(setNumber - 1)] = {
        ...shifted,
        set_number: setNumber - 1,
        deleted: false,
        dirty: true,
        client_updated_at: clientUpdatedAt,
        renumbered_at: clientUpdatedAt,
      } as T;
    }
  }
  return next;
}

function timestamp(value: VersionedWorkoutLog | undefined) {
  const raw = value?.client_updated_at || value?.updated_at || value?.created_at;
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * O rascunho local só vence quando é uma edição pendente baseada na mesma
 * revisão do servidor. Uma revisão maior do servidor sempre vence.
 */
export function mergeWorkoutDraftLogs<
  TServer extends VersionedWorkoutLog,
  TLocal extends VersionedWorkoutLog,
>(
  serverLogs: Record<string, TServer>,
  localLogs: Record<string, TLocal>,
) {
  type MergedLog = TServer | TLocal;
  const merged: Record<string, MergedLog> = { ...serverLogs };
  for (const [key, local] of Object.entries(localLogs)) {
    const server = serverLogs[key];
    if (!server) {
      if (local.dirty === true || local.deleted === true) merged[key] = local;
      continue;
    }
    // A replacement created by renumbering intentionally targets a key that
    // still exists on the server until its paired CAS tombstone is applied.
    // Keep both pieces of that local transaction together across reloads.
    const pairedTombstone = localLogs[workoutLogTombstoneKey(key)];
    if (local.dirty === true && pairedTombstone?.deleted === true) {
      merged[key] = local;
      continue;
    }
    if (server.id && local.id && server.id !== local.id && local.dirty !== true && local.deleted !== true) {
      continue;
    }
    const serverRevision = Number(server.revision ?? 0);
    const localRevision = Number(local.revision ?? 0);
    if (serverRevision > localRevision) continue;
    if (localRevision > serverRevision) {
      merged[key] = local;
      continue;
    }
    if (local.dirty === true) {
      merged[key] = local;
      continue;
    }
    if (timestamp(local) > timestamp(server)) merged[key] = local;
  }
  return merged;
}

/**
 * Rebaseia a edição feita enquanto o autosave estava em voo sobre a revisão
 * devolvida pelo servidor. Os campos locais continuam pendentes, mas o próximo
 * CAS parte da nova revisão em vez de repetir a revisão obsoleta.
 */
export function reconcileWorkoutLogResponse<
  TCurrent extends VersionedWorkoutLog,
  TServer extends VersionedWorkoutLog,
>(
  current: TCurrent | undefined,
  sent: VersionedWorkoutLog | undefined,
  server: TServer,
): TServer | (TServer & TCurrent) {
  const editedDuringRequest = !!current?.client_updated_at
    && current.client_updated_at !== sent?.client_updated_at;
  if (!editedDuringRequest || !current) return { ...server, dirty: false };
  return {
    ...server,
    ...current,
    id: server.id,
    revision: server.revision,
    updated_at: server.updated_at,
    dirty: true,
  };
}

export function reconcileWorkoutLogBatchResponse<T extends MutableWorkoutSetLog>(
  logs: Record<string, T>,
  sentLogs: T[],
  savedRows: T[],
  conflictRows: T[],
) {
  const next = { ...logs };
  const keyOf = (log: MutableWorkoutSetLog) => `${log.workout_id}-${log.exercise_index}-${log.set_number}`;
  const sentByKey = new Map(sentLogs.filter(log => !log.deleted).map(log => [keyOf(log), log]));
  const sentDeletions = new Map(sentLogs.filter(log => log.deleted).map(log => [keyOf(log), log]));
  for (const [rows, saved] of [[savedRows, true], [conflictRows, false]] as const) {
    for (const server of rows) {
      const key = keyOf(server);
      const sent = sentByKey.get(key);
      const tombstoneKey = workoutLogTombstoneKey(key);
      const tombstone = next[tombstoneKey];
      if (saved && server.deleted === true) {
        const deletion = sentDeletions.get(key);
        if (tombstone && deletion && tombstone.client_updated_at === deletion.client_updated_at
          && (tombstone.session_date ?? deletion.session_date) === deletion.session_date
          && tombstone.id === deletion.id && tombstone.revision === deletion.revision) delete next[tombstoneKey];
        continue;
      }
      if (tombstone?.deleted === true) {
        // Only an acknowledged save of the exact predecessor can advance a
        // deletion created in flight. The visible replacement stays an insert.
        if (saved && sent
          && Object.prototype.hasOwnProperty.call(tombstone, "deleted_from_client_updated_at")
          && (tombstone.deleted_from_client_updated_at ?? null) === (sent.client_updated_at ?? null)
          && tombstone.id === sent.id && tombstone.revision === sent.revision
          && (tombstone.session_date ?? sent.session_date) === sent.session_date) {
          const rebased = {
            ...tombstone,
            id: server.id,
            revision: server.revision,
            updated_at: server.updated_at,
          };
          delete rebased.server_missing;
          next[tombstoneKey] = rebased;
          // A shifted insert inherits the predecessor's missing-row marker.
          // Clear it only after that exact predecessor has been acknowledged.
          const shiftedKey = `${sent.workout_id}-${sent.exercise_index}-${sent.set_number - 1}`;
          const shifted = next[shiftedKey];
          if (tombstone.server_missing === true && shifted && !shifted.id
            && shifted.renumbered_at === tombstone.client_updated_at
            && (shifted.session_date ?? sent.session_date) === sent.session_date) {
            const confirmedShift = { ...shifted };
            delete confirmedShift.server_missing;
            next[shiftedKey] = confirmedShift;
          }
        }
        continue;
      }
      const current = next[key];
      if (current?.session_date && server.session_date && current.session_date !== server.session_date) continue;
      if (server.server_missing === true) {
        if (current) {
          const pending = { ...current, dirty: true, server_missing: true };
          delete pending.id;
          delete pending.revision;
          delete pending.updated_at;
          delete pending.created_at;
          next[key] = pending;
        }
        continue;
      }
      const reconciled = reconcileWorkoutLogResponse(current, sent, server) as T;
      if (saved) delete reconciled.server_missing;
      next[key] = reconciled;
    }
  }
  return next;
}

export function discardConflictedWorkoutLogDeletions<T extends MutableWorkoutSetLog>(
  logs: Record<string, T>,
  sentLogs: T[],
  conflicts: (MutableWorkoutSetLog & { requested_deleted?: boolean })[],
) {
  const keyOf = (log: MutableWorkoutSetLog) => `${log.workout_id}-${log.exercise_index}-${log.set_number}`;
  const transactionOf = (log: MutableWorkoutSetLog, fallbackDate?: string) =>
    JSON.stringify([log.workout_id, log.exercise_index, log.session_date ?? fallbackDate,
      log.deleted ? log.client_updated_at : log.renumbered_at ?? log.client_updated_at]);
  const conflictedKeys = new Set(conflicts.filter(row => row.requested_deleted === true)
    .map(row => JSON.stringify([keyOf(row), row.session_date])));
  const transactions = new Set(sentLogs.filter(log => log.deleted === true
    && conflictedKeys.has(JSON.stringify([keyOf(log), log.session_date]))).map(log => transactionOf(log)));
  const next = { ...logs };
  for (const sent of sentLogs) {
    if (!transactions.has(transactionOf(sent))) continue;
    const key = keyOf(sent);
    if (sent.deleted === true) {
      const tombstoneKey = workoutLogTombstoneKey(key);
      const current = next[tombstoneKey];
      if (!current || transactionOf(current, sent.session_date) !== transactionOf(sent)) continue;
      delete next[tombstoneKey];
      // Later field edits on this replacement still belong to the rejected
      // renumbering. Do not replay them onto the predecessor's server identity.
      if (next[key] && (next[key].session_date ?? sent.session_date) === sent.session_date && !next[key].id) delete next[key];
    } else {
      const current = next[key];
      if (current && !current.id && transactionOf(current, sent.session_date) === transactionOf(sent)) delete next[key];
    }
  }
  return next;
}
