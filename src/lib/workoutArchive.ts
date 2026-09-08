export interface WorkoutArchiveInput {
  studentId: string;
  cycleId: string;
  workoutId: string;
  reason?: string | null;
}

export interface WorkoutArchiveMessage {
  title: string;
  description: string;
}

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export function buildWorkoutArchivePayload(input: WorkoutArchiveInput) {
  return {
    p_student_id: input.studentId,
    p_cycle_id: input.cycleId,
    p_workout_id: input.workoutId,
    p_reason: input.reason?.trim() || null,
  };
}

function rpcErrorMessage(error: unknown): string {
  if (!error) return "Operação não confirmada pelo servidor.";
  if (typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return String(error);
}

export async function archiveWorkoutForStudent(client: RpcClient, input: WorkoutArchiveInput) {
  const result = await client.rpc("archive_student_workout", buildWorkoutArchivePayload(input));
  if (result.error) throw new Error(rpcErrorMessage(result.error));
  return result.data;
}

export async function restoreWorkoutForStudent(client: RpcClient, input: WorkoutArchiveInput) {
  const result = await client.rpc("restore_student_workout", buildWorkoutArchivePayload(input));
  if (result.error) throw new Error(rpcErrorMessage(result.error));
  return result.data;
}

export function buildWorkoutArchiveSuccessMessage(workoutTitle: string): WorkoutArchiveMessage {
  return {
    title: "Treino arquivado",
    description: `${workoutTitle} saiu das telas ativas. Logs e histórico foram preservados.`,
  };
}

export function buildWorkoutRestoreSuccessMessage(workoutTitle: string): WorkoutArchiveMessage {
  return {
    title: "Treino restaurado",
    description: `${workoutTitle} voltou para as telas ativas do aluno e do professor.`,
  };
}
