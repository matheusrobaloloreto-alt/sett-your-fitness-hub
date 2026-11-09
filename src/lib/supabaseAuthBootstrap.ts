const LEGACY_AUTH_STORAGE_KEY = "sb-sett-current-auth-token";
type AuthStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StoredSession = {
  access_token?: unknown;
  refresh_token?: unknown;
  user?: { id?: unknown } | null;
};

export function supabaseAuthStorageKeyFromUrl(
  supabaseUrl: string | null | undefined,
  fallbackProjectRef = "sett-current",
): string {
  try {
    const projectRef = new URL(supabaseUrl || "").hostname.split(".")[0];
    if (projectRef) return `sb-${projectRef}-auth-token`;
  } catch {
    // The Vite project ID is a fallback for builds without an absolute URL.
  }
  return `sb-${fallbackProjectRef || "sett-current"}-auth-token`;
}

function matchesProject(raw: string, supabaseUrl: string) {
  try {
    const session = JSON.parse(raw) as StoredSession | null;
    if (typeof session?.access_token !== "string" || typeof session.refresh_token !== "string"
      || !session.refresh_token || typeof session.user?.id !== "string" || !session.user.id) return false;
    const [header, payload, signature, extra] = session.access_token.split(".");
    if (!header || !payload || !signature || extra !== undefined) return false;
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    const issuer = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1`;
    // These claims only route the stored tokens. Supabase authenticates them and refreshes
    // expired access tokens. A client-side claim must never grant access.
    return claims?.iss === issuer && claims.sub === session.user.id;
  } catch {
    return false;
  }
}

export function migrateLegacySupabaseSession(storage: AuthStorage, supabaseUrl: string, projectRef?: string) {
  const key = supabaseAuthStorageKeyFromUrl(supabaseUrl, projectRef);
  if (key === LEGACY_AUTH_STORAGE_KEY) return key;
  const checked = `${key}:legacy-v1`;
  try {
    const current = storage.getItem(key);
    const legacy = storage.getItem(LEGACY_AUTH_STORAGE_KEY);
    const matchingLegacy = legacy !== null && matchesProject(legacy, supabaseUrl);
    if (current === null && matchingLegacy && storage.getItem(checked) !== "1") {
      storage.setItem(key, legacy);
    }
    // After sign-out, a tab still running the previous build may write the old key.
    // Do not let a later page load treat that value as an active session again.
    storage.setItem(checked, "1");
    if (matchingLegacy) storage.removeItem(LEGACY_AUTH_STORAGE_KEY);
  } catch {
    // If the destination write fails, the legacy value is still available on retry.
  }
  return key;
}

export function readSupabaseStoredUserIdFromStorage(
  storage: Pick<Storage, "getItem"> | null | undefined,
  key: string,
): string | null {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as (StoredSession & {
      currentSession?: StoredSession | null;
      session?: StoredSession | null;
    }) | null;
    const id = parsed?.user?.id ?? parsed?.currentSession?.user?.id ?? parsed?.session?.user?.id;
    return typeof id === "string" && id.trim() ? id : null;
  } catch {
    return null;
  }
}

export function bootstrapAuthTheme(supabaseUrl: string, projectRef?: string) {
  let mode = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  try {
    const storage = window.localStorage;
    const key = migrateLegacySupabaseSession(storage, supabaseUrl, projectRef);
    const id = readSupabaseStoredUserIdFromStorage(storage, key);
    const stored = storage.getItem(id ? `sett-personal-theme-mode:user:${id}` : "sett-personal-theme-mode:anonymous");
    if (stored === "dark" || stored === "light") mode = stored;
  } catch {
    // If the browser blocks local storage, use the system preference.
  }
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.dataset.themeMode = mode;
  root.style.setProperty("color-scheme", mode === "dark" ? "dark" : "only light");
}
