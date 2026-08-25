import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertTenantAccess, HttpError, isUuid } from "../_shared/tenant-auth.ts";
import {
  CardioPlanValidationError,
  normalizeCardioPlanUpdate,
  type EditableCardioSport,
} from "../_shared/cardio-plan-update.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_REQUEST_BYTES = 1_100_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const token = authHeader.slice("Bearer ".length);
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData.user) return json(401, { error: "Unauthorized" });

    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return json(413, { error: "Payload acima do limite permitido." });
    }
    let body: Record<string, unknown>;
    try {
      const parsed = JSON.parse(rawBody);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
      body = parsed as Record<string, unknown>;
    } catch {
      return json(400, { error: "JSON inválido." });
    }

    const planId = body.plan_id;
    const expectedUpdatedAt = body.expected_updated_at;
    if (!isUuid(planId)) return json(400, { error: "plan_id inválido." });
    if (!isTimestamp(expectedUpdatedAt)) return json(400, { error: "expected_updated_at inválido." });

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: existing, error: lookupError } = await adminClient
      .from("running_plans")
      .select("id, student_id, company_id, sport, updated_at, plan_name, goal, model")
      .eq("id", planId)
      .maybeSingle();
    if (lookupError) throw new HttpError(503, "Falha ao carregar a prescrição.");
    if (!existing) return json(404, { error: "Plano não encontrado." });

    await assertTenantAccess(adminClient, { sub: userData.user.id }, {
      studentId: existing.student_id,
      companyId: existing.company_id,
      requireStaff: true,
    });
    if (!(["corrida", "natacao", "ciclismo"] as string[]).includes(existing.sport)) {
      return json(409, { error: "Este plano não pertence a uma modalidade editável." });
    }
    if (existing.updated_at !== expectedUpdatedAt) {
      return json(409, { error: "Este plano foi atualizado em outra sessão. Recarregue antes de salvar." });
    }

    const normalized = normalizeCardioPlanUpdate(body.plan, existing.sport as EditableCardioSport);
    const persistedPlan = {
      ...normalized,
      plan_name: normalized.plan_name || existing.plan_name,
      goal: normalized.goal || existing.goal,
      model: normalized.model || existing.model,
    };
    const { data: updated, error: updateError } = await adminClient
      .from("running_plans")
      .update({
        plan_name: persistedPlan.plan_name,
        goal: persistedPlan.goal,
        duration_weeks: persistedPlan.duration_weeks,
        model: persistedPlan.model,
        weeks: persistedPlan.weeks,
        fc_zones: persistedPlan.fc_zones,
        safety_check: persistedPlan.safety_check,
        general_tips: persistedPlan.general_tips,
        warnings: persistedPlan.warnings,
        complementary_strength: persistedPlan.complementary_strength,
        nutrition_alert: persistedPlan.nutrition_alert,
      })
      .eq("id", planId)
      .eq("student_id", existing.student_id)
      .eq("company_id", existing.company_id)
      .eq("updated_at", expectedUpdatedAt)
      .select("id, updated_at")
      .maybeSingle();
    if (updateError) throw new HttpError(503, "Falha ao salvar a prescrição.");
    if (!updated) {
      return json(409, { error: "Este plano foi atualizado em outra sessão. Recarregue antes de salvar." });
    }

    return json(200, { id: updated.id, updated_at: updated.updated_at, plan: persistedPlan });
  } catch (error) {
    if (error instanceof CardioPlanValidationError) return json(400, { error: error.message });
    const status = error instanceof HttpError ? error.status : 500;
    console.error("update-running-plan-draft failed", {
      status,
      message: error instanceof Error ? error.message : "unknown",
    });
    return json(status, { error: status >= 500 ? "Falha ao salvar a prescrição." : (error as Error).message });
  }
});
