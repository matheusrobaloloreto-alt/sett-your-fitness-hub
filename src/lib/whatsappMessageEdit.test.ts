import { describe, expect, it } from "vitest";
import { shouldApplyWhatsAppMessageEditResult } from "./whatsappMessageEdit";

describe("WhatsApp edit result routing", () => {
  it("applies only a result bound to both the active and edited chat", () => {
    expect(shouldApplyWhatsAppMessageEditResult({
      activeChatId: "chat-a",
      editChatId: "chat-a",
      message: { chat_id: "chat-a" },
    })).toBe(true);

    expect(shouldApplyWhatsAppMessageEditResult({
      activeChatId: "chat-b",
      editChatId: "chat-a",
      message: { chat_id: "chat-a" },
    })).toBe(false);

    expect(shouldApplyWhatsAppMessageEditResult({
      activeChatId: "chat-a",
      editChatId: "chat-a",
      message: { chat_id: "chat-b" },
    })).toBe(false);

    expect(shouldApplyWhatsAppMessageEditResult({
      activeChatId: "chat-a",
      editChatId: "chat-a",
      message: null,
    })).toBe(false);
  });
});
