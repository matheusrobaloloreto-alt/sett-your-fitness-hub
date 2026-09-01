import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  directWhatsAppJidVariants,
  evolutionTextRecipient,
  normalizeWhatsAppPhoneKey,
  providerWhatsAppJidVariants,
} from "../_shared/whatsappIdentity.ts";
import {
  sanitizeProviderErrorForLog,
} from "../_shared/provider-error-redaction.ts";
import { providerIssueFromResponse } from "../_shared/whatsappProviderState.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-repair-token",
};

function safeEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

type WhatsAppChatRow = {
  id: string;
  student_id: string | null;
  contact_name: string | null;
  last_message_at: string | null;
  remote_jid: string;
};

const CHAT_LOOKUP_COLUMNS =
  "id, student_id, contact_name, last_message_at, remote_jid";

async function resolveExistingWhatsAppChat(args: {
  adminClient: any;
  instanceId: string;
  companyId: string;
  jidVariants: string[];
  messageExternalId?: string | null;
}): Promise<WhatsAppChatRow | null> {
  const directJids = args.jidVariants.filter((jid) =>
    jid.endsWith("@s.whatsapp.net")
  );
  if (directJids.length > 0) {
    const { data } = await args.adminClient.from("whatsapp_chats")
      .select(CHAT_LOOKUP_COLUMNS)
      .eq("instance_id", args.instanceId)
      .in("remote_jid", directJids)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data) return data as WhatsAppChatRow;
  }

  const lidJids = args.jidVariants.filter((jid) => jid.endsWith("@lid"));
  if (lidJids.length > 0) {
    const { data: alias } = await args.adminClient.from("whatsapp_jid_aliases")
      .select("canonical_chat_id")
      .eq("instance_id", args.instanceId)
      .in("alias_jid", lidJids)
      .limit(1)
      .maybeSingle();
    if (alias?.canonical_chat_id) {
      const { data } = await args.adminClient.from("whatsapp_chats")
        .select(CHAT_LOOKUP_COLUMNS)
        .eq("id", alias.canonical_chat_id)
        .eq("company_id", args.companyId)
        .maybeSingle();
      if (data) return data as WhatsAppChatRow;
    }
  }

  if (args.messageExternalId && lidJids.length > 0) {
    const { data: existingMessages } = await args.adminClient.from(
      "whatsapp_messages",
    )
      .select("chat_id")
      .eq("company_id", args.companyId)
      .eq("message_id_external", args.messageExternalId)
      .limit(10);
    const chatIds = [
      ...new Set(
        (existingMessages || []).map((row: any) => row.chat_id).filter(Boolean),
      ),
    ];
    if (chatIds.length > 0) {
      const { data: chats } = await args.adminClient.from("whatsapp_chats")
        .select(CHAT_LOOKUP_COLUMNS)
        .eq("instance_id", args.instanceId)
        .in("id", chatIds);
      const canonical = (chats || []).find((chat: WhatsAppChatRow) =>
        chat.remote_jid.endsWith("@s.whatsapp.net")
      ) ||
        (chats || [])[0];
      if (canonical) {
        return canonical as WhatsAppChatRow;
      }
    }
  }

  const { data } = await args.adminClient.from("whatsapp_chats")
    .select(CHAT_LOOKUP_COLUMNS)
    .eq("instance_id", args.instanceId)
    .in("remote_jid", args.jidVariants)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as WhatsAppChatRow | null) || null;
}

async function persistWhatsAppJidAliases(args: {
  adminClient: any;
  companyId: string;
  instanceId: string;
  chat: WhatsAppChatRow;
  jidVariants: string[];
}) {
  const aliases = args.jidVariants.filter((jid) => jid.endsWith("@lid"));
  if (aliases.length === 0) return;
  await args.adminClient.from("whatsapp_jid_aliases").upsert(
    aliases.map((aliasJid) => ({
      company_id: args.companyId,
      instance_id: args.instanceId,
      alias_jid: aliasJid,
      canonical_chat_id: args.chat.id,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "instance_id,alias_jid" },
  );
}

// ─── VARIABLE REPLACEMENT ───
function replaceVariables(text: string, context: Record<string, any>): string {
  // Get first name helper
  const firstName = (ctx: Record<string, any>): string => {
    const full = ctx.nome || ctx.name || "";
    return full.split(" ")[0] || full;
  };

  // Handle {{variable}} double-brace format
  let result = text.replace(/\{\{(\w[\w-]*)\}\}/g, (match, key) => {
    const normalized = key.replace(/-/g, "_");
    if (normalized === "primeiro_nome" || key === "primeiro-nome") {
      return firstName(context);
    }
    if (context[normalized] !== undefined) return String(context[normalized]);
    if (context[key] !== undefined) return String(context[key]);
    if (normalized === "nome" && context.name) return context.name;
    return match;
  });

  // Handle {variable} single-brace format (common in user-created flows)
  result = result.replace(/\{(\w[\w-]*)\}/g, (match, key) => {
    const normalized = key.replace(/-/g, "_");
    if (normalized === "primeiro_nome" || key === "primeiro-nome") {
      return firstName(context);
    }
    if (context[normalized] !== undefined) return String(context[normalized]);
    if (context[key] !== undefined) return String(context[key]);
    if (normalized === "nome" && context.name) return context.name;
    return match;
  });

  return result;
}

function extractMessageText(message: any, fallbackType = "mídia"): string {
  return message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    message?.documentMessage?.caption ||
    message?.documentMessage?.fileName ||
    (fallbackType ? `[${fallbackType}]` : "[mídia]");
}

function extractContextInfo(message: any): any {
  return message?.extendedTextMessage?.contextInfo ||
    message?.imageMessage?.contextInfo ||
    message?.videoMessage?.contextInfo ||
    message?.audioMessage?.contextInfo ||
    message?.documentMessage?.contextInfo ||
    message?.stickerMessage?.contextInfo ||
    null;
}

function extractQuotedPreview(contextInfo: any): string | null {
  const quoted = contextInfo?.quotedMessage;
  if (!quoted) return null;
  const text = extractMessageText(quoted, "mensagem").trim();
  if (!text) return null;
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function normalizeArrayPayload(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  const candidates = [
    payload?.messages,
    payload?.messages?.records,
    payload?.data,
    payload?.data?.records,
    payload?.result,
    payload?.result?.records,
    payload?.response,
    payload?.response?.records,
    payload?.records,
    payload?.data?.messages,
    payload?.data?.messages?.records,
    payload?.data?.data,
    payload?.data?.data?.records,
    payload?.result?.messages,
    payload?.result?.messages?.records,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function normalizeProviderMessage(raw: any) {
  return raw?.message?.key ? raw.message : raw;
}

function isProviderMessage(candidate: any) {
  const message = normalizeProviderMessage(candidate);
  return Boolean(
    message?.key?.remoteJid &&
      (
        message.message ||
        message.messageType ||
        message.messageTimestamp ||
        message.timestamp
      ),
  );
}

function extractWebhookMessages(body: any): any[] {
  const arrayCandidates = [
    body?.data,
    body?.data?.messages,
    body?.messages,
    body?.data?.data,
    body?.result,
    body?.response,
  ];

  for (const candidate of arrayCandidates) {
    if (!Array.isArray(candidate)) continue;
    const messages = candidate
      .map((item) => normalizeProviderMessage(item))
      .filter((item) => isProviderMessage(item));
    if (messages.length > 0) return messages;
  }

  const singleCandidates = [
    body?.data,
    body?.data?.message,
    body?.message,
    body,
  ];

  for (const candidate of singleCandidates) {
    const message = normalizeProviderMessage(candidate);
    if (isProviderMessage(message)) return [message];
  }

  return [];
}

function messageDate(value: unknown): Date {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    const milliseconds = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    const parsed = new Date(milliseconds);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function extensionFromMime(mimetype: string | null) {
  if (!mimetype) return "bin";
  if (mimetype.includes("jpeg")) return "jpg";
  if (mimetype.includes("png")) return "png";
  if (mimetype.includes("webp")) return "webp";
  if (mimetype.includes("mp4")) return "mp4";
  if (mimetype.includes("ogg")) return "ogg";
  if (mimetype.includes("opus")) return "ogg";
  if (mimetype.includes("mpeg")) return "mp3";
  if (mimetype.includes("pdf")) return "pdf";
  return mimetype.split("/")[1]?.split(";")[0]?.replace(/[^a-z0-9]/gi, "") ||
    "bin";
}

function decodeBase64(base64: string) {
  const clean = base64.includes(",") ? base64.split(",").pop() || "" : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function persistProviderMedia(args: {
  adminClient: any;
  evoUrl: string;
  instanceName: string;
  evoHeaders: Record<string, string>;
  companyId: string;
  chatId: string;
  messageId: string | null;
  remoteJid: string;
  fromMe: boolean;
  mimetype: string | null;
}) {
  if (!args.messageId) return null;
  const key: Record<string, unknown> = {
    id: args.messageId,
    remoteJid: args.remoteJid,
    fromMe: args.fromMe,
  };
  const attempts = [
    { message: { key }, convertToMp4: false },
    { message: { key: { id: args.messageId } }, convertToMp4: false },
    { key, convertToMp4: false },
    { id: args.messageId, convertToMp4: false },
  ];

  for (const payload of attempts) {
    const res = await fetch(
      `${args.evoUrl}/chat/getBase64FromMediaMessage/${args.instanceName}`,
      {
        method: "POST",
        headers: args.evoHeaders,
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) continue;
    const media = await res.json().catch(() => ({}));
    if (!media?.base64) continue;

    const mimetype = media.mimetype || args.mimetype ||
      "application/octet-stream";
    const bytes = decodeBase64(String(media.base64));
    const path = `${args.companyId}/${args.chatId}/inbound-${args.messageId}.${
      extensionFromMime(mimetype)
    }`;
    const { error: uploadError } = await args.adminClient.storage
      .from("whatsapp-media")
      .upload(path, bytes, { contentType: mimetype, upsert: true });
    if (uploadError) {
      console.error("[webhook] media upload failed:", uploadError.message);
      return null;
    }
    const { data: signed } = await args.adminClient.storage
      .from("whatsapp-media")
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    return {
      mediaUrl: signed?.signedUrl || null,
      mediaStoragePath: path,
      mimetype,
    };
  }

  return null;
}

function detectMessageType(msg: any) {
  if (msg.message?.reactionMessage || msg.messageType === "reactionMessage") {
    return "reaction";
  }
  if (msg.message?.imageMessage || msg.messageType === "imageMessage") {
    return "image";
  }
  if (msg.message?.videoMessage || msg.messageType === "videoMessage") {
    return "video";
  }
  if (msg.message?.audioMessage || msg.messageType === "audioMessage") {
    return "audio";
  }
  if (msg.message?.documentMessage || msg.messageType === "documentMessage") {
    return "document";
  }
  if (msg.message?.stickerMessage || msg.messageType === "stickerMessage") {
    return "sticker";
  }
  if (
    msg.messageType && msg.messageType !== "conversation" &&
    msg.messageType !== "extendedTextMessage"
  ) return String(msg.messageType);
  return "text";
}

function detectMediaType(msg: any, msgType: string): string | null {
  return msg.message?.imageMessage?.mimetype ||
    msg.message?.videoMessage?.mimetype ||
    msg.message?.audioMessage?.mimetype ||
    msg.message?.documentMessage?.mimetype ||
    msg.message?.stickerMessage?.mimetype ||
    (msgType === "image" ? "image/jpeg" : null) ||
    (msgType === "video" ? "video/mp4" : null) ||
    (msgType === "audio" ? "audio/ogg" : null) ||
    (msgType === "sticker" ? "image/webp" : null) ||
    null;
}

function extractMediaUrl(message: any): string | null {
  return message?.imageMessage?.url ||
    message?.videoMessage?.url ||
    message?.audioMessage?.url ||
    message?.documentMessage?.url ||
    message?.stickerMessage?.url ||
    null;
}

function dedupeProviderMessages(messages: any[]) {
  const seen = new Set<string>();
  const unique: any[] = [];
  for (const raw of messages) {
    const message = normalizeProviderMessage(raw);
    const key = message?.key || {};
    const identity = `${key.remoteJid || "unknown"}:${
      key.id || message.messageTimestamp || message.timestamp || unique.length
    }`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    unique.push(message);
  }
  return unique;
}

async function fetchMessagesWithPayload(
  evoUrl: string,
  instanceName: string,
  evoHeaders: Record<string, string>,
  payload: Record<string, unknown>,
) {
  const res = await fetch(`${evoUrl}/chat/findMessages/${instanceName}`, {
    method: "POST",
    headers: evoHeaders,
    body: JSON.stringify(payload),
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return normalizeArrayPayload(data);
}

async function fetchRecentMessages(
  evoUrl: string,
  instanceName: string,
  evoHeaders: Record<string, string>,
  limit: number,
  remoteJids: string[] = [],
  perChatLimit = 80,
  includeGlobal = true,
) {
  const attempts = [
    { where: {}, limit },
    { limit },
    { page: 1, limit },
    { where: { key: {} }, limit },
  ];
  const collected: any[] = [];
  if (includeGlobal) {
    for (const payload of attempts) {
      const messages = await fetchMessagesWithPayload(
        evoUrl,
        instanceName,
        evoHeaders,
        payload,
      );
      collected.push(...messages);
      if (collected.length >= limit) {
        return dedupeProviderMessages(collected).slice(0, limit);
      }
    }
  }

  for (const remoteJid of remoteJids) {
    const scopedAttempts = [
      { where: { key: { remoteJid } }, limit: perChatLimit },
      { where: { remoteJid }, limit: perChatLimit },
      { remoteJid, limit: perChatLimit },
    ];
    for (const payload of scopedAttempts) {
      const messages = await fetchMessagesWithPayload(
        evoUrl,
        instanceName,
        evoHeaders,
        payload,
      );
      collected.push(...messages);
      if (messages.length > 0) break;
    }
    if (collected.length >= limit) break;
  }
  return dedupeProviderMessages(collected).slice(0, limit);
}

// ─── SEND TEXT MESSAGE ───
async function sendText(
  evoUrl: string,
  instanceName: string,
  evoHeaders: Record<string, string>,
  remoteJid: string,
  text: string,
  adminClient: any,
  chatId: string,
): Promise<void> {
  try {
    const res = await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
      method: "POST",
      headers: evoHeaders,
      body: JSON.stringify({ number: evolutionTextRecipient(remoteJid), text }),
    });
    if (res.ok) {
      const d = await res.json();
      await adminClient.from("whatsapp_messages").insert({
        chat_id: chatId,
        content: text,
        source: "outgoing",
        type: "text",
        is_from_me: true,
        message_id_external: d?.key?.id || null,
        timestamp: new Date().toISOString(),
      });
    } else {
      const rawBody = await res.text().catch(() => "");
      const issue = providerIssueFromResponse(res.status, rawBody);
      console.error(
        "[flow] Send failed:",
        sanitizeProviderErrorForLog(res.status, issue, rawBody),
      );
    }
  } catch (err) {
    console.error("[flow] Send error:", err);
  }
}

// ─── BNITO NO WHATSAPP (opt-in por empresa) ───
// Responde aluno conhecido com contexto do treino. Barato (Haiku), curto, com guardrails:
// dor forte → orientar a falar com o professor; nunca diagnóstico; só temas de treino/app.
async function maybeBnitoReply(
  adminClient: any,
  companyId: string,
  chatId: string,
  question: string,
  remoteJid: string,
  instanceName: string,
  evoUrl: string,
  evoHeaders: Record<string, string>,
): Promise<void> {
  const { data: cfg } = await adminClient.from("company_ai_config")
    .select("bnito_whatsapp_enabled, assistant_name").eq(
      "company_id",
      companyId,
    ).maybeSingle();
  if (!cfg?.bnito_whatsapp_enabled) return; // default OFF — nada muda sem opt-in
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return;

  // Anti-loop / rate-limit: no máx. 1 resposta por minuto e 30/dia por chat.
  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const { count: recent } = await adminClient.from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("chat_id", chatId).eq("is_from_me", true).gte("timestamp", minuteAgo);
  if ((recent || 0) > 0) return;
  const { count: daily } = await adminClient.from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("chat_id", chatId).eq("is_from_me", true).gte("timestamp", dayAgo);
  if ((daily || 0) >= 30) return;

  // Contexto do aluno: nome + treino ativo (nomes dos treinos) + último check-in.
  const { data: chatRow } = await adminClient.from("whatsapp_chats").select(
    "student_id",
  ).eq("id", chatId).maybeSingle();
  const studentId = chatRow?.student_id;
  if (!studentId) return;
  const [{ data: student }, { data: cycle }] = await Promise.all([
    adminClient.from("students").select("full_name").eq("id", studentId)
      .maybeSingle(),
    adminClient.from("training_cycles").select(
      "id, objective, start_date, end_date",
    ).eq("student_id", studentId).eq("status", "active").order("created_at", {
      ascending: false,
    }).limit(1).maybeSingle(),
  ]);
  let workoutsTxt = "sem ciclo ativo no app";
  if (cycle?.id) {
    const { data: ws } = await adminClient.from("workouts").select(
      "name, day_of_week",
    ).eq("cycle_id", cycle.id).order("sort_order");
    workoutsTxt = (ws || []).map((w: any) => w.name).join("; ") ||
      "ciclo ativo sem treinos";
  }
  const assistantName = cfg.assistant_name || "Setty";
  const firstName = (student?.full_name || "").split(" ")[0] || "atleta";

  const system =
    `Você é ${assistantName}, assistente de treino no WhatsApp da equipe. Responda em PT-BR, tom humano e curto (máx. 500 caracteres), SEM markdown.
Contexto do aluno ${firstName}: objetivo do ciclo: ${
      cycle?.objective || "não informado"
    }; treinos do ciclo: ${workoutsTxt}.
REGRAS DURAS: só temas de treino/execução/app. Dor forte, lesão, tontura ou sintoma → mande falar com o professor e não prescreva nada. Nunca diagnóstico/medicação. Não invente exercícios fora do plano. Se não souber, diga que o professor responde.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system,
        messages: [{ role: "user", content: question.slice(0, 500) }],
      }),
    });
    if (!res.ok) {
      console.error("[bnito-wa] anthropic", res.status);
      return;
    }
    const data = await res.json();
    const answer = (data?.content?.[0]?.text || "").trim().slice(0, 700);
    if (answer) {
      await sendText(
        evoUrl,
        instanceName,
        evoHeaders,
        remoteJid,
        answer,
        adminClient,
        chatId,
      );
    }
  } catch (err) {
    console.error("[bnito-wa] error:", err);
  }
}

// ─── APPLY LABEL ───
async function applyLabel(
  adminClient: any,
  companyId: string,
  chatId: string,
  labelName: string,
  color = "#10b981",
) {
  let { data: label } = await adminClient.from("whatsapp_labels").select("id")
    .eq("company_id", companyId).eq("name", labelName).maybeSingle();
  if (!label) {
    const { data: nl } = await adminClient.from("whatsapp_labels")
      .insert({ company_id: companyId, name: labelName, color }).select("id")
      .single();
    label = nl;
  }
  if (label) {
    const { data: ex } = await adminClient.from("whatsapp_chat_labels").select(
      "id",
    )
      .eq("chat_id", chatId).eq("label_id", label.id).maybeSingle();
    if (!ex) {
      await adminClient.from("whatsapp_chat_labels").insert({
        chat_id: chatId,
        label_id: label.id,
      });
    }
  }
}

// ─── EXECUTE FLOW (with session support) ───
type FlowEdge = { target: string; handle?: string; label?: string };

async function executeFlow(
  adminClient: any,
  companyId: string,
  remoteJid: string,
  chatId: string,
  instanceName: string,
  evoUrl: string,
  evoHeaders: Record<string, string>,
  flowId: string,
  startNodeId: string,
  context: Record<string, any>,
  isStudentContact: boolean,
) {
  const [nodesRes, edgesRes] = await Promise.all([
    adminClient.from("automation_flow_nodes").select("*").eq("flow_id", flowId),
    adminClient.from("automation_flow_edges").select("*").eq("flow_id", flowId),
  ]);
  const nodes: any[] = nodesRes.data || [];
  const edges: any[] = edgesRes.data || [];

  const adjacency: Record<string, FlowEdge[]> = {};
  for (const e of edges) {
    if (!adjacency[e.source_node_id]) adjacency[e.source_node_id] = [];
    adjacency[e.source_node_id].push({
      target: e.target_node_id,
      handle: e.source_handle || undefined,
      label: e.label || undefined,
    });
  }

  const visited = new Set<string>();
  let currentId: string | null = startNodeId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const node = nodes.find((n: any) => n.id === currentId);
    if (!node) break;

    const nodeData = (node.data || {}) as Record<string, any>;
    const nodeType = node.node_type;
    console.log("[flow] Processing:", nodeType, node.label);

    if (nodeType === "content") {
      const message = replaceVariables(
        nodeData.message || node.label || "",
        context,
      );
      if (message.trim()) {
        const delayMs = (nodeData.delay_minutes || 0) * 60 * 1000;
        if (delayMs > 0 && delayMs <= 300000) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
        await sendText(
          evoUrl,
          instanceName,
          evoHeaders,
          remoteJid,
          message,
          adminClient,
          chatId,
        );
      }

      // Check if this node waits for a reply
      if (nodeData.wait_for_reply) {
        const nextEdges = adjacency[currentId] || [];
        const nextNodeId = nextEdges.length > 0
          ? nextEdges[0].target
          : currentId;

        // Cancel any existing session for this chat
        await adminClient.from("flow_sessions").update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
          .eq("chat_id", chatId).eq("status", "waiting_response");

        // Create new session
        await adminClient.from("flow_sessions").insert({
          chat_id: chatId,
          flow_id: flowId,
          current_node_id: nextNodeId,
          status: "waiting_response",
          context,
        });
        console.log(
          "[flow] Paused — waiting for reply. Next node:",
          nextNodeId,
          "save_as:",
          nodeData.save_response_as,
        );
        return; // STOP execution
      }
    } else if (nodeType === "menu") {
      const prompt = replaceVariables(nodeData.prompt || "", context);
      const options = (nodeData.options || []) as Array<
        { number: number; text: string }
      >;
      let menuText = prompt;
      if (options.length > 0) {
        menuText += "\n\n" +
          options.map((o) =>
            `${o.number}. ${replaceVariables(o.text, context)}`
          ).join("\n");
      }
      if (menuText.trim()) {
        await sendText(
          evoUrl,
          instanceName,
          evoHeaders,
          remoteJid,
          menuText,
          adminClient,
          chatId,
        );
      }

      // Menu also pauses for user response — create session
      const nextEdges: FlowEdge[] = adjacency[currentId] || [];
      if (nextEdges.length > 0) {
        await adminClient.from("flow_sessions").update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
          .eq("chat_id", chatId).eq("status", "waiting_response");
        await adminClient.from("flow_sessions").insert({
          chat_id: chatId,
          flow_id: flowId,
          current_node_id: currentId,
          status: "waiting_response",
          context: { ...context, _menu_node: true },
        });
        console.log("[flow] Menu paused — waiting for option selection");
      }
      return; // STOP
    } else if (nodeType === "action") {
      const actionType = nodeData.action_type || "";
      console.log("[flow] Action:", actionType, nodeData);
      if (actionType === "tag" && nodeData.tag_name) {
        await applyLabel(adminClient, companyId, chatId, nodeData.tag_name);
      }
    }

    // Move to next node
    const nextEdges: FlowEdge[] = adjacency[currentId] || [];
    if (nextEdges.length === 0) currentId = null;
    else if (nodeType === "condition") {
      const falsePath = nextEdges.find((e: FlowEdge) =>
        e.handle === "false" || e.label === "Não"
      );
      const truePath = nextEdges.find((e: FlowEdge) =>
        e.handle === "true" || e.label === "Sim"
      );
      currentId = (isStudentContact ? truePath?.target : falsePath?.target) ||
        nextEdges[0].target;
    } else {
      currentId = nextEdges[0].target;
    }
  }

  // Flow completed — apply label
  await applyLabel(adminClient, companyId, chatId, "Primeiro contato feito");
  console.log("[flow] Flow execution complete");
}

// ─── RESUME FLOW FROM SESSION ───
async function resumeFlowSession(
  adminClient: any,
  session: any,
  userMessage: string,
  remoteJid: string,
  chatId: string,
  instanceName: string,
  evoUrl: string,
  evoHeaders: Record<string, string>,
  companyId: string,
) {
  const ctx = (session.context || {}) as Record<string, any>;

  // Find the node that triggered the wait to get its save_response_as config
  const { data: currentNode } = await adminClient.from("automation_flow_nodes")
    .select("*").eq("id", session.current_node_id).maybeSingle();

  // If it was a menu pause, handle option routing
  if (ctx._menu_node) {
    delete ctx._menu_node;
    const { data: menuNode } = await adminClient.from("automation_flow_nodes")
      .select("*").eq("id", session.current_node_id).maybeSingle();

    if (menuNode) {
      const { data: edges } = await adminClient.from("automation_flow_edges")
        .select("*").eq("flow_id", session.flow_id).eq(
          "source_node_id",
          session.current_node_id,
        );

      // Find matching edge by option number (label = "1", "2", etc.)
      const chosenOption = userMessage.trim();
      const matchEdge = (edges || []).find((e: any) =>
        e.label === chosenOption || e.source_handle === chosenOption
      );
      const nextNodeId = matchEdge?.target_node_id ||
        (edges && edges.length > 0 ? edges[0].target_node_id : null);

      // Mark session complete
      await adminClient.from("flow_sessions").update({
        status: "completed",
        updated_at: new Date().toISOString(),
      }).eq("id", session.id);

      if (nextNodeId) {
        await executeFlow(
          adminClient,
          companyId,
          remoteJid,
          chatId,
          instanceName,
          evoUrl,
          evoHeaders,
          session.flow_id,
          nextNodeId,
          ctx,
          false,
        );
      }
      return;
    }
  }

  // For wait_for_reply nodes: find the PREVIOUS node that had wait_for_reply to get save config
  // The current_node_id points to the NEXT node after the wait
  // We need to check the node before it
  const { data: prevEdges } = await adminClient.from("automation_flow_edges")
    .select("source_node_id").eq("flow_id", session.flow_id).eq(
      "target_node_id",
      session.current_node_id,
    );

  let saveAs = "name"; // default
  if (prevEdges && prevEdges.length > 0) {
    const { data: prevNode } = await adminClient.from("automation_flow_nodes")
      .select("data").eq("id", prevEdges[0].source_node_id).maybeSingle();
    if (prevNode?.data) {
      const pd = prevNode.data as Record<string, any>;
      saveAs = pd.save_response_as || "name";
      if (saveAs === "custom") saveAs = pd.custom_variable || "custom";
    }
  }

  // Save the user's response to context
  ctx[saveAs] = userMessage.trim();
  console.log(
    "[flow-resume] Saved response as",
    saveAs,
    "=",
    userMessage.trim(),
  );

  // If saving name, also update chat contact_name
  if (saveAs === "name" || saveAs === "nome") {
    const nameValue = userMessage.trim();
    // Only save as contact_name if it looks like a real name (not too long, no line breaks)
    if (nameValue.length <= 60 && !nameValue.includes("\n")) {
      await adminClient.from("whatsapp_chats").update({
        contact_name: nameValue,
      }).eq("id", chatId);
      console.log("[flow-resume] Updated contact_name to:", nameValue);
    }
    ctx.nome = nameValue;
  }

  // Mark session completed
  await adminClient.from("flow_sessions").update({
    status: "completed",
    context: ctx,
    updated_at: new Date().toISOString(),
  }).eq("id", session.id);

  // Resume flow from next node
  await executeFlow(
    adminClient,
    companyId,
    remoteJid,
    chatId,
    instanceName,
    evoUrl,
    evoHeaders,
    session.flow_id,
    session.current_node_id,
    ctx,
    false,
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const expectedSecret = Deno.env.get("WHATSAPP_WEBHOOK_SECRET") || "";
  if (!expectedSecret) {
    console.error("[webhook] WHATSAPP_WEBHOOK_SECRET missing");
    return new Response(JSON.stringify({ error: "Webhook not configured" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const suppliedSecret = req.headers.get("x-webhook-secret") ||
    new URL(req.url).searchParams.get("token") || "";
  const expectedRepairToken = Deno.env.get("WHATSAPP_REPAIR_TOKEN") || "";
  const suppliedRepairToken = req.headers.get("x-repair-token") ||
    new URL(req.url).searchParams.get("repair_token") || "";
  const hasWebhookSecret = safeEqual(suppliedSecret, expectedSecret);
  const hasRepairToken = safeEqual(suppliedRepairToken, expectedRepairToken);
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let repairActor: { companyId: string | null; isMaster: boolean } | null =
    null;
  const authHeader = req.headers.get("Authorization") || "";
  if (
    !hasWebhookSecret && !hasRepairToken && authHeader.startsWith("Bearer ")
  ) {
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.slice("Bearer ".length);
    const { data: claimsData } = await anonClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub as string | undefined;
    if (userId) {
      const [{ data: hasAdmin }, { data: hasMaster }, { data: companyId }] =
        await Promise.all([
          adminClient.rpc("has_role", { _user_id: userId, _role: "admin" }),
          adminClient.rpc("has_role", { _user_id: userId, _role: "master" }),
          adminClient.rpc("get_user_company_id", { _user_id: userId }),
        ]);
      if (hasAdmin || hasMaster) {
        repairActor = {
          companyId: companyId || null,
          isMaster: Boolean(hasMaster),
        };
      }
    }
  }

  try {
    const body = await req.json();
    const event = body.event;
    const isRepairRequest = body.action === "repair-sync" &&
      (hasRepairToken || Boolean(repairActor));
    if (!hasWebhookSecret && !isRepairRequest) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isRepairRequest && body.action === "repair-sync") {
      const evoUrl = Deno.env.get("EVOLUTION_API_URL") || "";
      const evoKey = Deno.env.get("EVOLUTION_API_KEY") || "";
      if (!evoUrl || !evoKey) {
        return new Response(
          JSON.stringify({ error: "Evolution not configured" }),
          {
            status: 503,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const limit = Math.min(Math.max(Number(body.limit || 1000), 1), 5000);
      const days = Math.min(Math.max(Number(body.days || 14), 1), 365);
      const maxChats = Math.min(
        Math.max(Number(body.maxChats || 250), 1),
        1000,
      );
      const perChatLimit = Math.min(
        Math.max(Number(body.perChatLimit || 80), 1),
        300,
      );
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const evoHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        apikey: evoKey,
      };

      const requestedCompanyId = body.companyId || repairActor?.companyId ||
        null;
      if (
        repairActor && !repairActor.isMaster &&
        requestedCompanyId !== repairActor.companyId
      ) {
        return new Response(
          JSON.stringify({ error: "Forbidden: company mismatch" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      let instanceQuery = adminClient
        .from("whatsapp_instances")
        .select("id, company_id, instance_name")
        .order("updated_at", { ascending: false });
      if (requestedCompanyId) {
        instanceQuery = instanceQuery.eq("company_id", requestedCompanyId);
      }
      const { data: instance, error: instanceError } = await instanceQuery
        .limit(1).maybeSingle();
      if (instanceError || !instance) {
        return new Response(
          JSON.stringify({ error: "WhatsApp instance not found" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const webhookUrl = new URL(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-webhook`,
      );
      webhookUrl.searchParams.set("token", expectedSecret);
      const webhookPayloads = [
        {
          webhook: {
            enabled: true,
            url: webhookUrl.toString(),
            headers: { "x-webhook-secret": expectedSecret },
            byEvents: false,
            base64: false,
            events: ["MESSAGES_UPSERT", "MESSAGES_SET", "CONNECTION_UPDATE"],
          },
        },
        {
          enabled: true,
          url: webhookUrl.toString(),
          webhook_by_events: false,
          webhook_base64: false,
          events: [
            "MESSAGES_UPSERT",
            "MESSAGES_SET",
            "messages.upsert",
            "messages.set",
            "CONNECTION_UPDATE",
            "connection.update",
          ],
          headers: { "x-webhook-secret": expectedSecret },
        },
      ];

      let webhookConfigured = false;
      for (const payload of webhookPayloads) {
        const webhookRes = await fetch(
          `${evoUrl}/webhook/set/${instance.instance_name}`,
          {
            method: "POST",
            headers: evoHeaders,
            body: JSON.stringify(payload),
          },
        );
        if (webhookRes.ok) {
          webhookConfigured = true;
          break;
        }
        const webhookRawBody = await webhookRes.text().catch(() => "");
        const webhookIssue = providerIssueFromResponse(
          webhookRes.status,
          webhookRawBody,
        );
        console.error(
          "[repair-sync] webhook/set failed:",
          sanitizeProviderErrorForLog(
            webhookRes.status,
            webhookIssue,
            webhookRawBody,
          ),
        );
      }

      const settingsRes = await fetch(
        `${evoUrl}/settings/set/${instance.instance_name}`,
        {
          method: "POST",
          headers: evoHeaders,
          body: JSON.stringify({
            rejectCall: false,
            msgCall: "",
            groupsIgnore: false,
            alwaysOnline: true,
            readMessages: false,
            readStatus: false,
            syncFullHistory: true,
          }),
        },
      );

      const { data: knownChats } = await adminClient
        .from("whatsapp_chats")
        .select("remote_jid, last_message_at")
        .eq("instance_id", instance.id)
        .eq("company_id", instance.company_id)
        .not("remote_jid", "is", null)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(maxChats);
      const requestedRemoteJids: string[] = Array.isArray(body.remoteJids)
        ? body.remoteJids.flatMap((jid: unknown): string[] =>
          directWhatsAppJidVariants(jid)
        )
        : [];
      const remoteJids: string[] = [
        ...new Set<string>(
          (requestedRemoteJids.length > 0
            ? requestedRemoteJids
            : (knownChats || []).map((chat: any): string =>
              String(chat.remote_jid || "")
            ))
            .filter(Boolean),
        ),
      ];

      const rawMessages = await fetchRecentMessages(
        evoUrl,
        instance.instance_name,
        evoHeaders,
        limit,
        remoteJids,
        perChatLimit,
        requestedRemoteJids.length === 0,
      );
      let scanned = 0;
      let inserted = 0;
      let skippedOld = 0;
      let skippedDuplicate = 0;
      let mediaPersisted = 0;
      const touchedChats = new Set<string>();

      for (const raw of rawMessages) {
        const msg = normalizeProviderMessage(raw);
        const key = msg?.key || {};
        const remoteJid = String(key.remoteJid || "");
        if (!remoteJid) continue;
        const providerDate = messageDate(msg.messageTimestamp ?? msg.timestamp);
        if (providerDate < since) {
          skippedOld += 1;
          continue;
        }
        scanned += 1;
        const msgType = detectMessageType(msg);
        if (msgType === "reaction") continue;
        const msgExtId = key.id ? String(key.id) : null;
        const isFromMe = key.fromMe === true;
        const finalMediaType = detectMediaType(msg, msgType);
        let mediaUrl = extractMediaUrl(msg.message);
        const content = extractMessageText(
          msg.message,
          finalMediaType ? msgType : "mídia",
        );
        const contactName = remoteJid.includes("@g.us")
          ? (msg.groupMetadata?.subject || null)
          : (msg.pushName || null);

        const jidVariants = providerWhatsAppJidVariants(remoteJid, [
          key.remoteJidAlt,
          msg.remoteJidAlt,
        ]);
        let chat = await resolveExistingWhatsAppChat({
          adminClient,
          instanceId: instance.id,
          companyId: instance.company_id,
          jidVariants,
          messageExternalId: msgExtId,
        });
        if (!chat) {
          const { data: insertedChat } = await adminClient
            .from("whatsapp_chats")
            .insert({
              instance_id: instance.id,
              company_id: instance.company_id,
              remote_jid: remoteJid,
              last_message_at: providerDate.toISOString(),
              ...(!isFromMe && contactName
                ? { contact_name: contactName }
                : {}),
            })
            .select(CHAT_LOOKUP_COLUMNS)
            .maybeSingle();
          chat = insertedChat as WhatsAppChatRow | null;
        }
        if (!chat) continue;
        await persistWhatsAppJidAliases({
          adminClient,
          companyId: instance.company_id,
          instanceId: instance.id,
          chat,
          jidVariants,
        });
        touchedChats.add(chat.id);

        if (!isFromMe && contactName && contactName !== chat.contact_name) {
          await adminClient.from("whatsapp_chats").update({
            contact_name: contactName,
          }).eq("id", chat.id);
        }

        const phoneKey = normalizeWhatsAppPhoneKey(remoteJid);
        if (phoneKey && !remoteJid.includes("@g.us") && !chat.student_id) {
          const { data: students } = await adminClient.from("students")
            .select("id, phone, whatsapp")
            .eq("company_id", instance.company_id);
          const matches = (students || []).filter((student: any) => (
            normalizeWhatsAppPhoneKey(student.whatsapp) === phoneKey ||
            normalizeWhatsAppPhoneKey(student.phone) === phoneKey
          ));
          if (matches.length === 1) {
            await adminClient.from("whatsapp_chats").update({
              student_id: matches[0].id,
            }).eq("id", chat.id);
            chat.student_id = matches[0].id;
          }
        }

        if (msgExtId) {
          const { data: existing } = await adminClient
            .from("whatsapp_messages")
            .select("id")
            .eq("chat_id", chat.id)
            .eq("message_id_external", msgExtId)
            .limit(1)
            .maybeSingle();
          if (existing) {
            skippedDuplicate += 1;
            continue;
          }
        }

        let mediaStoragePath: string | null = null;
        if (finalMediaType && msgExtId) {
          const persisted = await persistProviderMedia({
            adminClient,
            evoUrl,
            instanceName: instance.instance_name,
            evoHeaders,
            companyId: instance.company_id,
            chatId: chat.id,
            messageId: msgExtId,
            remoteJid,
            fromMe: isFromMe,
            mimetype: finalMediaType,
          });
          if (persisted?.mediaUrl) {
            mediaUrl = persisted.mediaUrl;
            mediaStoragePath = persisted.mediaStoragePath;
            mediaPersisted += 1;
          }
        }

        const { error: insertError } = await adminClient.from(
          "whatsapp_messages",
        ).insert({
          chat_id: chat.id,
          company_id: instance.company_id,
          message_id_external: msgExtId,
          content,
          type: msgType,
          is_from_me: isFromMe,
          source: isFromMe ? "outgoing" : "incoming",
          sender_id: isFromMe ? null : remoteJid,
          media_url: mediaUrl,
          media_type: finalMediaType,
          media_storage_path: mediaStoragePath,
          timestamp: providerDate.toISOString(),
          origin: "provider_history_sync",
        });
        if (insertError) {
          if (insertError.code === "23505") skippedDuplicate += 1;
          else {console.error(
              "[repair-sync] message insert failed:",
              insertError.message,
            );}
          continue;
        }
        inserted += 1;

        if (
          !chat.last_message_at ||
          new Date(chat.last_message_at).getTime() <= providerDate.getTime()
        ) {
          await adminClient.from("whatsapp_chats").update({
            last_message: content,
            last_message_at: providerDate.toISOString(),
            ...(isFromMe ? { unread_count: 0 } : {}),
          }).eq("id", chat.id);
        }
      }

      if (touchedChats.size > 0) {
        await adminClient.from("whatsapp_chats")
          .update({ history_synced_at: new Date().toISOString() })
          .in("id", [...touchedChats]);
      }

      return new Response(
        JSON.stringify({
          success: true,
          instance: instance.instance_name,
          webhookConfigured,
          settingsConfigured: settingsRes.ok,
          knownChats: remoteJids.length,
          scanned,
          inserted,
          skippedOld,
          skippedDuplicate,
          mediaPersisted,
          touchedChats: touchedChats.size,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── CONNECTION UPDATE ───
    if (event === "CONNECTION_UPDATE" || body.event === "connection.update") {
      const state = body.data?.state || body.state;
      const instanceName = body.instance || body.data?.instance;
      if (!instanceName) {
        console.error(
          "[webhook] CONNECTION_UPDATE missing instance, body:",
          JSON.stringify(body),
        );
        return new Response(JSON.stringify({ error: "Missing instance" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const mappedStatus = state === "open"
        ? "connected"
        : state === "close"
        ? "disconnected"
        : "waiting_qr";

      const connectedPhone = state === "open"
        ? (body.data?.wuid || body.data?.owner || body.sender ||
          body.data?.instance?.owner || null)
        : null;

      const patch: Record<string, unknown> = {
        instance_name: instanceName,
        status: mappedStatus,
        updated_at: new Date().toISOString(),
      };
      if (state === "open") {
        patch.qr_code = null;
        if (connectedPhone) {
          patch.phone_number = String(connectedPhone).replace(/\D/g, "");
        }
      } else if (state === "close") {
        patch.qr_code = null;
        patch.phone_number = null;
      }

      const { error: updateError } = await adminClient
        .from("whatsapp_instances")
        .update(patch)
        .eq("instance_name", instanceName);
      if (updateError) {
        console.error(
          "[webhook] Failed to persist connection update:",
          updateError.message,
        );
        return new Response(
          JSON.stringify({ error: "Failed to persist connection update" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── MESSAGES UPSERT ───
    if (
      event === "MESSAGES_UPSERT" ||
      event === "messages.upsert" ||
      event === "MESSAGES_SET" ||
      event === "messages.set"
    ) {
      const messages = extractWebhookMessages(body);
      const isHistoryEvent = event === "MESSAGES_SET" ||
        event === "messages.set";
      const instanceName = body.instance;
      if (!instanceName) {
        console.error(
          "[webhook] MESSAGES_UPSERT missing instance, body:",
          JSON.stringify(body),
        );
        return new Response(JSON.stringify({ error: "Missing instance" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: instance } = await adminClient.from("whatsapp_instances")
        .select("id, company_id").eq("instance_name", instanceName).single();
      if (!instance) {
        console.error("Instance not found:", instanceName);
        return new Response(JSON.stringify({ error: "Instance not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const evoUrl = Deno.env.get("EVOLUTION_API_URL")!;
      const evoKey = Deno.env.get("EVOLUTION_API_KEY") || "";
      const evoHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        apikey: evoKey,
      };

      for (const msg of Array.isArray(messages) ? messages : [messages]) {
        const key = msg.key || {};
        const remoteJid = key.remoteJid || "";
        if (!remoteJid) continue;
        const providerMessageDate = messageDate(
          msg.messageTimestamp ?? msg.timestamp,
        );
        const providerMessageAt = providerMessageDate.toISOString();

        const contactName = remoteJid.includes("@g.us")
          ? (msg.groupMetadata?.subject || null)
          : (msg.pushName || null);
        const isFromMe = key.fromMe === true;
        const msgExtId = key.id ? String(key.id) : null;
        const jidVariants = providerWhatsAppJidVariants(remoteJid, [
          key.remoteJidAlt,
          msg.remoteJidAlt,
        ]);

        // Extract media
        let mediaUrl = msg.message?.imageMessage?.url ||
          msg.message?.videoMessage?.url || msg.message?.audioMessage?.url ||
          msg.message?.documentMessage?.url ||
          msg.message?.stickerMessage?.url || null;
        const mediaType = msg.message?.imageMessage?.mimetype ||
          msg.message?.videoMessage?.mimetype ||
          msg.message?.audioMessage?.mimetype ||
          msg.message?.documentMessage?.mimetype ||
          msg.message?.stickerMessage?.mimetype || null;

        let msgType = "text";
        if (
          msg.message?.reactionMessage || msg.messageType === "reactionMessage"
        ) msgType = "reaction";
        else if (
          msg.message?.imageMessage || msg.messageType === "imageMessage"
        ) msgType = "image";
        else if (
          msg.message?.videoMessage || msg.messageType === "videoMessage"
        ) msgType = "video";
        else if (
          msg.message?.audioMessage || msg.messageType === "audioMessage"
        ) msgType = "audio";
        else if (
          msg.message?.documentMessage || msg.messageType === "documentMessage"
        ) msgType = "document";
        else if (
          msg.message?.stickerMessage || msg.messageType === "stickerMessage"
        ) msgType = "sticker";
        else if (
          msg.messageType && msg.messageType !== "conversation" &&
          msg.messageType !== "extendedTextMessage"
        ) msgType = msg.messageType;

        const finalMediaType = mediaType ||
          (msgType === "image" ? "image/jpeg" : null) ||
          (msgType === "video" ? "video/mp4" : null) ||
          (msgType === "audio" ? "audio/ogg" : null) ||
          (msgType === "sticker" ? "image/webp" : null) || null;
        if (msgType === "reaction") continue;

        const content = extractMessageText(
          msg.message,
          mediaType || finalMediaType ? msgType : "mídia",
        );
        const contextInfo = extractContextInfo(msg.message);
        const quotedExternalId = contextInfo?.stanzaId
          ? String(contextInfo.stanzaId)
          : null;
        const quotedPreview = extractQuotedPreview(contextInfo);
        const quotedSource = contextInfo?.participant &&
            String(contextInfo.participant) !== remoteJid
          ? "outgoing"
          : null;
        let quotedDbId: string | null = null;

        // Check first contact — use phone base to cover JID variants (@lid, @s.whatsapp.net)
        let isFirstContact = false;
        const isDirectContact = !remoteJid.includes("@g.us");
        if (!isHistoryEvent && !isFromMe && isDirectContact) {
          const existingChat = await resolveExistingWhatsAppChat({
            adminClient,
            instanceId: instance.id,
            companyId: instance.company_id,
            jidVariants,
            messageExternalId: msgExtId,
          });
          isFirstContact = !existingChat;

          // Also check if phone matches a known student — never trigger welcome for students
          const phoneKey = normalizeWhatsAppPhoneKey(remoteJid);
          if (isFirstContact && phoneKey) {
            const { data: companyStudents } = await adminClient.from("students")
              .select("id, phone, whatsapp").eq(
                "company_id",
                instance.company_id,
              );
            const knownStudents = (companyStudents || []).filter((
              student: any,
            ) => (
              normalizeWhatsAppPhoneKey(student.whatsapp) === phoneKey ||
              normalizeWhatsAppPhoneKey(student.phone) === phoneKey
            ));
            if (knownStudents.length === 1) {
              isFirstContact = false;
              console.log(
                "[webhook] Phone matches student, skipping first contact:",
                phoneKey,
              );
            }
          }
        }

        // Avoid moving a current chat backwards when old history arrives.
        let chat = await resolveExistingWhatsAppChat({
          adminClient,
          instanceId: instance.id,
          companyId: instance.company_id,
          jidVariants,
          messageExternalId: msgExtId,
        });
        if (!chat) {
          const { data: insertedChat, error: chatInsertError } =
            await adminClient
              .from("whatsapp_chats")
              .insert({
                instance_id: instance.id,
                company_id: instance.company_id,
                remote_jid: remoteJid,
                last_message_at: providerMessageAt,
                ...(!isFromMe && contactName
                  ? { contact_name: contactName }
                  : {}),
              })
              .select(CHAT_LOOKUP_COLUMNS)
              .maybeSingle();
          if (chatInsertError?.code === "23505") {
            chat = await resolveExistingWhatsAppChat({
              adminClient,
              instanceId: instance.id,
              companyId: instance.company_id,
              jidVariants,
              messageExternalId: msgExtId,
            });
          } else {
            chat = insertedChat as WhatsAppChatRow | null;
          }
        } else if (
          !isFromMe && contactName && contactName !== chat.contact_name
        ) {
          await adminClient
            .from("whatsapp_chats")
            .update({ contact_name: contactName })
            .eq("id", chat.id);
          chat.contact_name = contactName;
        }
        if (!chat) continue;
        await persistWhatsAppJidAliases({
          adminClient,
          companyId: instance.company_id,
          instanceId: instance.id,
          chat,
          jidVariants,
        });

        // Link student (supports both @s.whatsapp.net and @lid)
        let isStudent = !!chat.student_id;
        const phoneKey = normalizeWhatsAppPhoneKey(remoteJid);
        if (phoneKey && !remoteJid.includes("@g.us") && !chat.student_id) {
          const { data: companyStudents } = await adminClient.from("students")
            .select("id, phone, whatsapp")
            .eq("company_id", instance.company_id);
          const matchingStudents = (companyStudents || []).filter((
            student: any,
          ) => (
            normalizeWhatsAppPhoneKey(student.whatsapp) === phoneKey ||
            normalizeWhatsAppPhoneKey(student.phone) === phoneKey
          ));
          if (matchingStudents.length === 1) {
            isStudent = true;
            chat.student_id = matchingStudents[0].id;
            await adminClient.from("whatsapp_chats").update({
              student_id: matchingStudents[0].id,
            }).eq("id", chat.id);
            console.log(
              "[webhook] Auto-linked student",
              matchingStudents[0].id,
              "to chat",
              chat.id,
            );
          }
        }

        // Deduplicate
        if (msgExtId) {
          const { data: existing } = await adminClient.from("whatsapp_messages")
            .select("id").eq("chat_id", chat.id).eq(
              "message_id_external",
              msgExtId,
            ).limit(1).maybeSingle();
          if (existing) continue;
        }

        if (quotedExternalId) {
          const { data: quotedRow } = await adminClient
            .from("whatsapp_messages")
            .select("id")
            .eq("chat_id", chat.id)
            .eq("message_id_external", quotedExternalId)
            .limit(1)
            .maybeSingle();
          quotedDbId = quotedRow?.id || null;
        }

        let mediaStoragePath: string | null = null;
        if (finalMediaType && msgExtId) {
          const persisted = await persistProviderMedia({
            adminClient,
            evoUrl,
            instanceName,
            evoHeaders,
            companyId: instance.company_id,
            chatId: chat.id,
            messageId: msgExtId,
            remoteJid,
            fromMe: isFromMe,
            mimetype: finalMediaType,
          });
          if (persisted?.mediaUrl) {
            mediaUrl = persisted.mediaUrl;
            mediaStoragePath = persisted.mediaStoragePath;
          }
        }

        // Insert message
        const { error: msgInsertError } = await adminClient.from(
          "whatsapp_messages",
        ).insert({
          chat_id: chat.id,
          company_id: instance.company_id,
          message_id_external: msgExtId,
          content,
          type: msgType,
          is_from_me: isFromMe,
          source: isFromMe ? "outgoing" : "incoming",
          sender_id: isFromMe ? null : remoteJid,
          media_url: mediaUrl,
          media_type: finalMediaType,
          media_storage_path: mediaStoragePath,
          quoted_message_id: quotedDbId,
          quoted_message_external_id: quotedExternalId,
          quoted_message_preview: quotedPreview,
          quoted_message_source: quotedSource,
          timestamp: providerMessageAt,
          origin: isHistoryEvent ? "provider_history_sync" : "provider_live",
        });
        if (msgInsertError) {
          if (msgInsertError.code !== "23505") {
            console.error("[webhook] msg insert error:", msgInsertError);
          }
          // A duplicate webhook must not increment unread counters or resume flows twice.
          continue;
        }
        // Update preview only when this is the newest provider message.
        if (
          !chat.last_message_at ||
          new Date(chat.last_message_at).getTime() <=
            providerMessageDate.getTime()
        ) {
          await adminClient
            .from("whatsapp_chats")
            .update({
              last_message: content,
              last_message_at: providerMessageAt,
            })
            .eq("id", chat.id);
        }

        // Increment unread
        if (!isHistoryEvent && !isFromMe) {
          const { data: currentChat } = await adminClient.from("whatsapp_chats")
            .select("unread_count").eq("id", chat.id).single();
          if (currentChat) {
            await adminClient.from("whatsapp_chats").update({
              unread_count: (currentChat.unread_count || 0) + 1,
            }).eq("id", chat.id);
          }
        }

        // ─── CHECK FOR ACTIVE FLOW SESSION (resume) ───
        if (!isHistoryEvent && !isFromMe && isDirectContact) {
          const { data: activeSession } = await adminClient.from(
            "flow_sessions",
          )
            .select("*").eq("chat_id", chat.id).eq("status", "waiting_response")
            .order("created_at", { ascending: false }).limit(1).maybeSingle();

          if (activeSession) {
            // Check if the flow is still active before resuming
            const { data: sessionFlow } = await adminClient.from(
              "automation_flows",
            )
              .select("is_active").eq("id", activeSession.flow_id)
              .maybeSingle();

            if (!sessionFlow || !sessionFlow.is_active) {
              console.log(
                "[webhook] Flow inactive, cancelling session:",
                activeSession.id,
              );
              await adminClient.from("flow_sessions").update({
                status: "cancelled",
              }).eq("id", activeSession.id);
            } else {
              console.log("[webhook] Resuming flow session:", activeSession.id);
              try {
                await resumeFlowSession(
                  adminClient,
                  activeSession,
                  content || "",
                  remoteJid,
                  chat.id,
                  instanceName,
                  evoUrl,
                  evoHeaders,
                  instance.company_id,
                );
              } catch (err) {
                console.error("[webhook] Resume error:", err);
              }
              continue; // Don't trigger welcome flow if resuming
            }
          }
        }

        // ─── BNITO NO WHATSAPP (opt-in por empresa; default OFF) ───
        // Aluno conhecido manda TEXTO → assistente responde com contexto do treino.
        if (
          !isFromMe && isDirectContact && isStudent && instance.company_id &&
          (msgType === "conversation" || msgType === "extendedTextMessage" ||
            msgType === "text") &&
          content && !content.startsWith("[") && content.length <= 500
        ) {
          try {
            await maybeBnitoReply(
              adminClient,
              instance.company_id,
              chat.id,
              content,
              remoteJid,
              instanceName,
              evoUrl,
              evoHeaders,
            );
          } catch (err) {
            console.error("[webhook] bnito reply error:", err);
          }
        }

        // ─── TRIGGER WELCOME FLOW for first contact non-students ───
        if (isFirstContact && !isStudent && !isFromMe && instance.company_id) {
          console.log("[webhook] First contact:", remoteJid);
          try {
            const { data: flow } = await adminClient.from("automation_flows")
              .select("id")
              .eq("company_id", instance.company_id).eq(
                "trigger_type",
                "new_student",
              ).eq("is_active", true).limit(1).maybeSingle();
            if (flow) {
              const { data: startNode } = await adminClient.from(
                "automation_flow_nodes",
              )
                .select("id").eq("flow_id", flow.id).eq("node_type", "start")
                .limit(1).maybeSingle();
              if (startNode) {
                const initialCtx: Record<string, any> = {};
                if (contactName) {
                  initialCtx.nome = contactName;
                  initialCtx.name = contactName;
                }
                await executeFlow(
                  adminClient,
                  instance.company_id,
                  remoteJid,
                  chat.id,
                  instanceName,
                  evoUrl,
                  evoHeaders,
                  flow.id,
                  startNode.id,
                  initialCtx,
                  isStudent,
                );
              }
            }
          } catch (err) {
            console.error("[webhook] Welcome flow error:", err);
          }
        }
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, ignored: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("whatsapp-webhook error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
