// Public endpoint: load minimal student context (name + company branding) and
// upsert anamnesis. Service role enforces scoping; client only sends studentId.
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

const ALLOWED_FIELDS = [
  "modalities","training_days","available_days","session_duration","training_location",
  "available_equipment","goals","diseases","injuries","current_pain","nutrition",
  "profession","sleep_hours","restorative_sleep","aware_of_trilogy","feel_in_3_months",
  "biggest_obstacle","extra_comments","authorizes_plan","commits_communication",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const action = body?.action as string;
    const studentId = body?.studentId as string | undefined;
    if (!studentId) {
      return new Response(JSON.stringify({ error: "studentId obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: student } = await supabase
      .from("students").select("id, full_name, company_id").eq("id", studentId).maybeSingle();
    if (!student) {
      return new Response(JSON.stringify({ error: "Aluno não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "context") {
      let branding = null;
      if (student.company_id) {
        const { data } = await supabase.from("platform_settings")
          .select("logo_url, platform_title, primary_color, background_color, card_color, text_color")
          .eq("company_id", student.company_id).maybeSingle();
        branding = data ?? null;
      }
      return new Response(JSON.stringify({
        student: { id: student.id, full_name: student.full_name },
        branding,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "submit") {
      const payload: Record<string, any> = {
        student_id: student.id,
        company_id: student.company_id,
      };
      for (const k of ALLOWED_FIELDS) if (body[k] !== undefined) payload[k] = body[k];

      const { data: existing } = await supabase
        .from("anamnesis").select("id, version").eq("student_id", student.id)
        .order("version", { ascending: false }).limit(1).maybeSingle();

      let error;
      if (existing) {
        ({ error } = await supabase.from("anamnesis").update({
          ...payload, version: (existing.version || 1) + 1, updated_at: new Date().toISOString(),
        }).eq("id", existing.id));
      } else {
        ({ error } = await supabase.from("anamnesis").insert(payload));
      }
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
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
