import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const JSON_HEADERS = { "Content-Type": "application/json" };

type FlowEdge = { target: string; handle?: string; label?: string };
type FlowSession = {
  id: string;
  flow_id: string;
  chat_id: string;
  current_node_id: string;
  context: Record<string, unknown> | null;
};

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

function firstName(context: Record<string, unknown>) {
  const fullName = String(context.nome || context.name || context.student_name || "").trim();
  return fullName.split(/\s+/)[0] || "atleta";
}

function replaceVariables(text: string, context: Record<string, unknown>) {
  const replace = (match: string, rawKey: string) => {
    const key = rawKey.replace(/-/g, "_");
    if (key === "primeiro_nome") return firstName(context);
    if (context[key] != null) return String(context[key]);
    if (context[rawKey] != null) return String(context[rawKey]);
    if (key === "nome" && context.name != null) return String(context.name);
    return match;
  };
  return text
    .replace(/\{\{(\w[\w-]*)\}\}/g, replace)
    .replace(/\{(\w[\w-]*)\}/g, replace);
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

async function sendText(args: {
  admin: any;
  evoUrl: string;
  evoKey: string;
  instanceName: string;
  remoteJid: string;
  chatId: string;
  companyId: string;
  text: string;
}) {
  const response = await fetch(`${args.evoUrl}/message/sendText/${args.instanceName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: args.evoKey },
    body: JSON.stringify({ number: args.remoteJid, text: args.text }),
  });
  if (!response.ok) {
    const details = (await response.text()).slice(0, 300);
    throw new Error(`Evolution ${response.status}: ${details}`);
  }
  const payload = await response.json().catch(() => ({}));
  const sentAt = new Date().toISOString();
  const { error: messageError } = await args.admin.from("whatsapp_messages").insert({
    chat_id: args.chatId,
    company_id: args.companyId,
    content: args.text,
    source: "outgoing",
    type: "text",
    is_from_me: true,
    message_id_external: payload?.key?.id || null,
    origin: "automation",
    timestamp: sentAt,
  });
  if (messageError) console.error("automation message log failed", messageError.message);
  await args.admin.from("whatsapp_chats").update({
    last_message: args.text,
    last_message_at: sentAt,
    updated_at: sentAt,
  }).eq("id", args.chatId);
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

async function processSession(admin: any, session: FlowSession, provider: { url: string; key: string }) {
  const chatResult = await admin.from("whatsapp_chats")
    .select("id, company_id, instance_id, remote_jid, student_id")
    .eq("id", session.chat_id).single();
  if (chatResult.error || !chatResult.data) throw new Error("Conversa da automação não encontrada.");
  const chat = chatResult.data;
  if (!chat.remote_jid) throw new Error("Conversa sem número remoto.");

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

  const [nodesResult, edgesResult] = await Promise.all([
    admin.from("automation_flow_nodes").select("*").eq("flow_id", session.flow_id),
    admin.from("automation_flow_edges").select("*").eq("flow_id", session.flow_id),
  ]);
  if (nodesResult.error) throw nodesResult.error;
  if (edgesResult.error) throw edgesResult.error;
  const nodes = nodesResult.data || [];
  const edges = edgesResult.data || [];
  const adjacency: Record<string, FlowEdge[]> = {};
  for (const edge of edges) {
    (adjacency[edge.source_node_id] ||= []).push({
      target: edge.target_node_id,
      handle: edge.source_handle || undefined,
      label: edge.label || undefined,
    });
  }

  const context: Record<string, unknown> = { ...(session.context || {}) };
  delete context.next_dispatch_at;
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
    const nextEdges: FlowEdge[] = adjacency[currentId] || [];

    if (nodeType === "content") {
      let message = replaceVariables(nodeData.message || node.label || "", context);
      if (context.trigger_type === "weekly_contact") message = weeklyContactMessage(context);
      if (message.trim()) {
        await sendText({
          admin,
          evoUrl: provider.url,
          evoKey: provider.key,
          instanceName: instance.instance_name,
          remoteJid: chat.remote_jid,
          chatId: chat.id,
          companyId: chat.company_id,
          text: message.trim(),
        });
      }
      const nextId: string | null = nextEdges[0]?.target || null;
      if (nodeData.wait_for_reply) {
        const updated = await admin.from("flow_sessions").update({
          current_node_id: nextId || currentId,
          status: "waiting_response",
          context,
          last_activity_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", session.id);
        if (updated.error) throw updated.error;
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
      await sendText({
        admin,
        evoUrl: provider.url,
        evoKey: provider.key,
        instanceName: instance.instance_name,
        remoteJid: chat.remote_jid,
        chatId: chat.id,
        companyId: chat.company_id,
        text: message.trim(),
      });
      const updated = await admin.from("flow_sessions").update({
        current_node_id: currentId,
        status: "waiting_response",
        context: { ...context, _menu_node: true },
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", session.id);
      if (updated.error) throw updated.error;
      return "waiting_response";
    }

    if (nodeType === "action" && nodeData.action_type === "tag" && nodeData.tag_name) {
      await applyLabel(admin, chat.company_id, chat.id, nodeData.tag_name);
    }

    if (nodeType === "condition") {
      const isStudent = Boolean(chat.student_id);
      const preferred = nextEdges.find((edge: FlowEdge) => isStudent
        ? edge.handle === "true" || edge.label === "Sim"
        : edge.handle === "false" || edge.label === "Não");
      currentId = preferred?.target || nextEdges[0]?.target || null;
    } else {
      currentId = nextEdges[0]?.target || null;
    }
  }

  if (currentId && (visited.has(currentId) || steps >= 30)) {
    throw new Error("Fluxo interrompido por ciclo ou excesso de etapas.");
  }
  await applyLabel(admin, chat.company_id, chat.id, "Primeiro contato feito");
  const completed = await admin.from("flow_sessions").update({
    current_node_id: null,
    status: "completed",
    context,
    last_activity_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", session.id);
  if (completed.error) throw completed.error;
  return "completed";
}

Deno.serve(async (request) => {
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
  const admin = createClient(supabaseUrl, serviceKey);

  const triggerResult = await admin.rpc("process_automation_triggers");
  if (triggerResult.error) console.error("automation trigger scan failed", triggerResult.error.message);
  const claimResult = await admin.rpc("claim_automation_sessions", { _limit: 25 });
  if (claimResult.error) return json({ error: "Unable to claim automation sessions" }, 500);
  const sessions = (claimResult.data || []) as FlowSession[];

  if (!evolutionUrl || !evolutionKey) {
    const retryAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    for (const session of sessions) {
      const context = { ...(session.context || {}), dispatch_error: "WhatsApp provider not configured", next_dispatch_at: retryAt };
      await admin.from("flow_sessions").update({ status: "active", context, updated_at: new Date().toISOString() }).eq("id", session.id);
    }
    return json({ processed: 0, deferred: sessions.length, reason: "provider_not_configured", triggers: triggerResult.data || null });
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
      const previousRetries = Number(session.context?.dispatch_retries || 0);
      const retryMinutes = Math.min(360, Math.max(5, 2 ** Math.min(previousRetries, 8)));
      const context = {
        ...(session.context || {}),
        dispatch_retries: previousRetries + 1,
        dispatch_error: error instanceof Error ? error.message.slice(0, 300) : "Unknown dispatcher error",
        next_dispatch_at: new Date(Date.now() + retryMinutes * 60 * 1000).toISOString(),
      };
      await admin.from("flow_sessions").update({ status: "active", context, updated_at: new Date().toISOString() }).eq("id", session.id);
    }
  }

  return json({ claimed: sessions.length, completed, waiting, failed, triggers: triggerResult.data || null });
});
