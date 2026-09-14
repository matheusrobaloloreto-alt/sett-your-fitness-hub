type SupabaseStoredSession = {
  user?: { id?: unknown } | null;
  currentSession?: { user?: { id?: unknown } | null } | null;
  session?: { user?: { id?: unknown } | null } | null;
};

const viteEnv = (typeof import.meta !== "undefined" && "env" in import.meta)
  ? (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  : undefined;

export function supabaseAuthStorageKeyFromUrl(
  supabaseUrl: string | null | undefined,
  fallbackProjectRef = "sett-current",
): string {
  try {
    const projectRef = new URL(supabaseUrl || "").hostname.split(".")[0];
    if (projectRef) return `sb-${projectRef}-auth-token`;
  } catch {
    // Fall through to the active build project id when URL parsing is unavailable.
  }
  return `sb-${fallbackProjectRef}-auth-token`;
}

export const SUPABASE_AUTH_STORAGE_KEY = supabaseAuthStorageKeyFromUrl(
  viteEnv?.VITE_SUPABASE_URL,
  viteEnv?.VITE_SUPABASE_PROJECT_ID,
);

export function readSupabaseStoredUserIdFromStorage(
  local: Storage | null | undefined,
  storageKey = SUPABASE_AUTH_STORAGE_KEY,
): string | null {
  if (!local) return null;
  try {
    const raw = local.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SupabaseStoredSession;
    const userId =
      parsed?.user?.id ??
      parsed?.currentSession?.user?.id ??
      parsed?.session?.user?.id ??
      null;
    return typeof userId === "string" && userId.trim() ? userId : null;
  } catch {
    return null;
  }
}
