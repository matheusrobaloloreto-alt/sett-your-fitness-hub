import { sameWhatsAppRecipient, verifiedWhatsAppJidVariants } from '../../supabase/functions/_shared/whatsappIdentity';
import { normalizeWhatsAppPhoneKey } from "@/lib/whatsappMessages";
import type { CompanyEventDraft, WhatsAppChatPanelRequest } from "@/lib/whatsappChatPanel";
import { validateRenderedMessageParts } from '../../supabase/functions/_shared/company-product-settings';

export type ChatRequestCandidate = {
  id: string;
  student_id: string | null;
  remote_jid: string;
  company_id?: string;
};

export type ResolvedWhatsAppChatRequest = {
  chatId: string | null;
  draftRecipient: {
    remoteJid: string;
    studentId: string | null;
    contactName: string;
  } | null;
  prefillMessage: string;
  eventDraft?: CompanyEventDraft;
  loginDraft?: StudentLoginDraft;
};

export type StudentLoginTarget = { companyId: string | null | undefined; studentId: string | null; chatId: string | null; remoteJid: string };
export type StudentLoginDraft = StudentLoginTarget & { companyId: string; studentId: string; preflightToken: string };

/** A provider JID without Brazil's DDI can be a different international number. */
export function sameRenewalRecipient(left: unknown, right: unknown): boolean {
  const number = (value: unknown) => /^([1-9]\d{7,14})(?:@s\.whatsapp\.net)?$/.exec(String(value ?? ""))?.[1];
  const first = number(left);
  const second = number(right);
  if (!first || !second) return false;
  return verifiedWhatsAppJidVariants(first + "@s.whatsapp.net").includes(second + "@s.whatsapp.net");
}

export function canPinRenewalChat(
  saved: { draft: CompanyEventDraft; studentId: string | null; remoteJid: string },
  chat: ChatRequestCandidate | null | undefined,
): boolean {
  return Boolean(saved.draft.renewalEnrollmentId && saved.studentId && chat
    && chat.company_id === saved.draft.companyId && chat.student_id === saved.studentId
    && sameRenewalRecipient(saved.remoteJid, chat.remote_jid));
}

export function conflictsWithSavedRenewal(
  saved: { draft: CompanyEventDraft; studentId: string | null; chatId: string | null },
  next: { draft: CompanyEventDraft; studentId: string | null; chatId: string | null },
): boolean {
  return Boolean(saved.draft.renewalEnrollmentId || next.draft.renewalEnrollmentId) && (
    saved.draft.renewalEnrollmentId !== next.draft.renewalEnrollmentId
    || saved.studentId !== next.studentId || saved.chatId !== next.chatId
  );
}
export function studentLoginSendPayload(draft: StudentLoginDraft, target: StudentLoginTarget, content: string) {
  if (!draft.preflightToken || draft.companyId !== target.companyId || draft.studentId !== target.studentId
    || draft.chatId !== target.chatId || !sameWhatsAppRecipient(draft.remoteJid, target.remoteJid) || !content.trim()) {
    throw new Error('O destinatário do acesso mudou. Gere e confira o acesso novamente no perfil.');
  }
  return { action: 'send-message', ...target, content, loginAccess: { studentId: draft.studentId, preflightToken: draft.preflightToken } };
}

export function manualSequencePayload(draft: CompanyEventDraft, target: { companyId: string; chatId: string | null; studentId: string | null; remoteJid: string }, signMessages: boolean) {
  if (draft.companyId !== target.companyId) throw new Error('message_draft_company_mismatch');
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(draft.draftId)) throw new Error('message_draft_invalid');
  const parts = validateRenderedMessageParts(draft.parts);
  if (!/^[1-9]\d{7,14}(?:@s\.whatsapp\.net)?$/.test(target.remoteJid)) throw new Error('message_draft_recipient_invalid');
  for (const part of parts) {
    if (part.type !== 'text' && (!part.media || part.media.bucket !== 'whatsapp-media' || !part.media.path.startsWith(`${draft.companyId}/message-settings/`))) throw new Error('message_draft_media_scope_invalid');
  }
  return { action: 'send-message-sequence', ...target, remoteJid: target.remoteJid.includes('@') ? target.remoteJid : `${target.remoteJid}@s.whatsapp.net`,
    requestId: draft.draftId, parts, signMessages };
}

/** Supabase non-2xx responses carry their structured outcome in FunctionsHttpError.context. */
export async function manualSequenceResult(requestId: string, data: unknown, error: { context?: Response; message?: string } | null) {
  let payload = data as { success?: boolean; sequenceComplete?: boolean; requestId?: string; code?: string; error?: string; chatId?: string } | null;
  if (error?.context) {
    try { payload = await error.context.clone().json(); } catch { /* Unknown outcome stays blocked. */ }
  }
  const complete = !error && payload?.success === true && payload.sequenceComplete === true && payload.requestId === requestId;
  return { complete, uncertain: !complete && payload?.code !== 'sequence_not_completed',
    message: payload?.error || error?.message || 'Envio da sequência não confirmado.', chatId: payload?.chatId };
}

/** Resolves every panel request independently, including when the chat stays mounted. */
export function resolveWhatsAppChatRequest(
  chats: ChatRequestCandidate[],
  request: WhatsAppChatPanelRequest,
  companyId?: string | null,
): ResolvedWhatsAppChatRequest {
  if (request.eventDraft && (!request.companyId || request.eventDraft.companyId !== request.companyId)) throw new Error('message_draft_company_mismatch');
  if (request.companyId && companyId !== undefined && request.companyId !== companyId) throw new Error('message_draft_company_mismatch');
  chats = chats.filter(chat => !request.companyId || chat.company_id === request.companyId);
  const requestedChat = request.chatId ? chats.find((chat) => chat.id === request.chatId) : null;
  if (request.chatId && request.companyId && !requestedChat) throw new Error('message_draft_chat_unavailable');
  if (requestedChat && request.studentId && requestedChat.student_id !== request.studentId) throw new Error('message_draft_recipient_mismatch');
  const studentChat = !requestedChat && request.studentId
    ? chats.find((chat) => chat.student_id === request.studentId)
    : null;
  const digits = (request.phone || "").replace(/\D/g, "");
  const phoneKey = normalizeWhatsAppPhoneKey(digits);
  const hasSamePhone = (chat: ChatRequestCandidate) => request.eventDraft?.renewalEnrollmentId
    ? sameRenewalRecipient(chat.remote_jid, digits)
    : normalizeWhatsAppPhoneKey(chat.remote_jid) === phoneKey;
  const phoneChat = !requestedChat && !studentChat && digits
    ? chats.find(hasSamePhone)
    : null;
  const matchedChat = requestedChat || studentChat || phoneChat || null;
  if (matchedChat && digits && !hasSamePhone(matchedChat)) throw new Error('message_draft_phone_mismatch');
  if (matchedChat && request.studentId && matchedChat.student_id && matchedChat.student_id !== request.studentId) throw new Error('message_draft_recipient_mismatch');

  let loginDraft: StudentLoginDraft | undefined;
  if (request.loginAccess) {
    if (!request.companyId || !companyId || !request.studentId || request.loginAccess.studentId !== request.studentId
      || typeof request.loginAccess.preflightToken !== 'string' || !request.loginAccess.preflightToken || !digits || request.eventDraft
      || (request.chatId ?? null) !== (matchedChat?.id ?? null)) throw new Error('student_login_draft_invalid');
    loginDraft = { companyId, studentId: request.studentId, chatId: matchedChat?.id ?? null,
      remoteJid: matchedChat?.remote_jid || `${digits}@s.whatsapp.net`, preflightToken: request.loginAccess.preflightToken };
  }
  return {
    ...(loginDraft ? { loginDraft } : {}),
    chatId: matchedChat?.id ?? null,
    draftRecipient: !matchedChat && digits
      ? {
        remoteJid: digits,
        studentId: request.studentId ?? null,
        contactName: request.contactName || "Nova conversa",
      }
      : null,
    prefillMessage: request.prefillMessage ?? "",
    ...(request.eventDraft ? { eventDraft: structuredClone(request.eventDraft) } : {}),
  };
}
