import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANONYMOUS_PERSONAL_THEME_STORAGE_KEY,
  PERSONAL_THEME_STORAGE_KEY,
  applyPlatformTheme,
  getStoredPersonalThemeMode,
  personalThemeStorageKey,
  readSupabaseStoredUserId,
  resolveInitialPersonalThemeMode,
  resolvePersonalThemeMode,
  storePersonalThemeMode,
} from "./personalTheme";
import { SUPABASE_AUTH_STORAGE_KEY, supabaseAuthStorageKeyFromUrl } from "./supabaseAuthStorage";

const settings = {
  primary_color: "#1D2D5C",
  background_color: "#FAFAF7",
  card_color: "#F2F0EA",
  text_color: "#0A0A0A",
};

function makeStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => values.delete(key)),
    setItem: vi.fn((key: string, value: string) => values.set(key, String(value))),
  };
}

describe("personal theme", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: makeStorage(),
    });
    window.localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-theme-mode");
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      matches: query === "(prefers-color-scheme: dark)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  it("uses the system color scheme when there is no saved choice", () => {
    expect(resolvePersonalThemeMode("student-1")).toBe("dark");
  });

  it("stores a user scoped choice without leaking it to another user", () => {
    expect(storePersonalThemeMode("light", "student-1")).toBe(true);

    expect(window.localStorage.getItem(PERSONAL_THEME_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(personalThemeStorageKey("student-1"))).toBe("light");
    expect(getStoredPersonalThemeMode("student-1")).toBe("light");
    expect(getStoredPersonalThemeMode("student-2")).toBeNull();
    expect(resolvePersonalThemeMode("student-2")).toBe("dark");
  });

  it("stores anonymous preference in a separate device scope", () => {
    expect(storePersonalThemeMode("light")).toBe(true);

    expect(window.localStorage.getItem(ANONYMOUS_PERSONAL_THEME_STORAGE_KEY)).toBe("light");
    expect(getStoredPersonalThemeMode()).toBe("light");
    expect(getStoredPersonalThemeMode("student-1")).toBeNull();
  });

  it("reads only the user id from the current Supabase auth storage key for prepaint", () => {
    window.localStorage.setItem(SUPABASE_AUTH_STORAGE_KEY, JSON.stringify({
      access_token: "not-read-by-theme",
      refresh_token: "not-read-by-theme",
      user: { id: "student-1", email: "aluno@example.test" },
    }));
    window.localStorage.setItem(personalThemeStorageKey("student-1"), "light");
    window.localStorage.setItem(ANONYMOUS_PERSONAL_THEME_STORAGE_KEY, "dark");

    expect(readSupabaseStoredUserId()).toBe("student-1");
    expect(resolveInitialPersonalThemeMode()).toBe("light");
  });

  it("ignores an old Supabase project session even when it was inserted first", () => {
    window.localStorage.setItem("sb-oldproject-auth-token", JSON.stringify({
      user: { id: "old-project-user" },
    }));
    window.localStorage.setItem(SUPABASE_AUTH_STORAGE_KEY, JSON.stringify({
      user: { id: "current-project-user" },
    }));
    window.localStorage.setItem(personalThemeStorageKey("old-project-user"), "light");
    window.localStorage.setItem(personalThemeStorageKey("current-project-user"), "dark");

    expect(readSupabaseStoredUserId()).toBe("current-project-user");
    expect(resolveInitialPersonalThemeMode()).toBe("dark");
  });

  it("derives the Supabase auth storage key from the current project URL", () => {
    expect(supabaseAuthStorageKeyFromUrl("https://zshrcgbyhzxpnlccssyz.supabase.co")).toBe(SUPABASE_AUTH_STORAGE_KEY);
  });

  it("keeps the in-memory toggle safe when storage writes fail", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        ...makeStorage(),
        setItem: vi.fn(() => {
          throw new Error("quota exceeded");
        }),
      },
    });

    expect(storePersonalThemeMode("dark", "student-1")).toBe(false);
  });

  it("applies the dark class and readable dark tokens without changing stored brand colors", () => {
    applyPlatformTheme(settings, "dark");

    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.dataset.themeMode).toBe("dark");
    expect(document.documentElement.style.getPropertyValue("--background")).toMatch(/\b8%$/);
    expect(document.documentElement.style.getPropertyValue("--foreground")).toMatch(/\b94%$/);
    expect(document.documentElement.style.getPropertyValue("--primary")).not.toBe("");
  });

  it("removes the dark class when the user switches back to light", () => {
    applyPlatformTheme(settings, "dark");
    applyPlatformTheme(settings, "light");

    expect(document.documentElement).not.toHaveClass("dark");
    expect(document.documentElement.dataset.themeMode).toBe("light");
    expect(document.documentElement.style.getPropertyValue("--background")).toMatch(/\b9[0-9]%$/);
  });
});
