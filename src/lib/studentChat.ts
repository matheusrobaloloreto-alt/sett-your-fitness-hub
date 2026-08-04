// Primitivo compartilhado: "abrir o chat do aluno com uma mensagem pronta (rascunho)".
// Usado pelos botões de Aniversário, Renovação e Envio de anamnese. NÃO envia sozinho — só pré-preenche
// a caixa de texto do WhatsAppChat (que lê location.state.prefillMessage). Nenhum fluxo abre
// WhatsApp externo: sem conversa vinculada, a tela interna abre um novo rascunho pelo telefone.
import type { NavigateFunction } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { paymentUrl } from "@/lib/publicFlowLinks";

// Mapa student_id -> chat_id (whatsapp_chats), escopo por empresa quando informado.
export async function buildStudentChatMap(companyId?: string | null): Promise<Record<string, string>> {
  let q = supabase.from("whatsapp_chats").select("id, student_id").not("student_id", "is", null);
  if (companyId) q = q.eq("company_id", companyId);
  const { data } = await q;
  const map: Record<string, string> = {};
  (data ?? []).forEach((c: any) => {
    if (c.student_id && !map[c.student_id]) map[c.student_id] = c.id;
  });
  return map;
}

function waDigits(phone?: string | null): string | null {
  if (!phone) return null;
  let d = String(phone).replace(/\D/g, "");
  if (!d) return null;
  if (d.length <= 11) d = "55" + d; // assume Brasil se vier sem DDI
  return d;
}

// Abre o chat interno do aluno com a mensagem pronta. Sem conversa vinculada, a tela
// interna recebe o telefone e prepara uma nova conversa. Sem telefone, usa onNoChat.
export async function openStudentChat(opts: {
  navigate: NavigateFunction;
  routePrefix: string;
  chatId?: string | null;
  studentId?: string | null;
  phone?: string | null;
  contactName?: string | null;
  message: string;
  onNoChat?: (message: string) => void;
}): Promise<void> {
  const { navigate, routePrefix, studentId, message, onNoChat } = opts;
  let resolvedChatId = opts.chatId ?? null;
  let resolvedPhone = opts.phone ?? null;
  let contactName: string | null = opts.contactName ?? null;

  if (!resolvedChatId && studentId) {
    const { data: linkedChat } = await supabase
      .from("whatsapp_chats")
      .select("id")
      .eq("student_id", studentId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    resolvedChatId = linkedChat?.id ?? null;
  }

  if ((!resolvedPhone || !contactName) && studentId) {
    const { data } = await supabase
      .from("students")
      .select("full_name, whatsapp, phone")
      .eq("id", studentId)
      .maybeSingle();
    resolvedPhone = resolvedPhone || (data as any)?.whatsapp || (data as any)?.phone || null;
    contactName = (data as any)?.full_name || null;
  }

  const digits = waDigits(resolvedPhone);
  if (!resolvedChatId && !digits) {
    if (onNoChat) {
      onNoChat(message);
      return;
    }
    void navigator.clipboard?.writeText(message);
    return;
  }

  navigate(`/${routePrefix}/whatsapp-chat`, {
    state: {
      chatId: resolvedChatId,
      studentId: studentId ?? null,
      phone: digits,
      contactName,
      prefillMessage: message,
    },
  });
}

const firstName = (full?: string | null) => (full ?? "").trim().split(/\s+/)[0] || "";

// Cria um link opaco e temporário. O UUID do aluno nunca funciona como credencial
// pública de checkout.
export async function createPlansLink(studentId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("public-payment-context", {
    body: { action: "create-link", studentId },
  });
  if (error || !data?.token) {
    throw new Error(data?.error || error?.message || "Não foi possível criar o link de pagamento.");
  }
  return paymentUrl(window.location.origin, data.token);
}

export function birthdayMessage(fullName?: string | null): string {
  const nome = firstName(fullName);
  return `Feliz aniversário, ${nome}! 🎉 Que esse novo ciclo venha cheio de saúde, energia e conquistas. Tamo junto pra você chegar nos seus objetivos. 💪`;
}

export function renewalMessage(opts: {
  fullName?: string | null;
  planName?: string | null;
  daysLeft?: number | null;
  paymentLink: string;
  overdue?: boolean;
}): string {
  const nome = firstName(opts.fullName);
  const plano = opts.planName ? ` ${opts.planName}` : "";
  const link = opts.paymentLink;
  if (opts.overdue) {
    return `Oi, ${nome}! Seu plano${plano} venceu e seu acesso aos treinos pode ser interrompido. Pra regularizar e continuar evoluindo, é só renovar por aqui: ${link}`;
  }
  const prazo =
    typeof opts.daysLeft === "number"
      ? ` (faltam ${opts.daysLeft} ${opts.daysLeft === 1 ? "dia" : "dias"})`
      : "";
  return `Oi, ${nome}! Seu plano${plano} está chegando ao fim${prazo}. Pra continuar sem interromper seus treinos, renove por aqui: ${link}`;
}
