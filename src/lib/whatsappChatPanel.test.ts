import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  requestWhatsAppChatPanel,
  WHATSAPP_CHAT_PANEL_EVENT,
  type WhatsAppChatPanelRequest,
} from "./whatsappChatPanel";

describe("persistent WhatsApp panel requests", () => {
  it("lets the dashboard shell claim a prefilled chat request", () => {
    let received: WhatsAppChatPanelRequest | null = null;
    const listener = (event: Event) => {
      received = (event as CustomEvent<WhatsAppChatPanelRequest>).detail;
      event.preventDefault();
    };
    window.addEventListener(WHATSAPP_CHAT_PANEL_EVENT, listener);

    expect(requestWhatsAppChatPanel({ chatId: "chat-1", prefillMessage: "Olá" })).toBe(true);
    expect(received).toEqual({ chatId: "chat-1", prefillMessage: "Olá" });

    window.removeEventListener(WHATSAPP_CHAT_PANEL_EVENT, listener);
  });

  it("keeps the legacy route fallback available when no dashboard shell is mounted", () => {
    expect(requestWhatsAppChatPanel({ chatId: "chat-1" })).toBe(false);
  });

  it("keeps compatibility routes behind the WhatsApp module and consumes repeated requests", () => {
    const routesSource = readFileSync("src/App.tsx", "utf8");
    const chatSource = readFileSync("src/pages/admin/WhatsAppChat.tsx", "utf8");
    expect(routesSource).toContain('path="/coordinator/whatsapp-chat" element={<FeatureRoute allowedRoles={["coordinator"]} requiredFeature="hasWhatsApp" requiredModule="whatsapp"><WhatsAppChatRoute fallbackPath="/coordinator" /></FeatureRoute>}');
    expect(routesSource).toContain('path="/trainer/whatsapp-chat" element={<FeatureRoute allowedRoles={["trainer"]} requiredFeature="hasWhatsApp" requiredModule="whatsapp"><WhatsAppChatRoute fallbackPath="/trainer" /></FeatureRoute>}');
    expect(chatSource).toContain("consumedNavigationRequestRef");
    expect(chatSource).toContain("setPendingNavigationRequest(navigationState)");
    expect(chatSource).toContain("resolveWhatsAppChatRequest(chats, pendingNavigationRequest)");
  });

  it("overrides the compact sheet width so the list and active conversation remain visible", () => {
    const panelSource = readFileSync("src/components/WhatsAppChatPanel.tsx", "utf8");
    expect(panelSource).toContain("!w-full !max-w-none");
    expect(panelSource).toContain("sm:!w-[min(96vw,1100px)] sm:!max-w-none");
  });
});
