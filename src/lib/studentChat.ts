// Primitivo compartilhado: "abrir o chat do aluno com uma mensagem pronta (rascunho)".
// Usado pelos botões de Aniversário, Renovação e Envio de anamnese. NÃO envia sozinho — só pré-preenche
// o painel persistente do WhatsApp, que consome cada pedido com um nonce. A rota só é fallback
// de compatibilidade. Nenhum fluxo abre WhatsApp externo: sem conversa vinculada, a tela interna
// abre um novo rascunho pelo telefone.
import type { NavigateFunction } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { paymentUrl } from "@/lib/publicFlowLinks";
import { requestWhatsAppChatPanel, type CompanyEventDraft } from "@/lib/whatsappChatPanel";
import { fetchCompanyProductSettings } from "@/lib/companyProductSettings";
import { WHATSAPP_EVENTS, type MessageEvent, type WhatsAppEvent } from '../../supabase/functions/_shared/company-product-settings';
import { eventMessage, eventMessageSequence, messageValues } from '../../supabase/functions/_shared/communication-policy';

export function eventDraftPreview(draft: CompanyEventDraft): string {
  return draft.parts.map((part, index) => `${index + 1}. ${part.type === 'text' ? part.text : `[${part.type}: ${part.media?.fileName || 'arquivo'}]${part.text ? `\n${part.text}` : ''}`}`).join('\n\n');
}

export async function draftCompanyEventSequence(companyId: string, event: MessageEvent, values: Record<string, string>, fallback: string): Promise<CompanyEventDraft> {
  if (!companyId || !(WHATSAPP_EVENTS as readonly string[]).includes(event)) throw new Error('whatsapp_event_company_required');
  const { settings, version } = await fetchCompanyProductSettings(companyId);
  const renderedValues = messageValues({ profissional: settings.brand.professional_name, email: settings.brand.support_email, prazo: String(settings.business.assessment_sla_business_days), ...values }, settings.brand.company_name);
  return {
    draftId: crypto.randomUUID(), companyId, event: event as WhatsAppEvent, settingsVersion: version,
    parts: version > 0 ? eventMessageSequence(settings, event as WhatsAppEvent, renderedValues, fallback) : [{ id: 'legacy', type: 'text', text: fallback }],
  };
}

export async function draftCompanyEventMessage(companyId: string, event: MessageEvent, values: Record<string, string>, fallback: string): Promise<string> {
  const { settings, version } = await fetchCompanyProductSettings(companyId);
  // Retained for old text callers. Never silently downgrade a configured sequence.
  if (version > 0 && settings.message_sequences?.[event as WhatsAppEvent]) throw new Error('Use draftCompanyEventSequence para revisar todas as mensagens e arquivos.');
  return version > 0 ? eventMessage(settings.messages, event, messageValues({ profissional: settings.brand.professional_name, email: settings.brand.support_email, ...values }, settings.brand.company_name), fallback) : fallback;
}

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

export function normalizeStudentChatPhone(phone?: string | null, countryCode?: string | null): string | null {
  if (!phone) return null;
  const raw = String(phone).trim();
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (/^\+(?!55)/.test(raw)) return /^[1-9]\d{7,14}$/.test(d) ? d : null;
  const country = String(countryCode || "").trim().toUpperCase();
  if (country && country !== "BR") return /^[1-9]\d{7,14}$/.test(d) ? d : null;
  if (d.length <= 11) d = "55" + d; // assume Brasil se vier sem DDI
  if (!/^55\d{10,11}$/.test(d)) return null;
  const local = d.slice(2);
  if (local.length === 11 && local[2] !== "9") return null;
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
  countryCode?: string | null;
  contactName?: string | null;
  message: string;
  companyId?: string;
  messageEvent?: MessageEvent;
  messageValues?: Record<string, string>;
  eventDraft?: CompanyEventDraft;
  onNoChat?: (message: string) => void;
}): Promise<void> {
  const { navigate, routePrefix, studentId, onNoChat } = opts;
  let message = opts.message;
  let eventDraft = opts.eventDraft;
  if (eventDraft && (!opts.companyId || eventDraft.companyId !== opts.companyId)) throw new Error('message_draft_company_mismatch');
  if (opts.messageEvent) {
    if (!opts.companyId) throw new Error('company_id_required_for_message_template');
    eventDraft = await draftCompanyEventSequence(opts.companyId, opts.messageEvent, opts.messageValues || {}, message);
    message = eventDraft.parts.length === 1 && eventDraft.parts[0].type === 'text' ? eventDraft.parts[0].text : '';
  }
  let resolvedChatId = opts.chatId ?? null;
  let resolvedPhone = opts.phone ?? null;
  let resolvedCountryCode = opts.countryCode ?? null;
  let contactName: string | null = opts.contactName ?? null;

  if (!resolvedChatId && studentId) {
    let chatQuery = supabase
      .from("whatsapp_chats")
      .select("id")
      .eq("student_id", studentId);
    if (opts.companyId) chatQuery = chatQuery.eq("company_id", opts.companyId);
    const { data: linkedChat, error } = await chatQuery
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    resolvedChatId = linkedChat?.id ?? null;
  }

  if ((!resolvedPhone || !contactName || !resolvedCountryCode) && studentId) {
    let studentQuery = supabase
      .from("students")
      .select("full_name, whatsapp, phone, country_code")
      .eq("id", studentId);
    if (opts.companyId) studentQuery = studentQuery.eq("company_id", opts.companyId);
    const { data, error } = await studentQuery.maybeSingle();
    if (error) throw error;
    if (opts.companyId && !data) throw new Error('student_company_mismatch');
    resolvedPhone = resolvedPhone || (data as any)?.whatsapp || (data as any)?.phone || null;
    contactName = (data as any)?.full_name || null;
    resolvedCountryCode = resolvedCountryCode || (data as any)?.country_code || null;
  }

  const digits = normalizeStudentChatPhone(resolvedPhone, resolvedCountryCode);
  if (!resolvedChatId && !digits) {
    if (onNoChat) {
      onNoChat(message);
      return;
    }
    if (eventDraft) throw new Error('Informe um destinatário válido para revisar a sequência completa.');
    void navigator.clipboard?.writeText(message);
    return;
  }

  const request = {
    ...(opts.companyId ? { companyId: opts.companyId } : {}),
    ...(eventDraft ? { eventDraft } : {}),
    chatId: resolvedChatId,
    studentId: studentId ?? null,
    phone: digits,
    contactName,
    prefillMessage: message,
    mode: "draft" as const,
  };

  // The app shell consumes this request and keeps the current page behind the
  // chat. The old route is intentionally retained as a compatibility fallback.
  if (!requestWhatsAppChatPanel(request)) {
    navigate(`/${routePrefix}/whatsapp-chat`, { state: request });
  }
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
