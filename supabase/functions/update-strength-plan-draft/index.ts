import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertTenantAccess, HttpError, isUuid } from "../_shared/tenant-auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_REQUEST_BYTES = 1_100_000;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const isTimestamp = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await authClient.auth.getUser(authHeader.slice(7));
    if (userError || !userData.user) return json(401, { error: "Unauthorized" });

    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) return json(413, { error: "Payload acima do limite permitido." });
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    if (!isUuid(body.plan_id)) return json(400, { error: "plan_id inválido." });
    if (!isTimestamp(body.expected_updated_at)) return json(400, { error: "expected_updated_at inválido." });
    if (!body.plan || typeof body.plan !== "object" || Array.isArray(body.plan)) return json(400, { error: "Plano inválido." });
    const workouts = (body.plan as Record<string, unknown>).workouts;
    if (!Array.isArray(workouts) || workouts.length < 1 || workouts.length > 20) return json(400, { error: "O plano precisa conter entre 1 e 20 treinos." });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: existing, error: lookupError } = await admin.from("ai_strength_plans")
      .select("id,student_id,company_id,updated_at").eq("id", body.plan_id).maybeSingle();
    if (lookupError) throw new HttpError(503, "Falha ao carregar a prescrição.");
    if (!existing) return json(404, { error: "Plano não encontrado." });
    await assertTenantAccess(admin, { sub: userData.user.id }, { studentId: existing.student_id, companyId: existing.company_id, requireStaff: true });
    if (existing.updated_at !== body.expected_updated_at) return json(409, { error: "Este plano foi atualizado em outra sessão. Recarregue antes de salvar." });

    const { data: updated, error: updateError } = await admin.from("ai_strength_plans")
      .update({ plan: body.plan }).eq("id", existing.id).eq("student_id", existing.student_id)
      .eq("company_id", existing.company_id).eq("updated_at", body.expected_updated_at)
      .select("id,updated_at,plan").maybeSingle();
    if (updateError) throw new HttpError(503, "Falha ao salvar a prescrição.");
    if (!updated) return json(409, { error: "Este plano foi atualizado em outra sessão. Recarregue antes de salvar." });
    return json(200, updated);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    console.error("update-strength-plan-draft failed", { status, message: error instanceof Error ? error.message : "unknown" });
    return json(status, { error: status >= 500 ? "Falha ao salvar a prescrição." : (error as Error).message });
  }
});
