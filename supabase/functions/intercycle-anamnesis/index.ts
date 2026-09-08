import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertTenantAccess, HttpError, isUuid } from "../_shared/tenant-auth.ts";
import {
  decideCancel,
  decideScheduleNow,
  INTERCYCLE_CONSENT_TEXT_VERSION,
} from "../_shared/intercycle-anamnesis.ts";

const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const url = Deno.env.get("SUPABASE_URL")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

type InviteRow = {
  id: string;
  delivery_id: string;
  company_id: string;
  student_id: string;
  enrollment_id: string;
  training_cycle_id: string;
  expires_at: string;
  consumed_at: string | null;
  intercycle_anamnesis_deliveries?: { status?: string | null } | Array<{ status?: string | null }> | null;
  students?: { full_name?: string | null } | Array<{ full_name?: string | null }> | null;
};

type TrainingCycleRow = {
  id: string;
  enrollment_id: string;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  superseded_at: string | null;
};

function text(value: unknown, max = 1200) {
  const source = String(value ?? "");
  let cleaned = "";
  for (const char of source) {
    const code = char.charCodeAt(0);
    cleaned += char === "<" || char === ">" || code < 32 ? " " : char;
  }
  return cleaned.trim().slice(0, max) || null;
}
async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((part) => part.toString(16).padStart(2, "0")).join("");
}
async function claims(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const client = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const result = await client.auth.getClaims(authorization.slice(7));
  const verified = result.data?.claims || null;
  if (!verified?.sub) return null;
  if (typeof verified.exp === "number" && verified.exp * 1000 <= Date.now()) return null;
  return verified;
}

async function businessDate() {
  const { data, error } = await admin.rpc("current_business_date");
  if (error || !data) throw new HttpError(503, "Data operacional indisponível.");
  return String(data);
}

function datePlusDays(date: string, days: number) {
  const start = new Date(`${date}T00:00:00-03:00`);
  start.setUTCDate(start.getUTCDate() + days);
  return start.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("", { headers });
  try {
    const body = await req.json();
    const action = String(body.action || "");
    if (action === "context" || action === "submit") {
      const rawToken = String(body.token || "").trim();
      if (!/^[a-f0-9]{64}$/i.test(rawToken)) throw new HttpError(404, "Link inválido.");
      const inviteResult = await admin.from("intercycle_anamnesis_invites")
        .select("id, delivery_id, company_id, student_id, enrollment_id, training_cycle_id, expires_at, consumed_at, intercycle_anamnesis_deliveries(status), students(full_name)")
        .eq("token_sha256", await hash(rawToken)).maybeSingle();
      const invite = inviteResult.data as InviteRow | null;
      if (inviteResult.error || !invite || invite.consumed_at || new Date(invite.expires_at).getTime() < Date.now()) throw new HttpError(410, "Este link não está mais disponível.");
      const deliveryStatus = Array.isArray(invite.intercycle_anamnesis_deliveries)
        ? invite.intercycle_anamnesis_deliveries[0]?.status
        : invite.intercycle_anamnesis_deliveries?.status;
      if (deliveryStatus === "cancelled" || deliveryStatus === "responded") throw new HttpError(410, "Este link não está mais disponível.");
      const student = Array.isArray(invite.students) ? invite.students[0] : invite.students;
      if (action === "context") return new Response(JSON.stringify({ student: { full_name: student?.full_name || "" }, cycle_id: invite.training_cycle_id }), { headers });
      if (body.sensitive_consent !== true) throw new HttpError(400, "Confirme o consentimento para usar dados sensíveis de treino e dor nesta atualização.");
      const eva = body.pain_eva == null || body.pain_eva === "" ? null : Number(body.pain_eva);
      const painPresent = body.pain_present === true;
      if (!['better','same','worse','not_completed'].includes(String(body.prescription_evaluation))) throw new HttpError(400, "Avalie a última prescrição.");
      if (typeof body.goals_continue !== "boolean" || typeof body.availability_changed !== "boolean") throw new HttpError(400, "Complete as atualizações solicitadas.");
      if (painPresent && (!Number.isInteger(eva) || eva! < 0 || eva! > 10 || !text(body.pain_location, 200))) throw new HttpError(400, "Informe local e intensidade do desconforto.");
      const now = new Date().toISOString();
      const answer = await admin.from("intercycle_anamneses").insert({
        company_id: invite.company_id, student_id: invite.student_id, enrollment_id: invite.enrollment_id,
        training_cycle_id: invite.training_cycle_id, delivery_id: invite.delivery_id,
        prescription_evaluation: body.prescription_evaluation, goals_continue: body.goals_continue,
        new_goals: body.goals_continue ? null : text(body.new_goals), availability_changed: body.availability_changed,
        available_days: body.availability_changed && Array.isArray(body.available_days) ? body.available_days.map((v: unknown) => text(v, 40)).filter(Boolean) : null,
        session_duration_minutes: body.availability_changed && body.session_duration_minutes ? Number(body.session_duration_minutes) : null,
        training_location: body.availability_changed ? text(body.training_location, 200) : null,
        available_equipment: body.availability_changed ? text(body.available_equipment, 500) : null,
        pain_present: painPresent, pain_location: painPresent ? text(body.pain_location, 200) : null,
        pain_eva: painPresent ? eva : null, pain_started_at: painPresent ? text(body.pain_started_at, 160) : null,
        pain_movement: painPresent ? text(body.pain_movement, 300) : null,
        additional_information: text(body.additional_information, 2000),
        sensitive_consent: true,
        consent_text_version: INTERCYCLE_CONSENT_TEXT_VERSION,
        consented_at: now,
      }).select("id").maybeSingle();
      if (answer.error) throw new HttpError(answer.error.code === "23505" ? 409 : 400, "Esta atualização já foi registrada ou não pôde ser salva.");
      if (!answer.data) throw new HttpError(409, "Esta atualização não foi confirmada pelo banco.");
      const consumed = await admin.from("intercycle_anamnesis_invites").update({ consumed_at: now }).eq("id", invite.id).is("consumed_at", null).select("id").maybeSingle();
      if (consumed.error || !consumed.data) throw new HttpError(409, "Esta atualização já foi consumida.");
      const responded = await admin.from("intercycle_anamnesis_deliveries").update({ status: "responded", responded_at: now, next_attempt_at: null, updated_at: now }).eq("id", invite.delivery_id).in("status", ["sent", "sending"]).select("id").maybeSingle();
      if (responded.error || !responded.data) throw new HttpError(409, "Não foi possível concluir esta atualização.");
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    const actor = await claims(req);
    if (!actor) throw new HttpError(401, "Autenticação necessária.");
    const studentId = String(body.student_id || "");
    const companyId = String(body.company_id || "");
    if (!isUuid(studentId) || !isUuid(companyId)) throw new HttpError(400, "Aluno ou empresa inválidos.");
    const tenant = await assertTenantAccess(admin, actor, { companyId, studentId, requireStaff: true });
    if (action === "opt-in") {
      const enabled = body.enabled === true;
      const result = await admin.from("students").update({ intercycle_anamnesis_enabled: enabled }).eq("id", studentId).eq("company_id", tenant.companyId);
      if (result.error) throw new HttpError(400, "Não foi possível atualizar o agendamento.");
      return new Response(JSON.stringify({ ok: true, enabled }), { headers });
    }
    if (action === "schedule-now") {
      const cycleId = String(body.training_cycle_id || "");
      if (!isUuid(cycleId)) throw new HttpError(400, "Ciclo inválido.");
      const cycleResult = await admin.from("training_cycles").select("id, enrollment_id, start_date, end_date, status, superseded_at").eq("id", cycleId).eq("student_id", studentId).eq("company_id", tenant.companyId).maybeSingle();
      const cycle = cycleResult.data as TrainingCycleRow | null;
      if (!cycle || !cycle.start_date) throw new HttpError(404, "Ciclo não encontrado.");
      if (cycle.superseded_at || ["cancelled", "superseded"].includes(String(cycle.status || ""))) throw new HttpError(409, "Ciclo inválido para Anamnese interciclos.");
      const today = await businessDate();
      if (today < datePlusDays(cycle.start_date, 28)) throw new HttpError(409, "O envio manual só fica disponível a partir do dia 29 do ciclo.");
      const existing = await admin.from("intercycle_anamnesis_deliveries").select("id,status")
        .eq("company_id", tenant.companyId).eq("training_cycle_id", cycleId).maybeSingle();
      if (existing.error) throw new HttpError(400, "Não foi possível consultar o agendamento.");
      const now = new Date().toISOString();
      const decision = existing.data ? decideScheduleNow(existing.data.status) : { action: "insert" as const };
      if (decision.action === "noop") return new Response(JSON.stringify({ ok: true, already_sent: true }), { headers });
      if (decision.action === "reject") {
        throw new HttpError(409, decision.reason === "delivery_claimed_or_sending"
          ? "Este envio já foi assumido pelo disparador. Aguarde o resultado antes de reagendar."
          : "Estado do agendamento inválido para reagendamento manual.");
      }
      const queued = existing.data
        ? await admin.from("intercycle_anamnesis_deliveries").update({
          status: "scheduled",
          scheduled_for: now,
          next_attempt_at: null,
          last_error_code: decision.action === "insert" ? null : decision.auditCode,
          reopened_at: decision.action === "reopen" ? now : null,
          reopened_by: decision.action === "reopen" ? tenant.userId : null,
          updated_at: now,
        }).eq("id", existing.data.id).eq("status", existing.data.status).select("id,status").maybeSingle()
        : await admin.from("intercycle_anamnesis_deliveries").insert({
          company_id: tenant.companyId, student_id: studentId, enrollment_id: cycle.enrollment_id, training_cycle_id: cycleId,
          idempotency_key: `intercycle:${cycleId}`, scheduled_for: now, status: "scheduled", next_attempt_at: null,
        }).select("id,status").maybeSingle();
      if (queued.error) throw new HttpError(400, "Não foi possível agendar o envio.");
      if (!queued.data) throw new HttpError(409, "O agendamento mudou enquanto era atualizado. Recarregue e tente novamente.");
      return new Response(JSON.stringify({ ok: true, queued: true }), { headers });
    }
    if (action === "cancel") {
      const deliveryId = String(body.delivery_id || "");
      if (!isUuid(deliveryId)) throw new HttpError(400, "Agendamento inválido.");
      const current = await admin.from("intercycle_anamnesis_deliveries").select("id,status")
        .eq("id", deliveryId).eq("company_id", tenant.companyId).eq("student_id", studentId).maybeSingle();
      if (current.error) throw new HttpError(400, "Não foi possível consultar este agendamento.");
      if (!current.data) throw new HttpError(404, "Agendamento não encontrado.");
      const decision = decideCancel(current.data.status);
      if (decision.action === "noop") return new Response(JSON.stringify({ ok: true, already_cancelled: true }), { headers });
      if (decision.action === "reject") {
        throw new HttpError(409, decision.reason === "delivery_claimed_or_sending"
          ? "Este envio já foi assumido pelo disparador ou pode ter sido enviado. Não é seguro cancelar automaticamente."
          : "Este envio já saiu ou foi respondido. Não é seguro cancelar automaticamente.");
      }
      const now = new Date().toISOString();
      const cancelled = await admin.from("intercycle_anamnesis_deliveries").update({
        status: "cancelled",
        cancelled_at: now,
        cancelled_by: tenant.userId,
        last_error_code: decision.auditCode,
        updated_at: now,
      }).eq("id", deliveryId).eq("company_id", tenant.companyId).eq("student_id", studentId).eq("status", current.data.status).select("id").maybeSingle();
      if (cancelled.error) throw new HttpError(400, "Não foi possível cancelar este agendamento.");
      if (!cancelled.data) throw new HttpError(409, "O agendamento mudou enquanto era cancelado. Recarregue e tente novamente.");
      return new Response(JSON.stringify({ ok: true }), { headers });
    }
    throw new HttpError(400, "Ação inválida.");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno." }), { status, headers });
  }
});
