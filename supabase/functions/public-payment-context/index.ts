// Public endpoint for the payment page: returns student data, available plans
// (scoped to the student's company), and renewal flag. Also allows updating the
// student's selected_plan_id. No anon RLS dependency.
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

    if (action === "context") {
      const { data: student } = await supabase
        .from("students")
        .select("id, full_name, email, cpf, cep, phone, whatsapp, selected_plan_id, address, address_number, neighborhood, company_id")
        .eq("id", studentId).maybeSingle();
      if (!student) {
        return new Response(JSON.stringify({ error: "Aluno não encontrado" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const [{ data: plans }, { data: enrollment }] = await Promise.all([
        supabase.from("plans")
          .select("id, name, price, duration_weeks, description")
          .eq("company_id", student.company_id!)
          .eq("is_active", true).order("price"),
        supabase.from("enrollments")
          .select("id").eq("student_id", studentId).eq("status", "active").maybeSingle(),
      ]);

      const { company_id: _omit, ...safeStudent } = student;
      return new Response(JSON.stringify({
        student: safeStudent,
        plans: plans ?? [],
        isRenewal: !!enrollment,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "select-plan") {
      const planId = body?.planId as string | undefined;
      if (!planId) {
        return new Response(JSON.stringify({ error: "planId obrigatório" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: student } = await supabase
        .from("students").select("company_id").eq("id", studentId).maybeSingle();
      if (!student) {
        return new Response(JSON.stringify({ error: "Aluno não encontrado" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: plan } = await supabase
        .from("plans").select("id").eq("id", planId)
        .eq("company_id", student.company_id!).eq("is_active", true).maybeSingle();
      if (!plan) {
        return new Response(JSON.stringify({ error: "Plano inválido" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await supabase.from("students")
        .update({ selected_plan_id: planId }).eq("id", studentId);
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
