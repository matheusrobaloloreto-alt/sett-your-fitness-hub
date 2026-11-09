import { dispatchConfiguredMessageSequence } from "../_shared/message-sequence.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DEFAULT_COMPANY_PRODUCT_SETTINGS, getCompanyProductSettings, readCompanyProductSettings } from "../_shared/company-product-settings.ts";
import { eventMessage, eventMessageSequence, messageValues, renderCompanyMessage, weeklyFlowMessage } from "../_shared/communication-policy.ts";
import { delayDecision, enterFlow, evaluateFlowCondition, loadCompanyFlow, validateFlowNode } from "../_shared/automation-flow.ts";
import { acknowledgeDispatch, assertAcyclicDispatchGraph, authorizeDispatch, prepareDispatch, DispatchUncertain, fencedDispatchUpdate, type DispatchAttempt } from "../_shared/automation-recovery.ts";
import { requireCompanyFeature } from "../_shared/company-feature-entitlements.ts";
import {
  providerErrorDetails,
  sanitizeProviderErrorForLog,
} from "../_shared/provider-error-redaction.ts";
import {
  evolutionTextRecipient,
  resolveVerifiedWhatsAppRecipient,
  sameWhatsAppRecipient,
} from "../_shared/whatsappIdentity.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

type FlowEdge = { target: string; handle?: string; label?: string };
type FlowSession = {
  id: string;
  dispatch_lease_token?: string | null;
  flow_id: string;
  chat_id: string;
  current_node_id: string;
  context: Record<string, unknown> | null;
};

export const PERMANENT_WEEKLY_CONTACT_ERROR_CODES = new Set([
  "weekly_contact_consent_missing",
  "weekly_contact_queued_recipient_changed",
  "weekly_contact_recipient_missing",
  "weekly_contact_recipient_ambiguous",
  "weekly_contact_recipient_mismatch",
]);

function queuedWeeklyRecipientGeneration(context: Record<string, unknown> | null) {
  const generation = Number(context?.recipient_generation);
  if (!Number.isSafeInteger(generation) || generation <= 0) {
    throw new Error("weekly_contact_queued_recipient_changed");
  }
  return generation;
}

function weeklyRecipientResolutionError(code: string) {
  if (code === "whatsapp_student_phone_ambiguous") {
    return new Error("weekly_contact_recipient_ambiguous");
  }
  if (code === "whatsapp_student_phone_missing" || code === "whatsapp_student_not_found") {
    return new Error("weekly_contact_recipient_missing");
  }
  return new Error("weekly_contact_recipient_mismatch");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function safeEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function replaceVariables(text: string, context: Record<string, unknown>) {
  return renderCompanyMessage(text, messageValues(context));
}

function weeklyContactMessage(context: Record<string, unknown>) {
  const variants = [
    "Oi, {{primeiro_nome}}! Como os treinos estão encaixando nesta semana? Se algum exercício ficou estranho, pode mandar um vídeo para a equipe olhar.",
    "Tudo certo por aí, {{primeiro_nome}}? Quero saber se apareceu alguma dificuldade no treino. Se quiser, envie um vídeo de execução para a gente conferir.",
    "{{primeiro_nome}}, passando para acompanhar sua semana: teve algum exercício mais difícil ou desconfortável? Pode mandar um vídeo e a equipe te orienta.",
    "Como você se sentiu nos últimos treinos, {{primeiro_nome}}? Se alguma execução deixou dúvida, envie um vídeo para avaliarmos com você.",
  ];
  const seed = Number(context.copy_seed || 0) + Number(context.contacts_last_7d_before || 0);
  return replaceVariables(variants[Math.abs(seed) % variants.length], context);
}

function providerSendCode(status: number) {
  if (status === 401 || status === 403) return "whatsapp_provider_unauthorized";
  if (status === 408 || status === 429) return "whatsapp_provider_busy";
  if (status === 400 || status === 404) return "whatsapp_recipient_rejected";
  return "whatsapp_provider_failure";
}

async function assertCurrentWeeklyContactConsent(
  admin: any,
  context: Record<string, unknown> | null,
  studentId: string,
  companyId: string,
  verifiedRemoteJid: string,
) {
  if (context?.trigger_type !== "weekly_contact") return;
  const queuedRecipientGeneration = queuedWeeklyRecipientGeneration(context);
  const consent = await admin.rpc("weekly_contact_consent_is_current", {
    _student_id: studentId,
    _company_id: companyId,
    _recipient_candidate: verifiedRemoteJid,
    _recipient_generation: queuedRecipientGeneration,
  });
  if (consent.error) {
    throw new Error("weekly_contact_consent_check_failed");
  }
  if (consent.data !== true) {
    throw new Error("weekly_contact_consent_missing");
  }
}

function assertQueuedWeeklyRecipient(
  context: Record<string, unknown> | null,
  verifiedRemoteJid: string,
) {
  if (context?.trigger_type !== "weekly_contact") return;
  queuedWeeklyRecipientGeneration(context);
  const queuedRecipient = String(context.recipient_candidate || "").trim();
  if (!queuedRecipient || !sameWhatsAppRecipient(queuedRecipient, verifiedRemoteJid)) {
    throw new Error("weekly_contact_queued_recipient_changed");
  }
}

async function resolveCurrentSessionRecipient(
  admin: any,
  chatId: string,
  companyId: string,
  expectedStudentId: string,
  expectedInstanceId: string | null,
  context: Record<string, unknown> | null,
) {
  const isWeeklyContact = context?.trigger_type === "weekly_contact";
  if (isWeeklyContact) queuedWeeklyRecipientGeneration(context);
  const chatResult = await admin.from("whatsapp_chats")
    .select("id, company_id, instance_id, remote_jid, student_id")
    .eq("id", chatId)
    .eq("company_id", companyId)
    .single();
  if (chatResult.error) throw chatResult.error;
  if (!chatResult.data?.remote_jid) throw new Error("weekly_contact_recipient_missing");
  const currentChat = chatResult.data;
  if (currentChat.instance_id !== expectedInstanceId) throw new Error("dispatch_instance_unavailable");
  if (String(currentChat.student_id || '') !== expectedStudentId) throw new Error('dispatch_subject_changed');
  let student: { id: string; phone: string | null; whatsapp: string | null; country_code?: unknown } | null = null;
  if (expectedStudentId) {
    const studentResult = await admin.from("students")
      .select(isWeeklyContact ? "id, phone, whatsapp" : "id, phone, whatsapp, country_code")
      .eq("id", expectedStudentId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (studentResult.error) throw studentResult.error;
    student = isWeeklyContact && studentResult.data
      ? { ...studentResult.data, country_code: context?.recipient_country_code }
      : studentResult.data;
  }
  const verifiedRecipient = resolveVerifiedWhatsAppRecipient({
    clientRemoteJid: currentChat.remote_jid,
    chatRemoteJid: currentChat.remote_jid,
    chatStudentId: currentChat.student_id,
    requestedStudentId: expectedStudentId,
    student,
  });
  if (!verifiedRecipient.ok) {
    throw weeklyRecipientResolutionError(verifiedRecipient.code);
  }
  return verifiedRecipient.remoteJid;
}

async function verifyWeeklyRecipientImmediatelyBeforeSend(
  admin: any,
  context: Record<string, unknown>,
  chatId: string,
  studentId: string,
  companyId: string,
  instanceId: string | null,
) {
  const verifiedRemoteJid = await resolveCurrentSessionRecipient(
    admin,chatId,companyId,studentId,instanceId,context,
  );
  assertQueuedWeeklyRecipient(context,verifiedRemoteJid);
  await assertCurrentWeeklyContactConsent(
    admin,context,studentId,companyId,verifiedRemoteJid,
  );
  return verifiedRemoteJid;
}

export async function sendText(args: {
  admin: any;
  evoUrl: string;
  evoKey: string;
  instanceName: string;
  remoteJid: string;
  chatId: string;
  companyId: string;
  text: string;
  attempt: DispatchAttempt;
  prepare?: () => Promise<void>;
}) {
  await requireCompanyFeature(args.admin, args.companyId, "hasAutomation");
  await requireCompanyFeature(args.admin, args.companyId, "hasWhatsApp");
  if (await prepareDispatch(args.admin, args.attempt) === "acked") return;
  // Preparation may fail or be interrupted before any provider request.
  await args.prepare?.();
  await requireCompanyFeature(args.admin, args.companyId, "hasAutomation");
  await requireCompanyFeature(args.admin, args.companyId, "hasWhatsApp");
  await authorizeDispatch(args.admin, args.attempt);
  let receipt: string | null = null;
  try {
    const response = await fetch(`${args.evoUrl}/message/sendText/${args.instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: args.evoKey },
      body: JSON.stringify({ number: evolutionTextRecipient(args.remoteJid), text: args.text }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      await response.text().catch(() => "");
      const providerCode = providerSendCode(response.status);
      console.error("automation WhatsApp send failed", sanitizeProviderErrorForLog(response.status, providerCode));
      throw new Error(providerErrorDetails(response.status, providerCode));
    }
    const payload = await response.json();
    receipt = typeof payload?.key?.id === "string" ? payload.key.id.trim() : null;
    if (!receipt || receipt.length > 200 || Array.from(receipt).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new DispatchUncertain();
    await acknowledgeDispatch(args.admin, args.attempt, receipt);
  } catch {
    throw new DispatchUncertain();
  }
  const sentAt = new Date().toISOString();
  try {
    const { error: messageError } = await args.admin.from("whatsapp_messages").insert({
      chat_id: args.chatId,
      company_id: args.companyId,
      content: args.text,
      source: "outgoing",
      type: "text",
      is_from_me: true,
      message_id_external: receipt,
      origin: "automation",
      timestamp: sentAt,
    });
    if (messageError) console.error("automation message log failed", messageError.message);
    await args.admin.from("whatsapp_chats").update({
      last_message: args.text,
      last_message_at: sentAt,
      updated_at: sentAt,
    }).eq("id", args.chatId);
  } catch {
    console.error("automation acknowledged message projection unavailable");
  }
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((part) => part.toString(16).padStart(2, "0")).join("");
}

function opaqueToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((part) => part.toString(16).padStart(2, "0")).join("");
}

/**
 * Cycle updates share the hardened WhatsApp sender and recipient resolver, but
 * deliberately do not enter the editable marketing flow graph.  Their unique
 * delivery row is the idempotency and retry ledger; a click in the UI only
 * schedules it, while this cron-owned dispatcher is the sole sender.
 */
export async function processIntercycleAnamnesisDeliveries(args: {
  admin: any;
  provider?: { url: string; key: string };
}) {
  const scheduled = await args.admin.rpc("process_intercycle_anamnesis_schedule");
  if (scheduled.error) throw new Error("intercycle_schedule_unavailable");
  const claimed = await args.admin.rpc("claim_intercycle_anamnesis_deliveries", { _limit: 25 });
  if (claimed.error) throw new Error("intercycle_claim_unavailable");
  const rows = claimed.data || [];
  let sent = 0;
  let failed = 0;
  for (const delivery of rows) {
    try {
      if (!args.provider?.url || !args.provider?.key) {
        throw new Error("intercycle_provider_not_configured");
      }
      const studentResult = await args.admin.from("students")
        .select("id, full_name, phone, whatsapp, country_code, intercycle_anamnesis_enabled")
        .eq("id", delivery.student_id).eq("company_id", delivery.company_id).maybeSingle();
      const student = studentResult.data;
      if (studentResult.error || !student || !student.intercycle_anamnesis_enabled) throw new Error("intercycle_opt_in_missing");
      const cycleResult = await args.admin.from("training_cycles")
        .select("id, student_id, company_id, enrollment_id, status, superseded_at")
        .eq("id", delivery.training_cycle_id)
        .eq("student_id", delivery.student_id)
        .eq("company_id", delivery.company_id)
        .eq("enrollment_id", delivery.enrollment_id)
        .maybeSingle();
      const cycle = cycleResult.data;
      if (
        cycleResult.error ||
        !cycle ||
        cycle.superseded_at ||
        ["cancelled", "superseded"].includes(String(cycle.status || ""))
      ) {
        throw new Error("intercycle_cycle_cancelled_or_rescoped");
      }
      const enrollmentResult = await args.admin.from("enrollments")
        .select("id, status")
        .eq("id", delivery.enrollment_id)
        .eq("student_id", delivery.student_id)
        .eq("company_id", delivery.company_id)
        .maybeSingle();
      if (enrollmentResult.error) {
        throw new Error("intercycle_enrollment_lookup_failed");
      }
      const enrollment = enrollmentResult.data;
      if (!enrollment || String(enrollment.status || "") === "completed") {
        throw new Error("intercycle_enrollment_completed_or_missing");
      }
      await requireCompanyFeature(args.admin, delivery.company_id, "hasAutomation");
      const chatResult = await args.admin.from("whatsapp_chats")
        .select("id, remote_jid, student_id, instance_id")
        .eq("company_id", delivery.company_id).eq("student_id", delivery.student_id)
        .order("updated_at", { ascending: false }).limit(1).maybeSingle();
      const chat = chatResult.data;
      if (chatResult.error || !chat?.remote_jid) throw new Error("intercycle_trusted_phone_missing");
      const recipient = resolveVerifiedWhatsAppRecipient({
        clientRemoteJid: chat.remote_jid, chatRemoteJid: chat.remote_jid,
        chatStudentId: chat.student_id, requestedStudentId: delivery.student_id, student,
      });
      if (!recipient.ok) throw new Error(`intercycle_${recipient.code}`);
      let instanceQuery = args.admin.from("whatsapp_instances").select("instance_name, status").eq("company_id", delivery.company_id);
      if (chat.instance_id) instanceQuery = instanceQuery.eq("id", chat.instance_id);
      const instanceResult = await instanceQuery.order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (instanceResult.error || !instanceResult.data?.instance_name || instanceResult.data.status !== "connected") {
        throw new Error("intercycle_whatsapp_unavailable");
      }
      const token = opaqueToken();
      const tokenHash = await sha256Hex(token);
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      const origin = (Deno.env.get("PUBLIC_APP_ORIGIN") || "https://www.settapp.com.br").replace(/\/+$/, "");
      const firstName = String(student.full_name || "").trim().split(/\s+/)[0] || "tudo bem";
      const link = `${origin}/anamnese-interciclos/${token}`;
      const { settings, version } = await readCompanyProductSettings(args.admin, delivery.company_id);
      const handledSequence = await dispatchConfiguredMessageSequence({
        admin: args.admin, companyId: delivery.company_id, chatId: chat.id,
        occurrence: `intercycle:${delivery.id}:invite`, configured: !!settings.message_sequences?.intercycle_invite,
        parts: eventMessageSequence(settings, 'intercycle_invite', messageValues({ nome: student.full_name, link }, settings.brand.company_name), ''),
        recipient: recipient.remoteJid, instanceName: instanceResult.data.instance_name, evoUrl: args.provider.url, evoKey: args.provider.key,
        scope: { kind: 'intercycle', ownerId: delivery.id, leaseToken: delivery.dispatch_lease_token || '' },
        metadata: { tokenHash, expiresAt, settingsVersion: version },
        prepare: async metadata => {
          if (typeof metadata.expiresAt !== 'string' || Date.parse(metadata.expiresAt) <= Date.now()) throw new Error('intercycle_invite_expired');
          const invite = await args.admin.from('intercycle_anamnesis_invites').upsert({
            delivery_id: delivery.id, company_id: delivery.company_id, student_id: delivery.student_id,
            enrollment_id: delivery.enrollment_id, training_cycle_id: delivery.training_cycle_id,
            token_sha256: metadata.tokenHash, expires_at: metadata.expiresAt,
          }, { onConflict: 'delivery_id' });
          if (invite.error) throw new Error('intercycle_invite_unavailable');
        },
        beforeSend: async () => {
          await requireCompanyFeature(args.admin, delivery.company_id, 'hasAutomation');
          const current = await args.admin.from('students').select('id,phone,whatsapp,country_code,intercycle_anamnesis_enabled').eq('id', delivery.student_id).eq('company_id', delivery.company_id).maybeSingle();
          if (current.error || !current.data?.intercycle_anamnesis_enabled) throw new Error('intercycle_opt_in_missing');
          const currentCycle = await args.admin.from('training_cycles').select('id,status,superseded_at').eq('id',delivery.training_cycle_id).eq('student_id',delivery.student_id).eq('company_id',delivery.company_id).eq('enrollment_id',delivery.enrollment_id).maybeSingle();
          if (currentCycle.error || !currentCycle.data || currentCycle.data.superseded_at || ['cancelled','superseded'].includes(currentCycle.data.status)) throw new Error('intercycle_cycle_cancelled_or_rescoped');
          const currentEnrollment = await args.admin.from('enrollments').select('id,status').eq('id',delivery.enrollment_id).eq('student_id',delivery.student_id).eq('company_id',delivery.company_id).maybeSingle();
          if (currentEnrollment.error || !currentEnrollment.data || currentEnrollment.data.status==='completed') throw new Error('intercycle_enrollment_completed_or_missing');
          const currentChat = await args.admin.from('whatsapp_chats').select('remote_jid,student_id,instance_id').eq('id', chat.id).eq('company_id', delivery.company_id).maybeSingle();
          const verified = resolveVerifiedWhatsAppRecipient({ clientRemoteJid: recipient.remoteJid, chatRemoteJid: currentChat.data?.remote_jid, chatStudentId: currentChat.data?.student_id, requestedStudentId: delivery.student_id, student: current.data });
          if (currentChat.error || currentChat.data?.instance_id !== chat.instance_id || !verified.ok) throw new Error('dispatch_recipient_changed');
          const live = await args.admin.from('whatsapp_instances').select('instance_name,status').eq('id',chat.instance_id).eq('company_id',delivery.company_id).maybeSingle();
          if (live.error || live.data?.status !== 'connected' || live.data?.instance_name !== instanceResult.data.instance_name) throw new Error('dispatch_instance_unavailable');
        },
      });
      if (handledSequence) {
        const completed = await args.admin.rpc('complete_intercycle_message_sequence', {
          _owner_id: delivery.id, _lease_token: delivery.dispatch_lease_token,
        });
        if (completed.error) throw new DispatchUncertain();
      } else await sendText({
        admin: args.admin, evoUrl: args.provider.url, evoKey: args.provider.key,
        instanceName: instanceResult.data.instance_name, remoteJid: recipient.remoteJid,
        chatId: chat.id, companyId: delivery.company_id,
        attempt: { kind: "intercycle", owner: delivery, key: "invite" },
        prepare: async () => {
          const invite = await args.admin.from("intercycle_anamnesis_invites").upsert({
            delivery_id: delivery.id, company_id: delivery.company_id, student_id: delivery.student_id,
            enrollment_id: delivery.enrollment_id, training_cycle_id: delivery.training_cycle_id,
            token_sha256: tokenHash, expires_at: expiresAt, consumed_at: null,
          }, { onConflict: "delivery_id" });
          if (invite.error) throw new Error("intercycle_invite_unavailable");
        },
        text: version > 0 ? eventMessage(settings.messages, 'intercycle_invite', messageValues({ nome: student.full_name, link }, settings.brand.company_name), '') : `Oi, ${firstName}! Estamos chegando ao fim deste ciclo. Você pode responder uma atualização rápida para orientar a próxima prescrição? ${link}`,
      });
      // The ACK RPC atomically completes this delivery before best-effort logs.
      sent += 1;
    } catch (error) {
      failed += 1;
      const retryCount = Number(delivery.retry_count || 0) + 1;
      const code = String(error instanceof Error ? error.message : "intercycle_dispatch_failed").replace(/[^a-z0-9_]/gi, "_").slice(0, 120);
      if (code === "company_feature_denied" || code === "company_feature_unavailable") {
        await fencedDispatchUpdate(args.admin, "intercycle", delivery, {
          status: "failed", last_error_code: code, next_attempt_at: null, updated_at: new Date().toISOString(),
        }).catch(() => {});
        continue;
      }
      if (error instanceof DispatchUncertain || (error instanceof Error && error.message === "dispatch_uncertain")) {
        await fencedDispatchUpdate(args.admin, "intercycle", delivery, {
          status: "failed", last_error_code: "dispatch_uncertain", next_attempt_at: null,
          updated_at: new Date().toISOString(),
        }).catch(() => {}); // A stale owner leaves recovery to the claim RPC.
        continue;
      }
      if (code === "intercycle_cycle_cancelled_or_rescoped" || code === "intercycle_enrollment_completed_or_missing") {
        await fencedDispatchUpdate(args.admin, "intercycle", delivery, {
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          last_error_code: code,
          updated_at: new Date().toISOString(),
        });
        continue;
      }
      const retryMinutes = code === "intercycle_provider_not_configured"
        ? 360
        : Math.min(360, Math.max(5, 2 ** Math.min(retryCount, 8)));
      await fencedDispatchUpdate(args.admin, "intercycle", delivery, {
        status: "failed", retry_count: retryCount, last_error_code: code,
        next_attempt_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }
  return { scheduled: Number(scheduled.data || 0), claimed: rows.length, sent, failed };
}

async function applyLabel(admin: any, companyId: string, chatId: string, labelName: string) {
  const { data: existingLabel, error } = await admin.from("whatsapp_labels").select("id")
    .eq("company_id", companyId).eq("name", labelName).maybeSingle();
  let label = existingLabel;
  if (error) throw error;
  if (!label) {
    const created = await admin.from("whatsapp_labels")
      .insert({ company_id: companyId, name: labelName, color: "#10b981" }).select("id").single();
    if (created.error) throw created.error;
    label = created.data;
  }
  const existing = await admin.from("whatsapp_chat_labels").select("id")
    .eq("chat_id", chatId).eq("label_id", label.id).maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) {
    const inserted = await admin.from("whatsapp_chat_labels").insert({ chat_id: chatId, label_id: label.id });
    if (inserted.error) throw inserted.error;
  }
}

export async function processSession(admin: any, session: FlowSession, provider: { url: string; key: string }) {
  const isWeeklyContact = session.context?.trigger_type === "weekly_contact";
  if (isWeeklyContact) queuedWeeklyRecipientGeneration(session.context);
  const chatResult = await admin.from("whatsapp_chats")
    .select("id, company_id, instance_id, remote_jid, student_id")
    .eq("id", session.chat_id).single();
  if (chatResult.error) throw chatResult.error;
  if (!chatResult.data) throw new Error("weekly_contact_recipient_missing");
  const chat = chatResult.data;
  if (isWeeklyContact && !chat.instance_id) throw new Error("dispatch_instance_unavailable");
  if (!chat.remote_jid) throw new Error("weekly_contact_recipient_missing");
  const savedContext = session.context || {};
  const subject = Object.prototype.hasOwnProperty.call(savedContext, '_dispatch_student_id')
    ? savedContext._dispatch_student_id : savedContext.student_id;
  if (subject !== null && (typeof subject !== 'string' || !subject)) throw new Error('dispatch_subject_snapshot_missing');
  const expectedStudentId = String(subject || '');
  if (String(chat.student_id || '') !== expectedStudentId) throw new Error('dispatch_subject_changed');
  const identityStudentId = expectedStudentId;
  if (session.context?.trigger_type === "weekly_contact" && !identityStudentId) {
    throw new Error("weekly_contact_recipient_missing");
  }
  let student: { id: string; phone: string | null; whatsapp: string | null; country_code?: unknown } | null = null;
  if (identityStudentId) {
    const studentResult = await admin.from("students")
      .select(isWeeklyContact ? "id, phone, whatsapp" : "id, phone, whatsapp, country_code")
      .eq("id", identityStudentId)
      .eq("company_id", chat.company_id)
      .maybeSingle();
    if (studentResult.error) throw studentResult.error;
    student = isWeeklyContact && studentResult.data
      ? { ...studentResult.data, country_code: session.context?.recipient_country_code }
      : studentResult.data;
  }
  const verifiedRecipient = resolveVerifiedWhatsAppRecipient({
    clientRemoteJid: chat.remote_jid,
    chatRemoteJid: chat.remote_jid,
    chatStudentId: chat.student_id,
    requestedStudentId: expectedStudentId,
    student,
  });
  if (!verifiedRecipient.ok) {
    throw weeklyRecipientResolutionError(verifiedRecipient.code);
  }
  const verifiedRemoteJid = verifiedRecipient.remoteJid;
  assertQueuedWeeklyRecipient(session.context,verifiedRemoteJid);
  await assertCurrentWeeklyContactConsent(
    admin,session.context,identityStudentId,chat.company_id,verifiedRemoteJid,
  );
  await requireCompanyFeature(admin, chat.company_id, "hasAutomation");

  let instanceQuery = admin.from("whatsapp_instances")
    .select("instance_name, status")
    .eq("company_id", chat.company_id);
  if (chat.instance_id) instanceQuery = instanceQuery.eq("id", chat.instance_id);
  const instanceResult = await instanceQuery.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (instanceResult.error) throw instanceResult.error;
  const instance = instanceResult.data;
  if (!instance?.instance_name || instance.status !== "connected") {
    throw new Error("WhatsApp da empresa não está conectado.");
  }
  const ownedFlow = await admin.from('automation_flows').select('id').eq('id', session.flow_id).eq('company_id', chat.company_id).eq('is_active', true).maybeSingle();
  if (ownedFlow.error || !ownedFlow.data) throw new Error('flow_target_missing_inactive_or_foreign');

  const [nodesResult, edgesResult] = await Promise.all([
    admin.from("automation_flow_nodes").select("*").eq("flow_id", session.flow_id),
    admin.from("automation_flow_edges").select("*").eq("flow_id", session.flow_id),
  ]);
  if (nodesResult.error) throw nodesResult.error;
  if (edgesResult.error) throw edgesResult.error;
  let nodes = nodesResult.data || [];
  let edges = edgesResult.data || [];
  assertAcyclicDispatchGraph(edges);
  const settingsEnvelope = await readCompanyProductSettings(admin, chat.company_id);
  const settings = settingsEnvelope.settings;
  let flowId = session.flow_id;

  const context: Record<string, unknown> = { ...(session.context || {}) };
  context._dispatch_student_id = subject;
  delete context.dispatch_error;
  const visited = new Set<string>();
  let currentId: string | null = session.current_node_id;
  let steps = 0;

  while (currentId && !visited.has(currentId) && steps < 30) {
    steps += 1;
    visited.add(currentId);
    const node = nodes.find((candidate: any) => candidate.id === currentId);
    if (!node) throw new Error(`Nó ${currentId} não encontrado no fluxo.`);
    const nodeData = (node.data || {}) as Record<string, any>;
    const nodeType = node.node_type || node.type;
    validateFlowNode(nodeType, nodeData);
    const nextEdges: FlowEdge[] = edges.filter((e: any) => e.source_node_id === currentId).map((e: any) => ({ target: e.target_node_id, handle: e.source_handle, label: e.label }));

    if (nodeType === 'flowConnection' || nodeType === 'flow_connection') {
      const nextFlowId = String(nodeData.target_flow_id);
      const pathContext = context._flow_path ? context : enterFlow(context, flowId);
      Object.assign(context, enterFlow(pathContext, nextFlowId));
      const target = await loadCompanyFlow(admin, chat.company_id, nextFlowId);
      flowId = nextFlowId;
      nodes = target.nodes;
      edges = target.edges;
      assertAcyclicDispatchGraph(edges);
      currentId = target.startId;
      await fencedDispatchUpdate(admin, "flow", session, { flow_id: flowId, current_node_id: currentId, context });
      session.flow_id = flowId;
      session.current_node_id = currentId;
      session.context = { ...context };
      continue;
    }

    if (nodeType === "content") {
      const contentKey = `${flowId}:${currentId}`;
      const alreadyAcknowledged = context._dispatch_content_ack === contentKey;
      const delay = alreadyAcknowledged
        ? { wait: false, context }
        : delayDecision(contentKey, Number(nodeData.delay_minutes || 0), context);
      Object.keys(context).forEach(key => { if (!(key in delay.context)) delete context[key]; });
      Object.assign(context, delay.context);
      if (delay.wait) {
        await fencedDispatchUpdate(admin, "flow", session, { flow_id: flowId, current_node_id: currentId, status: 'active', context, updated_at: new Date().toISOString() });
        return 'scheduled';
      }
      if (nodeData.use_company_template && context.trigger_type !== 'weekly_contact') throw new Error('flow_weekly_template_requires_weekly_trigger');
      const fallback = nodeData.message || (context.trigger_type === 'weekly_contact' ? (nodeData.use_company_template ? weeklyContactMessage(context) : '') : node.label || '');
      const message = context.trigger_type === 'weekly_contact'
        ? weeklyFlowMessage(settings.messages, DEFAULT_COMPANY_PRODUCT_SETTINGS.messages.weekly_contact, nodeData, messageValues(context, settings.brand.company_name), fallback)
        : replaceVariables(fallback, context);
      if ((message.trim() || nodeData.use_company_template === 'weekly_contact') && !alreadyAcknowledged) {
        const currentVerifiedRemoteJid = await verifyWeeklyRecipientImmediatelyBeforeSend(
          admin,context,chat.id,identityStudentId,chat.company_id,chat.instance_id,
        );
        const handledSequence = nodeData.use_company_template === 'weekly_contact' && await dispatchConfiguredMessageSequence({
          admin, companyId: chat.company_id, chatId: chat.id,
          legacyAttempt: { kind: 'flow', ownerId: session.id, key: contentKey },
          occurrence: `flow:${session.id}:${contentKey}`, configured: !!settings.message_sequences?.weekly_contact,
          parts: eventMessageSequence(settings, 'weekly_contact', messageValues(context, settings.brand.company_name), fallback),
          recipient: currentVerifiedRemoteJid, instanceName: instance.instance_name, evoUrl: provider.url, evoKey: provider.key,
          metadata: { settingsVersion: settingsEnvelope.version },
          scope: { kind: 'flow', ownerId: session.id, leaseToken: session.dispatch_lease_token || '' },
          beforeSend: async () => {
            const eligibility = await admin.rpc("weekly_contact_dispatch_check", { _owner_id: session.id });
            if (eligibility.error) throw new Error("weekly_contact_dispatch_check_failed");
            if (eligibility.data !== "eligible") throw new Error(eligibility.data || "weekly_contact_dispatch_check_failed");
            await requireCompanyFeature(admin, chat.company_id, 'hasAutomation');
            const live = await admin.from('whatsapp_instances').select('instance_name,status').eq('id', chat.instance_id).eq('company_id', chat.company_id).maybeSingle();
            if (live.error || live.data?.status !== 'connected' || live.data?.instance_name !== instance.instance_name) throw new Error('dispatch_instance_unavailable');
            const recipient = await verifyWeeklyRecipientImmediatelyBeforeSend(admin, context, chat.id, identityStudentId, chat.company_id, chat.instance_id);
            if (!sameWhatsAppRecipient(recipient, currentVerifiedRemoteJid)) throw new Error('dispatch_recipient_changed');
          },
        });
        if (!handledSequence) await sendText({
          admin,
          evoUrl: provider.url,
          evoKey: provider.key,
          instanceName: instance.instance_name,
          remoteJid: currentVerifiedRemoteJid,
          chatId: chat.id,
          companyId: chat.company_id,
          text: message.trim(),
          attempt: { kind: "flow", owner: session, key: contentKey },
          prepare: async () => {
            const recipient = await verifyWeeklyRecipientImmediatelyBeforeSend(
              admin,context,chat.id,identityStudentId,chat.company_id,chat.instance_id,
            );
            if (!sameWhatsAppRecipient(recipient, currentVerifiedRemoteJid)) throw new Error('dispatch_recipient_changed');
          },
        });
      }
      const nextId: string | null = nextEdges[0]?.target || null;
      // Keep acknowledged progress when a later node fails. Terminal/reply nodes
      // retain their cursor plus a marker so retrying their final DB work cannot
      // resend the content. This does not resolve an ambiguous provider ACK.
      context._dispatch_content_ack = contentKey;
      const checkpointNodeId = nodeData.wait_for_reply ? currentId : nextId || currentId;
      await fencedDispatchUpdate(admin, "flow", session, {
        flow_id: flowId,
        current_node_id: checkpointNodeId,
        context,
        updated_at: new Date().toISOString(),
      });
      session.flow_id = flowId;
      session.current_node_id = checkpointNodeId;
      session.context = { ...context };
      if (nodeData.wait_for_reply) {
        await fencedDispatchUpdate(admin, "flow", session, {
          flow_id: flowId,
          current_node_id: nextId || currentId,
          status: "waiting_response",
          context: { ...context, _reply_save_as: nodeData.save_response_as === 'custom' ? nodeData.custom_variable : (nodeData.save_response_as || 'name'), _reply_terminal: !nextId },
          last_activity_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        return "waiting_response";
      }
      currentId = nextId;
      continue;
    }

    if (nodeType === "menu") {
      const options = Array.isArray(nodeData.options) ? nodeData.options : [];
      let message = replaceVariables(nodeData.prompt || node.label || "", context);
      if (options.length) {
        message += `\n\n${options.map((option: any) => `${option.number}. ${replaceVariables(option.text || "", context)}`).join("\n")}`;
      }
      const currentVerifiedRemoteJid = await verifyWeeklyRecipientImmediatelyBeforeSend(
        admin,context,chat.id,identityStudentId,chat.company_id,chat.instance_id,
      );
      await sendText({
        admin,
        evoUrl: provider.url,
        evoKey: provider.key,
        instanceName: instance.instance_name,
        remoteJid: currentVerifiedRemoteJid,
        chatId: chat.id,
        companyId: chat.company_id,
        text: message.trim(),
        attempt: { kind: "flow", owner: session, key: `${flowId}:${currentId}` },
        prepare: async () => {
          const recipient = await verifyWeeklyRecipientImmediatelyBeforeSend(
            admin,context,chat.id,identityStudentId,chat.company_id,chat.instance_id,
          );
          if (!sameWhatsAppRecipient(recipient, currentVerifiedRemoteJid)) throw new Error('dispatch_recipient_changed');
        },
      });
      await fencedDispatchUpdate(admin, "flow", session, {
        flow_id: flowId,
        current_node_id: currentId,
        status: "waiting_response",
        context: { ...context, _menu_node: true },
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      return "waiting_response";
    }

    if (nodeType === "action" && nodeData.action_type === "tag" && nodeData.tag_name) {
      await applyLabel(admin, chat.company_id, chat.id, nodeData.tag_name);
    }

    if (nodeType === "condition") {
      const matches = evaluateFlowCondition(nodeData, { ...context, is_student: Boolean(chat.student_id) });
      const preferred = nextEdges.find((edge: FlowEdge) => matches
        ? edge.handle === "true" || edge.label === "Sim"
        : edge.handle === "false" || edge.label === "Não");
      if (!preferred) throw new Error('flow_condition_branch_missing');
      currentId = preferred.target;
    } else {
      currentId = nextEdges[0]?.target || null;
    }
  }

  if (currentId && (visited.has(currentId) || steps >= 30)) {
    throw new Error("Fluxo interrompido por ciclo ou excesso de etapas.");
  }
  await applyLabel(admin, chat.company_id, chat.id, "Primeiro contato feito");
  await fencedDispatchUpdate(admin, "flow", session, {
    flow_id: flowId,
    current_node_id: null,
    status: "completed",
    context,
    last_activity_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  return "completed";
}

export async function handleAutomationRequest(
  request: Request,
  overrides: { admin?: any } = {},
) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const expectedSecret = Deno.env.get("AUTOMATION_CRON_SECRET") || "";
  const suppliedSecret = request.headers.get("x-cron-secret") || "";
  if (!expectedSecret) return json({ error: "Automation dispatcher is not configured" }, 503);
  if (!safeEqual(expectedSecret, suppliedSecret)) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const evolutionUrl = (Deno.env.get("EVOLUTION_API_URL") || "").replace(/\/$/, "");
  const evolutionKey = Deno.env.get("EVOLUTION_API_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Supabase service configuration missing" }, 503);
  const admin = overrides.admin ?? createClient(supabaseUrl, serviceKey);

  const triggerResult = await admin.rpc("process_automation_triggers");
  if (triggerResult.error) console.error("automation trigger scan failed", triggerResult.error.message);
  const claimResult = await admin.rpc("claim_automation_sessions", { _limit: 25 });
  if (claimResult.error) return json({ error: "Unable to claim automation sessions" }, 500);
  const sessions = (claimResult.data || []) as FlowSession[];

  let intercycle: Record<string, number> = { scheduled: 0, claimed: 0, sent: 0, failed: 0 };
  try {
    intercycle = await processIntercycleAnamnesisDeliveries({
      admin,
      provider: evolutionUrl && evolutionKey ? { url: evolutionUrl, key: evolutionKey } : undefined,
    });
  } catch (error) {
    // No student identity, phone, token, or provider response is logged here.
    console.error("intercycle dispatcher unavailable", String(error instanceof Error ? error.message : "unknown").slice(0, 120));
  }

  if (!evolutionUrl || !evolutionKey) {
    const retryAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    for (const session of sessions) {
      const context = { ...(session.context || {}), dispatch_error: "WhatsApp provider not configured", next_dispatch_at: retryAt };
      await fencedDispatchUpdate(admin, "flow", session, { status: "active", context, updated_at: new Date().toISOString() });
    }
    return json({ processed: 0, deferred: sessions.length, reason: "provider_not_configured", intercycle, triggers: triggerResult.data || null });
  }

  let completed = 0;
  let waiting = 0;
  let failed = 0;
  for (const session of sessions) {
    try {
      const result = await processSession(admin, session, { url: evolutionUrl, key: evolutionKey });
      if (result === "completed") completed += 1;
      else waiting += 1;
    } catch (error) {
      failed += 1;
      const errorCode = error instanceof Error ? error.message : "Unknown dispatcher error";
      if (["company_feature_denied", "company_feature_unavailable", "flow_graph_cycle_unsupported"].includes(errorCode)) {
        await fencedDispatchUpdate(admin, "flow", session, {
          status: "failed", context: { ...(session.context || {}), dispatch_error: errorCode, next_dispatch_at: null },
          updated_at: new Date().toISOString(),
        }).catch(() => {});
        continue;
      }
      if (error instanceof DispatchUncertain || (error instanceof Error && error.message === "dispatch_uncertain")) {
        await fencedDispatchUpdate(admin, "flow", session, {
          status: "failed", context: { ...(session.context || {}), dispatch_error: "dispatch_uncertain", next_dispatch_at: null },
          updated_at: new Date().toISOString(),
        }).catch(() => {});
        continue;
      }
      if (
        session.context?.trigger_type === "weekly_contact" &&
        PERMANENT_WEEKLY_CONTACT_ERROR_CODES.has(errorCode)
      ) {
        const context: Record<string, unknown> = {
          ...(session.context || {}),
          dispatch_error: errorCode,
          next_dispatch_at: null,
        };
        delete context.dispatch_retries;
        await fencedDispatchUpdate(admin, "flow", session, {
          status: "failed",
          context,
          updated_at: new Date().toISOString(),
        }).catch(() => {});
        continue;
      }
      const previousRetries = Number(session.context?.dispatch_retries || 0);
      const retryMinutes = Math.min(360, Math.max(5, 2 ** Math.min(previousRetries, 8)));
      const context = {
        ...(session.context || {}),
        dispatch_retries: previousRetries + 1,
        dispatch_error: errorCode.slice(0, 300),
        next_dispatch_at: new Date(Date.now() + retryMinutes * 60 * 1000).toISOString(),
      };
      await fencedDispatchUpdate(admin, "flow", session, { status: "active", context, updated_at: new Date().toISOString() }).catch(() => {});
    }
  }

  return json({ claimed: sessions.length, completed, waiting, failed, intercycle, triggers: triggerResult.data || null });
}

if (import.meta.main) Deno.serve((request) => handleAutomationRequest(request));
