import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_COMPANY_PRODUCT_SETTINGS } from '@/lib/companyProductSettings';
import ProductSettings from './ProductSettings';

const mocks = vi.hoisted(() => ({
  auth: { role: 'admin', companyId: 'company-a' },
  master: { isViewingCompany: false, viewingCompany: null },
  fetch: vi.fn(), save: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/contexts/MasterContext', () => ({ useMaster: () => mocks.master }));
vi.mock('@/lib/companyProductSettings', async (original) => ({
  ...await original<typeof import('@/lib/companyProductSettings')>(),
  fetchCompanyProductSettings: mocks.fetch,
  saveCompanyProductSettings: mocks.save,
}));
vi.mock('@/components/admin/FormDefinitionManager', () => ({ default: () => <div>Formularios</div> }));

describe('company product settings screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth = { role: 'admin', companyId: 'company-a' };
    mocks.master = { isViewingCompany: false, viewingCompany: null };
    mocks.fetch.mockResolvedValue({ settings: structuredClone(DEFAULT_COMPANY_PRODUCT_SETTINGS), version: 7 });
    mocks.save.mockImplementation(async (_id, settings) => ({ settings, version: 8 }));
  });

  it('persists the selected company and expected version, then reflects the returned version', async () => {
    render(<ProductSettings />);
    const editor = await screen.findByLabelText('Mensagem');
    fireEvent.change(editor, { target: { value: 'Ola, {{primeiro_nome}}! Como foi a semana?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('company-a', expect.objectContaining({
      messages: DEFAULT_COMPANY_PRODUCT_SETTINGS.messages,
      message_sequences: expect.objectContaining({ weekly_contact: [expect.objectContaining({ type: 'text', text: 'Ola, {{primeiro_nome}}! Como foi a semana?' })] }),
    }), 7));
    expect(await screen.findByText('Versão 8')).toBeInTheDocument();
  });

  it.each(['PT409', '40001'])('preserves the draft on conflict %s instead of claiming a successful save', async (code) => {
    mocks.save.mockRejectedValue({ code, message: 'version conflict' });
    render(<ProductSettings />);
    fireEvent.change(await screen.findByLabelText('Mensagem'), { target: { value: 'Meu rascunho' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Outra pessoa');
    expect(screen.getByLabelText('Mensagem')).toHaveValue('Meu rascunho');
  });

  it('does not load company configuration for students', () => {
    mocks.auth = { role: 'student', companyId: 'company-a' };
    render(<ProductSettings />);
    expect(screen.getByRole('alert')).toHaveTextContent('administrador');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('requires a master to select a company before loading', () => {
    mocks.auth = { role: 'master', companyId: '' };
    render(<ProductSettings />);
    expect(screen.getByText('Selecione uma empresa no painel master.')).toBeInTheDocument();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('does not apply an old tenant save response after changing company', async () => {
    let finishSave!: (value: unknown) => void;
    mocks.save.mockImplementation(() => new Promise(resolve => { finishSave = resolve; }));
    const { rerender } = render(<ProductSettings />);
    fireEvent.change(await screen.findByLabelText('Mensagem'), { target: { value: 'Rascunho da empresa A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    mocks.auth = { role: 'admin', companyId: 'company-b' };
    rerender(<ProductSettings />);
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith('company-b'));
    await screen.findByLabelText('Mensagem');
    finishSave({ settings: { ...structuredClone(DEFAULT_COMPANY_PRODUCT_SETTINGS), brand: { ...DEFAULT_COMPANY_PRODUCT_SETTINGS.brand, company_name: 'Empresa A' } }, version: 8 });
    await waitFor(() => expect(screen.getByText('Versão 7')).toBeInTheDocument());
    expect(screen.queryByText('Empresa A')).not.toBeInTheDocument();
    expect(screen.queryByText('Configurações salvas.')).not.toBeInTheDocument();
  });

  it('rejects an unsafe contact interval before any write and keeps the input', async () => {
    render(<ProductSettings />);
    await screen.findByLabelText('Mensagem');
    fireEvent.click(screen.getByRole('button', { name: 'Contatos' }));
    const interval = screen.getByLabelText('Intervalo mínimo entre contatos (h)');
    fireEvent.change(interval, { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('contact_policy.minimum_interval_hours');
    expect(mocks.save).not.toHaveBeenCalled();
    expect(interval).toHaveValue(1);
  });

  it('does not let an old tenant acknowledgement unlock a newer pending save', async () => {
    let finishA!: (value: unknown) => void;
    let finishB!: (value: unknown) => void;
    mocks.save.mockImplementationOnce(() => new Promise(resolve => { finishA = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { finishB = resolve; }));
    const { rerender } = render(<ProductSettings />);
    fireEvent.change(await screen.findByLabelText('Mensagem'), { target: { value: 'Empresa A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    mocks.auth = { role: 'admin', companyId: 'company-b' };
    rerender(<ProductSettings />);
    await waitFor(() => expect(screen.getByLabelText('Mensagem')).toHaveValue(DEFAULT_COMPANY_PRODUCT_SETTINGS.messages.weekly_contact));
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Empresa B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    await act(async () => finishA({ settings: structuredClone(DEFAULT_COMPANY_PRODUCT_SETTINGS), version: 8 }));
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expect(screen.getByLabelText('Mensagem')).toHaveValue('Empresa B');
    await act(async () => finishB({ settings: { ...structuredClone(DEFAULT_COMPANY_PRODUCT_SETTINGS), messages: { ...DEFAULT_COMPANY_PRODUCT_SETTINGS.messages, weekly_contact: 'Empresa B' } }, version: 8 }));
    expect(await screen.findByText('Configurações salvas.')).toBeInTheDocument();
    expect(screen.getByLabelText('Mensagem')).toHaveValue('Empresa B');
  });

  it('previews invalid template text without crashing or sending a message', async () => {
    render(<ProductSettings />);
    fireEvent.change(await screen.findByLabelText('Mensagem'), { target: { value: 'Oi {{nao_existe}}' } });
    expect(screen.getByTestId('message-preview')).toHaveTextContent('Revise as variáveis');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('messages.weekly_contact.variable');
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('offers only variables supplied by the selected event and refuses unsupported tokens before saving', async () => {
    render(<ProductSettings />);
    await screen.findByLabelText('Mensagem');
    expect(screen.queryByRole('button', { name: '{{link}}' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '{{email}}' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Oi {{link}}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('messages.weekly_contact.variable.link');
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Evento'), { target: { value: 'fiscal_invite' } });
    expect(screen.getByRole('button', { name: '{{link}}' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '{{email}}' })).not.toBeInTheDocument();
  });
});
