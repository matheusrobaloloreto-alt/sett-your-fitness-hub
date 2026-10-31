import { unrestrictedMasterFeatures } from '@/lib/companyFeatureEntitlements';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import WhatsAppChat from './WhatsAppChat';
import { transientLoginNavigation } from '@/lib/whatsappChatPanel';
const api = vi.hoisted(() => ({ rpc: vi.fn(), auth: { user: { id: 'staff' }, role: 'admin', companyId: 'company-a' }, fetch: vi.fn(), from: vi.fn(), session: vi.fn(), error: vi.fn(), ack: true, missingAck: false, availableChats: [] as Array<Record<string, unknown>> }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => api.auth }));
vi.mock('@/contexts/MasterContext', () => ({ useMaster: () => ({ isViewingCompany: false, viewingCompany: null }) }));
vi.mock('react-router-dom', () => ({ useLocation: () => ({ pathname: '/admin/whatsapp-chat', state: null }), useNavigate: () => vi.fn() }));
vi.mock('@/hooks/useWhatsAppSignature', () => ({ useWhatsAppSignature: () => [false, vi.fn()] }));
vi.mock('sonner', () => ({ toast: { error: api.error, success: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/appPerformanceTelemetry', () => ({ recordAppPerformanceSample: vi.fn() }));
vi.mock('@/lib/studentFiles', () => ({ listStudentFiles: vi.fn(async () => []) }));
vi.mock('@/components/AthleticClubStar', () => ({ AthleticClubStar: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: api.rpc, from: api.from, auth: { getSession: api.session }, channel: () => { const c = { on: () => c, subscribe: () => c }; return c; }, removeChannel: vi.fn(), functions: { invoke: vi.fn(async () => ({ data: {}, error: null })) } } }));
const request = { requestId: 1, companyId: 'company-a', studentId: 'student-a', chatId: 'chat-a', phone: '5548999990001', prefillMessage: 'synthetic password draft', loginAccess: { studentId: 'student-a', preflightToken: 'signed-send-token' } };
const chats = [
 { id: 'chat-a', company_id: 'company-a', student_id: 'student-a', remote_jid: '5548999990001@s.whatsapp.net', contact_name: 'Synthetic A', unread_count: 0, last_message_at: '2026-10-29T12:00:00Z', history_synced_at: '2026-10-29T12:00:00Z' },
 { id: 'chat-b', company_id: 'company-a', student_id: 'student-b', remote_jid: '5548999990002@s.whatsapp.net', contact_name: 'Synthetic B', unread_count: 0, last_message_at: '2026-10-29T12:00:00Z', history_synced_at: '2026-10-29T12:00:00Z' },
];
beforeEach(() => {
 api.rpc.mockReset().mockResolvedValue({data:{company_id:'company-a',tier:'advanced',source:'legacy',version:1,features:unrestrictedMasterFeatures},error:null});
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

it('captures a file returned during focus validation, blocks all sends, supports cancellation and explicit recovery',async()=>{
 let finish!:(v:unknown)=>void;
 render(<WhatsAppChat embedded navigationState={{...request,loginAccess:undefined,prefillMessage:'synthetic ordinary message'}} />);
 const composer=await screen.findByDisplayValue('synthetic ordinary message');
 await waitFor(()=>expect(api.rpc).toHaveBeenCalledTimes(1));
 api.rpc.mockImplementationOnce(()=>new Promise(r=>{finish=r}));
 act(()=>window.dispatchEvent(new Event('focus')));
 fireEvent.keyDown(composer,{key:'Enter'});
 const fileInput=document.querySelector('input[type="file"]')!;
 fireEvent.change(fileInput,{target:{files:[new File(['synthetic'],'focus.pdf',{type:'application/pdf'})]}});
 expect(screen.getByText(/Arquivo selecionado: focus.pdf/)).toBeInTheDocument();
 expect(sends()).toHaveLength(0);
 fireEvent.click(screen.getByText('Enviar arquivo selecionado'));
 expect(sends()).toHaveLength(0);
 expect(screen.getByText(/Arquivo selecionado: focus.pdf/)).toBeInTheDocument();
 await act(async()=>finish({data:{company_id:'company-a',tier:'advanced',source:'legacy',version:1,features:unrestrictedMasterFeatures},error:null}));
 expect(sends()).toHaveLength(0);
 fireEvent.click(screen.getByText('Cancelar arquivo selecionado'));
 expect(screen.queryByText(/Arquivo selecionado: focus.pdf/)).toBeNull();
 fireEvent.keyDown(composer,{key:'Enter'});
 await waitFor(()=>expect(sends()).toHaveLength(1));
});
it('cancels an ordinary suspended send across A -> B -> A without restoring the old draft',async()=>{
 let sessionFinish!:(v:unknown)=>void;
 let validationFinish!:(v:unknown)=>void;
 const view=render(<WhatsAppChat embedded navigationState={{...request,loginAccess:undefined,prefillMessage:'ordinary A old'}} />);
 const composer=await screen.findByDisplayValue('ordinary A old');
 api.session.mockImplementationOnce(()=>new Promise(resolve=>{sessionFinish=resolve}));
 fireEvent.keyDown(composer,{key:'Enter'});
 await waitFor(()=>expect(sessionFinish).toBeDefined());
 api.rpc.mockImplementationOnce(()=>new Promise(resolve=>{validationFinish=resolve}));
 act(()=>window.dispatchEvent(new Event('focus')));
 await act(async()=>sessionFinish({data:{session:{access_token:'synthetic-auth'}}}));
 view.rerender(<WhatsAppChat embedded navigationState={{...request,requestId:2,studentId:'student-b',chatId:'chat-b',phone:'5548999990002',loginAccess:undefined,prefillMessage:'ordinary B'}} />);
 await screen.findByDisplayValue('ordinary B');
 view.rerender(<WhatsAppChat embedded navigationState={{...request,requestId:3,loginAccess:undefined,prefillMessage:'ordinary A new'}} />);
 await screen.findByDisplayValue('ordinary A new');
 await act(async()=>validationFinish({data:{company_id:'company-a',tier:'advanced',source:'legacy',version:1,features:unrestrictedMasterFeatures},error:null}));
 expect(sends()).toHaveLength(0);
 expect(screen.getByDisplayValue('ordinary A new')).toBeInTheDocument();
 expect(screen.queryByDisplayValue('ordinary A old')).toBeNull();
});
