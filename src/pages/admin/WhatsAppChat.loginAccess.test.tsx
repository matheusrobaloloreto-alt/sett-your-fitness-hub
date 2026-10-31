import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import WhatsAppChat from './WhatsAppChat';
import { transientLoginNavigation } from '@/lib/whatsappChatPanel';
const api = vi.hoisted(() => ({ auth: { user: { id: 'staff' }, role: 'admin', companyId: 'company-a' }, fetch: vi.fn(), from: vi.fn(), session: vi.fn(), error: vi.fn(), ack: true, missingAck: false, availableChats: [] as Array<Record<string, unknown>> }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => api.auth }));
vi.mock('@/contexts/MasterContext', () => ({ useMaster: () => ({ isViewingCompany: false, viewingCompany: null }) }));
vi.mock('react-router-dom', () => ({ useLocation: () => ({ pathname: '/admin/whatsapp-chat', state: null }), useNavigate: () => vi.fn() }));
vi.mock('@/hooks/useWhatsAppSignature', () => ({ useWhatsAppSignature: () => [false, vi.fn()] }));
vi.mock('sonner', () => ({ toast: { error: api.error, success: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/appPerformanceTelemetry', () => ({ recordAppPerformanceSample: vi.fn() }));
vi.mock('@/lib/studentFiles', () => ({ listStudentFiles: vi.fn(async () => []) }));
vi.mock('@/components/AthleticClubStar', () => ({ AthleticClubStar: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: api.from, auth: { getSession: api.session }, channel: () => { const c = { on: () => c, subscribe: () => c }; return c; }, removeChannel: vi.fn(), functions: { invoke: vi.fn(async () => ({ data: {}, error: null })) } } }));
vi.mock('@/lib/companyFeatureEntitlements', async original => ({ ...await original<typeof import('@/lib/companyFeatureEntitlements')>(), fetchCompanyEntitlements: async () => ({ tier: 'advanced', features: { hasWhatsApp: true } }) }));
const request = { requestId: 1, companyId: 'company-a', studentId: 'student-a', chatId: 'chat-a', phone: '5548999990001', prefillMessage: 'synthetic password draft', loginAccess: { studentId: 'student-a', preflightToken: 'signed-send-token' } };
const chats = [
 { id: 'chat-a', company_id: 'company-a', student_id: 'student-a', remote_jid: '5548999990001@s.whatsapp.net', contact_name: 'Synthetic A', unread_count: 0, last_message_at: '2026-10-29T12:00:00Z', history_synced_at: '2026-10-29T12:00:00Z' },
 { id: 'chat-b', company_id: 'company-a', student_id: 'student-b', remote_jid: '5548999990002@s.whatsapp.net', contact_name: 'Synthetic B', unread_count: 0, last_message_at: '2026-10-29T12:00:00Z', history_synced_at: '2026-10-29T12:00:00Z' },
];
beforeEach(() => {
 api.auth.companyId = 'company-a'; api.ack = true; api.missingAck = false; api.availableChats = chats; api.error.mockReset();
 api.session.mockReset().mockResolvedValue({ data: { session: { access_token: 'synthetic-auth' } } });
 api.from.mockImplementation((table: string) => {
  const filters: Record<string, unknown> = {};
  const result = () => ({ data: table === 'whatsapp_chats' ? api.availableChats.filter(chat => !filters.company_id || chat.company_id === filters.company_id) : [], error: null });
  const q = { select: () => q, order: () => q, in: () => q, is: () => q, not: () => q, or: () => q, limit: () => q, range: () => q, gte: () => q, lte: () => q, neq: () => q,
   eq: (key: string, value: unknown) => { filters[key] = value; return q; }, update: () => q,
   maybeSingle: async () => ({ data: null, error: null }), single: async () => ({ data: null, error: null }),
   then: (resolve: (r: object) => unknown) => Promise.resolve(result()).then(resolve) };
  return q;
 });
 api.fetch.mockReset().mockImplementation(async (_url: string, opts: { body?: string }) => {
  const body = JSON.parse(opts?.body || '{}');
  if (body.action === 'send-message') return { ok: api.ack, json: async () => api.ack ? { success: true, messageId: api.missingAck ? null : 'external-synthetic', chatId: 'chat-a' } : { code: 'student_login_preflight_stale', error: 'synthetic access stale' } };
  return { ok: true, json: async () => ({ success: true, contacts: [], messages: [] }) };
 });
 vi.stubGlobal('fetch', api.fetch);
 Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const sends = () => api.fetch.mock.calls.map(([, opts]) => JSON.parse(opts.body)).filter(body => body.action === 'send-message');
it('carries access metadata through the mounted chat to send-message only after explicit send', async () => {
 render(<WhatsAppChat embedded navigationState={request} />);
 const composer = await screen.findByDisplayValue('synthetic password draft');
 expect(sends()).toEqual([]);
 fireEvent.keyDown(composer, { key: 'Enter', shiftKey: false });
 await waitFor(() => expect(sends()).toHaveLength(1));
 expect(sends()[0]).toMatchObject({ action: 'send-message', companyId: 'company-a', studentId: 'student-a', chatId: 'chat-a', content: 'synthetic password draft', loginAccess: { studentId: 'student-a', preflightToken: 'signed-send-token' } });
});
it('clears password and proof after blocked/uncertain delivery and never retries as ordinary text', async () => {
 api.ack = false;
 render(<WhatsAppChat embedded navigationState={request} />);
 fireEvent.keyDown(await screen.findByDisplayValue('synthetic password draft'), { key: 'Enter' });
 await waitFor(() => expect(api.error).toHaveBeenCalledWith('synthetic access stale'));
 expect(screen.queryByDisplayValue('synthetic password draft')).not.toBeInTheDocument();
 fireEvent.keyDown(screen.getByPlaceholderText('Digite / para templates...'), { key: 'Enter' });
 expect(sends()).toHaveLength(1);
});
it('company switch clears protected draft without sending', async () => {
 const page = render(<WhatsAppChat embedded navigationState={request} />);
 await screen.findByDisplayValue('synthetic password draft');
 api.auth.companyId = 'company-b'; page.rerender(<WhatsAppChat embedded navigationState={request} />);
 await waitFor(() => expect(screen.queryByDisplayValue('synthetic password draft')).not.toBeInTheDocument());
 expect(sends()).toEqual([]);
});
it('rejects a recipient switch while session lookup is pending, before POST', async () => {
 let resolve!: (value: object) => void;
 api.session.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
 const page = render(<WhatsAppChat embedded navigationState={request} />);
 fireEvent.keyDown(await screen.findByDisplayValue('synthetic password draft'), { key: 'Enter' });
 page.rerender(<WhatsAppChat embedded navigationState={{ ...request, requestId: 2, chatId: 'chat-b', studentId: 'student-b', phone: '5548999990002', loginAccess: undefined, prefillMessage: '' }} />);
 await act(async () => resolve({ data: { session: { access_token: 'synthetic-auth' } } }));
 expect(sends()).toEqual([]);
 expect(screen.queryByDisplayValue('synthetic password draft')).not.toBeInTheDocument();
});


it('carries a no-chat proof as null until explicit first send without generating or creating a chat on open', async () => {
 api.availableChats = [];
 render(<WhatsAppChat embedded navigationState={{ ...request, chatId: null }} />);
 const composer = await screen.findByDisplayValue('synthetic password draft');
 expect(sends()).toEqual([]);
 expect(api.fetch.mock.calls.map(([, opts]) => JSON.parse(opts.body).action)).not.toContain('create-chat');
 fireEvent.keyDown(composer, { key: 'Enter' });
 await waitFor(() => expect(sends()).toHaveLength(1));
 expect(sends()[0]).toMatchObject({ chatId: null, studentId: 'student-a', remoteJid: '5548999990001@s.whatsapp.net', loginAccess: request.loginAccess });
 expect(api.fetch.mock.calls.map(([url]) => url).some(url => String(url).includes('student-login-credentials'))).toBe(false);
});
it('blocks a no-chat proof if a linked chat now exists and asks for explicit regeneration', async () => {
 render(<WhatsAppChat embedded navigationState={{ ...request, chatId: null }} />);
 await waitFor(() => expect(api.error).toHaveBeenCalledWith(expect.stringContaining('gere o acesso novamente por ação explícita')));
 expect(screen.queryByDisplayValue('synthetic password draft')).not.toBeInTheDocument();
 expect(sends()).toEqual([]);
});
it('clears a protected draft on another student selection without sending it as a free message', async () => {
 render(<WhatsAppChat embedded navigationState={request} />);
 await screen.findByDisplayValue('synthetic password draft');
 fireEvent.click(screen.getByRole('button', { name: 'Abrir conversa com Synthetic B' }));
 await waitFor(() => expect(screen.queryByDisplayValue('synthetic password draft')).not.toBeInTheDocument());
 fireEvent.keyDown(screen.getByPlaceholderText('Digite / para templates...'), { key: 'Enter' });
 expect(sends()).toEqual([]);
});


it('unmount while session lookup is pending cancels the protected POST', async () => {
 const page = render(<WhatsAppChat embedded navigationState={request} />);
 const composer = await screen.findByDisplayValue('synthetic password draft');
 let resolve!: (value: object) => void;
 api.session.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
 fireEvent.keyDown(composer, { key: 'Enter' }); page.unmount();
 await act(async () => resolve({ data: { session: { access_token: 'synthetic-auth' } } }));
 expect(sends()).toEqual([]);
});


it('treats HTTP 200 without a provider ACK as uncertain and clears proof without a retry', async () => {
 api.missingAck = true;
 render(<WhatsAppChat embedded navigationState={request} />);
 fireEvent.keyDown(await screen.findByDisplayValue('synthetic password draft'), { key: 'Enter' });
 await waitFor(() => expect(api.error).toHaveBeenCalledWith(expect.stringContaining('envio do acesso não foi confirmado')));
 expect(screen.queryByDisplayValue('synthetic password draft')).not.toBeInTheDocument();
 expect(sends()).toHaveLength(1);
});
it('consumes access proof on ACK so a later ordinary message does not inherit the token', async () => {
 render(<WhatsAppChat embedded navigationState={request} />);
 fireEvent.keyDown(await screen.findByDisplayValue('synthetic password draft'), { key: 'Enter' });
 await waitFor(() => expect(screen.queryByRole('button', { name: 'Descartar acesso' })).not.toBeInTheDocument());
 const composer = screen.getByPlaceholderText('Digite / para templates...');
 fireEvent.change(composer, { target: { value: 'ordinary synthetic message' } });
 fireEvent.keyDown(composer, { key: 'Enter' });
 await waitFor(() => expect(sends()).toHaveLength(2));
 expect(sends()[0].loginAccess).toEqual(request.loginAccess);
 expect(sends()[1].loginAccess).toBeUndefined();
});


it('hydrates a password-free navigation handle in the real chat and sends its signed proof', async () => {
 const navigation = transientLoginNavigation(request);
 expect(navigation.prefillMessage).toBeUndefined(); expect(navigation.loginAccess).toBeUndefined();
 render(<WhatsAppChat embedded navigationState={navigation} />);
 fireEvent.keyDown(await screen.findByDisplayValue('synthetic password draft'), { key: 'Enter' });
 await waitFor(() => expect(sends()).toHaveLength(1));
 expect(sends()[0]).toMatchObject({ companyId: request.companyId, studentId: request.studentId, chatId: request.chatId, loginAccess: request.loginAccess, content: 'synthetic password draft' });
});
