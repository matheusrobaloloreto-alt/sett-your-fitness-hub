export type WhatsAppChatPanelRequest = {
  requestId?: number;
  chatId?: string | null;
  studentId?: string | null;
  phone?: string | null;
  contactName?: string | null;
  prefillMessage?: string | null;
};

export const WHATSAPP_CHAT_PANEL_EVENT = "sett:open-whatsapp-chat";

/**
 * Requests the persistent internal WhatsApp panel without coupling callers to
 * the dashboard shell. A legacy route remains the fallback when no shell is
 * mounted (for example, an old deep link).
 */
export function requestWhatsAppChatPanel(request: WhatsAppChatPanelRequest = {}): boolean {
  if (typeof window === "undefined") return false;

  const event = new CustomEvent<WhatsAppChatPanelRequest>(WHATSAPP_CHAT_PANEL_EVENT, {
    detail: request,
    cancelable: true,
  });
  return !window.dispatchEvent(event);
}
