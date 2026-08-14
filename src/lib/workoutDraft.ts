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
  revision?: number | null;
  updated_at?: string | null;
  created_at?: string | null;
  client_updated_at?: string | null;
  dirty?: boolean;
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
export function mergeWorkoutDraftLogs<T extends VersionedWorkoutLog>(
  serverLogs: Record<string, T>,
  localLogs: Record<string, T>,
) {
  const merged: Record<string, T> = { ...serverLogs };
  for (const [key, local] of Object.entries(localLogs)) {
    const server = serverLogs[key];
    if (!server) {
      merged[key] = local;
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
export function reconcileWorkoutLogResponse<T extends VersionedWorkoutLog>(
  current: T | undefined,
  sent: VersionedWorkoutLog | undefined,
  server: T,
): T {
  const editedDuringRequest = !!current?.client_updated_at
    && current.client_updated_at !== sent?.client_updated_at;
  if (!editedDuringRequest || !current) return { ...server, dirty: false };
  return {
    ...server,
    ...current,
    revision: server.revision,
    updated_at: server.updated_at,
    dirty: true,
  };
}
