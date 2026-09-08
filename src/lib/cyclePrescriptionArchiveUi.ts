export interface CyclePrescriptionArchivePreviewState {
  ok?: boolean;
  student_id?: string | null;
  cycle_id?: string | null;
  content_signature?: string | null;
  active_workout_ids?: string[] | null;
  active_workouts?: number | null;
  active_bundles?: number | null;
  active_strength_plans?: number | null;
  active_running_plans?: number | null;
}

export interface CyclePrescriptionArchiveMutationResult {
  ok?: boolean;
  student_id?: string | null;
  cycle_id?: string | null;
  clear_event_id?: string | null;
}

export function cyclePrescriptionContentCount(preview: CyclePrescriptionArchivePreviewState | null | undefined) {
  return Number(preview?.active_workouts || 0)
    + Number(preview?.active_bundles || 0)
    + Number(preview?.active_strength_plans || 0)
    + Number(preview?.active_running_plans || 0);
}

export function assertCyclePrescriptionPreviewMatches(
  preview: CyclePrescriptionArchivePreviewState | null | undefined,
  expected: { studentId: string; cycleId: string },
): CyclePrescriptionArchivePreviewState {
  if (!preview?.ok) {
    throw new Error("O servidor não confirmou a prévia da remoção.");
  }
  if (preview.student_id && preview.student_id !== expected.studentId) {
    throw new Error("A prévia retornou outro aluno. Recarregue o perfil antes de tentar de novo.");
  }
  if (preview.cycle_id && preview.cycle_id !== expected.cycleId) {
    throw new Error("A prévia retornou outro ciclo. Recarregue o perfil antes de tentar de novo.");
  }
  if (!preview.content_signature?.trim()) {
    throw new Error("A confirmação de segurança expirou. Abra a confirmação novamente.");
  }
  if (cyclePrescriptionContentCount(preview) === 0) {
    throw new Error("Nenhum conteúdo ativo foi encontrado para remover neste ciclo.");
  }
  return preview;
}

export function assertCyclePrescriptionMutationSucceeded(
  result: unknown,
  expected: { studentId: string; cycleId: string },
): CyclePrescriptionArchiveMutationResult {
  const payload = result as CyclePrescriptionArchiveMutationResult | null | undefined;
  if (!payload?.ok) {
    throw new Error("O servidor não confirmou a conclusão da operação.");
  }
  if (payload.student_id && payload.student_id !== expected.studentId) {
    throw new Error("O servidor confirmou a operação para outro aluno. Recarregue o perfil antes de continuar.");
  }
  if (payload.cycle_id && payload.cycle_id !== expected.cycleId) {
    throw new Error("O servidor confirmou a operação para outro ciclo. Recarregue o perfil antes de continuar.");
  }
  return payload;
}

export function isCyclePrescriptionArchiveActionStale(
  action: { studentId: string; cycle: { id: string } } | null | undefined,
  currentStudentId: string | null | undefined,
) {
  return Boolean(action && currentStudentId && action.studentId !== currentStudentId);
}
