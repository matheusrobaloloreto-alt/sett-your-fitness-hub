type SupabaseAdmin = {
  from: (table: string) => any;
};

export type FunnelMessageResult = {
  sent: boolean;
  reason?: string;
  chatId?: string;
};

export function addBusinessDays(start: Date, amount: number): Date {
  const result = new Date(start);
  let remaining = Math.max(0, Math.trunc(amount));
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const weekday = result.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return result;
}

export function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "tudo bem";
}

export function buildPaymentLinkMessage(fullName: string, paymentUrl: string): string {
  return `Oi, ${firstName(fullName)}! Seu cadastro foi concluído. Agora escolha seu plano e faça o pagamento com segurança pelo Asaas: ${paymentUrl}`;
}

export function buildFiscalRegistrationMessage(fullName: string, registrationUrl: string): string {
  return [
    `Oi, ${firstName(fullName)}! Vamos seguir com seu cadastro na BN Performance Training.`,
    `Neste link você completa os dados fiscais necessários para a nota e escolhe seu plano: ${registrationUrl}`,
    "Depois, o pagamento é feito com segurança pelo Pix do Asaas. Assim que ele confirmar, você recebe as instruções da Avaliação de Movimento e o prazo para avaliação e início do treino é de até 5 dias úteis.",
  ].join("\n\n");
}

export function buildAssessmentOnboardingMessage(args: {
  fullName: string;
  dueDate: string;
  hasAnamnesis: boolean;
}): string {
  const anamnesisLine = args.hasAnamnesis
    ? "Sua anamnese já está registrada, então você não precisa responder novamente."
    : "A equipe vai conferir sua anamnese antes de finalizar a prescrição.";
  return [
    `Oi, ${firstName(args.fullName)}! Pagamento confirmado e seu plano já está ativo.`,
    anamnesisLine,
    "O próximo passo é a avaliação de movimento. A equipe vai enviar as instruções e acompanhar seu envio por aqui.",
    `O prazo para concluir a avaliação e liberar o início do treino é de até 5 dias úteis, com previsão até ${args.dueDate}.`,
  ].join("\n\n");
}

function normalizeRemoteJid(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length <= 11) digits = `55${digits}`;
  return `${digits}@s.whatsapp.net`;
}

export async function claimFunnelEvent(
  admin: SupabaseAdmin,
  args: {
    studentId: string;
    companyId: string;
    eventType: string;
    eventKey: string;
    payload?: Record<string, unknown>;
  },
): Promise<boolean> {
  const row = {
    student_id: args.studentId,
    company_id: args.companyId,
    event_type: args.eventType,
    event_key: args.eventKey,
    status: "processing",
    payload: args.payload || {},
  };
  const inserted = await admin.from("student_funnel_events").insert(row);
  if (!inserted.error) return true;
  if (inserted.error.code !== "23505") {
    throw new Error(`Falha ao registrar evento do funil: ${inserted.error.message}`);
  }
  const existing = await admin.from("student_funnel_events")
    .select("status")
    .eq("student_id", args.studentId)
    .eq("event_key", args.eventKey)
    .maybeSingle();
  if (existing.data?.status !== "failed") return false;
  const retried = await admin.from("student_funnel_events").update({
    status: "processing",
    error: null,
    payload: args.payload || {},
    processed_at: null,
  }).eq("student_id", args.studentId).eq("event_key", args.eventKey);
  if (retried.error) throw new Error(`Falha ao reabrir evento do funil: ${retried.error.message}`);
  return true;
}

export async function completeFunnelEvent(
  admin: SupabaseAdmin,
  studentId: string,
  eventKey: string,
  status: "completed" | "failed",
  error?: string,
) {
  await admin.from("student_funnel_events").update({
    status,
    error: error ? error.slice(0, 1000) : null,
    processed_at: new Date().toISOString(),
  }).eq("student_id", studentId).eq("event_key", eventKey);
}

export async function sendFunnelWhatsAppMessage(args: {
  admin: SupabaseAdmin;
  studentId: string;
  companyId: string;
  fullName: string;
  phone: string | null;
  text: string;
  eventType: string;
  eventKey: string;
  payload?: Record<string, unknown>;
}): Promise<FunnelMessageResult> {
  const claimed = await claimFunnelEvent(args.admin, args);
  if (!claimed) return { sent: true, reason: "already_processed" };

  try {
    const remoteJid = normalizeRemoteJid(args.phone || "");
    if (!remoteJid) throw new Error("Aluno sem WhatsApp válido.");

    const instanceResult = await args.admin.from("whatsapp_instances")
      .select("id, instance_name, status")
      .eq("company_id", args.companyId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const instance = instanceResult.data;
    if (instanceResult.error) throw instanceResult.error;
    if (!instance?.instance_name || instance.status !== "connected") {
      throw new Error("WhatsApp da empresa não está conectado.");
    }

    const evoUrl = Deno.env.get("EVOLUTION_API_URL") || "";
    const evoKey = Deno.env.get("EVOLUTION_API_KEY") || "";
    if (!evoUrl || !evoKey) throw new Error("Evolution API não configurada.");

    let chatResult = await args.admin.from("whatsapp_chats")
      .select("id")
      .eq("company_id", args.companyId)
      .eq("remote_jid", remoteJid)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (chatResult.error) throw chatResult.error;

    if (!chatResult.data) {
      chatResult = await args.admin.from("whatsapp_chats").insert({
        company_id: args.companyId,
        instance_id: instance.id,
        remote_jid: remoteJid,
        student_id: args.studentId,
        contact_name: args.fullName,
        unread_count: 0,
      }).select("id").single();
      if (chatResult.error) throw chatResult.error;
    } else {
      await args.admin.from("whatsapp_chats").update({
        student_id: args.studentId,
        contact_name: args.fullName,
      }).eq("id", chatResult.data.id);
    }

    const response = await fetch(`${evoUrl}/message/sendText/${instance.instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evoKey },
      body: JSON.stringify({ number: remoteJid.replace(/@.*$/, ""), text: args.text }),
    });
    if (!response.ok) {
      throw new Error(`Evolution ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    const providerPayload = await response.json().catch(() => ({}));
    const sentAt = new Date().toISOString();
    const messageResult = await args.admin.from("whatsapp_messages").insert({
      chat_id: chatResult.data.id,
      company_id: args.companyId,
      content: args.text,
      source: "outgoing",
      type: "text",
      is_from_me: true,
      message_id_external: providerPayload?.key?.id || null,
      origin: "automation",
      timestamp: sentAt,
    });
    if (messageResult.error) throw messageResult.error;
    await args.admin.from("whatsapp_chats").update({
      last_message: args.text,
      last_message_at: sentAt,
      updated_at: sentAt,
      unread_count: 0,
    }).eq("id", chatResult.data.id);
    await completeFunnelEvent(args.admin, args.studentId, args.eventKey, "completed");
    return { sent: true, chatId: chatResult.data.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao enviar mensagem do funil.";
    await completeFunnelEvent(args.admin, args.studentId, args.eventKey, "failed", message);
    return { sent: false, reason: message };
  }
}
