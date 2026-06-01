import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);

    const userId = claimsData.claims.sub as string;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: hasAdmin } = await adminClient.rpc("has_role", { _user_id: userId, _role: "admin" });
    const { data: hasMaster } = await adminClient.rpc("has_role", { _user_id: userId, _role: "master" });
    const { data: hasCoord } = await adminClient.rpc("has_role", { _user_id: userId, _role: "coordinator" });
    const { data: hasTrainer } = await adminClient.rpc("has_role", { _user_id: userId, _role: "trainer" });

    const isPrivileged = !!(hasAdmin || hasMaster);
    const canChat = isPrivileged || !!hasCoord || !!hasTrainer;
    if (!canChat) return json({ error: "Forbidden" }, 403);

    const body = await req.json();
    const { action, companyId: bodyCompanyId } = body;

    // Restrict instance/admin actions to admin/master only
    const adminOnlyActions = new Set([
      "init-connection", "restart-connection", "disconnect", "check-status",
      "refresh-qr", "disable-external-bot", "fetch-bot-settings",
    ]);
    if (adminOnlyActions.has(action) && !isPrivileged) {
      return json({ error: "Forbidden" }, 403);
    }

    const evoUrl = Deno.env.get("EVOLUTION_API_URL")!;
    const evoKey = Deno.env.get("EVOLUTION_API_KEY") || "";

    const evoHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: evoKey,
    };

    // Resolve company and instance dynamically
    let resolvedCompanyId = bodyCompanyId || null;
    if (!resolvedCompanyId) {
      const { data: cid } = await adminClient.rpc("get_user_company_id", { _user_id: userId });
      resolvedCompanyId = cid;
    }

    if (!resolvedCompanyId) return json({ error: "Company not found" }, 400);

    // Look up instance_name from whatsapp_instances table
    const { data: instanceRow } = await adminClient
      .from("whatsapp_instances")
      .select("instance_name")
      .eq("company_id", resolvedCompanyId)
      .limit(1)
      .maybeSingle();

    const instanceName = instanceRow?.instance_name || `company-${resolvedCompanyId}`;

    // ─── Helper: create fresh instance ───
    const createFreshInstance = async () => {
      console.log("[createFreshInstance] Creating instance:", instanceName);
      const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-webhook`;
      const createRes = await fetch(`${evoUrl}/instance/create`, {
        method: "POST",
        headers: evoHeaders,
        body: JSON.stringify({
          instanceName,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
          webhook: {
            url: webhookUrl,
            byEvents: false,
            base64: false,
            events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
          },
        }),
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        return json({ error: "Evolution API error", details: errText }, 502);
      }

      const createData = await createRes.json();
      console.log("[createFreshInstance] Response:", JSON.stringify(createData));
      await adminClient.from("whatsapp_instances").upsert(
        {
          instance_name: instanceName,
          company_id: resolvedCompanyId,
          status: "waiting_qr",
          qrcode: createData?.qrcode?.base64 || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "instance_name" }
      );

      return json({
        status: "waiting_qr",
        qrcode: createData?.qrcode?.base64 || null,
      });
    };

    // ─── Helper: destroy instance (logout + delete) ───
    const destroyInstance = async () => {
      try {
        await fetch(`${evoUrl}/instance/logout/${instanceName}`, {
          method: "DELETE",
          headers: evoHeaders,
        });
      } catch { /* ignore */ }
      try {
        await fetch(`${evoUrl}/instance/delete/${instanceName}`, {
          method: "DELETE",
          headers: evoHeaders,
        });
      } catch { /* ignore */ }
    };

    // ─── INIT CONNECTION ───
    if (action === "init-connection") {
      let existsInEvo = false;
      let evoState = "close";
      try {
        const checkRes = await fetch(`${evoUrl}/instance/connectionState/${instanceName}`, {
          headers: evoHeaders,
        });
        if (checkRes.ok) {
          existsInEvo = true;
          const checkData = await checkRes.json();
          evoState = checkData?.instance?.state || "close";
        }
      } catch { /* doesn't exist */ }

      if (!existsInEvo) {
        return await createFreshInstance();
      }

      // If already connected, just report
      if (evoState === "open") {
        await adminClient.from("whatsapp_instances").upsert(
          {
            instance_name: instanceName,
            company_id: resolvedCompanyId,
            status: "connected",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "instance_name" }
        );
        return json({ status: "connected" });
      }

      // Try to connect existing instance
      console.log("[init-connection] Connecting existing instance:", instanceName);
      const connectRes = await fetch(`${evoUrl}/instance/connect/${instanceName}`, {
        headers: evoHeaders,
      });

      if (!connectRes.ok) {
        const errText = await connectRes.text();
        console.error("[init-connection] connect failed:", connectRes.status, errText);
        // Connection endpoint failed — destroy and recreate
        await destroyInstance();
        return await createFreshInstance();
      }

      const connectData = await connectRes.json();
      console.log("[init-connection] connect response:", JSON.stringify(connectData));

      const qr = connectData?.base64 || connectData?.qrcode?.base64 || null;
      const state = connectData?.instance?.state || "waiting_qr";

      // If stuck (no QR and not open), destroy and recreate
      if (state !== "open" && !qr) {
        console.log("[init-connection] Instance stuck without QR, destroying and recreating...");
        await destroyInstance();
        return await createFreshInstance();
      }

      await adminClient.from("whatsapp_instances").upsert(
        {
          instance_name: instanceName,
          company_id: resolvedCompanyId,
          status: state === "open" ? "connected" : "waiting_qr",
          qrcode: qr,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "instance_name" }
      );

      return json({
        status: state === "open" ? "connected" : "waiting_qr",
        qrcode: qr,
      });
    }

    // ─── RESTART CONNECTION ───
    if (action === "restart-connection") {
      console.log("Restarting instance:", instanceName);
      await destroyInstance();

      await adminClient.from("whatsapp_instances").upsert(
        {
          instance_name: instanceName,
          company_id: resolvedCompanyId,
          status: "disconnected",
          qrcode: null,
          connected_phone: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "instance_name" }
      );

      // Small delay to let Evolution clean up
      await new Promise(r => setTimeout(r, 1000));

      return await createFreshInstance();
    }

    // ─── REFRESH QR (re-fetch a new QR for an existing waiting instance) ───
    if (action === "refresh-qr") {
      try {
        const connectRes = await fetch(`${evoUrl}/instance/connect/${instanceName}`, { headers: evoHeaders });
        if (!connectRes.ok) {
          // instance probably gone — recreate
          return await createFreshInstance();
        }
        const connectData = await connectRes.json();
        const qr = connectData?.base64 || connectData?.qrcode?.base64 || null;
        const state = connectData?.instance?.state || "waiting_qr";

        if (state !== "open" && !qr) {
          await destroyInstance();
          return await createFreshInstance();
        }

        await adminClient.from("whatsapp_instances").upsert({
          instance_name: instanceName,
          company_id: resolvedCompanyId,
          status: state === "open" ? "connected" : "waiting_qr",
          qrcode: qr,
          updated_at: new Date().toISOString(),
        }, { onConflict: "instance_name" });

        return json({ status: state === "open" ? "connected" : "waiting_qr", qrcode: qr });
      } catch (err) {
        console.error("[refresh-qr] error:", err);
        return json({ error: "Failed to refresh QR" }, 502);
      }
    }

    // ─── CHECK STATUS ───
    if (action === "check-status") {
      const stateRes = await fetch(`${evoUrl}/instance/connectionState/${instanceName}`, {
        headers: evoHeaders,
      });

      if (!stateRes.ok) {
        return json({ status: "disconnected" });
      }

      const stateData = await stateRes.json();
      const state = stateData?.instance?.state || "close";
      const mappedStatus = state === "open" ? "connected" : state === "connecting" ? "waiting_qr" : "disconnected";

      await adminClient.from("whatsapp_instances").upsert(
        {
          instance_name: instanceName,
          company_id: resolvedCompanyId,
          status: mappedStatus,
          connected_phone: mappedStatus === "connected" ? (stateData?.instance?.owner || null) : null,
          qrcode: mappedStatus === "connected" ? null : undefined,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "instance_name" }
      );

      return json({ status: mappedStatus, phone: stateData?.instance?.owner || null });
    }

    // ─── DISCONNECT ───
    if (action === "disconnect") {
      await fetch(`${evoUrl}/instance/logout/${instanceName}`, {
        method: "DELETE",
        headers: evoHeaders,
      });

      await adminClient.from("whatsapp_instances").upsert(
        {
          instance_name: instanceName,
          company_id: resolvedCompanyId,
          status: "disconnected",
          qrcode: null,
          connected_phone: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "instance_name" }
      );

      return json({ status: "disconnected" });
    }

    // ─── SEND MESSAGE ───
    if (action === "send-message") {
      const { remoteJid, content, chatId, quotedMessageId } = body;
      if (!remoteJid || !content) return json({ error: "remoteJid and content required" }, 400);

      const sendBody: Record<string, unknown> = {
        number: remoteJid,
        text: content,
      };

      if (quotedMessageId) {
        sendBody.quoted = {
          key: {
            remoteJid,
            fromMe: false,
            id: quotedMessageId,
          },
        };
      }

      const sendRes = await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
        method: "POST",
        headers: evoHeaders,
        body: JSON.stringify(sendBody),
      });

      if (!sendRes.ok) {
        const errText = await sendRes.text();
        return json({ error: "Failed to send message", details: errText }, 502);
      }

      const sendData = await sendRes.json();

      if (chatId) {
        await adminClient.from("whatsapp_messages").insert({
          chat_id: chatId,
          company_id: resolvedCompanyId,
          content,
          source: "outgoing",
          type: "text",
          is_from_me: true,
          sender_id: userId,
          message_id_external: sendData?.key?.id || null,
          origin: "panel_manual",
          timestamp: new Date().toISOString(),
        });

        // Update last_message_at and last_sender_id
        await adminClient.from("whatsapp_chats").update({
          last_message_at: new Date().toISOString(),
          unread_count: 0,
          last_sender_id: userId,
        }).eq("id", chatId);
      }

      return json({ success: true, messageId: sendData?.key?.id || null });
    }

    // ─── SEND MEDIA ───
    if (action === "send-media") {
      const { remoteJid, mediaUrl, caption, chatId, fileName, mediatype: clientMediaType, mimeType } = body;
      if (!remoteJid || !mediaUrl) return json({ error: "remoteJid and mediaUrl required" }, 400);

      // Determine Evolution API mediatype: image, video, audio, document
      let evoMediaType = clientMediaType || "document";
      if (!clientMediaType && mimeType) {
        if (mimeType.startsWith("image/")) evoMediaType = "image";
        else if (mimeType.startsWith("video/")) evoMediaType = "video";
        else if (mimeType.startsWith("audio/")) evoMediaType = "audio";
      }

      let sendRes: Response;
      let sendData: any;

      if (evoMediaType === "audio") {
        // Use dedicated WhatsApp audio endpoint for PTT voice messages
        sendRes = await fetch(`${evoUrl}/message/sendWhatsAppAudio/${instanceName}`, {
          method: "POST",
          headers: evoHeaders,
          body: JSON.stringify({
            number: remoteJid,
            audio: mediaUrl,
            encoding: true,
          }),
        });

        // Fallback to sendMedia if dedicated endpoint doesn't exist
        if (!sendRes.ok) {
          console.log("sendWhatsAppAudio failed, falling back to sendMedia");
          sendRes = await fetch(`${evoUrl}/message/sendMedia/${instanceName}`, {
            method: "POST",
            headers: evoHeaders,
            body: JSON.stringify({
              number: remoteJid,
              media: mediaUrl,
              mediatype: "audio",
              caption: "",
            }),
          });
        }
      } else {
        sendRes = await fetch(`${evoUrl}/message/sendMedia/${instanceName}`, {
          method: "POST",
          headers: evoHeaders,
          body: JSON.stringify({
            number: remoteJid,
            media: mediaUrl,
            mediatype: evoMediaType,
            caption: caption || "",
            ...(evoMediaType === "document" ? { fileName: fileName || "arquivo.pdf" } : {}),
          }),
        });
      }

      if (!sendRes.ok) {
        const errText = await sendRes.text();
        console.error("send-media error:", errText);
        return json({ error: "Failed to send media", details: errText }, 502);
      }

      sendData = await sendRes.json();

      // Determine DB type and media_type
      const dbType = evoMediaType === "image" ? "image" : evoMediaType === "video" ? "video" : evoMediaType === "audio" ? "audio" : "document";
      const dbMediaType = mimeType || (evoMediaType === "image" ? "image/jpeg" : evoMediaType === "video" ? "video/mp4" : evoMediaType === "audio" ? "audio/ogg" : "application/pdf");
      const defaultContent = evoMediaType === "image" ? "📷 Imagem" : evoMediaType === "video" ? "🎬 Vídeo" : evoMediaType === "audio" ? "🎤 Áudio" : `📎 ${fileName || "arquivo.pdf"}`;

      if (chatId) {
        await adminClient.from("whatsapp_messages").insert({
          chat_id: chatId,
          company_id: resolvedCompanyId,
          content: caption || defaultContent,
          source: "outgoing",
          type: dbType,
          is_from_me: true,
          sender_id: userId,
          message_id_external: sendData?.key?.id || null,
          media_url: mediaUrl,
          media_type: dbMediaType,
          origin: "panel_manual",
          timestamp: new Date().toISOString(),
        });

        await adminClient.from("whatsapp_chats").update({
          last_message_at: new Date().toISOString(),
          unread_count: 0,
          last_sender_id: userId,
        }).eq("id", chatId);
      }

      return json({ success: true, messageId: sendData?.key?.id || null });
    }

    // ─── FETCH MEDIA (base64) ───
    if (action === "fetch-media") {
      const { messageId, remoteJid: mediaJid, fromMe } = body;
      if (!messageId) return json({ error: "messageId required" }, 400);

      const key: Record<string, unknown> = { id: messageId };
      if (mediaJid) key.remoteJid = mediaJid;
      if (typeof fromMe === "boolean") key.fromMe = fromMe;

      const tryGetBase64 = async (payload: Record<string, unknown>, label: string) => {
        const res = await fetch(`${evoUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
          method: "POST",
          headers: evoHeaders,
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error(`fetch-media ${label} failed:`, res.status, errText);
          return { ok: false as const, errText };
        }

        const mediaData = await res.json();
        if (mediaData?.base64) {
          return { ok: true as const, mediaData };
        }

        return { ok: false as const, errText: "No base64 returned" };
      };

      // Try common payload formats used across different Evolution builds
      const payloadAttempts: Array<{ label: string; payload: Record<string, unknown> }> = [
        { label: "primary", payload: { message: { key }, convertToMp4: false } },
        { label: "minimal-key", payload: { message: { key: { id: messageId } }, convertToMp4: false } },
        { label: "root-key", payload: { key, convertToMp4: false } },
        { label: "root-id", payload: { id: messageId, convertToMp4: false } },
      ];

      let attempt: { ok: true; mediaData: any } | { ok: false; errText: string } = { ok: false, errText: "Unknown media fetch error" };

      for (const current of payloadAttempts) {
        attempt = await tryGetBase64(current.payload, current.label);
        if (attempt.ok) {
          return json({ base64: attempt.mediaData.base64, mimetype: attempt.mediaData?.mimetype || null });
        }
      }

      // Hydrate full message from history and retry with richer payloads
      const findPayloads = [
        { where: { key }, limit: 50 },
        { where: { key: { id: messageId } }, limit: 50 },
        { key, limit: 50 },
      ];

      let hydratedMessage: any = null;

      for (const payload of findPayloads) {
        const findRes = await fetch(`${evoUrl}/chat/findMessages/${instanceName}`, {
          method: "POST",
          headers: evoHeaders,
          body: JSON.stringify(payload),
        });

        if (!findRes.ok) continue;

        const findData = await findRes.json();
        const candidates = Array.isArray(findData)
          ? findData
          : Array.isArray(findData?.messages)
            ? findData.messages
            : Array.isArray(findData?.data)
              ? findData.data
              : Array.isArray(findData?.result)
                ? findData.result
                : [];

        hydratedMessage = candidates.find((m: any) => {
          const normalized = m?.message?.key ? m.message : m;
          const hasMedia = Boolean(
            normalized?.message?.imageMessage ||
            normalized?.message?.videoMessage ||
            normalized?.message?.audioMessage ||
            normalized?.message?.documentMessage ||
            normalized?.message?.stickerMessage
          );
          return normalized?.key?.id === messageId && hasMedia;
        });

        if (hydratedMessage) break;
      }

      if (hydratedMessage) {
        const normalized = hydratedMessage?.message?.key ? hydratedMessage.message : hydratedMessage;
        const hydratedAttempts: Array<{ label: string; payload: Record<string, unknown> }> = [
          { label: "hydrated-message", payload: { message: normalized, convertToMp4: false } },
          { label: "hydrated-key", payload: { message: { key: normalized?.key }, convertToMp4: false } },
        ];

        for (const current of hydratedAttempts) {
          attempt = await tryGetBase64(current.payload, current.label);
          if (attempt.ok) {
            return json({ base64: attempt.mediaData.base64, mimetype: attempt.mediaData?.mimetype || null });
          }
        }
      }

      // Non-fatal fallback: avoid bubbling 502 loops to the frontend when provider cannot resolve old media
      return json({
        base64: null,
        mimetype: null,
        error: "Media unavailable",
        details: attempt.errText || "Unknown media fetch error",
      });
    }

    // ─── FETCH CONTACTS ───
    if (action === "fetch-contacts") {
      const contactsRes = await fetch(`${evoUrl}/chat/contacts/${instanceName}`, {
        method: "POST",
        headers: evoHeaders,
        body: JSON.stringify({}),
      });

      if (!contactsRes.ok) {
        const altRes = await fetch(`${evoUrl}/chat/contacts/${instanceName}`, {
          headers: evoHeaders,
        });
        if (!altRes.ok) return json({ contacts: [] });
        const altData = await altRes.json();
        return json({ contacts: Array.isArray(altData) ? altData : [] });
      }

      const contactsData = await contactsRes.json();
      return json({ contacts: Array.isArray(contactsData) ? contactsData : [] });
    }

    // ─── FETCH GROUPS ───
    if (action === "fetch-groups") {
      const groupsRes = await fetch(`${evoUrl}/group/fetchAllGroups/${instanceName}?getParticipants=false`, {
        headers: evoHeaders,
      });

      if (!groupsRes.ok) return json({ groups: [] });

      const groupsData = await groupsRes.json();

      const rawGroups = Array.isArray(groupsData)
        ? groupsData
        : Array.isArray(groupsData?.groups)
          ? groupsData.groups
          : Array.isArray(groupsData?.data)
            ? groupsData.data
            : Array.isArray(groupsData?.result)
              ? groupsData.result
              : [];

      const groups = rawGroups
        .map((g: any) => {
          const jid = g?.id?._serialized || g?.id || g?.jid || g?.remoteJid || "";
          const subject = g?.subject || g?.name || g?.groupSubject || "";
          return { jid: String(jid), subject: String(subject).trim() };
        })
        .filter((g: { jid: string; subject: string }) => g.jid.includes("@g.us") && g.subject.length > 0);

      return json({ groups });
    }

    // ─── DELETE MESSAGE FOR EVERYONE ───
    if (action === "delete-message") {
      const { remoteJid, messageId: msgExtId, chatId: deleteChatId } = body;
      if (!remoteJid || !msgExtId) return json({ error: "remoteJid and messageId required" }, 400);

      const deleteRes = await fetch(`${evoUrl}/chat/deleteMessageForEveryone/${instanceName}`, {
        method: "DELETE",
        headers: evoHeaders,
        body: JSON.stringify({
          id: msgExtId,
          remoteJid,
          fromMe: true,
        }),
      });

      if (!deleteRes.ok) {
        const errText = await deleteRes.text();
        console.error("delete-message error:", errText);
        return json({ error: "Failed to delete message", details: errText }, 502);
      }

      // Remove from database
      if (deleteChatId && msgExtId) {
        await adminClient.from("whatsapp_messages").delete().eq("message_id_external", msgExtId).eq("chat_id", deleteChatId);
      }

      return json({ success: true });
    }

    // ─── FETCH EXTERNAL BOT SETTINGS ───
    if (action === "fetch-bot-settings") {
      try {
        // Try Typebot integration first
        const tbRes = await fetch(`${evoUrl}/typebot/find/${instanceName}`, { headers: evoHeaders });
        if (tbRes.ok) {
          const tbData = await tbRes.json();
          const isEnabled = tbData?.enabled === true || tbData?.typebot?.enabled === true;
          return json({ source: "typebot", enabled: isEnabled, data: tbData });
        }
      } catch { /* not available */ }

      try {
        // Try generic bot/settings endpoint
        const settingsRes = await fetch(`${evoUrl}/settings/find/${instanceName}`, { headers: evoHeaders });
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          const rejectCall = settingsData?.rejectCall === true || settingsData?.settings?.rejectCall === true;
          const msgOnReject = settingsData?.msgCall || settingsData?.settings?.msgCall || "";
          const readMessages = settingsData?.readMessages === true || settingsData?.settings?.readMessages === true;
          return json({ source: "settings", enabled: rejectCall || readMessages, rejectCall, msgOnReject, readMessages, data: settingsData });
        }
      } catch { /* not available */ }

      return json({ source: "none", enabled: false });
    }

    // ─── DISABLE EXTERNAL BOT ───
    if (action === "disable-external-bot") {
      const results: string[] = [];

      // Disable Typebot integration
      try {
        const tbRes = await fetch(`${evoUrl}/typebot/changeStatus/${instanceName}`, {
          method: "PUT", headers: evoHeaders,
          body: JSON.stringify({ status: "delete" }),
        });
        if (tbRes.ok) results.push("typebot disabled");
      } catch { /* not available */ }

      // Reset instance settings (disable auto-replies, reject calls etc)
      try {
        const setRes = await fetch(`${evoUrl}/settings/set/${instanceName}`, {
          method: "POST", headers: evoHeaders,
          body: JSON.stringify({ rejectCall: false, msgCall: "", readMessages: false, readStatus: false }),
        });
        if (setRes.ok) results.push("settings reset");
      } catch { /* not available */ }

      return json({ success: true, results });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("whatsapp-manager error:", err);
    return json({ error: "Internal error", details: String(err) }, 500);
  }
});
