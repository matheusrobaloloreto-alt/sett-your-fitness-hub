import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hasReactionReceipt, isFeedbackOrigin, mayAcknowledgeFeedback, type FeedbackOrigin } from "../_shared/dashboard-feedback.ts";
import { resolveVerifiedWhatsAppRecipient } from "../_shared/whatsappIdentity.ts";
import { HttpError, isUuid } from "../_shared/tenant-auth.ts";

export async function loadDashboardFeedbackOrigin(
  staff: SupabaseClient, db: SupabaseClient, companyId: string, feedbackId: unknown,
) {
  if (!isUuid(feedbackId)) throw new HttpError(400, "Feedback inválido.");
  // Authenticated reads enforce staff tenant and student scope without exposing the provider key.
  const accessible = await staff.from("workout_feedback_whatsapp_origins")
    .select("feedback_id").eq("feedback_id", feedbackId).eq("company_id", companyId).maybeSingle();
  if (accessible.error) throw new HttpError(503, "Não foi possível verificar a origem do feedback.");
  if (!accessible.data) throw new HttpError(404, "Feedback sem mensagem original do WhatsApp disponível.");
  const { data: origin, error } = await db.from("workout_feedback_whatsapp_origins")
    .select("*").eq("feedback_id", feedbackId).eq("company_id", companyId).maybeSingle();
  if (error) throw new HttpError(503, "Não foi possível verificar a origem do feedback.");
  if (!origin?.message_id) throw new HttpError(404, "Feedback sem mensagem original do WhatsApp disponível.");

  const [feedback, student, message, chat] = await Promise.all([
    staff.from("workout_feedback").select("student_id, trainer_replied_at, pain_areas")
      .eq("id", feedbackId).eq("company_id", companyId).eq("student_id", origin.student_id).maybeSingle(),
    db.from("students").select("id, phone, whatsapp, country_code")
      .eq("id", origin.student_id).eq("company_id", companyId).maybeSingle(),
    db.from("whatsapp_messages").select("id, chat_id, company_id, content, type, timestamp, created_at, source, is_from_me, origin, message_id_external, status, media_type")
      .eq("id", origin.message_id).eq("chat_id", origin.chat_id).eq("company_id", companyId).maybeSingle(),
    db.from("whatsapp_chats").select("id, company_id, student_id, instance_id, remote_jid")
      .eq("id", origin.chat_id).eq("company_id", companyId).maybeSingle(),
  ]);
  if (feedback.error || student.error || message.error || chat.error) throw new HttpError(503, "Não foi possível verificar a origem do feedback.");
  const recipient = resolveVerifiedWhatsAppRecipient({
    clientRemoteJid: origin.remote_jid, chatRemoteJid: chat.data?.remote_jid,
    chatStudentId: chat.data?.student_id, requestedStudentId: origin.student_id, student: student.data,
  });
  if (!feedback.data || !message.data || !chat.data || !recipient.ok
    || recipient.remoteJid !== origin.remote_jid || !isFeedbackOrigin(origin, message.data, chat.data)) {
    throw new HttpError(409, "A mensagem original do feedback não pôde ser confirmada.");
  }
  return {
    origin: origin as FeedbackOrigin & { reviewed_at: string | null; reaction_attempted_at: string | null },
    message: message.data,
    eligible: mayAcknowledgeFeedback({ ...feedback.data, needs_adjustment: origin.needs_adjustment }),
  };
}

export async function acknowledgeDashboardFeedback({
  db, binding, userId, feedbackId, providerUrl, headers, providerFetch = fetch,
}: {
  db: SupabaseClient;
  binding: Pick<Awaited<ReturnType<typeof loadDashboardFeedbackOrigin>>, "origin" | "eligible">;
  userId: string;
  feedbackId: string;
  providerUrl: string;
  headers: Record<string, string>;
  providerFetch?: typeof fetch;
}) {
  const { origin, eligible } = binding;
  if (origin.reviewed_at) return { reviewed: true };
  if (!eligible) throw new HttpError(409, "O feedback precisa de acompanhamento ou já recebeu resposta.");
  const uncertain = () => new HttpError(409, "Confirmação da curtida pendente. Confira no WhatsApp antes de qualquer nova tentativa.");
  if (origin.reaction_attempted_at) throw uncertain();

  const attemptedAt = new Date().toISOString();
  const claim = await db.from("workout_feedback_whatsapp_origins").update({ reaction_attempted_at: attemptedAt })
    .eq("feedback_id", feedbackId).eq("company_id", origin.company_id).eq("message_id", origin.message_id)
    .is("reaction_attempted_at", null).is("reviewed_at", null).select("feedback_id").maybeSingle();
  if (claim.error) throw new HttpError(503, "Não foi possível registrar a tentativa de curtida.");
  if (!claim.data) throw uncertain();

  const key = { id: origin.provider_message_id, remoteJid: origin.remote_jid, fromMe: false };
  // No second send after a timeout, rejection, missing receipt, or failed DB write.
  const response = await providerFetch(providerUrl, {
    method: "POST", headers, body: JSON.stringify({ key, reaction: "👍" }), signal: AbortSignal.timeout(12_000),
  }).catch(() => null);
  const payload = response?.ok ? await response.json().catch(() => null) : null;
  const receipt = hasReactionReceipt(payload, key);
  if (!receipt) throw uncertain();

  const saved = await db.from("workout_feedback_whatsapp_origins")
    .update({ reviewed_at: new Date().toISOString(), reviewed_by: userId, reaction_provider_id: receipt })
    .eq("feedback_id", feedbackId).eq("company_id", origin.company_id).eq("message_id", origin.message_id)
    .eq("reaction_attempted_at", attemptedAt).is("reviewed_at", null).select("feedback_id").maybeSingle();
  if (saved.error || !saved.data) throw uncertain();
  return { reviewed: true };
}
