const FALLBACK_SUPABASE_PROJECT_REF = "zshrcgbyhzxpnlccssyz";

type SupabaseStoredSession = {
  user?: { id?: unknown } | null;
  currentSession?: { user?: { id?: unknown } | null } | null;
  session?: { user?: { id?: unknown } | null } | null;
};

const viteEnv = (typeof import.meta !== "undefined" && "env" in import.meta)
  ? (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  : undefined;

export function supabaseAuthStorageKeyFromUrl(supabaseUrl: string | null | undefined): string {
  try {
    const projectRef = new URL(supabaseUrl || "").hostname.split(".")[0];
    if (projectRef) return `sb-${projectRef}-auth-token`;
  } catch {
    // Fall through to the known current project key. This preserves existing
    // sessions if env injection is unavailable in a local test/bootstrap path.
  }
  return `sb-${FALLBACK_SUPABASE_PROJECT_REF}-auth-token`;
}

export const SUPABASE_AUTH_STORAGE_KEY = supabaseAuthStorageKeyFromUrl(viteEnv?.VITE_SUPABASE_URL);

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
