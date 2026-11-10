import { describe, expect, it } from "vitest";
import { canPinRenewalChat, conflictsWithSavedRenewal, sameRenewalRecipient, studentLoginSendPayload, resolveWhatsAppChatRequest } from "./whatsappChatRequest";
import type { CompanyEventDraft } from "./whatsappChatPanel";

const chats = [
  { id: "chat-a", student_id: "student-a", remote_jid: "5548999990001@s.whatsapp.net" },
  { id: "chat-b", student_id: "student-b", remote_jid: "5548999990002@s.whatsapp.net" },
];

describe("persistent WhatsApp chat request resolution", () => {
  const renewal: CompanyEventDraft = { companyId: "company-a", draftId: "renewal-a", event: "renewal_due",
    settingsVersion: 0, renewalEnrollmentId: "enrollment-a", parts: [{ id: "text-1", type: "text", text: "synthetic draft" }] };

  it("matches the whole international number and checks the resolved student", () => {
    const chat = { id: "chat-intl", student_id: "student-a", company_id: "company-a", remote_jid: "441234567890@s.whatsapp.net" };
    const request = { companyId: "company-a", studentId: "student-a", chatId: chat.id, phone: "441234567890", eventDraft: renewal };
    expect(resolveWhatsAppChatRequest([chat], request, "company-a").chatId).toBe(chat.id);
    expect(() => resolveWhatsAppChatRequest([{ ...chat, student_id: "student-b" }],
      { ...request, chatId: null }, "company-a")).toThrow("message_draft_recipient_mismatch");
  });

  it("keeps a saved renewal separate from another student, enrollment or conversation", () => {
    const original = { studentId: "student-a", chatId: null, draft: renewal };
    expect(conflictsWithSavedRenewal(original, { ...original, draft: { ...renewal, draftId: "retry" } })).toBe(false);
    expect(conflictsWithSavedRenewal(original, { ...original, studentId: "student-b" })).toBe(true);
    expect(conflictsWithSavedRenewal(original, { ...original, chatId: "changed-chat" })).toBe(true);
    expect(conflictsWithSavedRenewal(original, { ...original, draft: { ...renewal, renewalEnrollmentId: "enrollment-b" } })).toBe(true);
  });

  it("keeps a Singapore number separate from a Brazilian alias but accepts Brazil's provider variants", () => {
    expect(sameRenewalRecipient("6581234567", "5565981234567@s.whatsapp.net")).toBe(false);
    expect(sameRenewalRecipient("6581234567", "6581234567@s.whatsapp.net")).toBe(true);
    expect(sameRenewalRecipient("556581234567", "5565981234567@s.whatsapp.net")).toBe(true);
  });

  it("resumes the same renewal on a newly persisted chat only for the original student and number", () => {
    const saved = { studentId: "student-a", chatId: null, remoteJid: "6581234567", draft: renewal };
    const persisted = { id: "new-chat", company_id: "company-a", student_id: "student-a", remote_jid: "6581234567@s.whatsapp.net" };
    expect(canPinRenewalChat(saved, persisted)).toBe(true);
    for (const changed of [
      { company_id: "other" }, { student_id: "student-b" }, { student_id: null },
      { remote_jid: "5565981234567@s.whatsapp.net" },
    ]) {
      expect(canPinRenewalChat(saved, { ...persisted, ...changed })).toBe(false);
    }
    const attached = { ...saved, chatId: persisted.id };
    expect(conflictsWithSavedRenewal(attached, { ...attached, draft: { ...renewal, draftId: "new-request" } })).toBe(false);
    expect(conflictsWithSavedRenewal(attached, { ...attached, chatId: "other-same-number" })).toBe(true);
    expect(attached.draft.draftId).toBe("renewal-a");
  });
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
