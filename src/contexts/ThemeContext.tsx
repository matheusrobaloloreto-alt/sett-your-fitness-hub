import React, { createContext, useContext, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface PlatformSettings {
  id: string;
  primary_color: string;
  background_color: string;
  card_color: string;
  text_color: string;
  platform_title: string;
  logo_url: string | null;
  company_id: string | null;
}

const DEFAULTS: Omit<PlatformSettings, "id" | "company_id"> = {
  primary_color: "#1D2D5C",
  background_color: "#FAFAF7",
  card_color: "#F2F0EA",
  text_color: "#0A0A0A",
  platform_title: "Set Training App",
  logo_url: null,
};

interface ThemeContextValue {
  settings: PlatformSettings | null;
  isLoading: boolean;
  defaults: typeof DEFAULTS;
  refetch: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  settings: null,
  isLoading: true,
  defaults: DEFAULTS,
  refetch: () => {},
});

export const useTheme = () => useContext(ThemeContext);

function hexToHSL(hex: string): string {
  hex = hex.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function adjustLightness(hex: string, amount: number): string {
  hex = hex.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  let l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  l = Math.max(0, Math.min(1, l + amount));
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function applyTheme(settings: { primary_color: string; background_color: string; card_color: string; text_color: string }) {
  const root = document.documentElement;
  const bg = hexToHSL(settings.background_color);
  const fg = hexToHSL(settings.text_color);
  const primary = hexToHSL(settings.primary_color);
  const card = hexToHSL(settings.card_color);

  // Detect light vs dark surface to derive sensible neutrals in either direction.
  const isLight = (() => {
    const hex = settings.background_color.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    return (Math.max(r, g, b) + Math.min(r, g, b)) / 2 > 0.5;
  })();

  const sign = isLight ? -1 : 1;
  const mutedBg = adjustLightness(settings.background_color, sign * 0.03);
  const mutedFg = adjustLightness(settings.text_color, sign * -0.35);
  const border = adjustLightness(settings.background_color, sign * 0.08);
  const sidebarBg = adjustLightness(settings.background_color, sign * 0.04);
  const sidebarAccent = adjustLightness(settings.background_color, sign * 0.06);

  root.style.setProperty("--background", bg);
  root.style.setProperty("--foreground", fg);
  root.style.setProperty("--primary", primary);
  root.style.setProperty("--primary-foreground", isLight ? "60 19% 98%" : "0 0% 100%");
  root.style.setProperty("--card", card);
  root.style.setProperty("--card-foreground", fg);
  root.style.setProperty("--popover", isLight ? bg : card);
  root.style.setProperty("--popover-foreground", fg);
  root.style.setProperty("--secondary", card);
  root.style.setProperty("--secondary-foreground", fg);
  root.style.setProperty("--muted", mutedBg);
  root.style.setProperty("--muted-foreground", mutedFg);
  root.style.setProperty("--accent", primary);
  root.style.setProperty("--accent-foreground", isLight ? "60 19% 98%" : "0 0% 100%");
  root.style.setProperty("--border", border);
  root.style.setProperty("--input", border);
  root.style.setProperty("--ring", primary);

  // Extra brand tokens (Paper / Navy / Ink) used by landing + chrome
  root.style.setProperty("--paper", bg);
  root.style.setProperty("--paper-warm", card);
  root.style.setProperty("--line", border);
  root.style.setProperty("--ink", fg);
  root.style.setProperty("--ink-soft", adjustLightness(settings.text_color, isLight ? 0.06 : -0.06));
  root.style.setProperty("--navy", primary);

  root.style.setProperty("--sidebar-background", card);
  root.style.setProperty("--sidebar-foreground", fg);
  root.style.setProperty("--sidebar-primary", primary);
  root.style.setProperty("--sidebar-primary-foreground", isLight ? "60 19% 98%" : "0 0% 100%");
  root.style.setProperty("--sidebar-accent", sidebarAccent);
  root.style.setProperty("--sidebar-accent-foreground", fg);
  root.style.setProperty("--sidebar-border", border);
  root.style.setProperty("--sidebar-ring", primary);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { companyId, role } = useAuth();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["platform-settings", companyId],
    queryFn: async () => {
      let query = supabase.from("platform_settings").select("*");
      
      if (companyId) {
        // Load company-specific settings
        query = query.eq("company_id", companyId);
      } else if (role === "master") {
        // Master without company context: load global (null company_id) settings
        query = query.is("company_id", null);
      } else {
        // Fallback: try to get any settings available
        query = query.is("company_id", null);
      }
      
      const { data, error } = await query.limit(1).maybeSingle();
      if (error) throw error;
      return data as PlatformSettings | null;
    },
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (settings) {
      applyTheme(settings);
      document.title = settings.platform_title;
    }
  }, [settings]);

  return (
    <ThemeContext.Provider
      value={{
        settings,
        isLoading,
        defaults: DEFAULTS,
        refetch: () => queryClient.invalidateQueries({ queryKey: ["platform-settings", companyId] }),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
