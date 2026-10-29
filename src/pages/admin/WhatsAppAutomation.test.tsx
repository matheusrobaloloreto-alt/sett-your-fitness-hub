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
