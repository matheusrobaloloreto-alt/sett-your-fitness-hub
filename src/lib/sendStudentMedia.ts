// Envia um arquivo (ex.: o PDF do laudo da avaliação) DIRETO para o WhatsApp do aluno, via
// whatsapp-manager (action "send-media"): faz upload no bucket whatsapp-media, gera signedUrl e
// dispara o envio para a conversa do aluno. Reaproveita o mesmo fluxo do WhatsAppChat (outbound).
import { supabase } from "@/integrations/supabase/client";

export async function sendPdfToStudentWhatsApp(opts: {
  companyId: string;
  studentId: string;
  blob: Blob;
  fileName: string;
  caption?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { companyId, studentId, blob, fileName, caption } = opts;
  try {
    // 1. Conversa do aluno (remote_jid + chatId). Sem conversa, monta o JID pelo número do cadastro.
    const { data: chat } = await supabase
      .from("whatsapp_chats")
      .select("id, remote_jid")
      .eq("student_id", studentId)
      .limit(1)
      .maybeSingle();
    let remoteJid = (chat as any)?.remote_jid as string | undefined;
    const chatId = (chat as any)?.id as string | undefined;
    if (!remoteJid) {
      const { data: st } = await supabase.from("students").select("whatsapp, phone").eq("id", studentId).maybeSingle();
      const raw = String((st as any)?.whatsapp || (st as any)?.phone || "").replace(/\D/g, "");
      if (!raw) return { ok: false, error: "Aluno sem WhatsApp cadastrado e sem conversa aberta." };
      const withDdi = raw.startsWith("55") ? raw : `55${raw}`;
      remoteJid = `${withDdi}@s.whatsapp.net`;
    }

    // 2. Upload no bucket de mídia do WhatsApp + signedUrl (7 dias).
    const safe = fileName.replace(/[^\w.-]+/g, "_");
    const path = `${companyId}/${studentId}/${Date.now()}-${safe}`;
    const { error: upErr } = await supabase.storage
      .from("whatsapp-media")
      .upload(path, blob, { contentType: "application/pdf", upsert: true });
    if (upErr) return { ok: false, error: `upload: ${upErr.message}` };
    const { data: signed } = await supabase.storage.from("whatsapp-media").createSignedUrl(path, 60 * 60 * 24 * 7);
    if (!signed?.signedUrl) return { ok: false, error: "Falha ao gerar URL do arquivo." };

    // 3. Envia via whatsapp-manager (mesma action usada no chat para mídia outbound).
    const { data, error } = await supabase.functions.invoke("whatsapp-manager", {
      body: {
        action: "send-media",
        companyId,
        remoteJid,
        chatId: chatId ?? null,
        mediaUrl: signed.signedUrl,
        mediatype: "document",
        mimeType: "application/pdf",
        fileName,
        caption: caption ?? "",
      },
    });
    if (error || (data as any)?.error) {
      return { ok: false, error: (data as any)?.error || error?.message || "Falha ao enviar pelo WhatsApp." };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Erro inesperado no envio." };
  }
}
