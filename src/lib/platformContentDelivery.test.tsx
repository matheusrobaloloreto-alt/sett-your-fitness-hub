import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), renderSlide: vi.fn(), download: vi.fn(), features: { hasAppearance: true, loading: false }, auth: { user: { id: 'master' }, role: 'master', companyId: '11111111-1111-4111-8111-111111111111' } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/hooks/useCompanyFeatures', () => ({ useCompanyFeatures: () => mocks.features }));
vi.mock('@/contexts/MasterContext', () => ({ useMaster: () => ({ viewingCompany: null }) }));
vi.mock('@/lib/bnContentRenderer', () => ({ renderBnContentSlide: mocks.renderSlide, downloadBnContentBlob: mocks.download }));
import PlatformContentManager from '@/pages/master/PlatformContentManager';
import CompanyContentStudio from '@/pages/admin/CompanyContentStudio';
import { PlatformLandingHero } from '@/components/content/PlatformLandingContent';
import { usePublicPlatformContent } from './platformContentLanding';
import { ManifestoFooter } from '@/components/landing/ManifestoFooter';
import { DEFAULT_PLATFORM_CONTENT, type PlatformContent } from './platformContent';
import { DEFAULT_COMPANY_BRAND, type CompanyContentDocument } from './companyContent';
let draft: PlatformContent; let published: PlatformContent | null; let version: number; let publicVersion: number;
let studio: CompanyContentDocument; let studioVersion: number;
function PublicConsumer() { const content = usePublicPlatformContent(); return <><PlatformLandingHero content={content} /><ManifestoFooter content={content} /></>; }
function mount(ui: React.ReactNode) { return render(<MemoryRouter>{ui}</MemoryRouter>); }
beforeEach(() => {
  draft = structuredClone(DEFAULT_PLATFORM_CONTENT); published = null; version = 0; publicVersion = 0; studioVersion = 0;
  studio = { brand: { ...DEFAULT_COMPANY_BRAND }, posts: [] };
  mocks.auth.role = 'master'; mocks.auth.user.id = 'master'; mocks.features.hasAppearance = true;
  mocks.rpc.mockReset(); mocks.renderSlide.mockReset(); mocks.download.mockReset(); mocks.renderSlide.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() }));
  mocks.rpc.mockImplementation(async (name, args) => {
    if (name === 'get_platform_content_editor') return { data: { document: structuredClone(draft), version, published_version: publicVersion }, error: null };
    if (name === 'save_platform_content') { if (args._expected_version !== version) return { data: null, error: { code: 'PT409' } }; draft = structuredClone(args._document); version++; if (args._publish) { published = structuredClone(draft); publicVersion = version; } return { data: { document: structuredClone(draft), version, published_version: publicVersion }, error: null }; }
    if (name === 'get_public_platform_content') return { data: published?.cms ?? null, error: null };
    if (name === 'get_company_content') return { data: { company_id: args._company_id, version: studioVersion, document: structuredClone(studio) }, error: null };
    if (name === 'save_company_content') { studio = structuredClone(args._document); studioVersion++; return { data: { company_id: args._company_id, version: studioVersion, document: structuredClone(studio) }, error: null }; }
    throw new Error(`Unexpected RPC ${name}`);
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('content delivery via existing RPC boundary (synthetic server)', () => {
  it('saves/reloads a draft without exposing it and publishes copy consumed by hero/footer', async () => {
    let view = mount(<PlatformContentManager />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Título principal'), { target: { value: 'Título sintético publicado' } });
    fireEvent.change(screen.getByLabelText('Descrição do rodapé'), { target: { value: 'Rodapé sintético' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    await screen.findByText('Rascunho salvo. O conteúdo público continua na versão anterior.'); view.unmount();
    view = mount(<PublicConsumer />); expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent('Título sintético publicado'); view.unmount();
    view = mount(<PlatformContentManager />); await waitFor(() => expect(screen.getByLabelText('Título principal')).toHaveValue('Título sintético publicado'));
    fireEvent.click(screen.getByRole('button', { name: 'Publicar versão neste ambiente' })); await screen.findByText('Versão publicada no CMS deste ambiente.'); view.unmount();
    mount(<PublicConsumer />); expect(await screen.findByText('Rodapé sintético')).toBeInTheDocument(); expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Título sintético publicado');
  });
  it('keeps the unsaved CMS draft on conflict and denies non-Master UI', async () => {
    const view = mount(<PlatformContentManager />); await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeEnabled()); version = 4;
    fireEvent.change(screen.getByLabelText('Título principal'), { target: { value: 'Minha edição' } }); fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    expect(await screen.findByRole('status')).toHaveTextContent('A versão mudou'); expect(screen.getByLabelText('Título principal')).toHaveValue('Minha edição'); view.unmount();
    mocks.auth.role = 'admin'; mount(<PlatformContentManager />); expect(screen.getByRole('alert')).toHaveTextContent('exclusivo do Master');
  });
  it('does not fetch or expose company drafts through the quarantined editor', () => {
    mocks.auth.role = 'admin'; mount(<CompanyContentStudio />);
    expect(screen.getByRole('status')).toHaveTextContent('Studio disponível somente no menu master BN.');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.renderSlide).not.toHaveBeenCalled(); expect(mocks.download).not.toHaveBeenCalled();
  });
  it('keeps saved company data untouched when company selection changes', () => {
    mocks.auth.role = 'admin'; const before = structuredClone(studio);
    const view = mount(<CompanyContentStudio />);
    mocks.auth.companyId = '22222222-2222-4222-8222-222222222222';
    view.rerender(<MemoryRouter><CompanyContentStudio /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('Studio disponível somente no menu master BN.');
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(studio).toEqual(before); expect(studioVersion).toBe(0);
    mocks.auth.companyId = '11111111-1111-4111-8111-111111111111';
  });
});
