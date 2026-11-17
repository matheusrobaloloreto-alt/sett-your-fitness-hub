import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { act, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_COMPANY_PRODUCT_SETTINGS } from '@/lib/companyProductSettings';
import ProductSettings from './ProductSettings';

const mocks = vi.hoisted(() => ({
  auth: { role: 'admin', companyId: 'company-a' },
  master: { isViewingCompany: false, viewingCompany: null as { id: string; name: string } | null },
  fetch: vi.fn(), save: vi.fn(), from: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/contexts/MasterContext', () => ({ useMaster: () => mocks.master }));
vi.mock('@/lib/companyProductSettings', async (original) => ({
  ...await original<typeof import('@/lib/companyProductSettings')>(),
  fetchCompanyProductSettings: mocks.fetch,
  saveCompanyProductSettings: mocks.save,
}));
vi.mock('@/components/admin/CompanyAchievements', () => ({
  default: () => <label>Conquista em edição<input defaultValue="" /></label>,
}));
vi.mock('@/components/admin/CompanyCommercialSettings', () => ({
  default: () => <label>Comercial preservado<input defaultValue="" /></label>,
}));
vi.mock('@/components/admin/FormDefinitionManager', async () => {
  const { useState } = await import('react');
  return {
    default: function FormDefinitionManagerMock() {
      const [title, setTitle] = useState('Título publicado');
      return <label>Título<input value={title} onChange={event => setTitle(event.target.value)} /></label>;
    },
  };
});

describe('company product settings screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      overrideTypes: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    mocks.auth = { role: 'admin', companyId: 'company-a' };
    mocks.master = { isViewingCompany: false, viewingCompany: null };
    mocks.fetch.mockResolvedValue({ settings: structuredClone(DEFAULT_COMPANY_PRODUCT_SETTINGS), version: 7 });
    mocks.save.mockImplementation(async (_id, settings) => ({ settings, version: 8 }));
  });

  it('edits both weekly conditions in Contatos; confirms one tenant-scoped update and reloads it', async () => {
    const flowId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    let returningWrite = false;
    let persisted = { id: flowId, name: 'Fluxo semanal', is_active: true, weekly_contact_interval_hours: 0, weekly_contact_inactivity_hours: 48 };
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), filter: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      update: vi.fn().mockImplementation(next => {
        returningWrite = true;
        persisted = { ...persisted, ...next };
        return query;
      }),
      overrideTypes: vi.fn().mockImplementation(async () => {
        const data = returningWrite ? [persisted]
          : [{ ...persisted, id: 'other-flow', name: 'Outro fluxo', weekly_contact_inactivity_hours: 0 }, persisted];
        returningWrite = false;
        return { data, error: null };
      }),
    };
    mocks.from.mockReturnValue(query);
    await act(async () => {
      rtlRender(<ProductSettings />, { wrapper: ({ children }) => <MemoryRouter initialEntries={[`/admin/settings?tab=contact_policy&flowId=${flowId}`]}>{children}</MemoryRouter> });
    });
    const interval = screen.getByRole('checkbox', { name: 'Exigir intervalo adicional entre contatos semanais' });
    const inactivity = screen.getByRole('checkbox', { name: 'Exigir inatividade no WhatsApp' });
    expect(screen.getByLabelText('Fluxo de contato semanal')).toHaveValue(flowId);
    expect(interval).not.toBeChecked();
    expect(inactivity).toBeChecked();
    expect(screen.getByLabelText('Tempo sem conversa no WhatsApp (h)')).toHaveValue(48);
    fireEvent.click(interval);
    fireEvent.change(screen.getByLabelText('Intervalo entre contatos semanais (h)'), { target: { value: '192' } });
    fireEvent.click(inactivity);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar condições do fluxo' })); });
    await screen.findByText('Condições do fluxo salvas.');
    expect(query.update).toHaveBeenCalledExactlyOnceWith({ weekly_contact_interval_hours: 192, weekly_contact_inactivity_hours: 0 });
    for (const [key, value] of [['company_id', 'company-a'], ['id', flowId], ['trigger_type', 'weekly_contact'], ['weekly_contact_inactivity_hours', 48]]) {
      expect(query.eq).toHaveBeenCalledWith(key, value);
    }
    expect(query.filter).toHaveBeenCalledExactlyOnceWith('weekly_contact_interval_hours', 'eq', 0);
    expect(mocks.save).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Recarregar condições do fluxo' })); });
    expect(await screen.findByLabelText('Intervalo entre contatos semanais (h)')).toHaveValue(192);
    expect(screen.getByRole('checkbox', { name: 'Exigir inatividade no WhatsApp' })).not.toBeChecked();
  });

  it('keeps a weekly draft after a zero-row write and requires reload before retry', async () => {
    const row = { id: 'weekly-a', name: 'Fluxo semanal', is_active: true, weekly_contact_interval_hours: 0, weekly_contact_inactivity_hours: 0 };
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), filter: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(),
      overrideTypes: vi.fn().mockResolvedValueOnce({ data: [row], error: null }).mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [{ ...row, weekly_contact_inactivity_hours: 72 }], error: null }),
    };
    mocks.from.mockReturnValue(query);
    await act(async () => {
      rtlRender(<ProductSettings />, { wrapper: ({ children }) => <MemoryRouter initialEntries={['/admin/settings?tab=contact_policy&flowId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']}>{children}</MemoryRouter> });
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Exigir inatividade no WhatsApp' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar condições do fluxo' })); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Seu rascunho foi mantido');
    expect(screen.getByLabelText('Tempo sem conversa no WhatsApp (h)')).toHaveValue(24);
    expect(screen.getByRole('button', { name: 'Salvar condições do fluxo' })).toBeDisabled();
    expect(screen.queryByText('Condições do fluxo salvas.')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Descartar rascunho e recarregar condições' })); });
    expect(await screen.findByLabelText('Tempo sem conversa no WhatsApp (h)')).toHaveValue(72);
    expect(query.update).toHaveBeenCalledOnce();
  });

  it('offers an explained expiry policy, persists it by company/version and reloads it', async () => {
    render(<ProductSettings />);
    await screen.findByLabelText('Mensagem');
    fireEvent.click(screen.getByRole('button', { name: 'Prescrição' }));
    const policy = screen.getByLabelText('Após o vencimento do treino');
    expect(policy).toHaveValue('keep_until_replaced');
    fireEvent.click(screen.getByRole('button', { name: 'Sobre Após o vencimento do treino' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('histórico');
    fireEvent.click(screen.getByRole('button', { name: 'Sobre Após o vencimento do treino' }));
    fireEvent.change(policy, { target: { value: 'hide_on_expiry' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('company-a', expect.objectContaining({ prescription: expect.objectContaining({ expired_workout_behavior: 'hide_on_expiry' }) }), 7));
    expect(await screen.findByText('Versão 8')).toBeInTheDocument();
    mocks.fetch.mockResolvedValue({ settings: { ...structuredClone(DEFAULT_COMPANY_PRODUCT_SETTINGS), prescription: { ...DEFAULT_COMPANY_PRODUCT_SETTINGS.prescription, expired_workout_behavior: 'hide_on_expiry' } }, version: 8 });
    fireEvent.click(screen.getByRole('button', { name: 'Recarregar configurações' }));
    await waitFor(() => expect(screen.getByLabelText('Após o vencimento do treino')).toHaveValue('hide_on_expiry'));
  }, 30000);

  it('saves and reloads a birthday draft template for the selected company', async () => {
    await act(async () => { render(<ProductSettings />); });
    fireEvent.change(screen.getByLabelText('Evento'), { target: { value: 'birthday' } });
    expect(screen.getByLabelText('Mensagem')).toHaveValue(DEFAULT_COMPANY_PRODUCT_SETTINGS.messages.birthday);
    const birthday = 'Parabéns, {{primeiro_nome}}!';
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: birthday } });
    expect(screen.getByTestId('message-preview')).toHaveTextContent('Parabéns, Ana!');
    await act(async () => { fireEvent.click(screen.getByText('Salvar', { selector: 'button' })); });
    expect(screen.queryByRole('alert')?.textContent).toBeUndefined();
    expect(screen.getByText('Versão 8')).toBeInTheDocument();
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith('company-a', expect.objectContaining({
      messages: expect.objectContaining({ birthday }),
    }), 7);
    mocks.fetch.mockResolvedValue({ settings: mocks.save.mock.calls[0][1], version: 8 });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Recarregar configurações' })); });
    expect(screen.getByLabelText('Mensagem')).toHaveValue(birthday);
  }, 20_000);

  it('keeps drafts across URL tab changes and relocates the existing controls', async () => {
    render(<ProductSettings />);
    fireEvent.change(await screen.findByLabelText('Mensagem'), { target: { value: 'Rascunho preservado' } });
    expect(screen.queryByRole('button', { name: 'Operação' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Formulários' }));
    expect(screen.getByLabelText('Prazo da primeira prescrição (dias úteis)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Experiência' }));
    expect(screen.getByLabelText('Hora do lembrete diário')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sobre Push de novo treino publicado' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Identidade' }));
    expect(await screen.findByText('Comercial preservado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mensagens' }));
    expect(await screen.findByLabelText('Mensagem')).toHaveValue('Rascunho preservado');
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('accepts a valid query tab and safely defaults an invalid tab', async () => {
    const view = rtlRender(<ProductSettings />, { wrapper: ({ children }) => <MemoryRouter initialEntries={['/admin/settings?tab=forms']}>{children}</MemoryRouter> });
    expect(await screen.findByLabelText('Prazo da primeira prescrição (dias úteis)')).toBeInTheDocument();
    view.unmount();
    rtlRender(<ProductSettings />, { wrapper: ({ children }) => <MemoryRouter initialEntries={['/admin/settings?tab=invalid']}>{children}</MemoryRouter> });
    expect(await screen.findByLabelText('Mensagem')).toBeInTheDocument();
  });

  it('preserves an unpublished form when visiting another settings section', async () => {
    render(<ProductSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Formulários' }));
    const title = await screen.findByLabelText('Título', {}, { timeout: 8000 });
    await waitFor(() => expect(title).toBeEnabled());
    fireEvent.change(title, { target: { value: 'Meu formulário em edição' } });
    fireEvent.click(screen.getByRole('button', { name: 'Contatos' }));
    expect(screen.queryByRole('textbox', { name: 'Título' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Formulários' }));
    await waitFor(() => expect(screen.getByLabelText('Título')).toHaveValue('Meu formulário em edição'));
  }, 15000);

  it.each([
    ['Identidade', 'Comercial preservado'],
    ['Experiência', 'Conquista em edição'],
    ['Prescrição', 'Chave da pergunta extra'],
    ['Formulários', 'Título'],
  ])('keeps the %s editor mounted across tabs and a central reload', async (tab, label) => {
    render(<ProductSettings />);
    fireEvent.click(await screen.findByRole('button', { name: tab }));
    fireEvent.change(await screen.findByLabelText(label), { target: { value: 'rascunho local' } });
    fireEvent.click(screen.getByRole('button', { name: 'Contatos' }));
    expect(screen.queryByRole('textbox', { name: label })).toBeNull();
    mocks.fetch.mockResolvedValue({ settings: structuredClone(DEFAULT_COMPANY_PRODUCT_SETTINGS), version: 8 });
    fireEvent.click(screen.getByRole('button', { name: 'Recarregar configurações' }));
    await screen.findByText('Versão 8');
    fireEvent.click(screen.getByRole('button', { name: tab }));
    expect(await screen.findByLabelText(label)).toHaveValue('rascunho local');
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('clears a mounted auxiliary draft when switching companies', async () => {
    const { rerender } = render(<ProductSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Identidade' }));
    fireEvent.change(await screen.findByLabelText('Comercial preservado'), { target: { value: 'Empresa A' } });
    mocks.auth = { role: 'admin', companyId: 'company-b' };
    rerender(<ProductSettings />);
    expect(await screen.findByLabelText('Comercial preservado')).toHaveValue('');
    expect(mocks.fetch).toHaveBeenCalledWith('company-b');
  });

  it('marks central edits as pending until explicitly discarded', async () => {
    render(<ProductSettings />);
    fireEvent.change(await screen.findByLabelText('Mensagem'), { target: { value: 'Alteração local' } });
    expect(screen.getByText('Alterações gerais pendentes.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Descartar alterações' }));
    expect(screen.queryByText('Alterações gerais pendentes.')).toBeNull();
    expect(screen.getByLabelText('Mensagem')).toHaveValue(DEFAULT_COMPANY_PRODUCT_SETTINGS.messages.weekly_contact);
    expect(mocks.save).not.toHaveBeenCalled();
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

  it.each(['student', 'coordinator', 'trainer'])('does not load or expose save for %s', (role) => {
    mocks.auth = { role, companyId: 'company-a' };
    render(<ProductSettings />);
    expect(screen.getByRole('alert')).toHaveTextContent('administrador');
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('requires a master to select a company before loading', () => {
    mocks.auth = { role: 'master', companyId: '' };
    render(<ProductSettings />);
    expect(screen.getByText('Selecione uma empresa no painel master.')).toBeInTheDocument();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('loads and saves only the company selected by master', async () => {
    mocks.auth = { role: 'master', companyId: 'default-company' };
    mocks.master = { isViewingCompany: true, viewingCompany: { id: 'selected-company', name: 'Empresa selecionada' } };
    render(<ProductSettings />);
    fireEvent.change(await screen.findByLabelText('Mensagem'), { target: { value: 'Rascunho do master' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await screen.findByText('Versão 8');
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith('selected-company');
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith('selected-company', expect.any(Object), 7);
  });

  it('preserves auxiliary editing if the central reload fails', async () => {
    render(<ProductSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Identidade' }));
    const field = await screen.findByLabelText('Comercial preservado');
    fireEvent.change(field, { target: { value: 'Rascunho comercial' } });
    mocks.fetch.mockRejectedValueOnce(new Error('Falha de rede fictícia'));
    fireEvent.click(screen.getByRole('button', { name: 'Recarregar configurações' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha de rede fictícia');
    expect(screen.getByText('Versão 7')).toBeInTheDocument();
    expect(field).toHaveValue('Rascunho comercial');
    expect(mocks.save).not.toHaveBeenCalled();
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

function render(ui: ReactElement) { return rtlRender(ui, { wrapper: MemoryRouter }); }
