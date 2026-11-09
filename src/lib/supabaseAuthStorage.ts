import {
  readSupabaseStoredUserIdFromStorage as readUserId,
  supabaseAuthStorageKeyFromUrl,
} from "./supabaseAuthBootstrap";

export { supabaseAuthStorageKeyFromUrl };

// Use direct property reads so Vite replaces them in the production bundle.
export const SUPABASE_AUTH_STORAGE_KEY = supabaseAuthStorageKeyFromUrl(
  import.meta.env?.VITE_SUPABASE_URL,
  import.meta.env?.VITE_SUPABASE_PROJECT_ID,
);

export function readSupabaseStoredUserIdFromStorage(
  storage: Storage | null | undefined,
  key = SUPABASE_AUTH_STORAGE_KEY,
): string | null {
  return readUserId(storage, key);
}
