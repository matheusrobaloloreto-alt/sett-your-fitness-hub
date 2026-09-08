import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyFeatures } from "@/hooks/useCompanyFeatures";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { useMaster } from "@/contexts/MasterContext";
import {
  WHATSAPP_CHAT_PANEL_EVENT,
  type WhatsAppChatPanelRequest,
} from "@/lib/whatsappChatPanel";
import { WhatsAppChatPanelContext } from "@/components/WhatsAppChatPanelContext";

const WhatsAppChat = lazy(() => import("@/pages/admin/WhatsAppChat"));

export function WhatsAppChatPanelProvider({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();
  const { isViewingCompany } = useMaster();
  const features = useCompanyFeatures();
  const { canAccess, loading: permissionsLoading } = useRolePermissions();
  const [isOpen, setIsOpen] = useState(false);
  const [request, setRequest] = useState<WhatsAppChatPanelRequest>({});
  const nextRequestId = useRef(1);

  const isCompanyScopedMaster = role === "master" && isViewingCompany;
  const isPermittedRole = role === "admin" || role === "coordinator" || role === "trainer" || isCompanyScopedMaster;
  const canUseWhatsApp = !features.loading
    && !permissionsLoading
    && isPermittedRole
    && features.hasWhatsApp
    && (role === "admin" || role === "master" || canAccess("whatsapp"));

  const openChatPanel = useCallback((nextRequest: WhatsAppChatPanelRequest = {}) => {
    if (!canUseWhatsApp) return false;
    setRequest({ ...nextRequest, requestId: nextRequestId.current++ });
    setIsOpen(true);
    return true;
  }, [canUseWhatsApp]);

  const closeChatPanel = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const requestEvent = event as CustomEvent<WhatsAppChatPanelRequest>;
      if (openChatPanel(requestEvent.detail ?? {})) event.preventDefault();
    };
    window.addEventListener(WHATSAPP_CHAT_PANEL_EVENT, handleOpen);
    return () => window.removeEventListener(WHATSAPP_CHAT_PANEL_EVENT, handleOpen);
  }, [openChatPanel]);

  useEffect(() => {
    if (!canUseWhatsApp) setIsOpen(false);
  }, [canUseWhatsApp]);

  const value = useMemo(() => ({ openChatPanel, closeChatPanel, isChatPanelOpen: isOpen }), [closeChatPanel, isOpen, openChatPanel]);

  return (
    <WhatsAppChatPanelContext.Provider value={value}>
      {children}
      {canUseWhatsApp && (
        <>
          <Button
            type="button"
            size="lg"
            className="fixed bottom-4 right-4 z-40 gap-2 rounded-full px-4 shadow-lg sm:bottom-6 sm:right-6"
            onClick={() => openChatPanel()}
            aria-label="Abrir conversas do WhatsApp"
            title="Abrir conversas do WhatsApp"
          >
            <MessageSquare className="h-5 w-5" />
            <span>Conversas</span>
          </Button>
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetContent
              side="right"
              className="flex h-dvh !w-full !max-w-none flex-col gap-0 border-l p-0 sm:!w-[min(96vw,1100px)] sm:!max-w-none"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Conversas do WhatsApp</SheetTitle>
              </SheetHeader>
              <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Carregando conversas…</div>}>
                <WhatsAppChat embedded navigationState={request} />
              </Suspense>
            </SheetContent>
          </Sheet>
        </>
      )}
    </WhatsAppChatPanelContext.Provider>
  );
}
