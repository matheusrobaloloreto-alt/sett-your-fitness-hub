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

function extractExternalMessageId(payload: any): string | null {
  const candidate =
    payload?.key?.id ||
    payload?.message?.key?.id ||
    payload?.data?.key?.id ||
    payload?.id ||
    null;
  return candidate ? String(candidate) : null;
}

function normalizeArrayPayload(payload: any, keys: string[]): any[] {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function truncatePreview(value: unknown): string | null {
  const text = String(value || "").trim();
  if (!text) return null;
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function buildQuotedMessage(preview: string | null, type?: string | null): Record<string, unknown> {
  if (type === "image") return { imageMessage: { caption: preview || "" } };
  if (type === "video") return { videoMessage: { caption: preview || "" } };
  if (type === "audio") return { audioMessage: {} };
  if (type === "document") return { documentMessage: { fileName: preview || "arquivo" } };
  if (type === "sticker") return { stickerMessage: {} };
  return { conversation: preview || "Mensagem" };
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
      "configure-history-sync",
    ]);
    if (adminOnlyActions.has(action) && !isPrivileged) {
      return json({ error: "Forbidden" }, 403);
    }

    const evoUrl = Deno.env.get("EVOLUTION_API_URL") || "";
    const evoKey = Deno.env.get("EVOLUTION_API_KEY") || "";
    const webhookSecret = Deno.env.get("WHATSAPP_WEBHOOK_SECRET") || "";

    if (!evoUrl || !evoKey || !webhookSecret) {
      if (action === "check-status") {
        return json({ status: "not_configured", configured: false });
      }
      return json({
        error: "Integração WhatsApp ainda não configurada no servidor.",
        code: "whatsapp_not_configured",
      }, 503);
    }

    const evoHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: evoKey,
    };

    // Resolve the user's own company once (used for defaulting + tenant validation).
    const { data: userCompanyId } = await adminClient.rpc("get_user_company_id", { _user_id: userId });

    // Resolve target company; default to the user's own company when not provided.
    let resolvedCompanyId = bodyCompanyId || userCompanyId || null;
    if (!resolvedCompanyId) return json({ error: "Company not found" }, 400);

    // SECURITY (IDOR): only master may operate on a company other than their own; every other
    // role is locked to their own company. This function uses the service-role client, which
    // bypasses RLS, so without this check a trusted bodyCompanyId would allow cross-tenant access.
    if (!hasMaster && resolvedCompanyId !== userCompanyId) {
      return json({ error: "Forbidden: company mismatch" }, 403);
    }

    // SECURITY (IDOR): when a chatId is supplied, ensure it belongs to this company
    // before any read/update/delete touches it (service-role bypasses RLS).
    if (body.chatId) {
      const { data: chatRow } = await adminClient
        .from("whatsapp_chats")
        .select("id")
        .eq("id", body.chatId)
        .eq("company_id", resolvedCompanyId)
        .maybeSingle();
      if (!chatRow) return json({ error: "Forbidden: chat not in company" }, 403);
    }

    // Look up instance_name from whatsapp_instances table
    const { data: instanceRow, error: instanceLookupError } = await adminClient
      .from("whatsapp_instances")
      .select("id, instance_name")
      .eq("company_id", resolvedCompanyId)
      .limit(1)
      .maybeSingle();
    if (instanceLookupError) {
      throw new Error(`Failed to load WhatsApp instance: ${instanceLookupError.message}`);
    }

    const instanceName = instanceRow?.instance_name || `company-${resolvedCompanyId}`;
    let persistedInstanceId = instanceRow?.id || null;

    const persistInstance = async (patch: Record<string, unknown>) => {
      const payload = {
        instance_name: instanceName,
        company_id: resolvedCompanyId,
        ...patch,
        updated_at: new Date().toISOString(),
      };

      const query = persistedInstanceId
        ? adminClient
          .from("whatsapp_instances")
          .update(payload)
          .eq("id", persistedInstanceId)
          .select("id")
          .maybeSingle()
        : adminClient
          .from("whatsapp_instances")
          .insert(payload)
          .select("id")
          .single();

      const { data, error } = await query;
      if (error) {
        throw new Error(`Failed to persist WhatsApp instance: ${error.message}`);
      }
      if (data?.id) persistedInstanceId = data.id;
    };

    // ─── Helper: create fresh instance ───
    const createFreshInstance = async () => {
      console.log("[createFreshInstance] Creating instance:", instanceName);
      const webhookUrl = new URL(`${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-webhook`);
      webhookUrl.searchParams.set("token", webhookSecret);
      const createRes = await fetch(`${evoUrl}/instance/create`, {
        method: "POST",
        headers: evoHeaders,
        body: JSON.stringify({
          instanceName,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
          syncFullHistory: true,
          webhook: {
            url: webhookUrl.toString(),
            headers: { "x-webhook-secret": webhookSecret },
            byEvents: false,
            base64: false,
            events: ["MESSAGES_UPSERT", "MESSAGES_SET", "CONNECTION_UPDATE"],
          },
        }),
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        return json({ error: "Evolution API error", details: errText }, 502);
      }

      const createData = await createRes.json();
      console.log("[createFreshInstance] Response:", JSON.stringify(createData));
      await persistInstance({
        status: "waiting_qr",
        qr_code: createData?.qrcode?.base64 || null,
      });

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
        await persistInstance({ status: "connected", qr_code: null });
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

      await persistInstance({
        status: state === "open" ? "connected" : "waiting_qr",
        qr_code: qr,
      });

      return json({
        status: state === "open" ? "connected" : "waiting_qr",
        qrcode: qr,
      });
    }

    // ─── RESTART CONNECTION ───
    if (action === "restart-connection") {
      console.log("Restarting instance:", instanceName);
      await destroyInstance();

      await persistInstance({
        status: "disconnected",
        qr_code: null,
        phone_number: null,
      });

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

        await persistInstance({
          status: state === "open" ? "connected" : "waiting_qr",
          qr_code: qr,
        });

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

      let connectedPhone: string | null = null;
      if (mappedStatus === "connected") {
        try {
          const detailsRes = await fetch(
            `${evoUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
            { headers: evoHeaders },
          );
          if (detailsRes.ok) {
            const detailsData = await detailsRes.json();
            const details = Array.isArray(detailsData) ? detailsData[0] : detailsData;
            const owner = details?.ownerJid || details?.instance?.owner || details?.owner || null;
            connectedPhone = owner ? String(owner).replace(/\D/g, "") : null;
          }
        } catch (error) {
          console.warn("[check-status] Failed to load connected phone:", error);
        }
      }

      await persistInstance({
        status: mappedStatus,
        phone_number: connectedPhone,
        ...(mappedStatus === "connected" ? { qr_code: null } : {}),
      });

      return json({ status: mappedStatus, phone: connectedPhone });
    }

    // ─── DISCONNECT ───
    if (action === "disconnect") {
      await fetch(`${evoUrl}/instance/logout/${instanceName}`, {
        method: "DELETE",
        headers: evoHeaders,
      });

      await persistInstance({
        status: "disconnected",
        qr_code: null,
        phone_number: null,
      });

      return json({ status: "disconnected" });
    }

    // ─── CONFIGURE HISTORY SYNC ───
    // Keeps future reconnects capable of restoring WhatsApp history without
    // resetting the currently connected instance.
    if (action === "configure-history-sync") {
      const settingsResponse = await fetch(`${evoUrl}/settings/find/${instanceName}`, {
        headers: evoHeaders,
      });
      const settingsPayload = settingsResponse.ok
        ? await settingsResponse.json().catch(() => ({}))
        : {};
      const currentSettings = settingsPayload?.settings || settingsPayload || {};
      const settingsUpdate = await fetch(`${evoUrl}/settings/set/${instanceName}`, {
        method: "POST",
        headers: evoHeaders,
        body: JSON.stringify({
          rejectCall: currentSettings.rejectCall === true,
          msgCall: currentSettings.msgCall || "",
          groupsIgnore: currentSettings.groupsIgnore === true,
          alwaysOnline: currentSettings.alwaysOnline === true,
          readMessages: currentSettings.readMessages === true,
          readStatus: currentSettings.readStatus === true,
          syncFullHistory: true,
        }),
      });
      if (!settingsUpdate.ok) {
        return json({ error: "Failed to enable WhatsApp history", details: await settingsUpdate.text() }, 502);
      }

      const webhookUrl = new URL(`${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-webhook`);
      webhookUrl.searchParams.set("token", webhookSecret);
      const webhookUpdate = await fetch(`${evoUrl}/webhook/set/${instanceName}`, {
        method: "POST",
        headers: evoHeaders,
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: webhookUrl.toString(),
            headers: { "x-webhook-secret": webhookSecret },
            byEvents: false,
            base64: false,
            events: ["MESSAGES_UPSERT", "MESSAGES_SET", "CONNECTION_UPDATE"],
          },
        }),
      });
      if (!webhookUpdate.ok) {
        return json({ error: "Failed to configure WhatsApp history webhook", details: await webhookUpdate.text() }, 502);
      }
      return json({ success: true, syncFullHistory: true });
    }

    // ─── SEND MESSAGE ───
    if (action === "send-message") {
      const {
        remoteJid,
        content,
        chatId,
        quotedMessageDbId,
        quotedMessageId,
        quotedFromMe,
        quotedMessageContent,
        quotedMessageType,
        studentId,
        contactName,
      } = body;
      if (!remoteJid || !content) return json({ error: "remoteJid and content required" }, 400);

      const sendBody: Record<string, unknown> = {
        number: remoteJid,
        text: content,
      };

      let quotedDbId: string | null = null;
      let quotedExternalId = quotedMessageId ? String(quotedMessageId) : null;
      let quotedPreview = truncatePreview(quotedMessageContent);
      let quotedSource = typeof quotedFromMe === "boolean"
        ? (quotedFromMe ? "outgoing" : "incoming")
        : null;
      let quotedType = typeof quotedMessageType === "string" ? quotedMessageType : null;

      if (quotedMessageDbId && chatId) {
        const { data: quotedRow, error: quotedError } = await adminClient
          .from("whatsapp_messages")
          .select("id, chat_id, content, source, type, media_type, message_id_external")
          .eq("id", quotedMessageDbId)
          .eq("chat_id", chatId)
          .eq("company_id", resolvedCompanyId)
          .maybeSingle();

        if (quotedError) {
          console.error("Failed to load quoted WhatsApp message:", quotedError.message);
        }

        if (quotedRow?.message_id_external) {
          quotedDbId = quotedRow.id;
          quotedExternalId = quotedRow.message_id_external;
          quotedPreview = truncatePreview(quotedRow.content) || (quotedRow.media_type ? "Mídia" : "Mensagem");
          quotedSource = quotedRow.source || quotedSource;
          quotedType = quotedRow.type || quotedType;
        }
      }

      if (quotedExternalId) {
        const quoteFromMe = quotedSource === "outgoing" || quotedFromMe === true;
        const quotedMessage = buildQuotedMessage(quotedPreview, quotedType);
        const quoteKey = {
          remoteJid,
          fromMe: quoteFromMe,
          id: quotedExternalId,
        };

        // Evolution v2 accepts `quoted`, but some builds require the quoted message
        // payload as well as the key for WhatsApp to render the native reply card.
        sendBody.quoted = {
          key: quoteKey,
          message: quotedMessage,
        };
        sendBody.contextInfo = {
          stanzaId: quotedExternalId,
          participant: quoteFromMe ? undefined : remoteJid,
          quotedMessage,
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
      const externalMessageId = extractExternalMessageId(sendData);
      let persistenceWarning = false;

      let persistedChatId = chatId || null;
      if (!persistedChatId) {
        const digits = String(remoteJid).replace(/\D/g, "");
        const databaseRemoteJid = String(remoteJid).includes("@")
          ? String(remoteJid)
          : `${digits}@s.whatsapp.net`;
        const { data: createdChat, error: chatError } = await adminClient
          .from("whatsapp_chats")
          .upsert({
            company_id: resolvedCompanyId,
            instance_id: instanceRow?.id || null,
            remote_jid: databaseRemoteJid,
            contact_name: contactName || null,
            student_id: studentId || null,
            last_message: content,
            last_message_at: new Date().toISOString(),
            unread_count: 0,
          }, { onConflict: "instance_id,remote_jid" })
          .select("id")
          .single();
        if (chatError) {
          console.error("Failed to persist new WhatsApp chat:", chatError.message);
          persistenceWarning = true;
        } else {
          persistedChatId = createdChat.id;
        }
      }

      let insertedMessage: Record<string, unknown> | null = null;
      if (persistedChatId) {
        const { data: insertedRow, error: messageInsertError } = await adminClient.from("whatsapp_messages").insert({
          chat_id: persistedChatId,
          company_id: resolvedCompanyId,
          content,
          source: "outgoing",
          type: "text",
          is_from_me: true,
          sender_id: userId,
          message_id_external: externalMessageId,
          quoted_message_id: quotedDbId,
          quoted_message_external_id: quotedExternalId,
          quoted_message_preview: quotedPreview,
          quoted_message_source: quotedSource,
          origin: "panel_manual",
          timestamp: new Date().toISOString(),
        }).select("*").maybeSingle();
        if (messageInsertError && messageInsertError.code !== "23505") {
          persistenceWarning = true;
          console.error("Failed to persist sent WhatsApp message:", messageInsertError.message);
        }
        if (insertedRow) insertedMessage = insertedRow;

        // Update last_message_at and last_sender_id
        const { error: chatUpdateError } = await adminClient.from("whatsapp_chats").update({
          last_message: content,
          last_message_at: new Date().toISOString(),
          unread_count: 0,
          last_sender_id: userId,
        }).eq("id", persistedChatId);
        if (chatUpdateError) {
          persistenceWarning = true;
          console.error("Failed to update WhatsApp chat preview:", chatUpdateError.message);
        }
      }

      return json({
        success: true,
        messageId: externalMessageId,
        chatId: persistedChatId,
        message: insertedMessage,
        persistenceWarning,
      });
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
      const externalMessageId = extractExternalMessageId(sendData);
      let persistenceWarning = false;

      // Determine DB type and media_type
      const dbType = evoMediaType === "image" ? "image" : evoMediaType === "video" ? "video" : evoMediaType === "audio" ? "audio" : "document";
      const dbMediaType = mimeType || (evoMediaType === "image" ? "image/jpeg" : evoMediaType === "video" ? "video/mp4" : evoMediaType === "audio" ? "audio/ogg" : "application/pdf");
      const defaultContent = evoMediaType === "image" ? "📷 Imagem" : evoMediaType === "video" ? "🎬 Vídeo" : evoMediaType === "audio" ? "🎤 Áudio" : `📎 ${fileName || "arquivo.pdf"}`;

      let insertedMediaMessage: Record<string, unknown> | null = null;
      if (chatId) {
        const { data: insertedMediaRow, error: messageInsertError } = await adminClient.from("whatsapp_messages").insert({
          chat_id: chatId,
          company_id: resolvedCompanyId,
          content: caption || defaultContent,
          source: "outgoing",
          type: dbType,
          is_from_me: true,
          sender_id: userId,
          message_id_external: externalMessageId,
          media_url: mediaUrl,
          media_type: dbMediaType,
          origin: "panel_manual",
          timestamp: new Date().toISOString(),
        }).select("*").maybeSingle();
        if (messageInsertError && messageInsertError.code !== "23505") {
          persistenceWarning = true;
          console.error("Failed to persist sent WhatsApp media:", messageInsertError.message);
        }
        if (insertedMediaRow) insertedMediaMessage = insertedMediaRow;

        const { error: chatUpdateError } = await adminClient.from("whatsapp_chats").update({
          last_message: caption || defaultContent,
          last_message_at: new Date().toISOString(),
          unread_count: 0,
          last_sender_id: userId,
        }).eq("id", chatId);
        if (chatUpdateError) {
          persistenceWarning = true;
          console.error("Failed to update WhatsApp media preview:", chatUpdateError.message);
        }
      }

      return json({ success: true, messageId: externalMessageId, message: insertedMediaMessage, persistenceWarning });
    }

    // ─── FETCH PROFILE PICTURE ───
    // Evolution's contacts endpoint does not consistently include profilePicUrl.
    // Resolve one visible conversation on demand to keep chat loading fast.
    if (action === "fetch-profile-picture") {
      if (!body.chatId) return json({ error: "chatId required" }, 400);

      const { data: chat, error: chatError } = await adminClient
        .from("whatsapp_chats")
        .select("id, remote_jid")
        .eq("id", body.chatId)
        .eq("company_id", resolvedCompanyId)
        .maybeSingle();
      if (chatError) throw new Error(`Failed to load chat profile: ${chatError.message}`);
      if (!chat?.remote_jid) return json({ photo: null });

      const profileRes = await fetch(`${evoUrl}/chat/fetchProfilePictureUrl/${instanceName}`, {
        method: "POST",
        headers: evoHeaders,
        body: JSON.stringify({ number: chat.remote_jid }),
      });
      if (!profileRes.ok) return json({ photo: null });

      const profileData = await profileRes.json().catch(() => ({}));
      const photo = String(
        profileData?.profilePictureUrl ||
        profileData?.profilePicUrl ||
        profileData?.pictureUrl ||
        profileData?.picture ||
        "",
      ).trim();

      if (photo) {
        const { error: photoError } = await adminClient
          .from("whatsapp_chats")
          .update({ contact_photo: photo })
          .eq("id", chat.id)
          .eq("company_id", resolvedCompanyId);
        if (photoError) console.error("profile picture persistence failed", photoError.message);
      }

      return json({ photo: photo || null });
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
      const contactsRes = await fetch(`${evoUrl}/chat/findContacts/${instanceName}`, {
        method: "POST",
        headers: evoHeaders,
        body: JSON.stringify({}),
      });

      if (!contactsRes.ok) {
        // Compatibility fallback for older Evolution API releases.
        const altRes = await fetch(`${evoUrl}/chat/contacts/${instanceName}`, {
          method: "POST",
          headers: evoHeaders,
          body: JSON.stringify({}),
        });
        if (!altRes.ok) return json({ contacts: [] });
        const altData = await altRes.json();
        return json({ contacts: normalizeArrayPayload(altData, ["contacts", "data", "result"]) });
      }

      const contactsData = await contactsRes.json();
      return json({ contacts: normalizeArrayPayload(contactsData, ["contacts", "data", "result"]) });
    }

    // ─── FETCH GROUPS ───
    if (action === "fetch-groups") {
      const groupsRes = await fetch(`${evoUrl}/group/fetchAllGroups/${instanceName}?getParticipants=false`, {
        headers: evoHeaders,
      });

      if (!groupsRes.ok) return json({ groups: [] });

      const groupsData = await groupsRes.json();

      const rawGroups = normalizeArrayPayload(groupsData, ["groups", "data", "result"]);

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
