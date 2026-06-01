// Public endpoint: lookup company by slug, list active plans, create student.
// Uses service role to enforce strict scoping; never trusts client company_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function resolveCompany(slug: string | null) {
  if (slug) {
    const { data } = await supabase
      .from("companies")
      .select("id, name, slug")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    if (data) return data;
  }
  const { data } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const action = body?.action as string;

    if (action === "context") {
      const company = await resolveCompany(body.slug ?? null);
      if (!company) {
        return new Response(JSON.stringify({ error: "Empresa não encontrada" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const [{ data: settings }, { data: plans }] = await Promise.all([
        supabase.from("platform_settings")
          .select("logo_url, platform_title, primary_color, background_color, card_color, text_color")
          .eq("company_id", company.id).maybeSingle(),
        supabase.from("plans")
          .select("id, name, description, duration_weeks, price")
          .eq("company_id", company.id).eq("is_active", true).order("name"),
      ]);
      return new Response(JSON.stringify({ company, branding: settings ?? null, plans: plans ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "register") {
      const { companyId, student } = body;
      if (!companyId || !student?.full_name || !student?.email) {
        return new Response(JSON.stringify({ error: "Dados obrigatórios ausentes" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Validate that companyId is real and active (defense-in-depth).
      const { data: company } = await supabase
        .from("companies").select("id").eq("id", companyId).eq("is_active", true).maybeSingle();
      if (!company) {
        return new Response(JSON.stringify({ error: "Empresa inválida" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Validate plan belongs to this company (if provided).
      if (student.selected_plan_id) {
        const { data: plan } = await supabase
          .from("plans").select("id")
          .eq("id", student.selected_plan_id)
          .eq("company_id", companyId)
          .eq("is_active", true).maybeSingle();
        if (!plan) {
          return new Response(JSON.stringify({ error: "Plano inválido para esta empresa" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Whitelist allowed fields — never trust client to set company_id, status, user_id, etc.
      const allowed = [
        "full_name", "birth_date", "email", "phone", "cpf", "cep",
        "address", "address_number", "neighborhood", "city", "state",
        "whatsapp", "selected_plan_id",
      ];
      const insertPayload: Record<string, any> = { company_id: companyId, status: "pending" };
      for (const k of allowed) if (student[k] !== undefined) insertPayload[k] = student[k];

      const { data, error } = await supabase
        .from("students").insert(insertPayload).select("id").single();
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ studentId: data.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
