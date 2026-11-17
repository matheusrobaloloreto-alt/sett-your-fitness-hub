import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import WhatsAppAutomation from './WhatsAppAutomation';

const mocks = vi.hoisted(() => ({ from: vi.fn(), success: vi.fn(), error: vi.fn(), deleted: vi.fn(), role: 'coordinator' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'actor' }, role: mocks.role, companyId: 'company' }) }));
vi.mock('@/contexts/MasterContext', () => ({ useMaster: () => ({ viewingCompany: null, isViewingCompany: false }) }));
vi.mock('@/components/flow-builder/FlowCanvas', () => ({ FlowCanvas: () => <div>Editor preservado</div> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.role = 'coordinator'; });

for (const result of [{ data: null, error: { code: '42501' } }, { data: [], error: null }]) {
  it(`keeps editor open without success acknowledgement for ${result.error ? 'DB error' : 'zero deleted rows'}`, async () => {
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [{ id: 'flow', company_id: 'company', name: 'Fluxo QA', trigger_type: 'manual', is_active: true }] }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: mocks.deleted }) }) }),
    };
    mocks.deleted.mockResolvedValue(result);
    mocks.from.mockReturnValue(query);
    render(<MemoryRouter><WhatsAppAutomation /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Fluxo QA'));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce());
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByText('Editor preservado')).toBeInTheDocument();
    expect(query.order).toHaveBeenCalledOnce();
    expect(mocks.deleted).toHaveBeenCalledWith('id');
  });
}

it('links admins to Configurações instead of exposing a second editor', async () => {
  mocks.role = 'admin';
  const flow = { id: 'flow&tab=other', company_id: 'company', name: 'Fluxo QA', trigger_type: 'weekly_contact', is_active: true };
  mocks.from.mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [flow] }) });
  render(<MemoryRouter><WhatsAppAutomation /></MemoryRouter>);
  fireEvent.click(await screen.findByText('Fluxo QA'));
  expect(screen.getByRole('link', { name: /editar condições do contato semanal/i })).toHaveAttribute('href', '/admin/settings?tab=contact_policy&flowId=flow%26tab%3Dother');
  expect(screen.queryByRole('checkbox', { name: 'Exigir inatividade no WhatsApp' })).toBeNull();
  expect(mocks.from).toHaveBeenCalledOnce();
});

it('keeps existing coordinator access to the same flow settings without company-wide controls', async () => {
  const flow = { id: 'flow', company_id: 'company', name: 'Fluxo QA', trigger_type: 'weekly_contact', is_active: true };
  const other = { ...flow, id: 'other', name: 'Outro fluxo', trigger_type: 'manual' };
  const settings = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    overrideTypes: vi.fn().mockResolvedValue({ data: [{ ...flow, weekly_contact_inactivity_hours: 24, weekly_contact_interval_hours: 0 }] }) };
  mocks.from.mockReturnValueOnce({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [flow, other] }) }).mockReturnValue(settings);
  render(<MemoryRouter><WhatsAppAutomation /></MemoryRouter>);
  fireEvent.click(await screen.findByText('Fluxo QA'));
  expect(await screen.findByLabelText('Tempo sem conversa no WhatsApp (h)')).toHaveValue(24);
  expect(screen.getByRole('checkbox', { name: 'Exigir intervalo adicional entre contatos semanais' })).not.toBeChecked();
  expect(settings.eq).toHaveBeenCalledWith('company_id', 'company');
  expect(settings.eq).toHaveBeenCalledWith('id', 'flow');
  expect(screen.queryByRole('link', { name: /editar condições do contato semanal/i })).toBeNull();
  const switchFlow = screen.getByRole('button', { name: /outro fluxo/i });
  fireEvent.change(screen.getByLabelText('Tempo sem conversa no WhatsApp (h)'), { target: { value: '48' } });
  expect(switchFlow).toBeDisabled();
  fireEvent.click(switchFlow);
  expect(screen.getByLabelText('Tempo sem conversa no WhatsApp (h)')).toHaveValue(48);
  fireEvent.click(screen.getByRole('button', { name: 'Descartar alterações do fluxo' }));
  expect(switchFlow).toBeEnabled();
  fireEvent.click(switchFlow);
  expect(screen.queryByLabelText('Tempo sem conversa no WhatsApp (h)')).toBeNull();
});

it.each(['coordinator', 'trainer'])('protects the weekly draft from an in-app route exit for %s', async role => {
  mocks.role = role;
  const flow = { id: 'flow', company_id: 'company', name: 'Fluxo QA', trigger_type: 'weekly_contact', is_active: true };
  const settings = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    overrideTypes: vi.fn().mockResolvedValue({ data: [{ ...flow, weekly_contact_inactivity_hours: 24, weekly_contact_interval_hours: 0 }] }) };
  mocks.from.mockReturnValueOnce({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [flow] }) }).mockReturnValue(settings);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  try {
    render(<MemoryRouter initialEntries={['/automacao']}>
      <Link to="/painel">Ir ao painel</Link>
      <Routes>
        <Route path="/automacao" element={<WhatsAppAutomation />} />
        <Route path="/painel" element={<h1>Painel de teste</h1>} />
      </Routes>
    </MemoryRouter>);
    fireEvent.click(await screen.findByText('Fluxo QA'));
    fireEvent.change(await screen.findByLabelText('Tempo sem conversa no WhatsApp (h)'), { target: { value: '48' } });
    fireEvent.click(screen.getByRole('link', { name: 'Ir ao painel' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Tempo sem conversa no WhatsApp (h)')).toHaveValue(48);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('link', { name: 'Ir ao painel' }));
    expect(await screen.findByRole('heading', { name: 'Painel de teste' })).toBeVisible();
  } finally {
    confirm.mockRestore();
  }
});

it('pauses through one tenant-scoped compare-and-swap and reports an unconfirmed write', async () => {
  const query = {
    select: vi.fn(), eq: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [{ id: 'flow', company_id: 'company', name: 'Fluxo QA', trigger_type: 'manual', is_active: true }] }),
  };
  query.select.mockImplementation((columns) => columns === 'id' ? Promise.resolve({ data: [] }) : query);
  mocks.from.mockReturnValue(query);

  render(<MemoryRouter><WhatsAppAutomation /></MemoryRouter>);
  fireEvent.click(await screen.findByText('Fluxo QA'));
  fireEvent.click(screen.getByRole('switch', { name: 'Ativo' }));

  await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce());
  expect(query.update).toHaveBeenCalledExactlyOnceWith({ is_active: false });
  expect(query.eq).toHaveBeenCalledWith('is_active', true);
  expect(mocks.from).not.toHaveBeenCalledWith('flow_sessions');
});
