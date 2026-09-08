import { createContext, useContext } from "react";
import type { WhatsAppChatPanelRequest } from "@/lib/whatsappChatPanel";

type WhatsAppChatPanelContextValue = {
  openChatPanel: (request?: WhatsAppChatPanelRequest) => boolean;
  closeChatPanel: () => void;
  isChatPanelOpen: boolean;
};

export const WhatsAppChatPanelContext = createContext<WhatsAppChatPanelContextValue | null>(null);

export function useWhatsAppChatPanel() {
  const context = useContext(WhatsAppChatPanelContext);
  if (!context) {
    throw new Error("useWhatsAppChatPanel must be used within WhatsAppChatPanelProvider");
  }
  return context;
}
