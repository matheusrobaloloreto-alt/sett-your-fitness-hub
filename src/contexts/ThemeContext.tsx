import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import {
  applyPlatformTheme,
  getStoredPersonalThemeMode,
  getSystemThemeMode,
  personalThemeStorageKey,
  readSupabaseStoredUserId,
  resolveInitialPersonalThemeMode,
  resolvePersonalThemeMode,
  storePersonalThemeMode,
  type PersonalThemeMode,
} from "@/lib/personalTheme";

interface PlatformSettings {
  id: string;
  primary_color: string;
  background_color: string;
  card_color: string;
  text_color: string;
  platform_title: string;
  logo_url: string | null;
  layout_style: string | null;
  company_id: string | null;
}

function normalizePlatformSettings(data: Partial<PlatformSettings> | null): PlatformSettings | null {
  if (!data?.id) return null;
  return {
    id: data.id,
    primary_color: data.primary_color || DEFAULTS.primary_color,
    background_color: data.background_color || DEFAULTS.background_color,
    card_color: data.card_color || DEFAULTS.card_color,
    text_color: data.text_color || DEFAULTS.text_color,
    platform_title: data.platform_title || DEFAULTS.platform_title,
    logo_url: data.logo_url ?? null,
    layout_style: data.layout_style || DEFAULTS.layout_style,
    company_id: data.company_id ?? null,
  };
}

const DEFAULTS: Omit<PlatformSettings, "id" | "company_id"> = {
  primary_color: "#1D2D5C",
  background_color: "#FAFAF7",
  card_color: "#F2F0EA",
  text_color: "#0A0A0A",
  platform_title: "Set Training App",
  logo_url: null,
  layout_style: "classico",
};

interface ThemeContextValue {
  settings: PlatformSettings | null;
  isLoading: boolean;
  defaults: typeof DEFAULTS;
  themeMode: PersonalThemeMode;
  setThemeMode: (mode: PersonalThemeMode) => void;
  refetch: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  settings: null,
  isLoading: true,
  defaults: DEFAULTS,
  themeMode: "light",
  setThemeMode: () => {},
  refetch: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export function applyTheme(
  settings: { primary_color: string; background_color: string; card_color: string; text_color: string },
  mode?: PersonalThemeMode,
) {
  applyPlatformTheme(settings, mode);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { companyId, role, user, loading: authLoading } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const [themeMode, setThemeModeState] = useState<PersonalThemeMode>(() => resolveInitialPersonalThemeMode());
  const [preAuthPersonalThemeUserId, setPreAuthPersonalThemeUserId] = useState<string | null>(() => readSupabaseStoredUserId());
  const personalThemeUserId = user?.id ?? (authLoading ? preAuthPersonalThemeUserId : null);

  useEffect(() => {
    if (authLoading) return;
    setPreAuthPersonalThemeUserId(user?.id ?? null);
  }, [authLoading, user?.id]);

  // Aluno não está em company_members → a empresa vem de students.company_id.
  // Sem isso, o app do aluno carregava o tema GLOBAL e ignorava o tema/layout da empresa dele.
  const { data: studentCompanyId } = useQuery({
    queryKey: ["theme-student-company", user?.id],
    enabled: role === "student" && !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("students")
        .select("company_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      return (data?.company_id as string | undefined) ?? null;
    },
    staleTime: 1000 * 60 * 5,
  });

  // Empresa em foco: master → empresa visualizada; aluno → empresa do aluno; staff → a sua.
  const effectiveCompanyId =
    role === "master"
      ? (isViewingCompany ? viewingCompany?.id ?? null : null)
      : role === "student"
        ? (studentCompanyId ?? null)
        : companyId;

  const { data: settings, isLoading } = useQuery({
    queryKey: ["platform-settings", effectiveCompanyId],
    queryFn: async () => {
      let query = supabase.from("platform_settings").select("*");
      if (effectiveCompanyId) {
        query = query.eq("company_id", effectiveCompanyId);
      } else {
        query = query.is("company_id", null);
      }
      const { data, error } = await query.limit(1).maybeSingle();
      if (error) throw error;
      return normalizePlatformSettings(data);
    },
    staleTime: 1000 * 60 * 5,
  });

  const activeThemeSettings = settings || (!isLoading ? DEFAULTS : null);

  useLayoutEffect(() => {
    const nextMode = resolvePersonalThemeMode(personalThemeUserId);
    setThemeModeState(nextMode);
    applyTheme(activeThemeSettings || DEFAULTS, nextMode);
    // Re-resolve only when the account scope changes. Settings refetches must keep
    // the in-memory choice when localStorage writes fail.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personalThemeUserId]);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const syncSystemMode = () => {
      if (getStoredPersonalThemeMode(personalThemeUserId)) return;
      setThemeModeState(getSystemThemeMode());
    };
    media.addEventListener("change", syncSystemMode);
    return () => media.removeEventListener("change", syncSystemMode);
  }, [personalThemeUserId, themeMode]);

  useEffect(() => {
    const key = personalThemeStorageKey(personalThemeUserId);
    const syncStoredMode = (event: StorageEvent) => {
      if (event.key !== key) return;
      setThemeModeState(resolvePersonalThemeMode(personalThemeUserId));
    };
    window.addEventListener("storage", syncStoredMode);
    return () => window.removeEventListener("storage", syncStoredMode);
  }, [personalThemeUserId]);

  useLayoutEffect(() => {
    if (settings) {
      applyTheme(settings, themeMode);
      document.documentElement.dataset.layout = settings.layout_style || "classico";
      document.title = settings.platform_title || DEFAULTS.platform_title;
    } else if (!isLoading) {
      // Empresa sem tema custom → volta ao padrão (não herda o tema da empresa anterior).
      applyTheme(DEFAULTS, themeMode);
      document.documentElement.dataset.layout = "classico";
      document.title = DEFAULTS.platform_title;
    }
  }, [settings, isLoading, themeMode]);

  const setThemeMode = useCallback((mode: PersonalThemeMode) => {
    storePersonalThemeMode(mode, personalThemeUserId);
    setThemeModeState(mode);
    applyTheme(activeThemeSettings || DEFAULTS, mode);
  }, [activeThemeSettings, personalThemeUserId]);

  return (
    <ThemeContext.Provider
      value={{
        settings,
        isLoading,
        defaults: DEFAULTS,
        themeMode,
        setThemeMode,
        refetch: () => queryClient.invalidateQueries({ queryKey: ["platform-settings", effectiveCompanyId] }),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
