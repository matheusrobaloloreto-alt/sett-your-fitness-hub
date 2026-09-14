import { readSupabaseStoredUserIdFromStorage } from "@/lib/supabaseAuthStorage";

export type PersonalThemeMode = "light" | "dark";

export interface PlatformThemeColors {
  primary_color: string;
  background_color: string;
  card_color: string;
  text_color: string;
}

export const PERSONAL_THEME_STORAGE_KEY = "sett-personal-theme-mode";
const PERSONAL_THEME_USER_STORAGE_PREFIX = `${PERSONAL_THEME_STORAGE_KEY}:user:`;
export const ANONYMOUS_PERSONAL_THEME_STORAGE_KEY = `${PERSONAL_THEME_STORAGE_KEY}:anonymous`;

type Hsl = {
  h: number;
  s: number;
  l: number;
};

function isPersonalThemeMode(value: unknown): value is PersonalThemeMode {
  return value === "light" || value === "dark";
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function themeStorageKey(userId?: string | null) {
  return userId ? `${PERSONAL_THEME_USER_STORAGE_PREFIX}${userId}` : ANONYMOUS_PERSONAL_THEME_STORAGE_KEY;
}

function readStorageMode(key: string): PersonalThemeMode | null {
  try {
    const value = storage()?.getItem(key);
    return isPersonalThemeMode(value) ? value : null;
  } catch {
    return null;
  }
}

export function getStoredPersonalThemeMode(userId?: string | null): PersonalThemeMode | null {
  return readStorageMode(themeStorageKey(userId));
}

export function getSystemThemeMode(): PersonalThemeMode {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolvePersonalThemeMode(userId?: string | null): PersonalThemeMode {
  return getStoredPersonalThemeMode(userId) ?? getSystemThemeMode();
}

export function personalThemeStorageKey(userId?: string | null) {
  return themeStorageKey(userId);
}

export function readSupabaseStoredUserId(): string | null {
  return readSupabaseStoredUserIdFromStorage(storage());
}

export function resolveInitialPersonalThemeMode(): PersonalThemeMode {
  return resolvePersonalThemeMode(readSupabaseStoredUserId());
}

export function storePersonalThemeMode(mode: PersonalThemeMode, userId?: string | null): boolean {
  const local = storage();
  if (!local) return false;
  try {
    local.setItem(themeStorageKey(userId), mode);
    return true;
  } catch {
    return false;
  }
}

function hslString({ h, s, l }: Hsl): string {
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

function parseHexToHsl(hex: string, fallback: Hsl): Hsl {
  const normalized = hex.trim().replace("#", "");
  const expanded = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return fallback;

  const r = parseInt(expanded.substring(0, 2), 16) / 255;
  const g = parseInt(expanded.substring(2, 4), 16) / 255;
  const b = parseInt(expanded.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

function withLightness(color: Hsl, l: number, maxSaturation = 100): Hsl {
  return {
    h: color.h,
    s: Math.min(color.s, maxSaturation),
    l,
  };
}

function primaryForMode(primary: Hsl, mode: PersonalThemeMode): Hsl {
  if (mode === "dark") {
    return {
      h: primary.h,
      s: Math.max(primary.s, 38),
      l: primary.l < 58 ? 68 : Math.min(primary.l, 76),
    };
  }
  if (primary.l > 68) return { ...primary, l: 36 };
  return primary;
}

function applyThemeModeClass(mode: PersonalThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.dataset.themeMode = mode;
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = mode === "dark" ? "#101318" : "#1D2D5C";
}

export function applyPlatformTheme(settings: PlatformThemeColors, mode: PersonalThemeMode = resolveInitialPersonalThemeMode()) {
  if (typeof document === "undefined") return;

  applyThemeModeClass(mode);

  const background = parseHexToHsl(settings.background_color, { h: 60, s: 19, l: 98 });
  const foreground = parseHexToHsl(settings.text_color, { h: 0, s: 0, l: 4 });
  const card = parseHexToHsl(settings.card_color, { h: 47, s: 21, l: 93 });
  const primary = primaryForMode(parseHexToHsl(settings.primary_color, { h: 223, s: 53, l: 27 }), mode);

  const palette = mode === "dark"
    ? {
      background: withLightness(background, 8, 18),
      foreground: withLightness(foreground, 94, 12),
      card: withLightness(background, 14, 22),
      popover: withLightness(background, 12, 20),
      muted: withLightness(background, 17, 18),
      mutedForeground: withLightness(foreground, 69, 12),
      border: withLightness(background, 24, 16),
      primaryForeground: { h: 223, s: 22, l: 10 },
      sidebar: withLightness(background, 11, 18),
      sidebarAccent: withLightness(background, 18, 18),
      success: { h: 142, s: 45, l: 55 },
      warning: { h: 38, s: 86, l: 62 },
    }
    : {
      background: background.l >= 76 ? background : withLightness(background, 98, 24),
      foreground: foreground.l <= 40 ? foreground : withLightness(foreground, 4, 12),
      card: card.l >= 72 ? card : withLightness(card, 93, 28),
      popover: background.l >= 76 ? background : withLightness(background, 98, 24),
      muted: card.l >= 72 ? card : withLightness(card, 93, 24),
      mutedForeground: withLightness(foreground, 41, 12),
      border: withLightness(background, 83, 18),
      primaryForeground: primary.l > 56 ? { h: 0, s: 0, l: 4 } : { h: 60, s: 19, l: 98 },
      sidebar: card.l >= 72 ? card : withLightness(card, 93, 24),
      sidebarAccent: background.l >= 76 ? background : withLightness(background, 98, 24),
      success: { h: 142, s: 50, l: 32 },
      warning: { h: 32, s: 80, l: 42 },
    };

  const root = document.documentElement;
  root.style.setProperty("--background", hslString(palette.background));
  root.style.setProperty("--foreground", hslString(palette.foreground));
  root.style.setProperty("--primary", hslString(primary));
  root.style.setProperty("--primary-foreground", hslString(palette.primaryForeground));
  root.style.setProperty("--card", hslString(palette.card));
  root.style.setProperty("--card-foreground", hslString(palette.foreground));
  root.style.setProperty("--popover", hslString(palette.popover));
  root.style.setProperty("--popover-foreground", hslString(palette.foreground));
  root.style.setProperty("--secondary", hslString(palette.card));
  root.style.setProperty("--secondary-foreground", hslString(palette.foreground));
  root.style.setProperty("--muted", hslString(palette.muted));
  root.style.setProperty("--muted-foreground", hslString(palette.mutedForeground));
  root.style.setProperty("--accent", hslString(primary));
  root.style.setProperty("--accent-foreground", hslString(palette.primaryForeground));
  root.style.setProperty("--border", hslString(palette.border));
  root.style.setProperty("--input", hslString(palette.border));
  root.style.setProperty("--ring", hslString(primary));
  root.style.setProperty("--paper", hslString(palette.background));
  root.style.setProperty("--paper-warm", hslString(palette.card));
  root.style.setProperty("--line", hslString(palette.border));
  root.style.setProperty("--ink", hslString(palette.foreground));
  root.style.setProperty("--ink-soft", hslString(palette.mutedForeground));
  root.style.setProperty("--navy", hslString(primary));
  root.style.setProperty("--sidebar-background", hslString(palette.sidebar));
  root.style.setProperty("--sidebar-foreground", hslString(palette.foreground));
  root.style.setProperty("--sidebar-primary", hslString(primary));
  root.style.setProperty("--sidebar-primary-foreground", hslString(palette.primaryForeground));
  root.style.setProperty("--sidebar-accent", hslString(palette.sidebarAccent));
  root.style.setProperty("--sidebar-accent-foreground", hslString(palette.foreground));
  root.style.setProperty("--sidebar-border", hslString(palette.border));
  root.style.setProperty("--sidebar-ring", hslString(primary));
  root.style.setProperty("--student-action", hslString(primary));
  root.style.setProperty("--student-action-foreground", hslString(palette.primaryForeground));
  root.style.setProperty("--student-surface", hslString(palette.background));
  root.style.setProperty("--student-rule", hslString(palette.border));
  root.style.setProperty("--success", hslString(palette.success));
  root.style.setProperty("--success-foreground", mode === "dark" ? "223 22% 10%" : "60 19% 98%");
  root.style.setProperty("--warning", hslString(palette.warning));
  root.style.setProperty("--warning-foreground", mode === "dark" ? "223 22% 10%" : "60 19% 98%");
  root.style.setProperty("--chart-1", hslString(primary));
  root.style.setProperty("--chart-2", hslString(mode === "dark" ? withLightness(primary, 58) : withLightness(primary, 45)));
  root.style.setProperty("--chart-3", hslString(palette.foreground));
  root.style.setProperty("--chart-4", hslString(palette.mutedForeground));
  root.style.setProperty("--chart-5", hslString(palette.border));
}
