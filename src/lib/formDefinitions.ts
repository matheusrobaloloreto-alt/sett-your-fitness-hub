import { supabase } from '@/integrations/supabase/client';
import { normalizeFormDefinition, type FormDefinition, type FormKind, type PublishedForm } from '../../supabase/functions/_shared/form-definitions';
export * from '../../supabase/functions/_shared/form-definitions';

interface FormRpcClient { rpc(name: string, args: Record<string, unknown>): PromiseLike<{data: unknown; error: {message?: string; code?: string} | null}> }
const db = supabase as unknown as FormRpcClient;
export function isFormDefinitionConflict(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && (error.code === 'PT409' || error.code === '40001');
}
export async function fetchFormDefinition(companyId: string, kind: FormKind): Promise<PublishedForm | null> {
  const {data,error}=await db.rpc('get_company_form_definition',{_company_id:companyId,_kind:kind});
  if(error) throw error;
  return parsePublishedForm(data);
}
export function parsePublishedForm(data: unknown): PublishedForm | null {
  if(data===null) return null;
  const row=data as PublishedForm;
  if(!row || typeof row.id!=='string' || !Number.isSafeInteger(row.version) || row.version<1) throw new Error('Versao de formulario invalida');
  return {...row,definition:normalizeFormDefinition(row.definition)};
}
export async function publishFormDefinition(companyId: string, definition: FormDefinition, expectedVersion: number): Promise<PublishedForm> {
  const normalized=normalizeFormDefinition(definition);
  const {data,error}=await db.rpc('publish_company_form_definition',{_company_id:companyId,_definition:normalized,_expected_version:expectedVersion});
  if(error) throw error;
  const result=parsePublishedForm(data);
  if(!result || result.version!==expectedVersion+1) throw new Error('Conflito de versao. Recarregue.');
  return result;
}
