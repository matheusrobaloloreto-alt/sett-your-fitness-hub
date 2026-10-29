import { describe, expect, it } from "vitest";
import { studentLoginSendPayload, resolveWhatsAppChatRequest } from "./whatsappChatRequest";

const chats = [
  { id: "chat-a", student_id: "student-a", remote_jid: "5548999990001@s.whatsapp.net" },
  { id: "chat-b", student_id: "student-b", remote_jid: "5548999990002@s.whatsapp.net" },
];

describe("persistent WhatsApp chat request resolution", () => {
  it("switches an already mounted panel from one chat to another", () => {
    const first = resolveWhatsAppChatRequest(chats, { requestId: 1, chatId: "chat-a", prefillMessage: "Primeiro rascunho" });
    const second = resolveWhatsAppChatRequest(chats, { requestId: 2, chatId: "chat-b", prefillMessage: "Segundo rascunho" });

    expect(first).toMatchObject({ chatId: "chat-a", prefillMessage: "Primeiro rascunho" });
    expect(second).toMatchObject({ chatId: "chat-b", prefillMessage: "Segundo rascunho" });
  });

  it("replaces a previous draft on a later request instead of retaining it", () => {
    const resolved = resolveWhatsAppChatRequest(chats, { requestId: 3, chatId: "chat-b", prefillMessage: "Novo prefill" });
    expect(resolved.prefillMessage).toBe("Novo prefill");
  });
});

const loginRequest = { companyId: 'company-a', chatId: 'chat-a', studentId: 'student-a', phone: '5548999990001', prefillMessage: 'synthetic password draft', loginAccess: { studentId: 'student-a', preflightToken: 'signed-send-proof' } };
it('carries a signed access draft only to its original company/student/chat/recipient', () => {
 const resolved = resolveWhatsAppChatRequest(chats.map(chat => ({ ...chat, company_id: 'company-a' })), loginRequest, 'company-a');
 expect(resolved).toMatchObject({ loginDraft: { companyId: 'company-a', studentId: 'student-a', chatId: 'chat-a', remoteJid: chats[0].remote_jid, preflightToken: 'signed-send-proof' } });
});
it('rejects contradictory access identity rather than falling back to ordinary text', () => {
 expect(() => resolveWhatsAppChatRequest(chats.map(chat => ({ ...chat, company_id: 'company-a' })), { ...loginRequest, loginAccess: { ...loginRequest.loginAccess, studentId: 'student-b' } }, 'company-a')).toThrow();
});


it('sends the signed proof alongside exact top-level student and target', () => {
 const target = { companyId: 'company-a', studentId: 'student-a', chatId: 'chat-a', remoteJid: chats[0].remote_jid };
 expect(studentLoginSendPayload({ ...target, preflightToken: 'signed-proof' }, target, 'synthetic credentials')).toMatchObject({ action: 'send-message', studentId: 'student-a', content: 'synthetic credentials', loginAccess: { studentId: 'student-a', preflightToken: 'signed-proof' } });
 for (const patch of [{ companyId: 'other' }, { studentId: 'other' }, { chatId: 'other' }, { remoteJid: chats[1].remote_jid }]) {
  expect(() => studentLoginSendPayload({ ...target, preflightToken: 'signed-proof' }, { ...target, ...patch }, 'synthetic credentials')).toThrow();
 }
});
it('does not adopt a newly linked chat after a no-chat preflight', () => {
 expect(() => resolveWhatsAppChatRequest(chats.map(chat => ({ ...chat, company_id: 'company-a' })), { ...loginRequest, chatId: null }, 'company-a')).toThrow();
});
