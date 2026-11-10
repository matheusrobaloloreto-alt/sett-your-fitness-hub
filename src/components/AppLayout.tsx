import { lazy, Suspense, useLayoutEffect, useRef } from "react";
import { AthleticClubProvider } from "@/components/AthleticClubStar";
import { Outlet, useLocation } from "react-router-dom";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { BnitoAssistantProvider } from "@/components/BnitoFloatingAssistant";
import { RouteTransition } from "@/components/RouteTransition";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { useCompanyAiConfig } from "@/lib/companyAiConfig";
import { useStaffPresence } from "@/hooks/useStaffPresence";
import { PlatformAdSlot } from "@/components/PlatformAdSlot";
import { applyPlatformTheme } from "@/lib/personalTheme";
import { LINEN_PALETTE } from "@/lib/linenPalette";
import { useTheme } from "@/contexts/ThemeContext";
import { appearanceEffectStyles, normalizeProfessionalAppearance } from "@/lib/professionalAppearance";
import "./professional-linen.css";
import { WhatsAppChatPanelProvider } from "@/components/WhatsAppChatPanel";

const PanelHeader = lazy(() => import("./PanelHeader"));

const ContentLoader = () => (
  <div className="flex items-center justify-center py-24">
    <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

export function AppLayout() {
  const { settings } = useTheme();
  const effects = settings?.professional_appearance
    ? normalizeProfessionalAppearance(settings.professional_appearance).effects
    : undefined;
  const shadows = effects?.softShadows;
  return (
    <SidebarProvider
      style={effects ? appearanceEffectStyles(effects) : undefined}
      data-sett-soft-shadows={shadows?.enabled && shadows.intensity > 0 ? "" : undefined}
    >
      <AppLayoutContent />
    </SidebarProvider>
  );
}

function AppLayoutContent() {
  const { isMobile } = useSidebar();
  const location = useLocation();
  const { role, companyId, user } = useAuth();
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
  const linen = (isProfessional || (role === "master" && isViewingCompany)) && (isMobile || isDashboard || isStudentProfile);
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
    <AthleticClubProvider>
      <div ref={surface} className={`min-h-dvh flex w-full min-w-0 bg-paper ${linen ? "sett-linen" : ""} ${isProfessional || isViewingCompany ? "sett-effects" : ""}`}>
      <WhatsAppChatPanelProvider mobileDock={linen}>
        <BnitoAssistantProvider>
          <AppSidebar linen={linen} />
          <main className="flex-1 flex flex-col min-w-0">
            <Suspense fallback={<div aria-hidden="true" className="h-14 shrink-0" />}>
              <PanelHeader key={`${effectiveCompanyId}:${user?.id}:${role}`}
                effectiveCompanyId={effectiveCompanyId} linen={linen} assistantName={assistantName}
                isWorkoutBuilder={isWorkoutBuilder} />
            </Suspense>
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
  );
}
