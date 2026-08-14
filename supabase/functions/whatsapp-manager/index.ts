import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  directWhatsAppJidVariants,
  storageObjectPathFromUrl,
} from "../_shared/whatsappIdentity.ts";

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
  return mimetype.split("/")[1]?.split(";")[0]?.replace(/[^a-z0-9]/gi, "") || "bin";
}

function decodeBase64(base64: string) {
  const clean = base64.includes(",") ? base64.split(",").pop() || "" : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function persistRemoteFile(args: {
  adminClient: any;
  bucket: string;
  url: string;
  filePath: string;
  fallbackMime: string;
  signedSeconds?: number;
}) {
  const response = await fetch(args.url);
  if (!response.ok) return null;

  const contentType = response.headers.get("content-type") || args.fallbackMime;
  const bytes = new Uint8Array(await response.arrayBuffer());
  const pathWithExtension = args.filePath.includes(".")
    ? args.filePath
    : `${args.filePath}.${extensionFromMime(contentType)}`;

  const { error: uploadError } = await args.adminClient.storage
    .from(args.bucket)
    .upload(pathWithExtension, bytes, { contentType, upsert: true });
  if (uploadError) {
    console.error("remote file persistence upload failed:", uploadError.message);
    return null;
  }

  const { data: signed } = await args.adminClient.storage
    .from(args.bucket)
    .createSignedUrl(pathWithExtension, args.signedSeconds || 60 * 60 * 24 * 30);
  return signed?.signedUrl || null;
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

    const evoHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: evoKey,
    };

    // Resolve the user's own company once (used for defaulting + tenant validation).
    const { data: userCompanyId } = await adminClient.rpc("get_user_company_id", { _user_id: userId });

    // Resolve target company; default to the user's own company when not provided.
    const resolvedCompanyId = bodyCompanyId || userCompanyId || null;
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

    // Read/unread is application state and must not depend on the external
    // WhatsApp provider being online. The service-role update is safe only
    // after the authenticated tenant and chat ownership checks above.
    if (action === "set-read-state") {
      if (!body.chatId || typeof body.unread !== "boolean") {
        return json({ error: "chatId and unread are required" }, 400);
      }
      const unreadCount = body.unread ? 1 : 0;
      const { data: updatedChat, error: updateError } = await adminClient
        .from("whatsapp_chats")
        .update({ unread_count: unreadCount })
        .eq("id", body.chatId)
        .eq("company_id", resolvedCompanyId)
        .select("id, unread_count")
        .single();
      if (updateError) {
        console.error("Failed to update WhatsApp read state:", updateError.message);
        return json({ error: "Failed to update read state" }, 500);
      }
      return json(updatedChat);
    }

    if (!evoUrl || !evoKey || !webhookSecret) {
      if (action === "check-status") {
        return json({ status: "not_configured", configured: false });
      }
      return json({
        error: "Integração WhatsApp ainda não configurada no servidor.",
        code: "whatsapp_not_configured",
      }, 503);
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
      const webhookPayloads = [
        {
          webhook: {
            enabled: true,
            url: webhookUrl.toString(),
            headers: { "x-webhook-secret": webhookSecret },
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
          events: ["MESSAGES_UPSERT", "MESSAGES_SET", "messages.upsert", "messages.set", "CONNECTION_UPDATE", "connection.update"],
          headers: { "x-webhook-secret": webhookSecret },
        },
      ];
      let webhookConfigured = false;
      let webhookError = "";
      for (const payload of webhookPayloads) {
        const webhookUpdate = await fetch(`${evoUrl}/webhook/set/${instanceName}`, {
          method: "POST",
          headers: evoHeaders,
          body: JSON.stringify(payload),
        });
        if (webhookUpdate.ok) {
          webhookConfigured = true;
          break;
        }
        webhookError = await webhookUpdate.text();
      }
      if (!webhookConfigured) {
        return json({ error: "Failed to configure WhatsApp history webhook", details: webhookError }, 502);
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
        let existingChat: { id: string } | null = null;
        if (instanceRow?.id) {
          const { data } = await adminClient
            .from("whatsapp_chats")
            .select("id")
            .eq("company_id", resolvedCompanyId)
            .eq("instance_id", instanceRow.id)
            .in("remote_jid", directWhatsAppJidVariants(databaseRemoteJid))
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          existingChat = data;
        }
        const chatPayload = {
          company_id: resolvedCompanyId,
          instance_id: instanceRow?.id || null,
          remote_jid: databaseRemoteJid,
          contact_name: contactName || null,
          student_id: studentId || null,
          last_message: content,
          last_message_at: new Date().toISOString(),
          unread_count: 0,
        };
        const chatQuery = existingChat
          ? adminClient.from("whatsapp_chats").update(chatPayload).eq("id", existingChat.id).select("id").single()
          : adminClient.from("whatsapp_chats").insert(chatPayload).select("id").single();
        const { data: createdChat, error: chatError } = await chatQuery;
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
        if (messageInsertError) {
          if (messageInsertError.code === "23505" && externalMessageId) {
            const { data: racedRow } = await adminClient.from("whatsapp_messages")
              .select("*")
              .eq("chat_id", persistedChatId)
              .eq("message_id_external", externalMessageId)
              .maybeSingle();
            if (racedRow) insertedMessage = racedRow;
          } else {
            persistenceWarning = true;
            console.error("Failed to persist sent WhatsApp message:", messageInsertError.message);
          }
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

      const sendData = await sendRes.json();
      const externalMessageId = extractExternalMessageId(sendData);
      let persistenceWarning = false;

      // Determine DB type and media_type
      const dbType = evoMediaType === "image" ? "image" : evoMediaType === "video" ? "video" : evoMediaType === "audio" ? "audio" : "document";
      const dbMediaType = mimeType || (evoMediaType === "image" ? "image/jpeg" : evoMediaType === "video" ? "video/mp4" : evoMediaType === "audio" ? "audio/ogg" : "application/pdf");
      const defaultContent = evoMediaType === "image" ? "📷 Imagem" : evoMediaType === "video" ? "🎬 Vídeo" : evoMediaType === "audio" ? "🎤 Áudio" : `📎 ${fileName || "arquivo.pdf"}`;
      const mediaStoragePath = storageObjectPathFromUrl(mediaUrl, "whatsapp-media");

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
          media_storage_path: mediaStoragePath,
          origin: "panel_manual",
          timestamp: new Date().toISOString(),
        }).select("*").maybeSingle();
        if (messageInsertError) {
          if (messageInsertError.code === "23505" && externalMessageId) {
            const { data: racedRow } = await adminClient.from("whatsapp_messages")
              .select("*")
              .eq("chat_id", chatId)
              .eq("message_id_external", externalMessageId)
              .maybeSingle();
            if (racedRow) insertedMediaMessage = racedRow;
          } else {
            persistenceWarning = true;
            console.error("Failed to persist sent WhatsApp media:", messageInsertError.message);
          }
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

      const phoneBase = String(chat.remote_jid).replace(/@.*$/, "");
      const photoPayloads = [
        { number: chat.remote_jid },
        { number: phoneBase },
        phoneBase.startsWith("55") ? { number: phoneBase.slice(2) } : null,
      ].filter(Boolean) as Array<Record<string, string>>;

      let photo = "";
      for (const payload of photoPayloads) {
        const profileRes = await fetch(`${evoUrl}/chat/fetchProfilePictureUrl/${instanceName}`, {
          method: "POST",
          headers: evoHeaders,
          body: JSON.stringify(payload),
        });
        if (!profileRes.ok) continue;

        const profileData = await profileRes.json().catch(() => ({}));
        photo = String(
          profileData?.profilePictureUrl ||
          profileData?.profilePicUrl ||
          profileData?.pictureUrl ||
          profileData?.picture ||
          "",
        ).trim();
        if (photo) break;
      }

      if (photo) {
        const durablePhoto = await persistRemoteFile({
          adminClient,
          bucket: "whatsapp-media",
          url: photo,
          filePath: `${resolvedCompanyId}/${chat.id}/avatar`,
          fallbackMime: "image/jpeg",
        }).catch((error) => {
          console.error("profile picture durable persistence failed", String(error));
          return null;
        });
        const storedPhoto = durablePhoto || photo;
        const { error: photoError } = await adminClient
          .from("whatsapp_chats")
          .update({ contact_photo: storedPhoto })
          .eq("id", chat.id)
          .eq("company_id", resolvedCompanyId);
        if (photoError) console.error("profile picture persistence failed", photoError.message);
        return json({ photo: storedPhoto });
      }

      return json({ photo: null });
    }

    // ─── FETCH MEDIA (base64) ───
    if (action === "fetch-media") {
      const { messageId, remoteJid: mediaJid, fromMe, chatId: mediaChatId, messageDbId, mimeType: requestedMimeType } = body;
      if (!messageId) return json({ error: "messageId required" }, 400);

      if (mediaChatId && messageDbId) {
        const { data: storedMessage } = await adminClient
          .from("whatsapp_messages")
          .select("media_storage_path, media_url, media_type")
          .eq("id", messageDbId)
          .eq("chat_id", mediaChatId)
          .eq("company_id", resolvedCompanyId)
          .maybeSingle();
        const storagePath = storedMessage?.media_storage_path
          || storageObjectPathFromUrl(storedMessage?.media_url, "whatsapp-media");
        if (storagePath) {
          const { data: signed, error: signError } = await adminClient.storage
            .from("whatsapp-media")
            .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
          if (!signError && signed?.signedUrl) {
            await adminClient.from("whatsapp_messages")
              .update({
                media_url: signed.signedUrl,
                media_storage_path: storagePath,
              })
              .eq("id", messageDbId)
              .eq("chat_id", mediaChatId)
              .eq("company_id", resolvedCompanyId);
            return json({
              base64: null,
              mimetype: storedMessage?.media_type || requestedMimeType || null,
              mediaUrl: signed.signedUrl,
              source: "storage",
            });
          }
        }
      }

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

      const persistFetchedMedia = async (mediaData: any) => {
        const mimetype = mediaData?.mimetype || requestedMimeType || "application/octet-stream";
        if (!mediaChatId || !messageDbId || !mediaData?.base64) {
          return { base64: mediaData?.base64 || null, mimetype, mediaUrl: null };
        }
        try {
          const bytes = decodeBase64(String(mediaData.base64));
          const filePath = `${resolvedCompanyId}/${mediaChatId}/inbound-${messageId}.${extensionFromMime(mimetype)}`;
          const { error: uploadError } = await adminClient.storage
            .from("whatsapp-media")
            .upload(filePath, bytes, { contentType: mimetype, upsert: true });
          if (uploadError) throw uploadError;

          const { data: signed } = await adminClient.storage
            .from("whatsapp-media")
            .createSignedUrl(filePath, 60 * 60 * 24 * 7);
          const mediaUrl = signed?.signedUrl || null;
          if (mediaUrl) {
            const { error: updateError } = await adminClient
              .from("whatsapp_messages")
              .update({ media_url: mediaUrl, media_type: mimetype, media_storage_path: filePath })
              .eq("id", messageDbId)
              .eq("chat_id", mediaChatId)
              .eq("company_id", resolvedCompanyId);
            if (updateError) console.error("fetch-media persistence update failed:", updateError.message);
          }
          return { base64: mediaData.base64, mimetype, mediaUrl };
        } catch (error) {
          console.error("fetch-media persistence failed:", String(error));
          return { base64: mediaData.base64, mimetype, mediaUrl: null };
        }
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
          return json(await persistFetchedMedia(attempt.mediaData));
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
            return json(await persistFetchedMedia(attempt.mediaData));
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
