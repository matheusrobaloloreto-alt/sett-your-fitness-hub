import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WhatsAppChatPanelProvider } from './WhatsAppChatPanel';
import { useWhatsAppChatPanel } from './WhatsAppChatPanelContext';
const scope = vi.hoisted(() => ({ companyId: 'company-a', user: { id: 'staff' } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ role: 'admin', ...scope }) }));
vi.mock('@/contexts/MasterContext', () => ({ useMaster: () => ({ isViewingCompany: false, viewingCompany: null }) }));
vi.mock('@/hooks/useCompanyFeatures', () => ({ useCompanyFeatures: () => ({ hasWhatsApp: true, loading: false }) }));
vi.mock('@/hooks/useRolePermissions', () => ({ useRolePermissions: () => ({ canAccess: () => true, loading: false }) }));
vi.mock('react-router-dom', () => ({ useLocation: () => ({ pathname: '/admin/students' }) }));
vi.mock('@/pages/admin/WhatsAppChat', () => ({ default: ({ navigationState }: { navigationState: { prefillMessage?: string; loginAccess?: { preflightToken: string } } }) => <div>{navigationState.prefillMessage}<span>{navigationState.loginAccess?.preflightToken}</span></div> }));
function Controls() {
 const panel = useWhatsAppChatPanel();
 return <><button onClick={() => panel.openChatPanel({ companyId: 'company-a', prefillMessage: 'synthetic secret', loginAccess: { studentId: 'student-a', preflightToken: 'synthetic proof' } })}>Open protected</button><button onClick={panel.closeChatPanel}>Close protected</button></>;
}
afterEach(() => { cleanup(); scope.companyId = 'company-a'; });
it('purges protected request on close instead of restoring it with the generic launcher', async () => {
 render(<WhatsAppChatPanelProvider><Controls /></WhatsAppChatPanelProvider>);
 fireEvent.click(screen.getByText('Open protected'));
 await screen.findByText('synthetic secret');
 fireEvent.click(screen.getByText('Close protected'));
 fireEvent.click(screen.getByLabelText('Abrir conversas do WhatsApp'));
 await waitFor(() => expect(screen.queryByText('synthetic secret')).not.toBeInTheDocument());
 expect(screen.queryByText('synthetic proof')).not.toBeInTheDocument();
});
it('purges protected request on company switch', async () => {
 const page = render(<WhatsAppChatPanelProvider><Controls /></WhatsAppChatPanelProvider>);
 fireEvent.click(screen.getByText('Open protected')); await screen.findByText('synthetic secret');
 scope.companyId = 'company-b'; page.rerender(<WhatsAppChatPanelProvider><Controls /></WhatsAppChatPanelProvider>);
 fireEvent.click(screen.getByLabelText('Abrir conversas do WhatsApp'));
 await waitFor(() => expect(screen.queryByText('synthetic secret')).not.toBeInTheDocument());
 expect(screen.queryByText('synthetic proof')).not.toBeInTheDocument();
});
