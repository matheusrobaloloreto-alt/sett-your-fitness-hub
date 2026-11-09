import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import WhatsAppAutomation from './WhatsAppAutomation';

const mocks = vi.hoisted(() => ({ from: vi.fn(), success: vi.fn(), error: vi.fn(), deleted: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'actor' }, role: 'coordinator', companyId: 'company' }) }));
vi.mock('@/contexts/MasterContext', () => ({ useMaster: () => ({ viewingCompany: null, isViewingCompany: false }) }));
vi.mock('@/components/flow-builder/FlowCanvas', () => ({ FlowCanvas: () => <div>Editor preservado</div> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

for (const result of [{ data: null, error: { code: '42501' } }, { data: [], error: null }]) {
  it(`keeps editor open without success acknowledgement for ${result.error ? 'DB error' : 'zero deleted rows'}`, async () => {
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [{ id: 'flow', company_id: 'company', name: 'Fluxo QA', trigger_type: 'manual', is_active: true }] }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: mocks.deleted }) }) }),
    };
    mocks.deleted.mockResolvedValue(result);
    mocks.from.mockReturnValue(query);
    render(<WhatsAppAutomation />);
    fireEvent.click(await screen.findByText('Fluxo QA'));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce());
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByText('Editor preservado')).toBeInTheDocument();
    expect(query.order).toHaveBeenCalledOnce();
    expect(mocks.deleted).toHaveBeenCalledWith('id');
  });
}

it('saves inactivity for the selected weekly flow and reads back the confirmed rule', async () => {
  const flow = { id: 'flow', company_id: 'company', name: 'Fluxo QA', trigger_type: 'weekly_contact', is_active: true };
  const query = {
    select: vi.fn(), eq: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(),
    order: vi.fn()
      .mockResolvedValueOnce({ data: [{ ...flow, weekly_contact_inactivity_hours: 0 }] })
      .mockResolvedValueOnce({ data: [{ ...flow, weekly_contact_inactivity_hours: 24 }] }),
  };
  query.select.mockImplementation((columns) => columns === 'id' ? Promise.resolve({ data: [{ id: flow.id }] }) : query);
  mocks.from.mockReturnValue(query);

  render(<WhatsAppAutomation />);
  fireEvent.click(await screen.findByText('Fluxo QA'));
  fireEvent.change(screen.getByLabelText('Inatividade mínima da conversa (horas)'), { target: { value: '24' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar regra' }));

  await screen.findByText(/Salvo: 24 h/);
  expect(query.update).toHaveBeenCalledWith({ weekly_contact_inactivity_hours: 24 });
  expect(query.eq).toHaveBeenCalledWith('weekly_contact_inactivity_hours', 0);
  expect(query.eq).toHaveBeenCalledWith('company_id', 'company');
});

it('pauses through one tenant-scoped compare-and-swap and reports an unconfirmed write', async () => {
  const query = {
    select: vi.fn(), eq: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [{ id: 'flow', company_id: 'company', name: 'Fluxo QA', trigger_type: 'manual', is_active: true }] }),
  };
  query.select.mockImplementation((columns) => columns === 'id' ? Promise.resolve({ data: [] }) : query);
  mocks.from.mockReturnValue(query);

  render(<WhatsAppAutomation />);
  fireEvent.click(await screen.findByText('Fluxo QA'));
  fireEvent.click(screen.getByRole('switch', { name: 'Ativo' }));

  await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce());
  expect(query.update).toHaveBeenCalledExactlyOnceWith({ is_active: false });
  expect(query.eq).toHaveBeenCalledWith('is_active', true);
  expect(mocks.from).not.toHaveBeenCalledWith('flow_sessions');
});
