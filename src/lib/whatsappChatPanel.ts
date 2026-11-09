import type { MessagePart, WhatsAppEvent } from '../../supabase/functions/_shared/company-product-settings';

/** A detached, occurrence-specific snapshot. Opening it never authorizes delivery. */
export type CompanyEventDraft = {
  draftId: string;
  companyId: string;
  event: WhatsAppEvent;
  settingsVersion: number;
  parts: MessagePart[];
};

export type WhatsAppChatPanelRequest = {
  requestId?: number;
  chatId?: string | null;
  dashboardFeedbackId?: string;
  studentId?: string | null;
  phone?: string | null;
  contactName?: string | null;
  prefillMessage?: string | null;
  mode?: "draft";
  companyId?: string;
  eventDraft?: CompanyEventDraft;
  loginAccess?: { studentId: string; preflightToken: string };
  loginDraftId?: string;
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


// Passwords and signed proofs never enter router history, sessionStorage or localStorage.
const transientLoginDrafts = new Map<string, { request: WhatsAppChatPanelRequest; expires: number }>();
export function transientLoginNavigation(request: WhatsAppChatPanelRequest): WhatsAppChatPanelRequest {
  if (!request.loginAccess) return request;
  const loginDraftId = crypto.randomUUID();
  for (const [id, entry] of transientLoginDrafts) if (entry.expires <= Date.now()) transientLoginDrafts.delete(id);
  transientLoginDrafts.set(loginDraftId, { request: structuredClone(request), expires: Date.now() + 120000 });
  setTimeout(() => transientLoginDrafts.delete(loginDraftId), 120000);
  const { prefillMessage: _text, loginAccess: _proof, ...safe } = request;
  return { ...safe, loginDraftId };
}
export function consumeTransientLoginNavigation(id: string): WhatsAppChatPanelRequest {
  const entry = transientLoginDrafts.get(id);
  transientLoginDrafts.delete(id);
  if (!entry || entry.expires <= Date.now()) throw new Error('O rascunho de acesso expirou. Gere e confira o acesso novamente no perfil.');
  return entry.request;
}

export function clearTransientLoginNavigation(): void { transientLoginDrafts.clear(); }
