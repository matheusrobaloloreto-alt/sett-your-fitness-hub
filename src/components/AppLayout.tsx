import { lazy, Suspense, useLayoutEffect, useRef } from "react";
import { AthleticClubProvider } from "@/components/AthleticClubStar";
import { Outlet, useLocation } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
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
import { ErrorBoundary } from "@/components/ErrorBoundary";

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
  // The professional shell belongs to the signed-in role, not a small allowlist
  // of pages. Keep it consistent while navigating, including the Master panel.
  const linen = isProfessional || role === "master";
  const surface = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!linen) return;
    // Radix menus and dialogs render outside the panel. Share only visual
    // scope/effect tokens, and remove them when leaving the professional area.
    const body = document.body;
    const previousScope = body.getAttribute("data-sett-professional-shell");
    const styles = appearanceEffectStyles(
      normalizeProfessionalAppearance(settings?.professional_appearance).effects,
    );
    const previous = Object.keys(styles).map(name => [name, body.style.getPropertyValue(name)]);
    body.setAttribute("data-sett-professional-shell", "");
    for (const [name, value] of Object.entries(styles)) body.style.setProperty(name, String(value));
    return () => {
      if (previousScope === null) body.removeAttribute("data-sett-professional-shell");
      else body.setAttribute("data-sett-professional-shell", previousScope);
      for (const [name, value] of previous) {
        if (value) body.style.setProperty(name, value);
        else body.style.removeProperty(name);
      }
    };
  }, [linen, settings?.professional_appearance]);
  useLayoutEffect(() => {
    if (linen && !themeLoading && !settings && surface.current) {
      const element = surface.current;
      applyPlatformTheme(LINEN_PALETTE, themeMode, element);
      // Master without a configured palette uses the same fallback in its
      // body-portaled forms. Restore prior body tokens on tenant/role changes.
      const body = document.body;
      const previous = Array.from(element.style).map(name => ({
        name, value: body.style.getPropertyValue(name), priority: body.style.getPropertyPriority(name),
      }));
      for (const { name } of previous) body.style.setProperty(name, element.style.getPropertyValue(name));
      return () => {
        element.removeAttribute("style");
        for (const { name, value, priority } of previous) {
          if (value) body.style.setProperty(name, value, priority);
          else body.style.removeProperty(name);
        }
      };
    }
  }, [linen, settings, themeLoading, themeMode]);
  const isWorkoutBuilder = /\/workout\/[^/]+/.test(location.pathname);

  return (
    <AthleticClubProvider>
      <div ref={surface} className={`min-h-dvh flex w-full min-w-0 bg-paper ${linen ? "sett-linen sett-effects" : ""}`}>
      <WhatsAppChatPanelProvider mobileDock={linen}>
        <BnitoAssistantProvider>
          <AppSidebar linen={linen} />
          <main className="flex-1 flex flex-col min-w-0">
            <ErrorBoundary scope="section">
              <Suspense fallback={<div aria-hidden="true" className="h-14 shrink-0" />}>
                <PanelHeader key={`${effectiveCompanyId}:${user?.id}:${role}`}
                  effectiveCompanyId={effectiveCompanyId} linen={linen} assistantName={assistantName}
                  isWorkoutBuilder={isWorkoutBuilder} />
              </Suspense>
            </ErrorBoundary>
            <div className={`min-w-0 flex-1 ${noPadding ? "" : "p-3 pb-24 sm:p-6 sm:pb-24 md:p-8"} ${linen ? "sett-linen-content" : ""}`}>
              {isProfessional && isDashboard && !noPadding && (
                <PlatformAdSlot audience="professional" placement="dashboard_banner" companyId={effectiveCompanyId} className="mb-6" />
              )}
              <ErrorBoundary scope="section" resetKey={`${location.pathname}${location.search}`}>
                <Suspense fallback={<ContentLoader />}>
                  <RouteTransition spring={linen}>
                    <Outlet />
                  </RouteTransition>
                </Suspense>
              </ErrorBoundary>
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
