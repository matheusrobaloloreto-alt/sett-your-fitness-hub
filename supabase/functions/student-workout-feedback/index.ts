// student-workout-feedback — fonte de verdade do feedback pós-treino.
// Persistimos primeiro em workout_feedback; WhatsApp é só espelho opcional.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildWorkoutFeedbackMessage,
  buildWorkoutFeedbackRecord,
  deliverWorkoutFeedbackToWhatsapp,
  normalizeWorkoutFeedbackPayload,
} from "../_shared/student-workout-feedback.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function getSub(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data, error } = await supa.auth.getClaims(auth.replace("Bearer ", ""));
  return error ? null : (typeof data?.claims?.sub === "string" ? data.claims.sub : null);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sub = await getSub(req);
  if (!sub) return json({ error: "Unauthorized" }, 401);

  try {
    const body = await req.json();
    const { student_id } = body;
    if (!student_id) return json({ error: "student_id obrigatório" }, 400);
    const payload = normalizeWorkoutFeedbackPayload(body);

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: student } = await db.from("students").select("id, company_id, user_id, full_name, whatsapp, phone").eq("id", student_id).maybeSingle();
    if (!student) return json({ error: "Aluno não encontrado" }, 404);
    if (student.user_id !== sub) return json({ error: "Forbidden" }, 403); // só o próprio aluno

    const firstName = String(student.full_name || "Aluno").split(/\s+/)[0];
    const content = buildWorkoutFeedbackMessage({ firstName, payload });
    const feedbackRecord = buildWorkoutFeedbackRecord({
      studentId: student_id,
      companyId: student.company_id,
      payload,
    });

    // Persist first. WhatsApp is an optional delivery channel, never the source of truth.
    const { data: savedFeedback, error: feedbackError } = await db.from("workout_feedback").insert(feedbackRecord).select("id").single();
    if (feedbackError || !savedFeedback) {
      throw new Error(`Falha ao registrar feedback: ${feedbackError?.message || "registro não retornado"}`);
    }

    const { data: enrollment } = await db.from("enrollments")
      .select("id, trainer_id")
      .eq("student_id", student_id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    await db.from("admin_alerts").insert({
      company_id: student.company_id,
      type: feedbackRecord.pain_areas.length ? "workout_feedback_pain" : "workout_feedback",
      severity: feedbackRecord.pain_areas.length ? "warning" : "info",
      target_role: enrollment?.trainer_id ? "trainer" : "admin",
      target_user_id: enrollment?.trainer_id ?? null,
      student_id,
      enrollment_id: null,
      title: feedbackRecord.pain_areas.length ? "Aluno relatou desconforto no treino" : "Novo feedback de treino",
      message: content,
      action_url: `/admin/students/${student_id}`,
    });

    const delivery = await deliverWorkoutFeedbackToWhatsapp({
      db,
      studentId: student_id,
      student,
      content,
    });

    return json({ ok: true, persisted: true, delivered: delivery.delivered, feedback_id: savedFeedback.id });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});
