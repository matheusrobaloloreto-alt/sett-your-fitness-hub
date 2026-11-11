import { supabase } from "@/integrations/supabase/client";
import type { WhatsAppAssessmentVideoHandoff } from "@/lib/whatsappAssessmentHandoff";

interface WhatsAppFetchMediaResponse {
  base64?: string | null;
  mimetype?: string | null;
  mediaUrl?: string | null;
}

function base64VideoBlob(base64: string, mimeType: string): Blob {
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

async function fetchVideoBlob(url: string): Promise<Blob> {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error(`Falha ao baixar o vídeo (HTTP ${response.status}).`);
  const blob = await response.blob();
  if (blob.type && !blob.type.startsWith("video/")) {
    throw new Error("A mídia recebida não é um vídeo válido.");
  }
  return blob;
}

export async function resolveWhatsAppAssessmentVideoBlob({
  handoff,
  companyId,
  studentId,
}: {
  handoff: WhatsAppAssessmentVideoHandoff;
  companyId: string;
  studentId: string;
}): Promise<Blob> {
  if (handoff.studentId !== studentId) {
    throw new Error("Este vídeo pertence a outro aluno. Volte à conversa correta e tente novamente.");
  }

  const { data: chat, error: chatError } = await supabase
    .from("whatsapp_chats")
    .select("id, company_id, student_id, remote_jid")
    .eq("id", handoff.chatId)
    .eq("company_id", companyId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (chatError || !chat) {
    throw new Error("A conversa não pertence a este aluno ou a esta empresa.");
  }

  const { data: message, error: messageError } = await supabase
    .from("whatsapp_messages")
    .select("id, chat_id, company_id, source, type, media_type, media_url, media_storage_path, message_id_external, sender_id")
    .eq("id", handoff.messageId)
    .eq("chat_id", handoff.chatId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (messageError || !message) {
    throw new Error("A mensagem de vídeo não foi encontrada nesta conversa.");
  }
  if (handoff.messageExternalId && message.message_id_external && handoff.messageExternalId !== message.message_id_external) {
    throw new Error("A identidade da mensagem mudou. Reabra o vídeo na conversa e tente novamente.");
  }
  if (message.source !== "incoming") {
    throw new Error("Somente vídeos recebidos do aluno podem iniciar esta avaliação.");
  }
  if (message.type !== "video" && !message.media_type?.startsWith("video/")) {
    throw new Error("A mensagem selecionada não contém um vídeo.");
  }

  const storagePath = message.media_storage_path;
  if (handoff.mediaStoragePath && storagePath && handoff.mediaStoragePath !== storagePath) {
    throw new Error("A referência do vídeo mudou. Reabra a mensagem e tente novamente.");
  }
  if (storagePath) {
    const expectedPrefix = `${companyId}/${handoff.chatId}/`;
    if (!storagePath.startsWith(expectedPrefix)) {
      throw new Error("O vídeo não está vinculado à conversa selecionada.");
    }
    const { data: storedVideo, error: storageError } = await supabase.storage
      .from("whatsapp-media")
      .download(storagePath)
      // The SDK can reject while consuming the body after receiving HTTP 200.
      // Treat that transport failure like its returned StorageError result.
      .catch((error: unknown) => ({ data: null, error }));
    if (!storageError && storedVideo) {
      if (storedVideo.type && !storedVideo.type.startsWith("video/")) {
        throw new Error("O arquivo armazenado não é um vídeo válido.");
      }
      return storedVideo;
    }

    try {
      const { data: signedVideo, error: signedError } = await supabase.storage
        .from("whatsapp-media")
        .createSignedUrl(storagePath, 300);
      if (!signedError && signedVideo?.signedUrl) {
        return await fetchVideoBlob(signedVideo.signedUrl);
      }
    } catch {
      // Continue with authenticated recovery of this same validated message.
    }
  }

  if (message.message_id_external) {
    const { data: fetched, error: fetchError } = await supabase.functions.invoke<WhatsAppFetchMediaResponse>("whatsapp-manager", {
      body: {
        action: "fetch-media",
        companyId,
        chatId: handoff.chatId,
        messageDbId: handoff.messageId,
        messageId: message.message_id_external,
        remoteJid: message.sender_id || chat.remote_jid,
        fromMe: false,
        mimeType: message.media_type,
      },
    }).catch((error: unknown) => ({ data: null, error }));
    if (!fetchError && fetched?.mediaUrl) {
      try {
        return await fetchVideoBlob(fetched.mediaUrl);
      } catch {
        // Em navegadores que bloqueiam o fetch da signed URL, usa o base64
        // autenticado retornado pela mesma função como último fallback.
      }
    }
    if (!fetchError && fetched?.base64) {
      const mimeType = fetched.mimetype || message.media_type || "video/mp4";
      if (!mimeType.startsWith("video/")) throw new Error("A mídia recuperada não é um vídeo.");
      return base64VideoBlob(fetched.base64, mimeType);
    }
  }

  // A URL é o último recurso e vem da linha validada no banco. O valor do
  // history.state nunca é usado para apontar para outra mídia.
  if (message.media_url) {
    try {
      return await fetchVideoBlob(message.media_url);
    } catch {
      // Preserve the handoff so the explicit retry can reload the original video.
    }
  }

  throw new Error("Não foi possível concluir o download do vídeo. Tente carregar novamente ou reabra a mídia na conversa.");
}

