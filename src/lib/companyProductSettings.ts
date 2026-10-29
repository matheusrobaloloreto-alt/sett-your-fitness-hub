import { supabase } from '@/integrations/supabase/client';
import {
  normalizeCompanyProductSettings, parseSettingsRecord, readCompanyProductSettings,
  type CompanyProductSettings, type SettingsReadClient, type SettingsRecord,
} from '../../supabase/functions/_shared/company-product-settings';

export * from '../../supabase/functions/_shared/company-product-settings';

// The generated Database type predates this local-only migration. Keep the cast at this boundary.
interface SettingsRpcClient extends SettingsReadClient {
  rpc(name: 'save_company_product_settings', args: {
    _company_id: string; _settings: CompanyProductSettings; _expected_version: number;
  }): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}
const client = supabase as unknown as SettingsRpcClient;

export function fetchCompanyProductSettings(companyId: string): Promise<SettingsRecord> {
  return readCompanyProductSettings(client, companyId);
}

export async function saveCompanyProductSettings(
  companyId: string, settings: CompanyProductSettings, expectedVersion: number,
): Promise<SettingsRecord> {
  if (!companyId?.trim() || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    throw new Error('Empresa e versao validas sao obrigatorias.');
  }
  const normalized = normalizeCompanyProductSettings(settings);
  const { data, error } = await client.rpc('save_company_product_settings', {
    _company_id: companyId, _settings: normalized, _expected_version: expectedVersion,
  });
  if (error) {
    if (error.code === 'PT409' || error.code === '40001') {
      throw Object.assign(new Error('Outra pessoa alterou esta configuracao. Seu rascunho foi mantido. Recarregue antes de salvar novamente.'), { code: error.code });
    }
    throw error;
  }
  const record = parseSettingsRecord(data);
  if (record.version !== expectedVersion + 1) throw new Error('Versao de configuracao inesperada. Recarregue.');
  return record;
}
