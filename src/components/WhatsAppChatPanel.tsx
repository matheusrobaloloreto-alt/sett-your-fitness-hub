import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
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
import { ErrorBoundary } from "@/components/ErrorBoundary";

const WhatsAppChat = lazy(() => import("@/pages/admin/WhatsAppChat"));

export function WhatsAppChatPanelProvider({ children, mobileDock = false }: { children: React.ReactNode; mobileDock?: boolean }) {
  const location = useLocation();
  const reducedMotion = useReducedMotion();
  const opener = useRef<HTMLElement | null>(null);
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
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused !== document.body && !focused.closest('[role="dialog"]')) {
      opener.current = focused;
    }
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
            <motion.button
              type="button"
              disabled={!canUseWhatsApp}
              whileTap={reducedMotion ? undefined : { scale: 0.95 }}
              transition={{ type: "spring", mass: 1, stiffness: 310, damping: 31 }}
              style={{ bottom: "calc(var(--sett-install-height, 0px) + max(1rem, env(safe-area-inset-bottom, 0px)))" }}
              className={`sett-chat-launcher fixed right-4 z-40 items-center gap-2 px-4 sm:right-6 ${mobileDock ? "hidden md:inline-flex" : "inline-flex"}`}
              onClick={() => openChatPanel()}
              aria-label="Abrir conversas do WhatsApp"
              title="Abrir conversas do WhatsApp"
            >
              <WhatsAppIcon className="h-5 w-5" />
              <span className="hidden min-[360px]:inline">Conversas</span>
            </motion.button>
          )}
          <Sheet open={isOpen} onOpenChange={open => open ? setIsOpen(true) : closeChatPanel()}>
            <SheetContent
              side="right"
              springTransition={reducedMotion ? { duration: 0 } : { type: "spring", mass: 1, stiffness: 310, damping: 31 }}
              showSpringClose
              onCloseAutoFocus={(event) => {
                const trigger = opener.current;
                opener.current = null;
                if (trigger?.isConnected && trigger.getClientRects().length) {
                  event.preventDefault();
                  trigger.focus({ preventScroll: true });
                }
              }}
              data-sett-full-height-sheet
              className="flex h-dvh !w-full !max-w-none flex-col gap-0 overflow-hidden border-l border-border bg-card p-0 sm:!w-[min(96vw,1100px)] sm:!max-w-none"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Conversas do WhatsApp</SheetTitle>
              </SheetHeader>
              {validationBlocked && <div role="status">{features.error || "Validando acesso…"}{features.error && <Button onClick={features.retry}>Tentar novamente</Button>}</div>}
              <fieldset {...(validationBlocked ? { inert: "" } : {})} disabled={validationBlocked} className="contents" aria-busy={validationBlocked}>
              <ErrorBoundary scope="section" resetKey={request.requestId}>
                <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Carregando conversas…</div>}>
                  <WhatsAppChat embedded navigationState={request} />
                </Suspense>
              </ErrorBoundary>
              </fieldset>
            </SheetContent>
          </Sheet>
        </>
      )}
    </WhatsAppChatPanelContext.Provider>
  );
}
