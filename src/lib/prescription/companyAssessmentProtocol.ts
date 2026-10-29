import { supabase } from '@/integrations/supabase/client';
import { normalizeAssessmentProtocol, parseAssessmentProtocolRecord, readCompanyAssessmentProtocol, type AssessmentProtocolReader, type CompanyAssessmentProtocol } from '../../../supabase/functions/_shared/prescription/assessmentProtocol';
export * from '../../../supabase/functions/_shared/prescription/assessmentProtocol';
interface Client extends AssessmentProtocolReader {
  rpc(name: 'save_company_assessment_protocol', args: { _company_id: string; _protocol: CompanyAssessmentProtocol; _expected_version: number }): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}
const client = supabase as unknown as Client;
export function isAssessmentProtocolConflict(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error
    && (error.code === 'PT409' || error.code === '40001');
}
export const fetchCompanyAssessmentProtocol = (companyId: string) => readCompanyAssessmentProtocol(client, companyId);
export async function saveCompanyAssessmentProtocol(companyId: string, protocol: CompanyAssessmentProtocol, expectedVersion: number) {
  if (!companyId || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error('Empresa e versao obrigatorias.');
  const { data, error } = await client.rpc('save_company_assessment_protocol', { _company_id: companyId, _protocol: normalizeAssessmentProtocol(protocol), _expected_version: expectedVersion });
  if (error) throw error;
  const saved = parseAssessmentProtocolRecord(data);
  if (saved.version !== expectedVersion + 1) throw new Error('Versao inesperada. Recarregue o protocolo.');
  return saved;
}
