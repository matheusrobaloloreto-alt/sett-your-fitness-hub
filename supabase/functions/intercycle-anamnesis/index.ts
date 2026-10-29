import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertTenantAccess, HttpError, isUuid } from "../_shared/tenant-auth.ts";
import { loadPublishedForm, assertPublishedAnswers, type FormReadClient } from '../_shared/published-forms.ts';
import { projectFormAnswers } from '../_shared/form-definitions.ts';
import {
  decideCancel,
  decideScheduleNow,
  INTERCYCLE_CONSENT_TEXT_VERSION,
  mapIntercycleSubmitRpcFailure,
} from "../_shared/intercycle-anamnesis.ts";

const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const url = Deno.env.get("SUPABASE_URL")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const formClient=admin as unknown as FormReadClient;

type InviteRow = {
  form_definition_id?: string | null;
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
function opaqueToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((part) => part.toString(16).padStart(2, "0")).join("");
}
async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((part) => part.toString(16).padStart(2, "0")).join("");
}
async function actorSession(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const client = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const result = await client.auth.getClaims(authorization.slice(7));
  const verified = result.data?.claims || null;
  if (!verified?.sub) return null;
  if (typeof verified.exp === "number" && verified.exp * 1000 <= Date.now()) return null;
  return { claims: verified, client };
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
    if (action === "context") {
      const rawToken = String(body.token || "").trim();
      if (!/^[a-f0-9]{64}$/i.test(rawToken)) throw new HttpError(404, "Link inválido.");
      const inviteResult = await admin.from("intercycle_anamnesis_invites")
        .select("id, delivery_id, company_id, student_id, enrollment_id, training_cycle_id, expires_at, consumed_at, form_definition_id, intercycle_anamnesis_deliveries(status), students(full_name)")
        .eq("token_sha256", await hash(rawToken)).maybeSingle();
      const invite = inviteResult.data as InviteRow | null;
      if (inviteResult.error || !invite || invite.consumed_at || new Date(invite.expires_at).getTime() < Date.now()) throw new HttpError(410, "Este link não está mais disponível.");
      const deliveryStatus = Array.isArray(invite.intercycle_anamnesis_deliveries)
        ? invite.intercycle_anamnesis_deliveries[0]?.status
        : invite.intercycle_anamnesis_deliveries?.status;
      if (deliveryStatus === "cancelled" || deliveryStatus === "responded") throw new HttpError(410, "Este link não está mais disponível.");
      const student = Array.isArray(invite.students) ? invite.students[0] : invite.students;
      const definition=invite.form_definition_id ? await loadPublishedForm(formClient,invite.company_id,'intercycle',invite.form_definition_id) : null;
      if (action === "context") return new Response(JSON.stringify({ student: { full_name: student?.full_name || "" }, cycle_id: invite.training_cycle_id, form_definition:definition }), { headers });
    }
    if (action === "submit") {
      const rawToken = String(body.token || "").trim();
      if (!/^[a-f0-9]{64}$/i.test(rawToken)) throw new HttpError(404, "Link inválido.");
      const pinned=await admin.from('intercycle_anamnesis_invites').select('company_id,form_definition_id').eq('token_sha256',await hash(rawToken)).maybeSingle();
      if(pinned.error) throw new HttpError(503,'Versao do convite indisponivel.');
      if(pinned.data?.form_definition_id) {
        const definition=await loadPublishedForm(formClient,pinned.data.company_id,'intercycle',pinned.data.form_definition_id);
        if(!definition) throw new HttpError(409,'Versao indisponivel.');
        assertPublishedAnswers(definition,body.form_definition_id,body.versioned_answers);
        const payload=projectFormAnswers(definition.definition,body.versioned_answers);
        const result=await admin.rpc('submit_versioned_intercycle_form',{_token_sha256:await hash(rawToken),_definition_id:definition.id,_answers:body.versioned_answers,_payload:payload});
        if(result.error || !result.data) {const failure=mapIntercycleSubmitRpcFailure(result.error?.message);throw new HttpError(failure.status,failure.message);}
        return new Response(JSON.stringify({ok:true}),{headers});
      } else if(body.form_definition_id) throw new HttpError(409,'Versao do convite divergente.');
      if (body.sensitive_consent !== true) throw new HttpError(400, "Confirme o consentimento para usar dados sensíveis de treino e dor nesta atualização.");
      const eva = body.pain_eva == null || body.pain_eva === "" ? null : Number(body.pain_eva);
      const painPresent = body.pain_present === true;
      if (!['better','same','worse','not_completed'].includes(String(body.prescription_evaluation))) throw new HttpError(400, "Avalie a última prescrição.");
      if (typeof body.goals_continue !== "boolean" || typeof body.availability_changed !== "boolean") throw new HttpError(400, "Complete as atualizações solicitadas.");
      if (painPresent && (!Number.isInteger(eva) || eva! < 0 || eva! > 10 || !text(body.pain_location, 200))) throw new HttpError(400, "Informe local e intensidade do desconforto.");
      const submitted = await admin.rpc("submit_intercycle_anamnesis", {
        _token_sha256: await hash(rawToken),
        _prescription_evaluation: String(body.prescription_evaluation),
        _goals_continue: body.goals_continue,
        _new_goals: body.goals_continue ? null : text(body.new_goals),
        _availability_changed: body.availability_changed,
        _available_days: body.availability_changed && Array.isArray(body.available_days) ? body.available_days.map((v: unknown) => text(v, 40)).filter(Boolean) : null,
        _session_duration_minutes: body.availability_changed && body.session_duration_minutes ? Number(body.session_duration_minutes) : null,
        _training_location: body.availability_changed ? text(body.training_location, 200) : null,
        _available_equipment: body.availability_changed ? text(body.available_equipment, 500) : null,
        _pain_present: painPresent,
        _pain_location: painPresent ? text(body.pain_location, 200) : null,
        _pain_eva: painPresent ? eva : null,
        _pain_started_at: painPresent ? text(body.pain_started_at, 160) : null,
        _pain_movement: painPresent ? text(body.pain_movement, 300) : null,
        _additional_information: text(body.additional_information, 2000),
        _sensitive_consent: true,
        _consent_text_version: INTERCYCLE_CONSENT_TEXT_VERSION,
      });
      if (submitted.error || !submitted.data) {
        const failure = mapIntercycleSubmitRpcFailure(submitted.error?.message);
        throw new HttpError(failure.status, failure.message);
      }
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    const actor = await actorSession(req);
    if (!actor) throw new HttpError(401, "Autenticação necessária.");
    const studentId = String(body.student_id || "");
    const companyId = String(body.company_id || "");
    if (!isUuid(studentId) || !isUuid(companyId)) throw new HttpError(400, "Aluno ou empresa inválidos.");
    const tenant = await assertTenantAccess(admin, actor.claims, { companyId, studentId, requireStaff: true });
    const canManage = await actor.client.rpc("can_manage_staff_student", { _company_id: tenant.companyId, _student_id: studentId });
    if (canManage.error) throw new HttpError(503, "Não foi possível validar permissão sobre este aluno.");
    if (canManage.data !== true) throw new HttpError(403, "Sem permissão para gerenciar este aluno.");
    if (action === "create-link") {
      const today = await businessDate();
      const cyclesResult = await admin.from("training_cycles")
        .select("id,enrollment_id,start_date,end_date,status,superseded_at")
        .eq("company_id", tenant.companyId)
        .eq("student_id", studentId)
        .is("superseded_at", null)
        .order("start_date", { ascending: false })
        .limit(10);
      if (cyclesResult.error) throw new HttpError(503, "Não foi possível consultar o ciclo do aluno.");
      const cycle = ((cyclesResult.data || []) as TrainingCycleRow[]).find((candidate) => (
        candidate.start_date &&
        candidate.start_date <= today &&
        !["cancelled", "superseded"].includes(String(candidate.status || ""))
      ));
      if (!cycle?.start_date) throw new HttpError(409, "Este aluno não possui um ciclo vigente para a anamnese interciclos.");

      const enrollment = await admin.from("enrollments").select("id,status")
        .eq("id", cycle.enrollment_id).eq("company_id", tenant.companyId).eq("student_id", studentId).maybeSingle();
      if (enrollment.error || !enrollment.data || !["active", "awaiting_training", "awaiting_renewal"].includes(String(enrollment.data.status || ""))) {
        throw new HttpError(409, "A matrícula deste aluno não está ativa para a anamnese interciclos.");
      }

      const existing = await admin.from("intercycle_anamnesis_deliveries").select("id,status,last_error_code")
        .eq("company_id", tenant.companyId).eq("training_cycle_id", cycle.id).maybeSingle();
      if (existing.error) throw new HttpError(503, "Não foi possível consultar os convites interciclos.");
      if (existing.data?.last_error_code === "dispatch_uncertain") throw new HttpError(409, "Entrega não confirmada. A revisão técnica deve ocorrer antes de gerar outro link.");
      if (existing.data?.status === "sending") throw new HttpError(409, "O envio automático já está em andamento. Aguarde a confirmação.");
      if (existing.data?.status === "responded") throw new HttpError(409, "Este aluno já respondeu à anamnese deste ciclo.");

      const now = new Date().toISOString();
      const delivery = existing.data
        ? existing.data.status === "sent"
          ? await admin.from("intercycle_anamnesis_deliveries").update({
            last_error_code: "intercycle_manual_link_ready",
            updated_at: now,
          }).eq("id", existing.data.id).eq("status", "sent").select("id,status").maybeSingle()
          : await admin.from("intercycle_anamnesis_deliveries").update({
            status: "ready",
            scheduled_for: now,
            next_attempt_at: null,
            last_error_code: "intercycle_manual_link_ready",
            reopened_at: existing.data.status === "cancelled" ? now : null,
            reopened_by: existing.data.status === "cancelled" ? tenant.userId : null,
            updated_at: now,
          }).eq("id", existing.data.id).eq("status", existing.data.status).select("id,status").maybeSingle()
        : await admin.from("intercycle_anamnesis_deliveries").insert({
          company_id: tenant.companyId,
          student_id: studentId,
          enrollment_id: cycle.enrollment_id,
          training_cycle_id: cycle.id,
          idempotency_key: `intercycle:${cycle.id}`,
          status: "ready",
          scheduled_for: now,
          last_error_code: "intercycle_manual_link_ready",
        }).select("id,status").maybeSingle();
      if (delivery.error) throw new HttpError(400, "Não foi possível preparar o link interciclos.");
      if (!delivery.data) throw new HttpError(409, "O estado do ciclo mudou. Recarregue e tente novamente.");

      const previousInvite = await admin.from("intercycle_anamnesis_invites").select("id,form_definition_id")
        .eq("delivery_id", delivery.data.id).maybeSingle();
      if (previousInvite.error) throw new HttpError(503, "Não foi possível consultar o convite interciclos.");
      const token = opaqueToken();
      const definition=previousInvite.data ? (previousInvite.data.form_definition_id ? await loadPublishedForm(formClient,tenant.companyId,'intercycle',previousInvite.data.form_definition_id) : null) : await loadPublishedForm(formClient,tenant.companyId,'intercycle');
      const expiresAt = new Date(Date.now() + (definition?.definition.policy.invite_expiry_days??14) * 24 * 60 * 60 * 1000).toISOString();
      const invitePayload = {
        delivery_id: delivery.data.id,
        company_id: tenant.companyId,
        student_id: studentId,
        enrollment_id: cycle.enrollment_id,
        training_cycle_id: cycle.id,
        token_sha256: await hash(token),
        expires_at: expiresAt,
        consumed_at: null,
      };
      const invite = previousInvite.data ? await admin.from('intercycle_anamnesis_invites').update(invitePayload).eq('id',previousInvite.data.id).is('consumed_at',null).select('expires_at').single() : await admin.from('intercycle_anamnesis_invites').insert(invitePayload).select('expires_at').single();
      if (invite.error) throw new HttpError(400, "Não foi possível gerar o convite interciclos.");
      return new Response(JSON.stringify({
        token,
        expires_at: invite.data?.expires_at??expiresAt,
        replaced_previous: Boolean(previousInvite.data),
      }), { headers });
    }
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
      const definition=await loadPublishedForm(formClient,tenant.companyId,'intercycle');
      const scheduledDay=definition?.definition.policy.intercycle_day??29;
      if (today < datePlusDays(cycle.start_date, scheduledDay-1)) throw new HttpError(409, `O agendamento fica disponivel a partir do dia ${scheduledDay} do ciclo.`);
      const existing = await admin.from("intercycle_anamnesis_deliveries").select("id,status,last_error_code")
        .eq("company_id", tenant.companyId).eq("training_cycle_id", cycleId).maybeSingle();
      if (existing.error) throw new HttpError(400, "Não foi possível consultar o agendamento.");
      if (existing.data?.last_error_code === "dispatch_uncertain") throw new HttpError(409, "Entrega não confirmada. A revisão técnica deve ocorrer antes de reagendar.");
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
