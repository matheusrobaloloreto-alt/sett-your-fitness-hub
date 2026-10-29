import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyOnboarding from './CompanyOnboarding';

const state = vi.hoisted(() => ({ role: 'admin', enabled: true, save: vi.fn(), read: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ companyId: 'company-a', role: state.role }) }));
vi.mock('@/contexts/MasterContext', () => ({ useMaster: () => ({ viewingCompany: { id: 'company-a' }, isViewingCompany: true }) }));
vi.mock('@/lib/companyAiConfig', () => ({ fetchCompanyAiConfig: async () => ({ assistant_name: 'Setty' }), saveCompanyAiConfig: (...args: unknown[]) => state.save(...args) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => ({ select: (columns: string) => ({ eq: (key: string, company: string) => ({ maybeSingle: async () => { state.read(table, columns, key, company); return { data: { bnito_whatsapp_enabled: state.enabled }, error: null }; } }) }) }) } }));
afterEach(cleanup);
beforeEach(() => {
  state.role = 'admin'; state.enabled = true; state.read.mockClear();
  state.save.mockReset().mockImplementation(async (_company: string, patch: { bnito_whatsapp_enabled?: boolean }) => { if (patch.bnito_whatsapp_enabled != null) state.enabled = patch.bnito_whatsapp_enabled; return { error: null }; });
});
describe('company assistant WhatsApp toggle', () => {
  it('loads, labels and persists the exact dispatcher field for company admin', async () => {
    render(<CompanyOnboarding />);
    const toggle = await screen.findByRole('switch', { name: 'Assistente no WhatsApp' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledWith('company-a', expect.objectContaining({ bnito_whatsapp_enabled: false })));
    expect(state.enabled).toBe(false);
    expect(state.read).toHaveBeenCalledWith('company_ai_config', 'bnito_whatsapp_enabled', 'company_id', 'company-a');
  });
  it('exposes the switch to master in company context', async () => {
    state.role = 'master'; render(<CompanyOnboarding />);
    expect(await screen.findByRole('switch', { name: 'Assistente no WhatsApp' })).toBeEnabled();
  });
  it('does not expose or submit the flag for a trainer', async () => {
    state.role = 'trainer'; render(<CompanyOnboarding />);
    await screen.findByRole('button', { name: 'Salvar rascunho' });
    expect(screen.queryByRole('switch', { name: 'Assistente no WhatsApp' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    await waitFor(() => expect(state.save).toHaveBeenCalled());
    expect(state.save.mock.calls[0][1]).not.toHaveProperty('bnito_whatsapp_enabled');
  });
});
