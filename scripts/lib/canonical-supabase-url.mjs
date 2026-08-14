export const CANONICAL_SUPABASE_HOST = "zshrcgbyhzxpnlccssyz.supabase.co";

export function assertCanonicalSupabaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("AUDIT_SUPABASE_URL must be a valid URL");
  }
  if (
    parsed.protocol !== "https:"
    || parsed.hostname !== CANONICAL_SUPABASE_HOST
    || parsed.port
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || !["", "/"].includes(parsed.pathname)
  ) {
    throw new Error(`Refusing non-canonical Supabase URL; expected https://${CANONICAL_SUPABASE_HOST}`);
  }
  return parsed.origin;
}
