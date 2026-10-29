import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';

const state = vi.hoisted(() => ({
  role: 'admin', viewing: false, permissions: true,
  features: { hasDashboard: true, hasFinancial: true, hasWhatsApp: true },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ role: state.role, user: { id: 'test' }, signOut: vi.fn() }) }));
vi.mock('@/hooks/useCompanyFeatures', () => ({ useCompanyFeatures: () => state.features }));
vi.mock('@/hooks/useRolePermissions', () => ({ useRolePermissions: () => ({ canAccess: () => state.permissions }) }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ settings: {} }) }));
vi.mock('@/contexts/MasterContext', () => ({ useMaster: () => ({ isViewingCompany: state.viewing, viewingCompany: state.viewing ? { id: 'company', name: 'Company' } : null, exitCompanyView: vi.fn() }) }));
vi.mock('@/components/WhatsAppChatPanelContext', () => ({ useWhatsAppChatPanel: () => ({ openChatPanel: vi.fn() }) }));
vi.mock('@/components/Logo', () => ({ Logo: () => <span>SETT</span> }));

beforeEach(() => {
  state.role = 'admin'; state.viewing = false; state.permissions = true;
  state.features = { hasDashboard: true, hasFinancial: true, hasWhatsApp: true };
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
});
afterEach(cleanup);
function sidebar(role: string, viewing = false) {
  state.role = role; state.viewing = viewing;
  render(<MemoryRouter initialEntries={['/' + role + '/whatsapp-templates']}><SidebarProvider><AppSidebar /></SidebarProvider></MemoryRouter>);
}
function hrefs() { return screen.queryAllByRole('link').map(link => link.getAttribute('href')); }

describe('settings-only company navigation', () => {
  it.each(['admin', 'coordinator', 'trainer', 'master', 'student'])('removes management and diagnostic sidebar entries for %s', role => {
    sidebar(role);
    for (const target of ['/admin/governance', '/admin/operations', '/suporte', `/${role}/whatsapp`]) expect(hrefs()).not.toContain(target);
    expect(screen.queryByText('Diagnóstico')).not.toBeInTheDocument();
    expect(screen.queryByText('Operação e relatórios')).not.toBeInTheDocument();
    expect(hrefs()).not.toContain('/admin/content-studio');
    expect(hrefs().includes('/master/bn-content')).toBe(role === 'master');
    expect(hrefs().includes('/admin/settings')).toBe(role === 'admin');
  });
  it('keeps master BN links outside company view and admin settings inside it', () => {
    sidebar('master', true);
    expect(hrefs()).toContain('/admin/settings');
    expect(hrefs()).toContain('/admin/students');
    expect(hrefs()).not.toContain('/master/bn-content');
    expect(hrefs()).not.toContain('/admin/content-studio');
    expect(hrefs()).not.toContain('/admin/governance');
    expect(hrefs()).not.toContain('/admin/operations');
    expect(hrefs()).not.toContain('/suporte');
  });
  it.each(['admin', 'coordinator', 'trainer'])('preserves WhatsApp tools without its settings duplicate for %s', role => {
    sidebar(role);
    expect(hrefs()).toContain(`/${role}/whatsapp-templates`);
    expect(hrefs()).toContain(`/${role}/whatsapp-automation`);
    expect(screen.getByRole('button', { name: 'Conversas' })).toBeInTheDocument();
    expect(hrefs()).not.toContain(`/${role}/whatsapp`);
    if (role !== 'admin') expect(hrefs()).toContain(`/${role}/settings`);
  });
  it.each(['coordinator', 'trainer'])('preserves diagnostic settings without granting admin settings or WhatsApp when %s lacks permission', role => {
    state.permissions = false;
    sidebar(role);
    expect(hrefs()).not.toContain('/admin/settings');
    expect(hrefs()).toContain(`/${role}/settings`);
    expect(screen.queryByText('WhatsApp')).not.toBeInTheDocument();
    expect(hrefs()).not.toContain(`/${role}/students`);
  });
  it.each(['coordinator', 'trainer'])('preserves diagnostic settings without the WhatsApp feature for %s', role => {
    state.features.hasWhatsApp = false;
    sidebar(role);
    expect(hrefs()).toContain(`/${role}/settings`);
    expect(screen.queryByText('WhatsApp')).not.toBeInTheDocument();
  });
  it('keeps settings available to the basic admin without enabling paid features', () => {
    state.features = { hasDashboard: false, hasFinancial: false, hasWhatsApp: false };
    sidebar('admin');
    expect(hrefs()).toEqual(['/admin/settings']);
    expect(screen.queryByText('WhatsApp')).not.toBeInTheDocument();
  });
});
