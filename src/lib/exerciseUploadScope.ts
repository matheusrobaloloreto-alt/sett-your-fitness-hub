export interface ExerciseUploadScopeInput {
  isMaster: boolean;
  isEditing: boolean;
  existingIsGlobal: boolean;
  effectiveCompanyId: string | null;
  companyId: string | null;
}

export interface ExerciseUploadScope {
  is_global: boolean;
  company_id: string | null;
  storage_scope: string;
}

/**
 * Conteúdo novo criado pela operação master alimenta a base global. Edição de
 * um item privado e uploads de uma empresa preservam o isolamento já existente.
 */
export function resolveExerciseUploadScope(input: ExerciseUploadScopeInput): ExerciseUploadScope {
  const tenantId = input.effectiveCompanyId || input.companyId;
  const isGlobal = input.isMaster && (!input.isEditing || input.existingIsGlobal);
  if (!isGlobal && !tenantId) {
    throw new Error("Empresa obrigatória para salvar um exercício privado.");
  }
  return {
    is_global: isGlobal,
    company_id: isGlobal ? null : tenantId,
    storage_scope: isGlobal ? "global" : tenantId!,
  };
}
