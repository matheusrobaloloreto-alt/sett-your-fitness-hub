export interface WorkoutRevisionRow {
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
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
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

function workoutRevisionError(message?: string): Error {
  const raw = String(message || "");
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

export async function saveCycleWorkoutRevision(
  db: RpcDatabase,
  args: {
    cycleId: string;
    expectedRows: WorkoutRevisionRow[];
    workouts: WorkoutRevisionInput[];
  },
): Promise<{ revisionId: string; workoutIds: string[] }> {
  const { data, error } = await db.rpc("replace_cycle_workout_revision", {
    p_cycle_id: args.cycleId,
    p_expected_rows: args.expectedRows,
    p_workouts: args.workouts,
  });
  if (error) throw workoutRevisionError(error.message);

  const result = (Array.isArray(data) ? data[0] : data) as {
    cycle_id?: string;
    revision_id?: string;
    workouts_created?: number;
    workout_ids?: string[];
  } | null;
  const workoutIds = Array.isArray(result?.workout_ids) ? result.workout_ids : [];
  if (
    !result?.revision_id
    || result.cycle_id !== args.cycleId
    || Number(result.workouts_created) !== args.workouts.length
    || workoutIds.length !== args.workouts.length
  ) {
    throw new Error("O banco não confirmou todos os treinos da nova versão. Nada foi considerado salvo.");
  }

  return { revisionId: result.revision_id, workoutIds };
}
