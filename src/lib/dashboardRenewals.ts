import { differenceInCalendarDays, format, parseISO, subMonths } from "date-fns";
import type { NavigateFunction } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveVerifiedWhatsAppRecipient } from "../../supabase/functions/_shared/whatsappIdentity";
import type { CompanyDashboardSnapshot, DashboardRenewalRow } from "./companyDashboardSnapshot";
import { readPages } from "./pagedRead";
import { createPlansLink, draftCompanyEventSequence, isRenewalOverdue, openStudentChat, renewalMessage } from "./studentChat";
import { OPEN_ENROLLMENT_STATUSES } from "./studentRoster";
import { sameRenewalRecipient } from "./whatsappChatRequest";

export type RenewalPeriod = "currentMonth" | "previousMonth" | "all";

// Postgres JSON timestamps carry up to six decimal places. Parse the zone and
// whole second separately so Date never truncates the fractional tie-break.
function renewalTimestamp(value: unknown): bigint | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(value);
  if (!match) return null;
  const second = parseISO(match[1] + match[3]).getTime();
  return Number.isFinite(second) ? BigInt(second) * 1000n + BigInt((match[2] ?? "").padEnd(6, "0")) : null;
}

function compareIds(left: string, right: string) {
  // UUIDs emitted by Postgres are lowercase. Code unit order matches byte order.
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRenewalRow(value: unknown): value is DashboardRenewalRow {
  if (!value || typeof value !== "object") return false;
  const row = value as DashboardRenewalRow;
  return typeof row.id === "string" && typeof row.student_id === "string"
    && OPEN_ENROLLMENT_STATUSES.includes(row.status) && renewalTimestamp(row.created_at) !== null
    && (row.end_date === null || (typeof row.end_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.end_date)
      && Number.isFinite(parseISO(row.end_date).getTime())))
    && (row.trainer_id === null || typeof row.trainer_id === "string")
    && (row.students === null || typeof row.students?.full_name === "string")
    && (row.plans === null || typeof row.plans?.name === "string");
}

export function readDashboardRenewalQueue(snapshot: CompanyDashboardSnapshot): DashboardRenewalRow[] | null {
  const rows = snapshot.dashboardRenewalContracts;
  // The marker distinguishes a legitimately empty result from an empty legacy
  // notice window. Reject a mixed result as a whole to avoid picking a loser.
  return snapshot.renewalQueueVersion === 2 && Array.isArray(rows) && rows.every(isRenewalRow) ? rows : null;
}

export function dashboardRenewalsForPeriod(
  contracts: DashboardRenewalRow[],
  period: RenewalPeriod,
  today: string,
) {
  const businessToday = parseISO(today);
  const month = period === "previousMonth"
    ? format(subMonths(businessToday, 1), "yyyy-MM")
    : today.slice(0, 7);
  // Match the checkout's choice when legacy data contains more than one open enrollment.
  const currentByStudent = new Map<string, DashboardRenewalRow>();
  const ordered = contracts.flatMap(contract => {
    const priority = OPEN_ENROLLMENT_STATUSES.indexOf(contract.status);
    if (priority < 0) return [];
    const timestamp = renewalTimestamp(contract.created_at);
    if (timestamp === null) throw new Error("Data de criação da matrícula inválida.");
    return [{ contract, priority, timestamp }];
  }).sort((a, b) => a.priority - b.priority
    || (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : compareIds(b.contract.id, a.contract.id)));
  for (const { contract } of ordered) {
    if (!currentByStudent.has(contract.student_id)) currentByStudent.set(contract.student_id, contract);
  }
  return Array.from(currentByStudent.values()).flatMap(contract => {
    if (!contract.end_date || (period !== "all" && contract.end_date.slice(0, 7) !== month)) return [];
    const daysLeft = differenceInCalendarDays(parseISO(contract.end_date), businessToday);
    return Number.isFinite(daysLeft) ? [{ contract, daysLeft }] : [];
  }).sort((a, b) => a.daysLeft - b.daysLeft || compareIds(a.contract.id, b.contract.id));
}

async function verifyRenewalRecipient(companyId: string, studentId: string) {
  const { data: student, error } = await supabase.from("students").select("id, company_id, full_name, whatsapp, phone, country_code")
    .eq("company_id", companyId).eq("id", studentId).maybeSingle();
  if (error || !student || student.id !== studentId || student.company_id !== companyId) {
    throw new Error("Não foi possível confirmar o aluno nesta empresa.");
  }

  const query = supabase.from("whatsapp_chats").select("id, company_id, student_id, remote_jid")
    .eq("company_id", companyId).order("last_message_at", { ascending: false, nullsFirst: false }).order("id");
  const chats = await readPages(async (from, to) => {
    const page = await query.range(from, to);
    if (page.error || !Array.isArray(page.data) || page.data.some(chat => chat.company_id !== companyId)) {
      throw new Error("Não foi possível confirmar as conversas de WhatsApp desta empresa.");
    }
    return page;
  });
  const linked = chats.find(chat => chat.student_id === studentId);
  const storedContacts = [student.whatsapp, student.phone].filter(value => value?.trim());
  if (!linked && !storedContacts.length) return { student, recipient: null };

  const identity = { student, requestedStudentId: studentId };
  const canonical = resolveVerifiedWhatsAppRecipient({ ...identity, clientRemoteJid: storedContacts[0] });
  if (!canonical.ok || storedContacts.some(contact => !resolveVerifiedWhatsAppRecipient({ ...identity, clientRemoteJid: contact }).ok)) {
    throw new Error("Confira e confirme o WhatsApp do aluno no cadastro antes de gerar o link.");
  }
  const phone = canonical.remoteJid.replace("@s.whatsapp.net", "");
  // With no linked chat, the panel can still select a conversation by phone.
  // Check every candidate so ordering or an unlinked conversation is safe.
  const candidates = linked ? [linked] : chats.filter(chat => sameRenewalRecipient(chat.remote_jid, canonical.remoteJid));
  const chatId = linked?.id ?? null;
  for (const chat of candidates) {
    const verified = resolveVerifiedWhatsAppRecipient({ ...identity, clientRemoteJid: canonical.remoteJid,
      chatRemoteJid: chat.remote_jid, chatStudentId: chat.student_id });
    if (!verified.ok || !sameRenewalRecipient(chat.remote_jid, canonical.remoteJid)) {
      throw new Error("A conversa do WhatsApp não corresponde ao cadastro do aluno. Confira o vínculo antes de gerar o link.");
    }
  }
  return { student, recipient: { chatId, phone, contactName: student.full_name } };
}

export async function openDashboardRenewalDraft(opts: {
  companyId: string;
  contract: DashboardRenewalRow;
  daysLeft: number;
  navigate: NavigateFunction;
  routePrefix: string;
  copyDraft?: (message: string) => Promise<void>;
}): Promise<"chat" | "copied"> {
  const { companyId, contract, daysLeft, navigate, routePrefix, copyDraft } = opts;
  const studentId = contract.student_id;
  const { student, recipient } = await verifyRenewalRecipient(companyId, studentId);
  if (!recipient && !copyDraft) throw new Error("Aluno sem WhatsApp e área de transferência indisponível.");

  const fullName = student.full_name;
  const planName = contract.plans?.name;
  const paymentLink = await createPlansLink(studentId, { enrollmentId: contract.id });
  const message = renewalMessage({ fullName, planName, daysLeft, paymentLink });
  const messageEvent = isRenewalOverdue(daysLeft) ? "renewal_overdue" : "renewal_due";
  const messageValues = { nome: fullName, primeiro_nome: fullName.trim().split(/\s+/)[0], link: paymentLink, prazo: String(daysLeft) };
  if (!recipient) {
    const draft = await draftCompanyEventSequence(companyId, messageEvent, messageValues, message);
    if (draft.parts.length !== 1 || draft.parts[0].type !== "text") {
      throw new Error("Aluno sem WhatsApp confirmado para revisar a sequência de renovação.");
    }
    await copyDraft(draft.parts[0].text);
    return "copied";
  }
  await openStudentChat({ navigate, routePrefix, studentId, companyId,
    verifiedDraftRecipient: { ...recipient, enrollmentId: contract.id },
    message, messageEvent, messageValues });
  return "chat";
}
