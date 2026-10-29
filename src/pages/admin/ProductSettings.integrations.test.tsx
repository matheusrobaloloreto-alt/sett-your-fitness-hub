import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ProductSettings from './ProductSettings';
import { DEFAULT_COMPANY_PRODUCT_SETTINGS } from '@/lib/companyProductSettings';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
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
  render(<MemoryRouter><ProductSettings /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: /^Integrações$/ }));
  expect(await screen.findByRole('heading', { name: 'Conexão em uso' })).toBeVisible();
  const preparation = screen.getByText('Credenciais próprias da empresa · preparação');
  fireEvent.click(preparation);
  expect(preparation.closest('details')).toHaveAttribute('open');
  expect(await screen.findByText(/Chave preparada neste cofre — ativação futura/)).toBeInTheDocument();
  expect(rpc).toHaveBeenCalledExactlyOnceWith('get_company_integration_status', { _company_id: 'a' });
  expect(screen.getByLabelText('Nova chave Asaas')).toBeVisible();
  expect(screen.getByLabelText('Nova chave Asaas')).toHaveValue('');
});
