import { describe, expect, it } from "vitest";
import { resolveWhatsAppChatRequest } from "./whatsappChatRequest";

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
