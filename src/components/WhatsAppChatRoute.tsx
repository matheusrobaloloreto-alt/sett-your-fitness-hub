import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useWhatsAppChatPanel } from "@/components/WhatsAppChatPanelContext";
import type { WhatsAppChatPanelRequest } from "@/lib/whatsappChatPanel";

/** Keeps old /whatsapp-chat links working while conversations now live in the global panel. */
export function WhatsAppChatRoute({ fallbackPath }: { fallbackPath: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { openChatPanel } = useWhatsAppChatPanel();
  const openedRef = useRef(false);

  useEffect(() => {
    if (openedRef.current) return;
    const request = (location.state as WhatsAppChatPanelRequest | null) ?? {};
    if (openChatPanel(request)) {
      openedRef.current = true;
      navigate(fallbackPath, { replace: true });
    }
  }, [fallbackPath, location.state, navigate, openChatPanel]);

  return null;
}
