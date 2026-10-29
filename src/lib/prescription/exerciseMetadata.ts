type ExerciseOwner = { id: string; company_id: string | null; is_global: boolean };
export type ExerciseMetadataDraft = { contraindications: string; regressions: string; equivalent_substitutes: string[] };
export type ExerciseMetadataPayload = { exercise_id: string; contraindications: string[]; regressions: string[]; equivalent_substitutes: string[] };
export interface MetadataWriteClient {
  from(table: 'exercise_metadata'): { upsert(payload: ExerciseMetadataPayload, options: { onConflict: 'exercise_id' }): PromiseLike<{ error: { message: string } | null }> };
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function prepareExerciseMetadata(source: ExerciseOwner, companyId: string | null | undefined, role: string | null, catalog: ExerciseOwner[], draft: ExerciseMetadataDraft): ExerciseMetadataPayload {
  if (!['admin', 'coordinator', 'master'].includes(role || '')) throw new Error('Sem permissao para contexto tecnico.');
  if (!companyId || source.company_id !== companyId || source.is_global || !uuid.test(source.id)) throw new Error('Selecione um exercicio privado da empresa em foco.');
  const lines = (value: string) => {
    const items = [...new Set(value.split('\n').map(line => line.trim()).filter(Boolean))];
    if (items.length > 30 || items.some(line => line.length > 300)) throw new Error('Limite de 30 criterios, com 300 caracteres por criterio.');
    return items;
  };
  const ids = [...new Set(draft.equivalent_substitutes)];
  if (ids.length > 30 || ids.some(id => !uuid.test(id) || id === source.id || !catalog.some(target => target.id === id && (target.is_global || target.company_id === companyId)))) throw new Error('Substituicao exige ID canonico global ou da propria empresa.');
  return { exercise_id: source.id, contraindications: lines(draft.contraindications), regressions: lines(draft.regressions), equivalent_substitutes: ids };
}
export async function saveExerciseMetadata(client: MetadataWriteClient, payload: ExerciseMetadataPayload): Promise<void> {
  const { error } = await client.from('exercise_metadata').upsert(payload, { onConflict: 'exercise_id' });
  if (error) throw new Error(error.message);
}
