// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { normalizeCompanyProductSettings } from '../supabase/functions/_shared/company-product-settings';
import ProductSettings from '../src/pages/admin/ProductSettings';

const mocks = vi.hoisted(() => ({ auth: { role: 'admin', companyId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, fetch: vi.fn(), save: vi.fn(), upload: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/contexts/MasterContext', () => ({ useMaster: () => ({ isViewingCompany: false, viewingCompany: null }) }));
vi.mock('@/lib/companyProductSettings', async () => ({
  ...await import('../supabase/functions/_shared/company-product-settings'),
  fetchCompanyProductSettings: mocks.fetch, saveCompanyProductSettings: mocks.save,
}));
vi.mock('@/lib/companyMessageMedia', () => ({
  MESSAGE_MEDIA_MAX_BYTES: { image: 16777216, video: 16777216, audio: 16777216 },
  MESSAGE_MEDIA_MIME_TYPES: { image: ['image/png'], video: ['video/mp4'], audio: ['audio/ogg'] },
  uploadCompanyMessageMedia: mocks.upload, previewCompanyMessageMedia: vi.fn(async () => 'https://preview.invalid/synthetic'),
}));
vi.mock('@/components/admin/SettingsWorkspaceLinks', () => ({ default: () => null }));
vi.mock('@/components/admin/PrescriptionMethodologyEditor', () => ({ PrescriptionMethodologyEditor: () => null }));

const media = { bucket: 'whatsapp-media', path: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/message-settings/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png', mimeType: 'image/png', fileName: 'late.png' };
let finish: (value: typeof media) => void;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('QA forbids network'); }));
  mocks.auth.companyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  mocks.fetch.mockResolvedValue({ settings: normalizeCompanyProductSettings({ brand: { company_name: 'Synthetic BN', professional_name: 'Existing' }, messages: { weekly_contact: 'BN original' } }), version: 7 });
  mocks.upload.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function startUpload() {
  await screen.findByLabelText('Mensagem');
  fireEvent.change(screen.getByLabelText('Tipo da mensagem 1'), { target: { value: 'image' } });
  fireEvent.change(screen.getByLabelText('Anexar arquivo à mensagem 1'), { target: { files: [new File(['x'], 'late.png', { type: 'image/png' })] } });
  expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
}
it('ignores late upload after section unmount/remount and does not corrupt another event', async () => {
  render(createElement(ProductSettings)); await startUpload();
  fireEvent.click(screen.getByRole('button', { name: 'Identidade' }));
  fireEvent.click(screen.getByRole('button', { name: 'Mensagens' }));
  fireEvent.change(screen.getByLabelText('Evento'), { target: { value: 'fiscal_invite' } });
  const fiscalBefore = (screen.getByLabelText('Mensagem') as HTMLTextAreaElement).value;
  await act(async () => finish(media));
  expect(screen.getByLabelText('Mensagem')).toHaveValue(fiscalBefore);
  expect(screen.queryByAltText('late.png')).not.toBeInTheDocument();
  expect(mocks.save).not.toHaveBeenCalled();
});
it('ignores late upload after whole page unmount', async () => {
  const page = render(createElement(ProductSettings)); await startUpload(); page.unmount();
  await act(async () => finish(media));
  expect(mocks.save).not.toHaveBeenCalled();
  expect(screen.queryByAltText('late.png')).not.toBeInTheDocument();
});
it('keeps existing BN legacy text intact in the exact save payload after editing a sequence', async () => {
  mocks.save.mockImplementation(async (_company, settings) => ({ settings, version: 8 }));
  render(createElement(ProductSettings)); await screen.findByLabelText('Mensagem');
  fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'New explicit sequence text' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  expect(mocks.save.mock.calls[0][1].messages.weekly_contact).toBe('BN original');
  expect(mocks.save.mock.calls[0][1].message_sequences.weekly_contact[0].text).toBe('New explicit sequence text');
  expect(mocks.save.mock.calls[0][1].brand).toMatchObject({ company_name: 'Synthetic BN', professional_name: 'Existing' });
});
