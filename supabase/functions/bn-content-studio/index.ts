import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { createBnContentHandler, StudioError } from "./handler.ts";
import { createGeminiProvider } from "./provider.ts";
import { createStudioStore } from "./store.ts";

export function createRuntimeHandler(
  env: (name: string) => string | undefined,
  fetcher: typeof fetch = fetch,
) {
  const url = env("SUPABASE_URL") ?? "";
  const anonKey = env("SUPABASE_ANON_KEY") ?? "";
  const key = env("BN_CONTENT_GEMINI_API_KEY") ?? "";
  const provider = createGeminiProvider(key, fetcher);
  return createBnContentHandler({
    async authenticate(token) {
      if (!url || !anonKey) throw new StudioError(503, "auth_unavailable");
      const client = createClient(url, anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          headers: { Authorization: `Bearer ${token}` },
          fetch: fetcher,
        },
      });
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) return null;
      const role = await client.rpc("has_role", {
        _user_id: data.user.id,
        _role: "master",
      });
      if (role.error) throw new StudioError(503, "auth_unavailable");
      return { id: data.user.id, master: role.data === true };
    },
    store() {
      const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
      if (!url || !serviceKey) {
        throw new StudioError(503, "storage_unavailable");
      }
      return createStudioStore(createClient(url, serviceKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: { fetch: fetcher },
      }));
    },
    capabilities: () => ({
      text: key.trim().length > 0,
      images: key.trim().length > 0,
    }),
    text: provider.text,
    image: provider.image,
    uuid: () => crypto.randomUUID(),
  });
}

if (import.meta.main) {
  Deno.serve(createRuntimeHandler((name) => Deno.env.get(name)));
}
