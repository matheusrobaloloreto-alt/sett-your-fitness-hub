import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { act, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_COMPANY_PRODUCT_SETTINGS, type SettingsRecord } from '@/lib/companyProductSettings';
import type { MessageMedia, SequenceSettings } from '@/lib/companyMessageSequences';
import ProductSettings from './ProductSettings';

const companyA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const companyB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const mocks = vi.hoisted(() => ({
  auth: { role: 'admin', companyId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
  fetch: vi.fn(), save: vi.fn(), upload: vi.fn(), preview: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/contexts/MasterContext', () => ({ useMaster: () => ({ isViewingCompany: false, viewingCompany: null }) }));
vi.mock('@/lib/companyProductSettings', async () => ({ ...await vi.importActual('@/lib/companyProductSettings'), fetchCompanyProductSettings: mocks.fetch, saveCompanyProductSettings: mocks.save }));
vi.mock('@/lib/companyMessageMedia', async () => ({ ...await vi.importActual('@/lib/companyMessageMedia'), uploadCompanyMessageMedia: mocks.upload, previewCompanyMessageMedia: mocks.preview }));
vi.mock('@/components/admin/FormDefinitionManager', () => ({ default: () => null }));

function initial(): SettingsRecord {
  const settings = structuredClone(DEFAULT_COMPANY_PRODUCT_SETTINGS);
  settings.brand.company_name = 'Empresa de teste';
  settings.messages.pre_registration_confirmation = 'Texto personalizado preservado {{primeiro_nome}}';
  settings.messages.weekly_contact = 'Contato personalizado {{primeiro_nome}}';
  return { settings, version: 4 };
}
function selectEvent(event: string) { fireEvent.change(screen.getByLabelText('Evento'), { target: { value: event } }); }
function media(): MessageMedia { return { bucket: 'whatsapp-media', path: `${companyA}/message-settings/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png`, mimeType: 'image/png', fileName: 'imagem.png' }; }

describe('WhatsApp event sequences in company settings', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.auth.companyId = companyA;
    mocks.fetch.mockResolvedValue(initial());
    mocks.save.mockImplementation(async (_company, settings, version) => ({ settings, version: version + 1 }));
    mocks.upload.mockResolvedValue(media()); mocks.preview.mockResolvedValue('https://example.invalid/signed-preview');
  });

  it('opens and browses legacy settings without materializing sequences, including unrelated saves', async () => {
    render(<ProductSettings />);
    expect(await screen.findByLabelText('Mensagem')).toHaveValue(initial().settings.messages.weekly_contact);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    selectEvent('pre_registration_confirmation');
    expect(screen.getByLabelText('Mensagem')).toHaveValue(initial().settings.messages.pre_registration_confirmation);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Identidade' }));
    fireEvent.change(screen.getByLabelText('Nome público da empresa'), { target: { value: 'Nome editado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(mocks.save.mock.calls[0][1]).not.toHaveProperty('message_sequences');
    expect(mocks.save.mock.calls[0][1].messages).toEqual(initial().settings.messages);
  });

  it('adds below the blocks, keeps per-block variables, removes and enforces 1–10 parts', async () => {
    render(<ProductSettings />); await screen.findByLabelText('Mensagem');
    const first = screen.getByRole('region', { name: 'Mensagem 1' });
    expect(within(first).getByRole('button', { name: 'Remover mensagem 1' })).toBeDisabled();
    // This control stays mounted while blocks grow. Reuse the accessible query result:
    // repeating a document-wide role/name search measures every block's buttons and help.
    const addMessage = screen.getByRole('button', { name: 'Adicionar mensagem' });
    fireEvent.click(addMessage);
    const second = screen.getByRole('region', { name: 'Mensagem 2' });
    fireEvent.change(within(second).getByLabelText('Texto da mensagem 2'), { target: { value: 'Segundo ' } });
    fireEvent.click(within(second).getByRole('button', { name: '{{primeiro_nome}}' }));
    expect(within(second).getByLabelText('Texto da mensagem 2')).toHaveValue('Segundo {{primeiro_nome}}');
    expect(within(second).queryByRole('button', { name: '{{link}}' })).not.toBeInTheDocument();
    for (let count = 2; count < 10; count++) fireEvent.click(addMessage);
    const blocks = screen.getAllByRole('region', { name: /^Mensagem \d+$/ });
    expect(blocks).toHaveLength(10);
    expect(addMessage).toBeDisabled();
    // A disabled add cannot create an eleventh block.
    fireEvent.click(addMessage);
    expect(screen.queryByRole('region', { name: 'Mensagem 11' })).not.toBeInTheDocument();
    fireEvent.click(within(blocks[9]).getByRole('button', { name: 'Remover mensagem 10' }));
    expect(addMessage).toBeEnabled();
    expect(screen.getAllByRole('region', { name: /^Mensagem \d+$/ })).toHaveLength(9);
    expect(within(second).getByLabelText('Texto da mensagem 2')).toHaveValue('Segundo {{primeiro_nome}}');
  });

  it('saves and reloads ordered text/media with optional caption and stable IDs, preserving other copy', async () => {
    const { unmount } = render(<ProductSettings />); await screen.findByLabelText('Mensagem');
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar mensagem' }));
    fireEvent.change(screen.getByLabelText('Tipo da mensagem 2'), { target: { value: 'image' } });
    fireEvent.change(screen.getByLabelText('Anexar arquivo à mensagem 2'), { target: { files: [new File(['image'], 'imagem.png', { type: 'image/png' })] } });
    await screen.findByAltText('imagem.png');
    expect(screen.getByLabelText('Legenda opcional da mensagem 2')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await screen.findByText('Configurações salvas.');
    const saved = mocks.save.mock.calls[0][1] as SequenceSettings;
    expect(saved.messages).toEqual(initial().settings.messages);
    expect(saved.message_sequences?.weekly_contact).toEqual([
      { id: 'legacy-weekly_contact', type: 'text', text: initial().settings.messages.weekly_contact },
      { id: expect.any(String), type: 'image', text: '', media: media() },
    ]);
    expect(mocks.save.mock.calls[0][2]).toBe(4);
    unmount(); mocks.fetch.mockResolvedValue({ settings: saved, version: 5 }); render(<ProductSettings />);
    await screen.findByAltText('imagem.png');
    expect(screen.getByLabelText('Mensagem')).toHaveValue(saved.messages.weekly_contact);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('edits and reloads sequence text while retaining every original legacy message', async () => {
    const { unmount } = render(<ProductSettings />);
    fireEvent.change(await screen.findByLabelText('Mensagem'), { target: { value: 'Nova sequência {{primeiro_nome}}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await screen.findByText('Configurações salvas.');
    const saved = mocks.save.mock.calls[0][1] as SequenceSettings;
    expect(saved.messages).toEqual(initial().settings.messages);
    expect(saved.message_sequences?.weekly_contact?.[0].text).toBe('Nova sequência {{primeiro_nome}}');
    unmount(); mocks.fetch.mockResolvedValue({ settings: saved, version: 5 }); render(<ProductSettings />);
    expect(await screen.findByLabelText('Mensagem')).toHaveValue('Nova sequência {{primeiro_nome}}');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expect(saved.messages.weekly_contact).toBe('Contato personalizado {{primeiro_nome}}');
  });

  it.each(['daily_reminder_title', 'daily_reminder_body', 'new_workout_push_title', 'new_workout_push_body'])('keeps %s as push text with no media editor', async event => {
    render(<ProductSettings />); await screen.findByLabelText('Mensagem'); selectEvent(event);
    expect(screen.getByText('Canal: notificação push · somente texto.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Adicionar mensagem' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Texto push atualizado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(mocks.save.mock.calls[0][1]).not.toHaveProperty('message_sequences');
  });

  it('retains sequence draft on a CAS conflict and switches events without losing blocks', async () => {
    mocks.save.mockRejectedValue({ code: 'PT409' }); render(<ProductSettings />); await screen.findByLabelText('Mensagem');
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar mensagem' }));
    fireEvent.change(screen.getByLabelText('Texto da mensagem 2'), { target: { value: 'Rascunho parte 2' } });
    selectEvent('fiscal_invite'); expect(screen.getByRole('button', { name: '{{link}}' })).toBeInTheDocument();
    selectEvent('weekly_contact'); expect(screen.getByLabelText('Texto da mensagem 2')).toHaveValue('Rascunho parte 2');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Outra pessoa');
    expect(screen.getByLabelText('Texto da mensagem 2')).toHaveValue('Rascunho parte 2');
  });

  it('does not attach a delayed upload after tenant changes and disables saving while uploading', async () => {
    let finish!: (value: MessageMedia) => void;
    mocks.upload.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { rerender } = render(<ProductSettings />); await screen.findByLabelText('Mensagem');
    fireEvent.change(screen.getByLabelText('Tipo da mensagem 1'), { target: { value: 'image' } });
    fireEvent.change(screen.getByLabelText('Anexar arquivo à mensagem 1'), { target: { files: [new File(['image'], 'imagem.png', { type: 'image/png' })] } });
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expect(screen.getByLabelText('Evento')).toBeDisabled();
    mocks.auth.companyId = companyB; rerender(<ProductSettings />);
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith(companyB));
    await screen.findByLabelText('Mensagem');
    await act(async () => finish(media()));
    expect(screen.queryByAltText('imagem.png')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Mensagem')).toHaveValue(initial().settings.messages.weekly_contact);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('keeps an in-flight attachment when navigating to another settings tab', async () => {
    let finish!: (value: MessageMedia) => void;
    mocks.upload.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<ProductSettings />);
    await screen.findByLabelText('Mensagem');
    fireEvent.change(screen.getByLabelText('Tipo da mensagem 1'), { target: { value: 'image' } });
    fireEvent.change(screen.getByLabelText('Anexar arquivo à mensagem 1'), {
      target: { files: [new File(['fixture'], 'imagem.png', { type: 'image/png' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Contatos' }));
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    await act(async () => finish(media()));
    fireEvent.click(screen.getByRole('button', { name: 'Mensagens' }));
    expect(await screen.findByAltText('imagem.png')).toBeInTheDocument();
  });

  it('clears media metadata when switching back to text and never deletes storage objects', async () => {
    const record = initial();
    (record.settings as SequenceSettings).message_sequences = { weekly_contact: [{ id: 'part-image', type: 'image', text: '', media: media() }] };
    mocks.fetch.mockResolvedValue(record); render(<ProductSettings />); await screen.findByAltText('imagem.png');
    fireEvent.change(screen.getByLabelText('Tipo da mensagem 1'), { target: { value: 'text' } });
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Agora texto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await screen.findByText('Configurações salvas.');
    expect(mocks.save.mock.calls[0][1].message_sequences.weekly_contact).toEqual([{ id: 'part-image', type: 'text', text: 'Agora texto' }]);
  });

  it.each([['video', 'video/mp4', 'video.mp4'], ['audio', 'audio/ogg', 'audio.ogg']] as const)('previews and saves a media-only %s sequence without replacing legacy text', async (type, mimeType, fileName) => {
    const attachment = { ...media(), path: media().path.replace(/\.png$/, type === 'video' ? '.mp4' : '.ogg'), mimeType, fileName };
    mocks.upload.mockResolvedValue(attachment); render(<ProductSettings />); await screen.findByLabelText('Mensagem');
    fireEvent.change(screen.getByLabelText('Tipo da mensagem 1'), { target: { value: type } });
    fireEvent.change(screen.getByLabelText('Legenda opcional da mensagem 1'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Anexar arquivo à mensagem 1'), { target: { files: [new File(['synthetic'], fileName, { type: mimeType })] } });
    const preview = await screen.findByLabelText(`Prévia de ${fileName}`);
    expect(preview.tagName.toLowerCase()).toBe(type);
    expect(preview).toHaveAttribute('controls');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await screen.findByText('Configurações salvas.');
    expect(mocks.save.mock.calls[0][1].messages).toEqual(initial().settings.messages);
    expect(mocks.save.mock.calls[0][1].message_sequences.weekly_contact).toEqual([{ id: 'legacy-weekly_contact', type, text: '', media: attachment }]);
  });

  it('preserves the draft on upload failure and rejects missing media before saving', async () => {
    mocks.upload.mockRejectedValue(new Error('Armazenamento indisponível'));
    render(<ProductSettings />); await screen.findByLabelText('Mensagem');
    fireEvent.change(screen.getByLabelText('Tipo da mensagem 1'), { target: { value: 'image' } });
    fireEvent.change(screen.getByLabelText('Anexar arquivo à mensagem 1'), { target: { files: [new File(['x'], 'x.png', { type: 'image/png' })] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Armazenamento indisponível');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.getAllByRole('alert').some(alert => alert.textContent?.includes('message_sequences.media'))).toBe(true));
    expect(mocks.save).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Tipo da mensagem 1')).toHaveValue('image');
  });
});

function render(ui: ReactElement) { return rtlRender(ui, { wrapper: MemoryRouter }); }
