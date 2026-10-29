import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: { companyId: '11111111-1111-4111-8111-111111111111', role: 'admin', user: { id: 'operator' } }, features: { hasAppearance: true, loading: false }, get: vi.fn(), save: vi.fn(), upload: vi.fn(), render: vi.fn(), download: vi.fn(), zip: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/hooks/useCompanyFeatures', () => ({ useCompanyFeatures: () => mocks.features }));
vi.mock('@/contexts/MasterContext', () => ({ useMaster: () => ({ viewingCompany: null }) }));
vi.mock('@/lib/companyContent', async original => ({ ...await original<typeof import('@/lib/companyContent')>(), fetchCompanyContent: mocks.get, saveCompanyContent: mocks.save }));
vi.mock('@/lib/companyContentMedia', async original => ({ ...await original<typeof import('@/lib/companyContentMedia')>(), uploadCompanyMedia: mocks.upload }));
vi.mock('@/lib/companyContentMediaRenderer', () => ({ renderCompanyContentSlide: mocks.render }));
vi.mock('@/lib/bnContentRenderer', () => ({ downloadBnContentBlob: mocks.download }));
vi.mock('@/lib/bnContentZip', () => ({ createBnContentZip: mocks.zip }));
import CompanyContentStudio from '@/pages/admin/CompanyContentStudio';
import { CompanyContentPreview } from './CompanyContentPreview';
import { DEFAULT_COMPANY_BRAND, newCompanyPost } from '@/lib/companyContent';
const company = '11111111-1111-4111-8111-111111111111'; const other = '22222222-2222-4222-8222-222222222222';
const asset = { path: `${company}/slides/33333333-3333-4333-8333-333333333333.png`, mime: 'image/png', bytes: 100, width: 64, height: 64 };
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.companyId = company; mocks.auth.role = 'admin'; mocks.features.hasAppearance = true;
  mocks.get.mockImplementation(async id => ({ company_id: id, version: 7, document: { brand: { ...DEFAULT_COMPANY_BRAND, name: id === company ? 'Empresa A' : 'Empresa B' }, posts: [newCompanyPost()] } }));
  mocks.save.mockImplementation(async (_id, document) => ({ version: 8, document }));
  mocks.render.mockResolvedValue(new Blob(['png'])); mocks.zip.mockResolvedValue(new Blob(['zip'])); mocks.upload.mockResolvedValue(asset);
  URL.createObjectURL = vi.fn(() => 'blob:preview'); URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);
// Company UI is quarantined; media/renderer unit coverage remains separate.
it.each(['admin', 'trainer', 'master'])('does not start company media work for %s', role => {
  mocks.auth.role = role;
  render(<CompanyContentStudio />);
  expect(screen.getByRole('status')).toHaveTextContent('Studio disponível somente no menu master BN.');
  expect(screen.queryByLabelText('Enviar logo')).not.toBeInTheDocument();
  expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.render).not.toHaveBeenCalled();
  expect(mocks.download).not.toHaveBeenCalled(); expect(mocks.zip).not.toHaveBeenCalled();
});
it('keeps the candidate closed across A → B → A switches and entitlement changes', () => {
  const view = render(<CompanyContentStudio />);
  for (const id of [other, company]) {
    mocks.auth.companyId = id; mocks.features.hasAppearance = !mocks.features.hasAppearance;
    view.rerender(<CompanyContentStudio />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  }
  expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
});
it('shows load errors and retries preview with fresh media resolution', async () => {
  const post = newCompanyPost(); mocks.render.mockRejectedValueOnce(new Error('Imagem expirou'));
  render(<CompanyContentPreview companyId={company} post={post} brand={DEFAULT_COMPANY_BRAND} index={0} />);
  await screen.findByText('Imagem expirou'); fireEvent.click(screen.getByRole('button', { name: 'Recarregar prévia' }));
  await screen.findByAltText('Prévia do slide 1'); expect(mocks.render).toHaveBeenCalledTimes(2);
});
it('ignores and revokes stale preview state after company switch', async () => {
  let finish!: (value: Blob) => void; const post = newCompanyPost();
  mocks.render.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<CompanyContentPreview companyId={company} post={post} brand={DEFAULT_COMPANY_BRAND} index={0} />);
  view.rerender(<CompanyContentPreview companyId={other} post={post} brand={DEFAULT_COMPANY_BRAND} index={0} />);
  await screen.findByAltText('Prévia do slide 1');
  await act(async () => { finish(new Blob(['old'])); }); expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  view.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
});
