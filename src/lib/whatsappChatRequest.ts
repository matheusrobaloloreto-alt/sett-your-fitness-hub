import { normalizeWhatsAppPhoneKey } from "@/lib/whatsappMessages";
import type { WhatsAppChatPanelRequest } from "@/lib/whatsappChatPanel";

export type ChatRequestCandidate = {
  id: string;
  student_id: string | null;
  remote_jid: string;
};

export type ResolvedWhatsAppChatRequest = {
  chatId: string | null;
  draftRecipient: {
    remoteJid: string;
    studentId: string | null;
    contactName: string;
  } | null;
  prefillMessage: string;
};

/** Resolves every panel request independently, including when the chat stays mounted. */
export function resolveWhatsAppChatRequest(
  chats: ChatRequestCandidate[],
  request: WhatsAppChatPanelRequest,
): ResolvedWhatsAppChatRequest {
  const requestedChat = request.chatId ? chats.find((chat) => chat.id === request.chatId) : null;
  const studentChat = !requestedChat && request.studentId
    ? chats.find((chat) => chat.student_id === request.studentId)
    : null;
  const digits = (request.phone || "").replace(/\D/g, "");
  const phoneKey = normalizeWhatsAppPhoneKey(digits);
  const phoneChat = !requestedChat && !studentChat && digits
    ? chats.find((chat) => normalizeWhatsAppPhoneKey(chat.remote_jid) === phoneKey)
    : null;
  const matchedChat = requestedChat || studentChat || phoneChat || null;

  return {
    chatId: matchedChat?.id ?? null,
    draftRecipient: !matchedChat && digits
      ? {
        remoteJid: digits,
        studentId: request.studentId ?? null,
        contactName: request.contactName || "Nova conversa",
      }
      : null,
    prefillMessage: request.prefillMessage ?? "",
  };
}
