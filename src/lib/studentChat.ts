import { sameWhatsAppRecipient } from '../../supabase/functions/_shared/whatsappIdentity';
import { readEdgeError } from '@/lib/edgeError';
// Primitivo compartilhado: "abrir o chat do aluno com uma mensagem pronta (rascunho)".
// Usado pelos botões de Aniversário, Renovação e Envio de anamnese. NÃO envia sozinho — só pré-preenche
// o painel persistente do WhatsApp, que consome cada pedido com um nonce. A rota só é fallback
// de compatibilidade. Nenhum fluxo abre WhatsApp externo: sem conversa vinculada, a tela interna
// abre um novo rascunho pelo telefone.
import type { NavigateFunction } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { paymentUrl } from "@/lib/publicFlowLinks";
import { requestWhatsAppChatPanel, transientLoginNavigation, type CompanyEventDraft } from "@/lib/whatsappChatPanel";
import { fetchCompanyProductSettings } from "@/lib/companyProductSettings";
import { DEFAULT_COMPANY_PRODUCT_SETTINGS, WHATSAPP_EVENTS, type MessageEvent, type WhatsAppEvent } from '../../supabase/functions/_shared/company-product-settings';
import { eventMessage, eventMessageSequence, messageValues, renderCompanyMessage } from '../../supabase/functions/_shared/communication-policy';

export function eventDraftPreview(draft: CompanyEventDraft): string {
  return draft.parts.map((part, index) => `${index + 1}. ${part.type === 'text' ? part.text : `[${part.type}: ${part.media?.fileName || 'arquivo'}]${part.text ? `\n${part.text}` : ''}`}`).join('\n\n');
}

export async function draftCompanyEventSequence(companyId: string, event: MessageEvent, values: Record<string, string>, fallback: string): Promise<CompanyEventDraft> {
  if (!companyId || !(WHATSAPP_EVENTS as readonly string[]).includes(event)) throw new Error('whatsapp_event_company_required');
  const { settings, version } = await fetchCompanyProductSettings(companyId);
  const prescriptionDays = Math.max(2, settings.business.assessment_sla_business_days);
  const renderedValues = messageValues({ profissional: settings.brand.professional_name, email: settings.brand.support_email, prazo: String(prescriptionDays), ...values }, settings.brand.company_name);
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

/** Compare already-normalized destinations, including the supported Brazilian ninth-digit variant. */
export function sameStudentContactRecipient(left: string | null, right: string | null): boolean {
  return Boolean(left && right && sameWhatsAppRecipient(`${left}@s.whatsapp.net`, `${right}@s.whatsapp.net`));
}

export function studentContactErrorMessage(error: { code?: string; message?: string } | null): string {
  const messages: Record<string, string> = {
    contact_version_conflict: 'O cadastro mudou desde que você abriu esta edição. Recarregue o aluno, confira os dados atuais e tente novamente.',
    contact_ownership_conflict: 'Este WhatsApp já está associado a outro aluno da empresa. Verifique a identidade e o vínculo antes de confirmar o contato.',
    contact_chat_ownership_conflict: 'A conversa deste WhatsApp está vinculada a outro aluno. Verifique a identidade e o vínculo da conversa antes de alterar o contato.',
    contact_confirmation_required: 'Confira a identidade do aluno e marque a confirmação do WhatsApp atual antes de salvar.',
    contact_reconciliation_confirmation_required: 'Os contatos antigos divergem. Confira a identidade e confirme explicitamente o WhatsApp atual para reconciliar.',
    contact_not_authorized: 'Você não tem permissão para alterar este aluno nesta empresa. Confira a empresa selecionada e seu acesso.',
    contact_country_invalid: 'O país do contato não está confirmado no cadastro. Confira o país antes de alterar o WhatsApp.',
    contact_profile_name_required: 'Informe o nome do aluno antes de salvar.',
    contact_profile_patch_invalid: 'Não foi possível validar os dados da edição. Recarregue o cadastro e tente novamente.',
  };
  const key = Object.keys(messages).find(code => error?.message?.split(/[^a-z_]+/).includes(code));
  if (key) return messages[key];
  if (error?.code === '42501') return messages.contact_not_authorized;
  if (error?.code === 'PT409') return messages.contact_version_conflict;
  if (error?.code === '22023') return 'Confira o WhatsApp, o país e os dados informados antes de salvar novamente.';
  return 'Não foi possível confirmar a atualização do cadastro. Recarregue o aluno e tente novamente.';
}

export interface StudentContactSnapshot {
  whatsapp?: string | null; phone?: string | null; country_code?: string | null;
}
export function studentCanonicalContact(student: StudentContactSnapshot) {
  const whatsapp = normalizeStudentChatPhone(student.whatsapp, student.country_code);
  const phone = normalizeStudentChatPhone(student.phone, student.country_code);
  const divergent = Boolean(student.whatsapp?.trim() && student.phone?.trim() && (!whatsapp || !phone
    || !sameStudentContactRecipient(whatsapp, phone)));
  return { whatsapp, phone, divergent, ready: Boolean(whatsapp) && !divergent,
    reason: divergent ? 'Contatos legados divergentes. Confira a identidade e reconcilie o WhatsApp confirmado antes de preparar o acesso.'
      : !whatsapp ? 'Confirme um WhatsApp válido no cadastro antes de preparar o acesso.' : '' };
}
export interface StudentLoginAccessReady {
  ready: true; companyId: string; studentId: string; chatId: string | null; remoteJid: string;
  preflightToken: string; stateFingerprint: string; expiresAt: string;
}
export interface GeneratedStudentLoginAccess {
  email: string; password: string; studentId: string; companyId: string; chatId: string | null;
  remoteJid: string; loginSendToken: string; stateFingerprint: string; expiresAt: string;
}
export type StudentLoginAccessInput = { companyId: string; studentId: string; chatId?: string | null; remoteJid?: string | null };
function validAccessIdentity(data: { companyId?: unknown; studentId?: unknown; chatId?: unknown; remoteJid?: unknown; stateFingerprint?: unknown; expiresAt?: unknown }, input: StudentLoginAccessInput) {
  return data.companyId === input.companyId && data.studentId === input.studentId
    && (data.chatId === null || typeof data.chatId === 'string')
    && (input.chatId === undefined || data.chatId === input.chatId)
    && typeof data.remoteJid === 'string' && /^\d{8,15}@s\.whatsapp\.net$/.test(data.remoteJid)
    && (!input.remoteJid || sameWhatsAppRecipient(input.remoteJid, data.remoteJid))
    && typeof data.stateFingerprint === 'string' && data.stateFingerprint.length > 0
    && typeof data.expiresAt === 'string' && Number.isFinite(Date.parse(data.expiresAt)) && Date.parse(data.expiresAt) > Date.now();
}
/** Server read only: never requests credentials, a connection, or an outbound message. */
export async function preflightStudentLoginAccess(input: StudentLoginAccessInput): Promise<StudentLoginAccessReady> {
  if (!input.companyId || !input.studentId) throw new Error('Empresa e aluno são obrigatórios para verificar o acesso.');
  const { data, error } = await supabase.functions.invoke('whatsapp-manager', { body: { action: 'preflight-student-login', ...input } });
  if (error || data?.error) throw new Error(await readEdgeError(error, data) || 'Não foi possível verificar o destinatário.');
  if (!data || data.ready !== true || !validAccessIdentity(data, input) || typeof data.preflightToken !== 'string' || !data.preflightToken) {
    throw new Error('O servidor não confirmou identidade, cadastro e conversa. Nenhuma credencial foi solicitada.');
  }
  return data as StudentLoginAccessReady;
}
/** Call only from an explicit generate/reset action. A blocked preflight never invokes credentials. */
export async function generateStudentLoginAccess(input: StudentLoginAccessInput): Promise<GeneratedStudentLoginAccess> {
  const ready = await preflightStudentLoginAccess(input);
  const { data, error } = await supabase.functions.invoke('student-login-credentials', { body: {
    action: 'generate-login-credentials', student_id: ready.studentId, company_id: ready.companyId,
    chat_id: ready.chatId, remote_jid: ready.remoteJid, preflight_token: ready.preflightToken,
  } });
  if (error || data?.error) throw new Error(await readEdgeError(error, data) || 'Não foi possível gerar o acesso.');
  if (!data || !validAccessIdentity(data, { ...input, chatId: ready.chatId, remoteJid: ready.remoteJid })
    || typeof data.email !== 'string' || !data.email.trim() || typeof data.password !== 'string' || !data.password
    || typeof data.loginSendToken !== 'string' || !data.loginSendToken) {
    throw new Error('O servidor não confirmou a geração do acesso. Não reutilize uma resposta incompleta.');
  }
  return data as GeneratedStudentLoginAccess;
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
  verifiedLoginAccess?: StudentLoginAccessReady;
  loginAccess?: { studentId: string; preflightToken: string };
}): Promise<void> {
  const { navigate, routePrefix, studentId, onNoChat } = opts;
  const verified = opts.verifiedLoginAccess;
  if (verified && (!opts.companyId || !studentId || !validAccessIdentity(verified, { companyId: opts.companyId, studentId, chatId: opts.chatId })
    || (opts.phone && !sameWhatsAppRecipient(`${normalizeStudentChatPhone(opts.phone, opts.countryCode)}@s.whatsapp.net`, verified.remoteJid)))) {
    throw new Error('O destinatário do acesso mudou. Verifique novamente antes de abrir a conversa.');
  }
  if (opts.loginAccess && (!verified || opts.loginAccess.studentId !== studentId || !opts.loginAccess.preflightToken)) throw new Error('access_draft_preflight_required');
  let message = opts.message;
  let eventDraft = opts.eventDraft;
  if (eventDraft && (!opts.companyId || eventDraft.companyId !== opts.companyId)) throw new Error('message_draft_company_mismatch');
  if (opts.messageEvent) {
    if (!opts.companyId) throw new Error('company_id_required_for_message_template');
    eventDraft = await draftCompanyEventSequence(opts.companyId, opts.messageEvent, opts.messageValues || {}, message);
    message = eventDraft.parts.length === 1 && eventDraft.parts[0].type === 'text' ? eventDraft.parts[0].text : '';
  }
  let resolvedChatId = verified ? verified.chatId : opts.chatId ?? null;
  let resolvedPhone = verified ? verified.remoteJid.replace('@s.whatsapp.net', '') : opts.phone ?? null;
  let resolvedCountryCode = opts.countryCode ?? null;
  let contactName: string | null = opts.contactName ?? null;

  if (!verified && !resolvedChatId && studentId) {
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

  if (!verified && (!resolvedPhone || !contactName || !resolvedCountryCode) && studentId) {
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
    ...(opts.loginAccess ? { loginAccess: opts.loginAccess } : {}),
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
    navigate(`/${routePrefix}/whatsapp-chat`, { state: opts.loginAccess ? transientLoginNavigation(request) : request });
  }
}

const firstName = (full?: string | null) => (full ?? "").trim().split(/\s+/)[0] || "";

// Cria um link opaco e temporário. O UUID do aluno nunca funciona como credencial
// pública de checkout.
export async function createPlansLink(studentId: string, renewal?: { enrollmentId?: string }): Promise<string> {
  const { data, error } = await supabase.functions.invoke("public-payment-context", {
    body: renewal
      ? { action: "create-renewal-link", studentId, renewalOfEnrollmentId: renewal.enrollmentId }
      : { action: "create-link", studentId },
  });
  if (error || !data?.token) {
    throw new Error(data?.error || error?.message || "Não foi possível criar o link de pagamento.");
  }
  return paymentUrl(window.location.origin, data.token);
}

export function birthdayMessage(fullName?: string | null, template?: string, companyName?: string): string {
  const values = { ...messageValues({ nome: fullName ?? '' }, companyName), primeiro_nome: firstName(fullName) };
  return renderCompanyMessage(template ?? DEFAULT_COMPANY_PRODUCT_SETTINGS.messages.birthday, values);
}

export function isRenewalOverdue(daysLeft: number | null | undefined): boolean {
  return typeof daysLeft === "number" && Number.isFinite(daysLeft) && daysLeft < 0;
}

export function renewalMessage(opts: {
  fullName?: string | null;
  planName?: string | null;
  daysLeft?: number | null;
  paymentLink: string;
}): string {
  const nome = firstName(opts.fullName);
  const plano = opts.planName ? ` ${opts.planName}` : "";
  const link = opts.paymentLink;
  if (isRenewalOverdue(opts.daysLeft)) {
    return `Oi, ${nome}! Seu plano${plano} venceu e seu acesso aos treinos pode ser interrompido. Pra regularizar e continuar evoluindo, é só renovar por aqui: ${link}`;
  }
  if (opts.daysLeft === 0) {
    return `Oi, ${nome}! Seu plano${plano} vence hoje. Pra continuar sem interromper seus treinos, renove por aqui: ${link}`;
  }
  const prazo =
    typeof opts.daysLeft === "number"
      ? ` (faltam ${opts.daysLeft} ${opts.daysLeft === 1 ? "dia" : "dias"})`
      : "";
  return `Oi, ${nome}! Seu plano${plano} está chegando ao fim${prazo}. Pra continuar sem interromper seus treinos, renove por aqui: ${link}`;
}
