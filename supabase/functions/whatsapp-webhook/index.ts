import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
    if (normalized === "primeiro_nome" || key === "primeiro-nome") return firstName(context);
    if (context[normalized] !== undefined) return String(context[normalized]);
    if (context[key] !== undefined) return String(context[key]);
    if (normalized === "nome" && context.name) return context.name;
    return match;
  });

  // Handle {variable} single-brace format (common in user-created flows)
  result = result.replace(/\{(\w[\w-]*)\}/g, (match, key) => {
    const normalized = key.replace(/-/g, "_");
    if (normalized === "primeiro_nome" || key === "primeiro-nome") return firstName(context);
    if (context[normalized] !== undefined) return String(context[normalized]);
    if (context[key] !== undefined) return String(context[key]);
    if (normalized === "nome" && context.name) return context.name;
    return match;
  });

  return result;
}

// ─── SEND TEXT MESSAGE ───
async function sendText(
  evoUrl: string, instanceName: string, evoHeaders: Record<string, string>,
  remoteJid: string, text: string, adminClient: any, chatId: string
): Promise<void> {
  try {
    const res = await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
      method: "POST", headers: evoHeaders,
      body: JSON.stringify({ number: remoteJid, text }),
    });
    if (res.ok) {
      const d = await res.json();
      await adminClient.from("whatsapp_messages").insert({
        chat_id: chatId, content: text, source: "outgoing", type: "text", is_from_me: true,
        message_id_external: d?.key?.id || null, timestamp: new Date().toISOString(),
      });
    } else {
      console.error("[flow] Send failed:", await res.text());
    }
  } catch (err) { console.error("[flow] Send error:", err); }
}

// ─── APPLY LABEL ───
async function applyLabel(adminClient: any, companyId: string, chatId: string, labelName: string, color = "#10b981") {
  let { data: label } = await adminClient.from("whatsapp_labels").select("id")
    .eq("company_id", companyId).eq("name", labelName).maybeSingle();
  if (!label) {
    const { data: nl } = await adminClient.from("whatsapp_labels")
      .insert({ company_id: companyId, name: labelName, color }).select("id").single();
    label = nl;
  }
  if (label) {
    const { data: ex } = await adminClient.from("whatsapp_chat_labels").select("id")
      .eq("chat_id", chatId).eq("label_id", label.id).maybeSingle();
    if (!ex) await adminClient.from("whatsapp_chat_labels").insert({ chat_id: chatId, label_id: label.id });
  }
}

// ─── EXECUTE FLOW (with session support) ───
async function executeFlow(
  adminClient: any, companyId: string, remoteJid: string, chatId: string,
  instanceName: string, evoUrl: string, evoHeaders: Record<string, string>,
  flowId: string, startNodeId: string, context: Record<string, any>,
  isStudentContact: boolean
) {
  const [nodesRes, edgesRes] = await Promise.all([
    adminClient.from("automation_flow_nodes").select("*").eq("flow_id", flowId),
    adminClient.from("automation_flow_edges").select("*").eq("flow_id", flowId),
  ]);
  const nodes: any[] = nodesRes.data || [];
  const edges: any[] = edgesRes.data || [];

  const adjacency: Record<string, Array<{ target: string; handle?: string; label?: string }>> = {};
  for (const e of edges) {
    if (!adjacency[e.source_node_id]) adjacency[e.source_node_id] = [];
    adjacency[e.source_node_id].push({ target: e.target_node_id, handle: e.source_handle || undefined, label: e.label || undefined });
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
      const message = replaceVariables(nodeData.message || node.label || "", context);
      if (message.trim()) {
        const delayMs = (nodeData.delay_minutes || 0) * 60 * 1000;
        if (delayMs > 0 && delayMs <= 300000) await new Promise(r => setTimeout(r, delayMs));
        await sendText(evoUrl, instanceName, evoHeaders, remoteJid, message, adminClient, chatId);
      }

      // Check if this node waits for a reply
      if (nodeData.wait_for_reply) {
        const nextEdges = adjacency[currentId] || [];
        const nextNodeId = nextEdges.length > 0 ? nextEdges[0].target : currentId;

        // Cancel any existing session for this chat
        await adminClient.from("flow_sessions").update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("chat_id", chatId).eq("status", "waiting_response");

        // Create new session
        await adminClient.from("flow_sessions").insert({
          chat_id: chatId, flow_id: flowId, current_node_id: nextNodeId,
          status: "waiting_response", context,
        });
        console.log("[flow] Paused — waiting for reply. Next node:", nextNodeId, "save_as:", nodeData.save_response_as);
        return; // STOP execution
      }
    } else if (nodeType === "menu") {
      const prompt = replaceVariables(nodeData.prompt || "", context);
      const options = (nodeData.options || []) as Array<{ number: number; text: string }>;
      let menuText = prompt;
      if (options.length > 0) menuText += "\n\n" + options.map(o => `${o.number}. ${replaceVariables(o.text, context)}`).join("\n");
      if (menuText.trim()) await sendText(evoUrl, instanceName, evoHeaders, remoteJid, menuText, adminClient, chatId);

      // Menu also pauses for user response — create session
      const nextEdges = adjacency[currentId] || [];
      if (nextEdges.length > 0) {
        await adminClient.from("flow_sessions").update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("chat_id", chatId).eq("status", "waiting_response");
        await adminClient.from("flow_sessions").insert({
          chat_id: chatId, flow_id: flowId, current_node_id: currentId,
          status: "waiting_response", context: { ...context, _menu_node: true },
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
    const nextEdges = adjacency[currentId] || [];
    if (nextEdges.length === 0) { currentId = null; }
    else if (nodeType === "condition") {
      const falsePath = nextEdges.find(e => e.handle === "false" || e.label === "Não");
      const truePath = nextEdges.find(e => e.handle === "true" || e.label === "Sim");
      currentId = (isStudentContact ? truePath?.target : falsePath?.target) || nextEdges[0].target;
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
  adminClient: any, session: any, userMessage: string,
  remoteJid: string, chatId: string, instanceName: string,
  evoUrl: string, evoHeaders: Record<string, string>, companyId: string
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
        .select("*").eq("flow_id", session.flow_id).eq("source_node_id", session.current_node_id);
      
      // Find matching edge by option number (label = "1", "2", etc.)
      const chosenOption = userMessage.trim();
      const matchEdge = (edges || []).find((e: any) => e.label === chosenOption || e.source_handle === chosenOption);
      const nextNodeId = matchEdge?.target_node_id || (edges && edges.length > 0 ? edges[0].target_node_id : null);

      // Mark session complete
      await adminClient.from("flow_sessions").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", session.id);

      if (nextNodeId) {
        await executeFlow(adminClient, companyId, remoteJid, chatId, instanceName, evoUrl, evoHeaders, session.flow_id, nextNodeId, ctx, false);
      }
      return;
    }
  }

  // For wait_for_reply nodes: find the PREVIOUS node that had wait_for_reply to get save config
  // The current_node_id points to the NEXT node after the wait
  // We need to check the node before it
  const { data: prevEdges } = await adminClient.from("automation_flow_edges")
    .select("source_node_id").eq("flow_id", session.flow_id).eq("target_node_id", session.current_node_id);
  
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
  console.log("[flow-resume] Saved response as", saveAs, "=", userMessage.trim());

  // If saving name, also update chat contact_name
  if (saveAs === "name" || saveAs === "nome") {
    const nameValue = userMessage.trim();
    // Only save as contact_name if it looks like a real name (not too long, no line breaks)
    if (nameValue.length <= 60 && !nameValue.includes("\n")) {
      await adminClient.from("whatsapp_chats").update({ contact_name: nameValue }).eq("id", chatId);
      console.log("[flow-resume] Updated contact_name to:", nameValue);
    }
    ctx.nome = nameValue;
  }

  // Mark session completed
  await adminClient.from("flow_sessions").update({ status: "completed", context: ctx, updated_at: new Date().toISOString() }).eq("id", session.id);

  // Resume flow from next node
  await executeFlow(adminClient, companyId, remoteJid, chatId, instanceName, evoUrl, evoHeaders, session.flow_id, session.current_node_id, ctx, false);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const event = body.event;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ─── CONNECTION UPDATE ───
    if (event === "CONNECTION_UPDATE" || body.event === "connection.update") {
      const state = body.data?.state || body.state;
      const instanceName = body.instance || body.data?.instance;
      if (!instanceName) {
        console.error("[webhook] CONNECTION_UPDATE missing instance, body:", JSON.stringify(body));
        return new Response(JSON.stringify({ error: "Missing instance" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const mappedStatus = state === "open" ? "connected" : state === "close" ? "disconnected" : "waiting_qr";

      const connectedPhone = state === "open"
        ? (body.data?.wuid || body.data?.owner || body.sender || body.data?.instance?.owner || null)
        : null;

      const patch: Record<string, unknown> = {
        instance_name: instanceName,
        status: mappedStatus,
        updated_at: new Date().toISOString(),
      };
      if (state === "open") {
        patch.qrcode = null;
        if (connectedPhone) patch.connected_phone = connectedPhone;
      } else if (state === "close") {
        patch.qrcode = null;
        patch.connected_phone = null;
      }

      await adminClient.from("whatsapp_instances").upsert(patch, { onConflict: "instance_name" });

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── MESSAGES UPSERT ───
    if (event === "MESSAGES_UPSERT" || event === "messages.upsert") {
      const messages = body.data || [];
      const instanceName = body.instance;
      if (!instanceName) {
        console.error("[webhook] MESSAGES_UPSERT missing instance, body:", JSON.stringify(body));
        return new Response(JSON.stringify({ error: "Missing instance" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: instance } = await adminClient.from("whatsapp_instances").select("id, company_id").eq("instance_name", instanceName).single();
      if (!instance) {
        console.error("Instance not found:", instanceName);
        return new Response(JSON.stringify({ error: "Instance not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const evoUrl = Deno.env.get("EVOLUTION_API_URL")!;
      const evoKey = Deno.env.get("EVOLUTION_API_KEY") || "";
      const evoHeaders: Record<string, string> = { "Content-Type": "application/json", apikey: evoKey };

      for (const msg of Array.isArray(messages) ? messages : [messages]) {
        const key = msg.key || {};
        const remoteJid = key.remoteJid || "";
        if (!remoteJid) continue;

        const contactName = remoteJid.includes("@g.us") ? (msg.groupMetadata?.subject || null) : (msg.pushName || null);
        const isFromMe = key.fromMe === true;

        // Extract media
        const mediaUrl = msg.message?.imageMessage?.url || msg.message?.videoMessage?.url || msg.message?.audioMessage?.url || msg.message?.documentMessage?.url || msg.message?.stickerMessage?.url || null;
        const mediaType = msg.message?.imageMessage?.mimetype || msg.message?.videoMessage?.mimetype || msg.message?.audioMessage?.mimetype || msg.message?.documentMessage?.mimetype || msg.message?.stickerMessage?.mimetype || null;

        let msgType = "text";
        if (msg.message?.reactionMessage || msg.messageType === "reactionMessage") msgType = "reaction";
        else if (msg.message?.imageMessage || msg.messageType === "imageMessage") msgType = "image";
        else if (msg.message?.videoMessage || msg.messageType === "videoMessage") msgType = "video";
        else if (msg.message?.audioMessage || msg.messageType === "audioMessage") msgType = "audio";
        else if (msg.message?.documentMessage || msg.messageType === "documentMessage") msgType = "document";
        else if (msg.message?.stickerMessage || msg.messageType === "stickerMessage") msgType = "sticker";
        else if (msg.messageType && msg.messageType !== "conversation" && msg.messageType !== "extendedTextMessage") msgType = msg.messageType;

        const finalMediaType = mediaType || (msgType === "image" ? "image/jpeg" : null) || (msgType === "video" ? "video/mp4" : null) || (msgType === "audio" ? "audio/ogg" : null) || (msgType === "sticker" ? "image/webp" : null) || null;
        if (msgType === "reaction") continue;

        const content = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || msg.message?.videoMessage?.caption || msg.message?.documentMessage?.caption || msg.message?.documentMessage?.fileName || (mediaType || finalMediaType ? `[${msgType}]` : "[mídia]");

        // Check first contact — use phone base to cover JID variants (@lid, @s.whatsapp.net)
        let isFirstContact = false;
        const isDirectContact = !remoteJid.includes("@g.us");
        if (!isFromMe && isDirectContact) {
          const phoneBase = remoteJid.replace(/@.*$/, "");
          const { data: existingChats } = await adminClient.from("whatsapp_chats")
            .select("id").eq("instance_id", instance.id)
            .or(`remote_jid.eq.${remoteJid},remote_jid.ilike.${phoneBase}%`)
            .limit(2);
          isFirstContact = !existingChats || existingChats.length === 0;
          
          // Also check if phone matches a known student — never trigger welcome for students
          if (isFirstContact && phoneBase) {
            const { data: knownStudent } = await adminClient.from("students")
              .select("id").eq("company_id", instance.company_id)
              .or(`whatsapp.ilike.%${phoneBase}%,phone.ilike.%${phoneBase}%`)
              .limit(1).maybeSingle();
            if (knownStudent) {
              isFirstContact = false;
              console.log("[webhook] Phone matches student, skipping first contact:", phoneBase);
            }
          }
        }

        // Upsert chat
        const { data: chat } = await adminClient.from("whatsapp_chats").upsert(
          { instance_id: instance.id, company_id: instance.company_id, remote_jid: remoteJid, last_message_at: new Date().toISOString(), ...(!isFromMe && contactName ? { contact_name: contactName } : {}) },
          { onConflict: "instance_id,remote_jid" }
        ).select("id, student_id, contact_name").single();
        if (!chat) continue;

        // ─── DEDUP @lid vs @s.whatsapp.net ───
        // If this is a @lid chat, check if there's a canonical @s.whatsapp.net chat
        // with the same student_id or contact_name in the same instance → merge
        if (remoteJid.includes("@lid") && (chat.student_id || chat.contact_name)) {
          const orFilters: string[] = [];
          if (chat.student_id) orFilters.push(`student_id.eq.${chat.student_id}`);
          if (chat.contact_name) orFilters.push(`contact_name.eq.${chat.contact_name}`);
          
          const { data: canonical } = await adminClient.from("whatsapp_chats")
            .select("id")
            .eq("instance_id", instance.id)
            .neq("id", chat.id)
            .like("remote_jid", "%@s.whatsapp.net")
            .or(orFilters.join(","))
            .limit(1)
            .maybeSingle();

          if (canonical) {
            console.log("[webhook] Merging @lid chat", chat.id, "into canonical", canonical.id);
            // Move messages to canonical chat
            await adminClient.from("whatsapp_messages").update({ chat_id: canonical.id }).eq("chat_id", chat.id);
            // Move labels
            await adminClient.from("whatsapp_chat_labels").update({ chat_id: canonical.id }).eq("chat_id", chat.id);
            // Move flow sessions
            await adminClient.from("flow_sessions").update({ chat_id: canonical.id }).eq("chat_id", chat.id);
            // Update canonical last_message_at
            await adminClient.from("whatsapp_chats").update({ last_message_at: new Date().toISOString() }).eq("id", canonical.id);
            // Delete the @lid duplicate
            await adminClient.from("whatsapp_chats").delete().eq("id", chat.id);
            // Use canonical chat going forward
            Object.assign(chat, { id: canonical.id });
          }
        }

        // Link student (supports both @s.whatsapp.net and @lid)
        let isStudent = !!chat.student_id;
        const phoneBase = remoteJid.replace(/@.*$/, "");
        const phoneClean = phoneBase.replace(/^55/, "");
        if (phoneClean && !remoteJid.includes("@g.us") && !chat.student_id) {
          const { data: student } = await adminClient.from("students").select("id")
            .eq("company_id", instance.company_id)
            .or(`whatsapp.ilike.%${phoneClean}%,phone.ilike.%${phoneClean}%`)
            .limit(1).maybeSingle();
          if (student) {
            isStudent = true;
            await adminClient.from("whatsapp_chats").update({ student_id: student.id }).eq("id", chat.id);
            console.log("[webhook] Auto-linked student", student.id, "to chat", chat.id);
          }
        }

        // Deduplicate
        const msgExtId = key.id || null;
        if (msgExtId) {
          const { data: existing } = await adminClient.from("whatsapp_messages").select("id").eq("chat_id", chat.id).eq("message_id_external", msgExtId).limit(1).maybeSingle();
          if (existing) continue;
        }

        // Insert message
        const { error: msgInsertError } = await adminClient.from("whatsapp_messages").insert({
          chat_id: chat.id, company_id: instance.company_id, message_id_external: msgExtId,
          content, type: msgType, is_from_me: isFromMe,
          source: isFromMe ? "outgoing" : "incoming", sender_id: isFromMe ? null : remoteJid,
          media_url: mediaUrl, media_type: finalMediaType,
          timestamp: new Date().toISOString(),
        });
        if (msgInsertError) console.error("[webhook] msg insert error:", msgInsertError);
        // Update chat last_message preview
        await adminClient.from("whatsapp_chats").update({ last_message: content }).eq("id", chat.id);

        // Increment unread
        if (!isFromMe) {
          const { data: currentChat } = await adminClient.from("whatsapp_chats").select("unread_count").eq("id", chat.id).single();
          if (currentChat) await adminClient.from("whatsapp_chats").update({ unread_count: (currentChat.unread_count || 0) + 1 }).eq("id", chat.id);
        }

        // ─── CHECK FOR ACTIVE FLOW SESSION (resume) ───
        if (!isFromMe && isDirectContact) {
          const { data: activeSession } = await adminClient.from("flow_sessions")
            .select("*").eq("chat_id", chat.id).eq("status", "waiting_response")
            .order("created_at", { ascending: false }).limit(1).maybeSingle();

          if (activeSession) {
            // Check if the flow is still active before resuming
            const { data: sessionFlow } = await adminClient.from("automation_flows")
              .select("is_active").eq("id", activeSession.flow_id).maybeSingle();

            if (!sessionFlow || !sessionFlow.is_active) {
              console.log("[webhook] Flow inactive, cancelling session:", activeSession.id);
              await adminClient.from("flow_sessions").update({ status: "cancelled" }).eq("id", activeSession.id);
            } else {
              console.log("[webhook] Resuming flow session:", activeSession.id);
              try {
                await resumeFlowSession(adminClient, activeSession, content || "", remoteJid, chat.id, instanceName, evoUrl, evoHeaders, instance.company_id);
              } catch (err) { console.error("[webhook] Resume error:", err); }
              continue; // Don't trigger welcome flow if resuming
            }
          }
        }

        // ─── TRIGGER WELCOME FLOW for first contact non-students ───
        if (isFirstContact && !isStudent && !isFromMe && instance.company_id) {
          console.log("[webhook] First contact:", remoteJid);
          try {
            const { data: flow } = await adminClient.from("automation_flows").select("id")
              .eq("company_id", instance.company_id).eq("trigger_type", "new_student").eq("is_active", true).limit(1).maybeSingle();
            if (flow) {
              const { data: startNode } = await adminClient.from("automation_flow_nodes")
                .select("id").eq("flow_id", flow.id).eq("node_type", "start").limit(1).maybeSingle();
              if (startNode) {
                const initialCtx: Record<string, any> = {};
                if (contactName) { initialCtx.nome = contactName; initialCtx.name = contactName; }
                await executeFlow(adminClient, instance.company_id, remoteJid, chat.id, instanceName, evoUrl, evoHeaders, flow.id, startNode.id, initialCtx, isStudent);
              }
            }
          } catch (err) { console.error("[webhook] Welcome flow error:", err); }
        }
      }

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, ignored: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("whatsapp-webhook error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
