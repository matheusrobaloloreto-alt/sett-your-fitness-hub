import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  handleStudentRecoveryWhatsApp,
  RECOVERY_NEUTRAL_RESPONSE,
} from "../_shared/student-recovery-whatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-forwarded-for",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requestIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    null;
}

function runtimeConfig() {
  return {
    enabled: Deno.env.get("RECOVERY_WHATSAPP_SEND_ENABLED") === "true",
    hashSecret: Deno.env.get("RECOVERY_WHATSAPP_HASH_SECRET") || "",
    redirectTo: Deno.env.get("RECOVERY_REDIRECT_TO") || undefined,
    provider: {
      url: Deno.env.get("EVOLUTION_API_URL") || "",
      key: Deno.env.get("EVOLUTION_API_KEY") || "",
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") return json(RECOVERY_NEUTRAL_RESPONSE);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json(RECOVERY_NEUTRAL_RESPONSE);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const body = await req.json().catch(() => ({}));
  const result = await handleStudentRecoveryWhatsApp(admin, runtimeConfig(), {
    email: body?.email,
    requestIp: requestIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return json(result.body, result.status);
});
