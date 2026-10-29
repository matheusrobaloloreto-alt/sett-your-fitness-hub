import { supabase } from '@/integrations/supabase/client';
export const INTEGRATION_PROVIDERS = ['asaas', 'whatsapp_evolution'] as const;
export type IntegrationProvider = typeof INTEGRATION_PROVIDERS[number];
export type IntegrationStatus = { provider: IntegrationProvider; configured: boolean; mask: '••••••••' | null; version: number; consumer_enabled: false };
export type IntegrationCredentials = { api_key: string; environment: 'sandbox' | 'production' } | { api_key: string; base_url: string };
interface Client { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string } | null }> }
const client = supabase as unknown as Client;
const unavailable = 'Não foi possível preparar a integração. Confira acesso e disponibilidade do cofre.';
export function parseIntegrationStatus(value: unknown): IntegrationStatus[] {
  if (!Array.isArray(value) || value.length !== INTEGRATION_PROVIDERS.length) throw new Error(unavailable);
  const seen = new Set<string>();
  return value.map(row => {
    if (!row || typeof row !== 'object' || Object.keys(row).sort().join(',') !== 'configured,consumer_enabled,mask,provider,version'
      || !INTEGRATION_PROVIDERS.includes(row.provider) || seen.has(row.provider) || typeof row.configured !== 'boolean'
      || row.consumer_enabled !== false || !Number.isSafeInteger(row.version) || row.version < 0
      || row.mask !== (row.configured ? '••••••••' : null) || (row.configured && row.version === 0)) throw new Error(unavailable);
    seen.add(row.provider);
    // Return an allowlisted projection only. Never copy a backend response wholesale.
    return { provider: row.provider, configured: row.configured, mask: row.mask, version: row.version, consumer_enabled: false };
  });
}
async function request(name: string, companyId: string, args: Record<string, unknown> = {}) {
  if (!companyId) throw new Error('Empresa obrigatória.');
  let result: Awaited<ReturnType<Client['rpc']>>;
  try { result = await client.rpc(name, { _company_id: companyId, ...args }); }
  catch { throw new Error(unavailable); }
  if (result.error) throw new Error(['PT409', '40001', '409'].includes(result.error.code || '')
    ? 'Outra pessoa alterou a integração. Recarregue antes de tentar novamente.' : unavailable);
  return parseIntegrationStatus(result.data);
}
export function fetchIntegrationStatus(companyId: string) { return request('get_company_integration_status', companyId); }
function mutationArgs(provider: IntegrationProvider, version: number) {
  if (!INTEGRATION_PROVIDERS.includes(provider) || !Number.isSafeInteger(version) || version < 0) throw new Error('Provedor ou versão inválidos.');
  return { _provider: provider, _expected_version: version };
}
export async function saveIntegrationCredentials(companyId: string, provider: IntegrationProvider, credentials: IntegrationCredentials, version: number) {
  const args = mutationArgs(provider, version);
  // Reject mismatched/extra fields locally too. Server remains authoritative.
  const fields = provider === 'asaas' ? ['api_key', 'environment'] : ['api_key', 'base_url'];
  if (!credentials || Object.keys(credentials).sort().join(',') !== fields.sort().join(',')
    || typeof credentials.api_key !== 'string' || !/^[!-~]{16,4096}$/.test(credentials.api_key)) throw new Error('Formato da credencial inválido.');
  const result = await request('save_company_integration_credentials', companyId, { ...args, _credentials: credentials });
  if (result.find(row => row.provider === provider)?.version !== version + 1 || !result.find(row => row.provider === provider)?.configured) throw new Error(unavailable);
  return result;
}
export async function removeIntegrationCredentials(companyId: string, provider: IntegrationProvider, version: number) {
  const result = await request('remove_company_integration_credentials', companyId, mutationArgs(provider, version));
  const row = result.find(item => item.provider === provider);
  if (row?.version !== version + 1 || row.configured) throw new Error(unavailable);
  return result;
}
