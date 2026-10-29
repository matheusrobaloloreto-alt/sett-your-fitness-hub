import { beforeEach, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
import { fetchIntegrationStatus, parseIntegrationStatus, saveIntegrationCredentials, removeIntegrationCredentials } from './companyIntegrationCredentials';
const initial = [
  { provider: 'asaas', configured: false, mask: null, version: 0, consumer_enabled: false },
  { provider: 'whatsapp_evolution', configured: false, mask: null, version: 0, consumer_enabled: false },
];
beforeEach(() => rpc.mockReset());
it('requires company, rejects unsupported provider and extra credential fields before RPC', async () => {
  await expect(fetchIntegrationStatus('')).rejects.toThrow('Empresa');
  await expect(saveIntegrationCredentials('a', 'zapi' as never, { api_key: 'synthetic-api-key-long', environment: 'sandbox' }, 0)).rejects.toThrow('Provedor');
  await expect(saveIntegrationCredentials('a', 'asaas', { api_key: 'synthetic-api-key-long', environment: 'sandbox', extra: true } as never, 0)).rejects.toThrow('Formato');
  expect(rpc).not.toHaveBeenCalled();
});
it('forwards explicit tenant, provider, bundle and expected version; returns status only', async () => {
  const updated = [{ ...initial[0], configured: true, mask: '••••••••', version: 1 }, initial[1]];
  rpc.mockResolvedValue({ data: updated, error: null });
  const bundle = { api_key: 'synthetic-api-key-long', environment: 'sandbox' as const };
  expect(await saveIntegrationCredentials('a', 'asaas', bundle, 0)).toEqual(updated);
  expect(rpc).toHaveBeenCalledWith('save_company_integration_credentials', { _company_id: 'a', _provider: 'asaas', _credentials: bundle, _expected_version: 0 });
  expect(JSON.stringify(updated)).not.toContain(bundle.api_key);
  rpc.mockResolvedValue({ data: [{ ...initial[0], version: 2 }, initial[1]], error: null });
  await removeIntegrationCredentials('a', 'asaas', 1);
  expect(rpc).toHaveBeenLastCalledWith('remove_company_integration_credentials', { _company_id: 'a', _provider: 'asaas', _expected_version: 1 });
});
it('rejects duplicate/unknown providers, extra fields, partial masks, enabled consumers and wrong versions', async () => {
  for (const response of [[], [initial[0], initial[0]], [{ ...initial[0], api_key: 'synthetic-secret' }, initial[1]], [{ ...initial[0], mask: 'last-four' }, initial[1]], [{ ...initial[0], consumer_enabled: true }, initial[1]], [{ ...initial[0], version: -1 }, initial[1]]]) {
    expect(() => parseIntegrationStatus(response)).toThrow();
  }
  rpc.mockResolvedValue({ data: initial, error: null });
  await expect(saveIntegrationCredentials('a', 'asaas', { api_key: 'synthetic-api-key-long', environment: 'sandbox' }, 0)).rejects.toThrow();
});
it('redacts transport/provider errors and maps conflicts without exposing raw data', async () => {
  rpc.mockRejectedValue(new Error('raw-token-synthetic'));
  await expect(fetchIntegrationStatus('a')).rejects.not.toThrow('raw-token');
  rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'raw-token-synthetic' } });
  await expect(fetchIntegrationStatus('a')).rejects.not.toThrow('raw-token');
  rpc.mockResolvedValue({ data: null, error: { code: 'PT409' } });
  await expect(fetchIntegrationStatus('a')).rejects.toThrow('Outra pessoa alterou');
});
