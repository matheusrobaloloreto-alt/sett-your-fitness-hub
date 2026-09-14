export interface WorkoutRevisionRow {
  id: string;
  updated_at: string;
}

export interface WorkoutRevisionSavedRow {
  id: string;
  updated_at: string;
}

export interface WorkoutRevisionInput {
  title: string;
  description?: string | null;
  day_of_week?: number | null;
  exercises: unknown[];
}

type RpcDatabase = {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string; details?: string; hint?: string; message?: string } | null }>;
};

export function currentWorkoutRevisionRows<T extends { superseded_at?: string | null }>(rows: T[]): T[] {
  return rows.filter((row) => !row.superseded_at);
}

export class WorkoutRevisionConflictError extends Error {
  readonly code = "workout_revision_changed";

  constructor() {
    super("O treino foi alterado em outra tela. Escolha qual versão deve permanecer para continuar.");
    this.name = "WorkoutRevisionConflictError";
  }
}

function workoutRevisionError(error?: { code?: string; details?: string; hint?: string; message?: string } | null): Error {
  const raw = [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(" ");
  if (raw.includes("workout_revision_changed")) {
    return new WorkoutRevisionConflictError();
  }
  if (raw.includes("workout_revision_cycle_not_visible")) {
    return new Error("Este não é o ciclo que o aluno está vendo. Abra o ciclo atual indicado no perfil antes de salvar.");
  }
  if (raw.includes("workout_revision_forbidden")) {
    return new Error("Seu acesso atual não permite alterar este aluno. Atualize o treinador responsável ou peça acesso à coordenação.");
  }
  return new Error(raw || "Falha ao salvar a nova versão do treino.");
}

function parseSavedWorkoutRows(result: { workout_rows?: unknown; workout_ids?: unknown }): WorkoutRevisionSavedRow[] {
  if (Array.isArray(result.workout_rows)) {
    return result.workout_rows
      .map((row) => row as Partial<WorkoutRevisionSavedRow>)
      .filter((row): row is WorkoutRevisionSavedRow => Boolean(row.id && row.updated_at))
      .map((row) => ({ id: row.id, updated_at: row.updated_at }));
  }
  if (Array.isArray(result.workout_ids)) {
    return result.workout_ids
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .map((id) => ({ id, updated_at: "" }));
  }
  return [];
}

export async function saveCycleWorkoutRevision(
  db: RpcDatabase,
  args: {
    cycleId: string;
    expectedRows: WorkoutRevisionRow[];
    workouts: WorkoutRevisionInput[];
  },
): Promise<{ revisionId: string; workoutIds: string[]; workoutRows: WorkoutRevisionSavedRow[] }> {
  const { data, error } = await db.rpc("replace_cycle_workout_revision", {
    p_cycle_id: args.cycleId,
    p_expected_rows: args.expectedRows,
    p_workouts: args.workouts,
  });
  if (error) throw workoutRevisionError(error);

  const result = (Array.isArray(data) ? data[0] : data) as {
    cycle_id?: string;
    revision_id?: string;
    workouts_created?: number;
    workout_ids?: string[];
    workout_rows?: Array<{ id?: string; updated_at?: string }>;
  } | null;
  const workoutRows = result ? parseSavedWorkoutRows(result) : [];
  const workoutIds = workoutRows.map((row) => row.id);
  if (
    !result?.revision_id
    || result.cycle_id !== args.cycleId
    || Number(result.workouts_created) !== args.workouts.length
    || workoutIds.length !== args.workouts.length
  ) {
    throw new Error("O banco não confirmou todos os treinos da nova versão. Nada foi considerado salvo.");
  }

  return { revisionId: result.revision_id, workoutIds, workoutRows };
}
