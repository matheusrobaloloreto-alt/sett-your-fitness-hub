import { MemoryRouter } from 'react-router-dom';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ProductSettings from './ProductSettings';
import '@/components/admin/CompanyIntegrations';
import '@/components/admin/CompanyCommercialSettings';
import { DEFAULT_COMPANY_PRODUCT_SETTINGS } from '@/lib/companyProductSettings';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
// The feature is off in this case. Keep its unused provider panel out of the lazy import graph.
vi.mock('@/pages/admin/WhatsAppSettings', () => ({ WhatsAppConnectionPanel: () => null }));
vi.mock('@/components/admin/WhatsAppSequenceEditor', () => ({ WhatsAppSequenceEditor: () => null }));
vi.mock('@/components/admin/SettingHelp', () => ({ SettingHelp: () => null }));
vi.mock('@/components/admin/CompanyCommercialSettings', () => ({ default: () => <h2>Comercial</h2> }));
vi.mock('@/hooks/useCompanyFeatures', () => ({ useCompanyFeatures: () => ({ hasWhatsApp: false, loading: false }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ role: 'admin', companyId: 'a' }) }));
vi.mock('@/contexts/MasterContext', () => ({ useMaster: () => ({ isViewingCompany: false }) }));
vi.mock('@/lib/companyProductSettings', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/companyProductSettings')>(),
  fetchCompanyProductSettings: vi.fn(async () => ({ settings: structuredClone(DEFAULT_COMPANY_PRODUCT_SETTINGS), version: 1 })),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('mounts integration preparation from actual settings navigation and uses only status RPC', async () => {
  rpc.mockResolvedValue({ data: [
    { provider: 'asaas', configured: true, mask: '••••••••', version: 1, consumer_enabled: false },
    { provider: 'whatsapp_evolution', configured: false, mask: null, version: 0, consumer_enabled: false },
  ], error: null });
  await act(async () => { render(<MemoryRouter><ProductSettings /></MemoryRouter>); });
  const integrationsTab = screen.getByText('Integrações', { selector: 'button' });
  await act(async () => { fireEvent.click(integrationsTab); });
  expect(screen.getByText('Conexão em uso', { selector: 'h2' }).closest('section[hidden]')).toBeNull();
  const preparation = screen.getByText('Credenciais próprias da empresa · preparação');
  fireEvent.click(preparation);
  expect(preparation.closest('details')).toHaveAttribute('open');
  expect(screen.getByText(/Chave preparada neste cofre — ativação futura/)).toBeInTheDocument();
  expect(rpc).toHaveBeenCalledExactlyOnceWith('get_company_integration_status', { _company_id: 'a' });
  expect(screen.getByLabelText('Nova chave Asaas').closest('details')).toBe(preparation.closest('details'));
  expect(screen.getByLabelText('Nova chave Asaas')).toHaveValue('');

  fireEvent.change(screen.getByLabelText('Nova chave Asaas'), { target: { value: 'chave-ficticia-em-edicao' } });
  await act(async () => { fireEvent.click(screen.getByText('Identidade', { selector: 'button' })); });
  expect(screen.getByText('Comercial', { selector: 'h2' }).closest('section[hidden]')).toBeNull();
  expect(screen.getByLabelText('Nova chave Asaas').closest('section[hidden]')).not.toBeNull();
  fireEvent.click(integrationsTab);
  expect(screen.getByLabelText('Nova chave Asaas').closest('section[hidden]')).toBeNull();
  expect(screen.getByLabelText('Nova chave Asaas')).toHaveValue('chave-ficticia-em-edicao');
  expect(rpc).toHaveBeenCalledExactlyOnceWith('get_company_integration_status', { _company_id: 'a' });
}, 20_000); // Slow jsdom workers measured >10 s for the complete navigation.
