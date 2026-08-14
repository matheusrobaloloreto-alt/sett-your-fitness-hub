export interface WorkoutUiDraft {
  cycleId: string | null;
  workoutId: string | null;
  expandedExercise: number | null;
  activeView: string;
  extraSets: Record<number, number>;
  updatedAt: number;
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

/**
 * A cópia local representa a última interação do aluno. Quando o servidor
 * ainda tem a versão anterior da mesma série, o valor local precisa vencer.
 */
export function mergeWorkoutDraftLogs<T>(serverLogs: Record<string, T>, localLogs: Record<string, T>) {
  return { ...serverLogs, ...localLogs };
}
