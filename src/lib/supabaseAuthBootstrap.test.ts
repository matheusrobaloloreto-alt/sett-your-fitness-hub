import { beforeEach, describe, expect, it } from "vitest";
import { bootstrapAuthTheme, migrateLegacySupabaseSession } from "./supabaseAuthBootstrap";

const backend = "https://sett-example.supabase.co";
const key = "sb-sett-example-auth-token";
const legacy = "sb-sett-current-auth-token";

function session(id: string, options: { issuer?: string; subject?: string } = {}) {
  const claims = btoa(JSON.stringify({ iss: options.issuer ?? `${backend}/auth/v1`, sub: options.subject ?? id, exp: 1 }))
    .replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return JSON.stringify({ access_token: `e30.${claims}.signature`, refresh_token: "fixture-refresh", user: { id }, expires_at: 1 });
}

beforeEach(() => localStorage.clear());

describe("SETT session and theme bootstrap", () => {
  it("moves the same project's expired access token with its refresh token intact and paints the user's theme", () => {
    const raw = session("student-a");
    localStorage.setItem(legacy, raw);
    localStorage.setItem("sett-personal-theme-mode:user:student-a", "dark");
    localStorage.setItem("sett-personal-theme-mode:anonymous", "light");

    bootstrapAuthTheme(backend);

    expect(localStorage.getItem(key)).toBe(raw);
    expect(localStorage.getItem(legacy)).toBeNull();
    expect(document.documentElement.dataset.themeMode).toBe("dark");
  });

  it("keeps the canonical account and does not revive a value written by an old tab after sign-out", () => {
    const current = session("student-b");
    localStorage.setItem(key, current);
    localStorage.setItem(legacy, session("student-a"));
    migrateLegacySupabaseSession(localStorage, backend);
    expect(localStorage.getItem(key)).toBe(current);

    localStorage.removeItem(key);
    localStorage.setItem(legacy, session("student-a"));
    migrateLegacySupabaseSession(localStorage, backend);
    expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem(legacy)).toBeNull();
  });

  it.each([
    session("student-a", { issuer: "https://foreign.supabase.co/auth/v1" }),
    session("student-a", { subject: "other-student" }),
    "malformed json",
  ])("does not migrate a foreign, inconsistent or unreadable value", (raw) => {
    localStorage.setItem(legacy, raw);
    migrateLegacySupabaseSession(localStorage, backend);
    expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem(legacy)).toBe(raw);
  });

  it("does not discard the original if the canonical storage write fails", () => {
    const raw = session("student-a");
    localStorage.setItem(legacy, raw);
    migrateLegacySupabaseSession({
      getItem: (name) => localStorage.getItem(name),
      setItem: () => { throw new Error("storage full"); },
      removeItem: (name) => localStorage.removeItem(name),
    }, backend);
    expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem(legacy)).toBe(raw);
    migrateLegacySupabaseSession(localStorage, backend);
    expect(localStorage.getItem(key)).toBe(raw);
  });
});
