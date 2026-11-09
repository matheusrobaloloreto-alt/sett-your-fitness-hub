import { Suspense, useLayoutEffect, useRef } from "react";
import { AthleticClubProvider } from "@/components/AthleticClubStar";
import { Outlet, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { BnitoAssistantProvider, BnitoContextButton } from "@/components/BnitoFloatingAssistant";
import { RouteTransition } from "@/components/RouteTransition";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { useCompanyAiConfig } from "@/lib/companyAiConfig";
import { useStaffPresence } from "@/hooks/useStaffPresence";
import { PlatformAdSlot } from "@/components/PlatformAdSlot";
import { applyPlatformTheme } from "@/lib/personalTheme";
import { LINEN_PALETTE } from "@/lib/linenPalette";
import { useTheme } from "@/contexts/ThemeContext";
import "./professional-linen.css";
import { WhatsAppChatPanelProvider } from "@/components/WhatsAppChatPanel";

const ContentLoader = () => (
  <div className="flex items-center justify-center py-24">
    <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

export function AppLayout() {
  const location = useLocation();
  const { role, companyId } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  // Empresa em foco: master vendo uma empresa → a dela; senão a do usuário.
  const effectiveCompanyId =
    role === "master" ? (isViewingCompany ? viewingCompany?.id ?? null : null) : companyId;
  const { config } = useCompanyAiConfig(effectiveCompanyId);
  const assistantName = config.assistant_name || "Setty";
  // Registro de presença de colaboradores (coordinator/trainer): entrada, heartbeat e saída.
  useStaffPresence(role, effectiveCompanyId ?? null);
  const noPadding =
    location.pathname.includes("/whatsapp-chat") ||
    location.pathname.includes("/whatsapp-automation");
  const isProfessional = role === "admin" || role === "coordinator" || role === "trainer";
  const isDashboard = ["/admin", "/coordinator", "/trainer"].includes(location.pathname);
  const { settings, isLoading: themeLoading, themeMode } = useTheme();
  const isStudentProfile = /^\/(admin|coordinator|trainer)\/students\/[^/]+\/?$/.test(location.pathname);
  const linen = (isProfessional || (role === "master" && isViewingCompany)) && (isDashboard || isStudentProfile);
  const surface = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (linen && !themeLoading && !settings && surface.current) {
      const element = surface.current;
      applyPlatformTheme(LINEN_PALETTE, themeMode, element);
      return () => element.removeAttribute("style");
    }
  }, [linen, settings, themeLoading, themeMode]);
  const isWorkoutBuilder = /\/workout\/[^/]+/.test(location.pathname);

  return (
    <SidebarProvider>
      <AthleticClubProvider>
      <div ref={surface} className={`min-h-dvh flex w-full min-w-0 bg-paper ${linen ? "sett-linen" : ""}`}>
      <WhatsAppChatPanelProvider mobileDock={linen}>
        <BnitoAssistantProvider>
          <AppSidebar linen={linen} />
          <main className="flex-1 flex flex-col min-w-0">
            <header className="sett-panel-header sticky top-0 z-30 h-14 shrink-0 flex items-center gap-3 border-b border-line px-3 sm:px-6 bg-paper md:static">
              <SidebarTrigger aria-label="Abrir ou recolher menu lateral" className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground" />
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
                Set / Painel
              </span>
              {!isWorkoutBuilder && (
                <BnitoContextButton
                  label="painel atual"
                  context="Ajuda contextual geral da rota atual, considerando permissao, modulo e tarefa em andamento."
                  question="Me orienta sobre esta tela e os proximos passos tecnicos?"
                  text={assistantName}
                  className="ml-auto"
                />
              )}
            </header>
            <div className={`min-w-0 flex-1 ${noPadding ? "" : "p-3 pb-24 sm:p-6 sm:pb-24 md:p-8"} ${linen ? "sett-linen-content" : ""}`}>
              {isProfessional && isDashboard && !noPadding && (
                <PlatformAdSlot audience="professional" placement="dashboard_banner" companyId={effectiveCompanyId} className="mb-6" />
              )}
              <Suspense fallback={<ContentLoader />}>
                <RouteTransition spring={linen}>
                  <Outlet />
                </RouteTransition>
              </Suspense>
              {isProfessional && !noPadding && (
                <PlatformAdSlot audience="professional" placement="footer" companyId={effectiveCompanyId} className="mt-8" />
              )}
            </div>
          </main>
        </BnitoAssistantProvider>
      </WhatsAppChatPanelProvider>
      </div>
      </AthleticClubProvider>
    </SidebarProvider>
  );
}
