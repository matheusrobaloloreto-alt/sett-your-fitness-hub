import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyFeatures } from "@/hooks/useCompanyFeatures";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { useMaster } from "@/contexts/MasterContext";
import {
  WHATSAPP_CHAT_PANEL_EVENT, clearTransientLoginNavigation,
  type WhatsAppChatPanelRequest,
} from "@/lib/whatsappChatPanel";
import { WhatsAppChatPanelContext } from "@/components/WhatsAppChatPanelContext";

const WhatsAppChat = lazy(() => import("@/pages/admin/WhatsAppChat"));

export function WhatsAppChatPanelProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { role, companyId, user } = useAuth();
  const { isViewingCompany, viewingCompany } = useMaster();
  const features = useCompanyFeatures();
  const { canAccess, loading: permissionsLoading } = useRolePermissions();
  const [isOpen, setIsOpen] = useState(false);
  const [request, setRequest] = useState<WhatsAppChatPanelRequest>({});
  const nextRequestId = useRef(1);

  const isCompanyScopedMaster = role === "master" && isViewingCompany;
  const isPermittedRole = role === "admin" || role === "coordinator" || role === "trainer" || isCompanyScopedMaster;
  const canRetainWhatsApp = !features.loading
    && !permissionsLoading
    && isPermittedRole
    && features.hasWhatsApp
    && (role === "admin" || role === "master" || canAccess("whatsapp"));
  const validationBlocked = features.refreshing || !!features.error;
  const canUseWhatsApp = canRetainWhatsApp && !validationBlocked;
  const isWhatsAppChatRoute = /\/whatsapp-chat$/.test(location.pathname);

  const openChatPanel = useCallback((nextRequest: WhatsAppChatPanelRequest = {}) => {
    if (!canUseWhatsApp) return false;
    setRequest({ ...nextRequest, requestId: nextRequestId.current++ });
    setIsOpen(true);
    return true;
  }, [canUseWhatsApp]);

  const closeChatPanel = useCallback(() => {
    setIsOpen(false);
    setRequest(current => current.loginAccess || current.loginDraftId ? {} : current);
  }, []);
  useEffect(() => { setRequest({}); setIsOpen(false); return () => clearTransientLoginNavigation(); }, [companyId, viewingCompany?.id, user?.id, role]);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const requestEvent = event as CustomEvent<WhatsAppChatPanelRequest>;
      if (openChatPanel(requestEvent.detail ?? {})) event.preventDefault();
    };
    window.addEventListener(WHATSAPP_CHAT_PANEL_EVENT, handleOpen);
    return () => window.removeEventListener(WHATSAPP_CHAT_PANEL_EVENT, handleOpen);
  }, [openChatPanel]);

  useEffect(() => {
    if (!canRetainWhatsApp) { setRequest({}); closeChatPanel(); }
  }, [canRetainWhatsApp, closeChatPanel]);

  useEffect(() => {
    document.documentElement.dataset.settChatOpen = String(isOpen);
    window.dispatchEvent(new CustomEvent("sett:chat-layout", { detail: { open: isOpen } }));
    return () => { delete document.documentElement.dataset.settChatOpen; window.dispatchEvent(new CustomEvent("sett:chat-layout", { detail: { open: false } })); };
  }, [isOpen]);

  const value = useMemo(
    () => ({ isAvailable: canUseWhatsApp, openChatPanel, closeChatPanel, isChatPanelOpen: isOpen }),
    [canUseWhatsApp, closeChatPanel, isOpen, openChatPanel],
  );

  return (
    <WhatsAppChatPanelContext.Provider value={value}>
      {children}
      {canRetainWhatsApp && (
        <>
          {!isWhatsAppChatRoute && (
            <Button
              type="button"
              size="lg"
              style={{ bottom: "calc(var(--sett-install-height, 0px) + max(1rem, env(safe-area-inset-bottom, 0px)))" }}
              className="fixed right-4 z-40 gap-2 rounded-full px-4 shadow-lg max-[380px]:px-3 sm:bottom-6 sm:right-6"
              onClick={() => openChatPanel()}
              aria-label="Abrir conversas do WhatsApp"
              title="Abrir conversas do WhatsApp"
            >
              <MessageSquare className="h-5 w-5" />
              <span className="hidden min-[360px]:inline">Conversas</span>
            </Button>
          )}
          <Sheet open={isOpen} onOpenChange={open => open ? setIsOpen(true) : closeChatPanel()}>
            <SheetContent
              side="right"
              className="flex h-dvh !w-full !max-w-none flex-col gap-0 overflow-hidden border-l bg-white p-0 dark:border-[#2a3942] dark:bg-[#0b141a] sm:!w-[min(96vw,1100px)] sm:!max-w-none"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Conversas do WhatsApp</SheetTitle>
              </SheetHeader>
              {validationBlocked && <div role="status">{features.error || "Validando acesso…"}{features.error && <Button onClick={features.retry}>Tentar novamente</Button>}</div>}
              <fieldset {...(validationBlocked ? { inert: "" } : {})} disabled={validationBlocked} className="contents" aria-busy={validationBlocked}>
              <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Carregando conversas…</div>}>
                <WhatsAppChat embedded navigationState={request} />
              </Suspense>
              </fieldset>
            </SheetContent>
          </Sheet>
        </>
      )}
    </WhatsAppChatPanelContext.Provider>
  );
}
