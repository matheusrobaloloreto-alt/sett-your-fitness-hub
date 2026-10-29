import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_COMPANY_PRODUCT_SETTINGS, WHATSAPP_EVENTS } from './companyProductSettings';
import { draftCompanyEventMessage, draftCompanyEventSequence, openStudentChat } from './studentChat';
import { manualSequencePayload, manualSequenceResult, resolveWhatsAppChatRequest } from './whatsappChatRequest';
import type { CompanyEventDraft } from './whatsappChatPanel';
const mocks = vi.hoisted(() => ({ settings: vi.fn(), panel: vi.fn(() => true), from: vi.fn(), invoke: vi.fn() }));
vi.mock('@/lib/companyProductSettings', async importOriginal => ({ ...await importOriginal<typeof import('./companyProductSettings')>(), fetchCompanyProductSettings: mocks.settings }));
vi.mock('@/lib/whatsappChatPanel', async importOriginal => ({ ...await importOriginal<typeof import('./whatsappChatPanel')>(), requestWhatsAppChatPanel: mocks.panel }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from, functions: { invoke: mocks.invoke } } }));
afterEach(() => vi.clearAllMocks());
const company = '11111111-1111-4111-8111-111111111111';
const parts: CompanyEventDraft['parts'] = [
  { id: 'hello', type: 'text', text: 'Olá {{primeiro_nome}}' },
  { id: 'image', type: 'image', text: 'Foto {{empresa}}', media: { bucket: 'whatsapp-media', path: `${company}/message-settings/22222222-2222-4222-8222-222222222222.png`, mimeType: 'image/png', fileName: 'foto.png' } },
  { id: 'video', type: 'video', text: '', media: { bucket: 'whatsapp-media', path: `${company}/message-settings/33333333-3333-4333-8333-333333333333.mp4`, mimeType: 'video/mp4', fileName: 'guia.mp4' } },
  { id: 'audio', type: 'audio', text: '', media: { bucket: 'whatsapp-media', path: `${company}/message-settings/44444444-4444-4444-8444-444444444444.mp3`, mimeType: 'audio/mpeg', fileName: 'voz.mp3' } },
];
function settings() { return { version: 7, settings: { ...DEFAULT_COMPANY_PRODUCT_SETTINGS, brand: { ...DEFAULT_COMPANY_PRODUCT_SETTINGS.brand, company_name: 'Empresa' }, message_sequences: { first_contact: parts } } }; }
describe('manual event sequences', () => {
  it('preserves ordered typed parts and renders text/captions without changing configured source', async () => {
    mocks.settings.mockResolvedValue(settings());
    const draft = await draftCompanyEventSequence(company, 'first_contact', { primeiro_nome: 'Ana' }, 'fallback');
    expect(draft).toMatchObject({ companyId: company, event: 'first_contact', settingsVersion: 7 });
    expect(draft.parts.map(p => p.type)).toEqual(['text', 'image', 'video', 'audio']);
    expect(draft.parts[0].text).toBe('Olá Ana'); expect(draft.parts[1].text).toBe('Foto Empresa');
    draft.parts[1].media!.fileName = 'edited'; expect(parts[1].media!.fileName).toBe('foto.png');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it('opening a media-only sequence transports its whole snapshot without sending or external navigation', async () => {
    mocks.settings.mockResolvedValue({ ...settings(), settings: { ...settings().settings, message_sequences: { first_contact: parts.slice(1) } } });
    const navigate = vi.fn();
    await openStudentChat({ navigate, routePrefix: 'admin', companyId: company, messageEvent: 'first_contact', chatId: 'chat', phone: '+5548999990001', contactName: 'Ana', countryCode: 'BR', message: 'fallback' });
    expect(mocks.panel).toHaveBeenCalledWith(expect.objectContaining({ companyId: company, mode: 'draft', prefillMessage: '', eventDraft: expect.objectContaining({ parts: parts.slice(1).map(p => ({ ...p, text: p.text.replace('{{empresa}}', 'Empresa') })) }) }));
    expect(mocks.invoke).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
  });
  it('rejects push fields and mismatched tenant before opening', async () => {
    await expect(draftCompanyEventSequence(company, 'daily_reminder_body', {}, 'x')).rejects.toThrow('whatsapp_event_company_required');
    await expect(openStudentChat({ navigate: vi.fn(), routePrefix: 'admin', companyId: 'other', message: '', eventDraft: { draftId: 'stable', companyId: company, event: 'first_contact', settingsVersion: 1, parts } })).rejects.toThrow('company_mismatch');
    expect(mocks.panel).not.toHaveBeenCalled();
  });
  it('retains the sequence across request resolution and route serialization while verifying company and recipient', () => {
    const eventDraft: CompanyEventDraft = { draftId: 'stable', companyId: company, event: 'first_contact', settingsVersion: 7, parts };
    const request = JSON.parse(JSON.stringify({ companyId: company, chatId: 'chat', studentId: 'student', phone: '5548999990001', eventDraft }));
    const chats = [{ id: 'chat', company_id: company, student_id: 'student', remote_jid: '5548999990001@s.whatsapp.net' }];
    const resolved = resolveWhatsAppChatRequest(chats, request, company);
    expect(resolved.eventDraft).toEqual(eventDraft); expect(resolved.eventDraft).not.toBe(eventDraft);
    expect(() => resolveWhatsAppChatRequest(chats, request, 'other')).toThrow('company_mismatch');
    expect(() => resolveWhatsAppChatRequest(chats, { ...request, studentId: 'wrong' }, company)).toThrow('recipient_mismatch');
    expect(() => resolveWhatsAppChatRequest(chats, { ...request, phone: '5548999990002' }, company)).toThrow('phone_mismatch');
    expect(() => resolveWhatsAppChatRequest([], request, company)).toThrow('chat_unavailable');
  });
  it('retries one server sequence using the same occurrence, immutable part IDs and detached payload', () => {
    const draft: CompanyEventDraft = { draftId: 'stable', companyId: company, event: 'first_contact', settingsVersion: 7, parts };
    const target = { companyId: company, chatId: 'chat', studentId: 'student', remoteJid: '5548999990001' };
    const a = manualSequencePayload(draft, target, true), b = manualSequencePayload(draft, target, true);
    expect(a).toEqual(b); expect(a.action).toBe('send-message-sequence'); expect(a.requestId).toBe('stable'); expect(a.remoteJid).toBe('5548999990001@s.whatsapp.net');
    a.parts[0].text = 'changed'; expect(draft.parts[0].text).not.toBe('changed');
    expect(() => manualSequencePayload(draft, { ...target, companyId: 'other' }, false)).toThrow('company_mismatch');
    expect(() => manualSequencePayload({ ...draft, parts: [{ ...parts[1], media: { ...parts[1].media!, path: parts[1].media!.path.replace(company, '99999999-9999-4999-8999-999999999999') } }] }, target, false)).toThrow('media_scope');
  });
});

it('legacy string API refuses to silently discard a configured sequence', async () => {
  mocks.settings.mockResolvedValue(settings());
  await expect(draftCompanyEventMessage(company, 'first_contact', {}, 'fallback')).rejects.toThrow('draftCompanyEventSequence');
});
it('only the matching complete ACK finishes; partial retry retains its identity and uncertain delivery blocks', async () => {
  expect(await manualSequenceResult('id', { success: true, sequenceComplete: true, requestId: 'id' }, null)).toMatchObject({ complete: true, uncertain: false });
  expect(await manualSequenceResult('id', { success: true }, null)).toMatchObject({ complete: false, uncertain: true });
  expect(await manualSequenceResult('id', { success: true, sequenceComplete: true, requestId: 'other' }, null)).toMatchObject({ complete: false, uncertain: true });
  expect(await manualSequenceResult('id', null, { context: new Response(JSON.stringify({ code: 'sequence_not_completed', error: 'Retome' }), { status: 422 }) })).toMatchObject({ complete: false, uncertain: false, message: 'Retome' });
  expect(await manualSequenceResult('id', null, { context: new Response(JSON.stringify({ code: 'dispatch_uncertain', error: 'Revise' }), { status: 409 }) })).toMatchObject({ complete: false, uncertain: true });
  expect(await manualSequenceResult('id', null, { message: 'network timeout' })).toMatchObject({ complete: false, uncertain: true });
});

it.each(WHATSAPP_EVENTS)('keeps typed parts for the %s consumer', async event => {
  mocks.settings.mockResolvedValue({ ...settings(), settings: { ...settings().settings, message_sequences: { [event]: parts } } });
  const draft = await draftCompanyEventSequence(company, event, { primeiro_nome: 'Ana' }, 'fallback');
  expect(draft.parts.map(part => part.id)).toEqual(parts.map(part => part.id));
  expect(draft.event).toBe(event);
});
it('carries the complete occurrence through the compatibility route without sending', async () => {
  mocks.settings.mockResolvedValue(settings()); mocks.panel.mockReturnValueOnce(false);
  const navigate = vi.fn();
  await openStudentChat({ navigate, routePrefix: 'trainer', companyId: company, messageEvent: 'first_contact', phone: '+5548999990001', countryCode: 'BR', message: 'fallback' });
  expect(navigate).toHaveBeenCalledWith('/trainer/whatsapp-chat', { state: expect.objectContaining({ mode: 'draft', companyId: company, eventDraft: expect.objectContaining({ parts: expect.arrayContaining([expect.objectContaining({ id: 'audio', type: 'audio' })]) }) }) });
  expect(mocks.invoke).not.toHaveBeenCalled();
});
