export interface CyclePrescriptionArchiveInput {
  studentId: string;
  cycleId: string;
  expectedWorkoutIds?: string[];
  expectedContentSignature: string;
  reason?: string | null;
}

export interface CyclePrescriptionArchivePreviewInput {
  studentId: string;
  cycleId: string;
}

export interface CyclePrescriptionRestoreInput {
  studentId: string;
  cycleId: string;
  clearEventId?: string | null;
  reason?: string | null;
}

export interface CyclePrescriptionArchiveMessage {
  title: string;
  description: string;
}

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

function trimmedReason(reason: string | null | undefined): string | null {
  return reason?.trim() || null;
}

function sortedUnique(values: string[] | null | undefined): string[] {
  return [...new Set(values || [])].sort();
}

export function buildCyclePrescriptionArchivePayload(input: CyclePrescriptionArchiveInput) {
  return {
    p_student_id: input.studentId,
    p_cycle_id: input.cycleId,
    p_expected_workout_ids: input.expectedWorkoutIds ? sortedUnique(input.expectedWorkoutIds) : null,
    p_expected_content_signature: trimmedReason(input.expectedContentSignature),
    p_reason: trimmedReason(input.reason),
  };
}

export function buildCyclePrescriptionArchivePreviewPayload(input: CyclePrescriptionArchivePreviewInput) {
  return {
    p_student_id: input.studentId,
    p_cycle_id: input.cycleId,
  };
}

export function buildCyclePrescriptionRestorePayload(input: CyclePrescriptionRestoreInput) {
  return {
    p_student_id: input.studentId,
    p_cycle_id: input.cycleId,
    p_clear_event_id: input.clearEventId || null,
    p_reason: trimmedReason(input.reason),
  };
}

function rpcErrorMessage(error: unknown): string {
  if (!error) return "Operação não confirmada pelo servidor.";
  if (typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return String(error);
}

export async function previewCyclePrescriptionArchiveForStudent(
  client: RpcClient,
  input: CyclePrescriptionArchivePreviewInput,
) {
  const result = await client.rpc(
    "preview_student_cycle_prescription_archive",
    buildCyclePrescriptionArchivePreviewPayload(input),
  );
  if (result.error) throw new Error(rpcErrorMessage(result.error));
  return result.data;
}

export async function archiveCyclePrescriptionForStudent(client: RpcClient, input: CyclePrescriptionArchiveInput) {
  const result = await client.rpc("archive_student_cycle_prescription", buildCyclePrescriptionArchivePayload(input));
  if (result.error) throw new Error(rpcErrorMessage(result.error));
  return result.data;
}

export async function restoreCyclePrescriptionForStudent(client: RpcClient, input: CyclePrescriptionRestoreInput) {
  const result = await client.rpc("restore_student_cycle_prescription", buildCyclePrescriptionRestorePayload(input));
  if (result.error) throw new Error(rpcErrorMessage(result.error));
  return result.data;
}

export function buildCyclePrescriptionArchiveSuccessMessage(cycleNumber: number): CyclePrescriptionArchiveMessage {
  return {
    title: "Prescrição do ciclo removida",
    description: `O ciclo ${cycleNumber} ficou vazio de treino para o aluno. Treinos, cardio e pacotes foram arquivados com histórico preservado.`,
  };
}

export function buildCyclePrescriptionRestoreSuccessMessage(cycleNumber: number): CyclePrescriptionArchiveMessage {
  return {
    title: "Prescrição do ciclo restaurada",
    description: `A prescrição anterior do ciclo ${cycleNumber} voltou para as telas ativas.`,
  };
}
