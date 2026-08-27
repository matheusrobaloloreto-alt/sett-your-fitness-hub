#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_PROJECT_REF = "zshrcgbyhzxpnlccssyz";

const clean = (value) => String(value || "").trim();
const blank = (value) => clean(value) === "";
const hash = (value, length = 12) => createHash("sha256").update(String(value)).digest("hex").slice(0, length);

export function normalizeName(value) {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
}

export function normalizePhone(value) {
  let digits = clean(value).split("@")[0].replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  else if (/^0\d{2}[1-9]{2}\d{8,9}$/.test(digits)) digits = digits.slice(3);
  else if (/^0[1-9]{2}\d{8}$/.test(digits)) digits = digits.slice(1);
  else if (digits.length > 11) digits = digits.slice(-11);
  if (digits.length === 10 && /^[1-9]{2}[6-9]/.test(digits)) digits = `${digits.slice(0, 2)}9${digits.slice(2)}`;
  if (digits.length === 11 && digits[2] !== "9") return null;
  return digits.length === 10 || digits.length === 11 ? digits : null;
}

const blocked = (reason, evidence = {}) => ({ status: "blocked", reason, evidence });

export function buildRepairDecision({ source, students, chats, messages, aliases }) {
  const sourceName = normalizeName(source?.nome);
  const phone = normalizePhone(source?.telefone);
  if (!sourceName) return blocked("source_name_missing");
  if (!phone) return blocked("source_phone_invalid");

  const exactStudents = students.filter((student) => normalizeName(student.full_name) === sourceName);
  if (exactStudents.length !== 1) return blocked("exact_name_student_ambiguous", { exact_name_students: exactStudents.length });
  const student = exactStudents[0];
  const phoneOwners = students.filter((row) => row.id !== student.id && (
    normalizePhone(row.phone) === phone || normalizePhone(row.whatsapp) === phone
  ));
  if (phoneOwners.length) return blocked("phone_owned_by_other_student", { other_phone_owners: phoneOwners.length });

  const matchingChats = chats.filter((chat) => normalizePhone(chat.remote_jid) === phone);
  if (matchingChats.length !== 1) return blocked("phone_chat_ambiguous", { matching_chats: matchingChats.length });
  const chat = matchingChats[0];
  if (chat.student_id && chat.student_id !== student.id) return blocked("chat_linked_to_other_student");
  const otherChatsForStudent = chats.filter((row) => row.student_id === student.id && row.id !== chat.id);
  if (otherChatsForStudent.length) return blocked("student_linked_to_other_chat", { other_linked_chats: otherChatsForStudent.length });
  if (normalizeName(chat.contact_name) !== sourceName) return blocked("provider_contact_name_mismatch");
  const contactName = clean(chat.contact_name);
  if (contactName.length < 3 || contactName.length > 60 || /[\r\n]/.test(contactName) || /^\+?\d[\d\s().-]+$/.test(contactName)) {
    return blocked("provider_contact_name_implausible");
  }

  const aliasConflicts = aliases.filter((row) => (
    normalizePhone(row.alias_jid) === phone && row.canonical_chat_id !== chat.id
  ));
  if (aliasConflicts.length) return blocked("phone_alias_points_to_other_chat", { alias_conflicts: aliasConflicts.length });

  const inboundProvider = messages.filter((message) => (
    message.chat_id === chat.id
      && Boolean(message.message_id_external)
      && !message.is_from_me
      && message.source !== "outgoing"
  ));
  if (!inboundProvider.length) return blocked("no_inbound_provider_evidence");

  const e164Phone = `+55${phone}`;
  const phoneStateSafe = blank(student.phone) || normalizePhone(student.phone) === phone;
  const whatsappStateSafe = blank(student.whatsapp) || normalizePhone(student.whatsapp) === phone;
  if (!phoneStateSafe || !whatsappStateSafe) return blocked("student_contact_conflict");

  const evidence = {
    exact_name_students: 1,
    matching_chats: 1,
    inbound_provider_messages: inboundProvider.length,
    alias_conflicts: 0,
    other_phone_owners: 0,
  };
  const status = normalizePhone(student.phone) === phone
      && normalizePhone(student.whatsapp) === phone
      && chat.student_id === student.id
    ? "already_applied"
    : "ready";
  return { status, reason: status, student, chat, e164Phone, evidence };
}

function parseArgs(argv) {
  const options = { apply: false, clients: "", companyId: "", report: "", backup: "", confirmProject: "", refs: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") { options.apply = true; continue; }
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    const [flag, inline] = arg.split("=", 2);
    const value = inline ?? argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    if (flag === "--mfit-clients") options.clients = value;
    else if (flag === "--company-id") options.companyId = value;
    else if (flag === "--report") options.report = value;
    else if (flag === "--backup") options.backup = value;
    else if (flag === "--confirm-project") options.confirmProject = value;
    else if (flag === "--include-client-ref") options.refs.push(value);
    else throw new Error("Unknown command-line argument");
  }
  options.refs = [...new Set(options.refs)];
  if (options.refs.some((value) => !/^[0-9a-f]{12}$/.test(value))) throw new Error("Client refs must be 12 lowercase hex characters");
  if (options.refs.length < 1 || options.refs.length > 5) throw new Error("Provide 1-5 explicit client refs");
  if (options.apply && options.confirmProject !== EXPECTED_PROJECT_REF) throw new Error(`Apply requires --confirm-project ${EXPECTED_PROJECT_REF}`);
  if (options.apply && !options.backup) throw new Error("Apply requires a private --backup path");
  return options;
}

const usage = `Usage: node scripts/mfit-identity-contact-repair.mjs --mfit-clients FILE --company-id UUID
  --include-client-ref 12HEX [--include-client-ref 12HEX] [--report FILE]
  [--apply --confirm-project ${EXPECTED_PROJECT_REF} --backup PRIVATE_FILE]
Dry-run is the default. Reports are sanitized; backups contain PII and are written mode 0600.\n`;

async function writeJson(path, payload) {
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

const must = (result, label) => {
  if (result.error) throw new Error(`${label}:${result.error.code || "database_error"}`);
  return result.data || [];
};

function applyOriginal(query, column, value) {
  return value === null || value === undefined ? query.is(column, null) : query.eq(column, value);
}

async function updateStudentCas(db, companyId, decision) {
  let query = db.from("students").update({ phone: decision.e164Phone, whatsapp: decision.e164Phone })
    .eq("id", decision.student.id).eq("company_id", companyId).eq("updated_at", decision.student.updated_at);
  query = applyOriginal(query, "phone", decision.student.phone);
  query = applyOriginal(query, "whatsapp", decision.student.whatsapp);
  const rows = must(await query.select("id,company_id,full_name,phone,whatsapp,updated_at"), "student_compare_and_swap");
  if (rows.length !== 1) throw new Error("student_compare_and_swap_failed");
  return rows[0];
}

async function updateChatCas(db, companyId, decision) {
  let query = db.from("whatsapp_chats").update({ student_id: decision.student.id })
    .eq("id", decision.chat.id).eq("company_id", companyId).eq("updated_at", decision.chat.updated_at)
    .eq("remote_jid", decision.chat.remote_jid);
  query = applyOriginal(query, "student_id", decision.chat.student_id);
  const rows = must(await query.select("id,company_id,student_id,remote_jid,contact_name,updated_at"), "chat_compare_and_swap");
  if (rows.length !== 1) throw new Error("chat_compare_and_swap_failed");
  return rows[0];
}

async function rollbackCompleted(db, companyId, completed) {
  const failures = [];
  for (const item of [...completed].reverse()) {
    if (item.chatAfter) {
      const chatResult = await db.from("whatsapp_chats").update({ student_id: item.decision.chat.student_id })
        .eq("id", item.decision.chat.id).eq("company_id", companyId)
        .eq("student_id", item.decision.student.id).select("id");
      if (chatResult.error || chatResult.data?.length !== 1) failures.push("chat");
    }
    const studentResult = await db.from("students").update({
      phone: item.decision.student.phone,
      whatsapp: item.decision.student.whatsapp,
    }).eq("id", item.decision.student.id).eq("company_id", companyId)
      .eq("phone", item.decision.e164Phone).eq("whatsapp", item.decision.e164Phone).select("id");
    if (studentResult.error || studentResult.data?.length !== 1) failures.push("student");
  }
  if (failures.length) throw new Error("repair_failed_rollback_incomplete");
}

export async function applyReadyDecisions(items, { updateStudent, updateChat, rollback }) {
  const completed = [];
  try {
    for (const item of items) {
      const current = { ...item, studentAfter: await updateStudent(item.decision) };
      completed.push(current);
      current.chatAfter = await updateChat(item.decision);
    }
    return completed;
  } catch (error) {
    await rollback(completed);
    throw error;
  }
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) { process.stdout.write(usage); return 0; }
  if (!options.clients || !options.companyId) throw new Error("--mfit-clients and --company-id are required");
  const url = clean(process.env.MFIT_SUPABASE_URL || process.env.TARGET_SUPABASE_URL || process.env.SUPABASE_URL);
  const serviceRole = clean(process.env.MFIT_SUPABASE_SERVICE_ROLE_KEY || process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname.split(".")[0] !== EXPECTED_PROJECT_REF || !serviceRole) {
    throw new Error("Canonical Supabase credentials are required");
  }
  const clientsText = await readFile(options.clients, "utf8");
  const clientsPayload = JSON.parse(clientsText);
  const allSources = clientsPayload.items || clientsPayload.clients || [];
  const sources = options.refs.map((ref) => {
    const matches = allSources.filter((source) => hash(source.id) === ref);
    if (matches.length !== 1) throw new Error("Client ref did not resolve uniquely");
    return matches[0];
  });
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const [students, chats, aliases] = await Promise.all([
    db.from("students").select("id,company_id,full_name,phone,whatsapp,updated_at").eq("company_id", options.companyId),
    db.from("whatsapp_chats").select("id,company_id,student_id,remote_jid,contact_name,updated_at").eq("company_id", options.companyId),
    db.from("whatsapp_jid_aliases").select("canonical_chat_id,alias_jid").eq("company_id", options.companyId),
  ]).then((results) => results.map((result, index) => must(result, ["students", "chats", "aliases"][index])));

  const decisions = [];
  for (const source of sources) {
    const phone = normalizePhone(source.telefone);
    const matchingChatIds = phone ? chats.filter((chat) => normalizePhone(chat.remote_jid) === phone).map((chat) => chat.id) : [];
    const messages = matchingChatIds.length ? must(await db.from("whatsapp_messages")
      .select("chat_id,message_id_external,is_from_me,source").eq("company_id", options.companyId)
      .in("chat_id", matchingChatIds), "messages") : [];
    decisions.push({ source, decision: buildRepairDecision({ source, students, chats, messages, aliases }) });
  }
  const blockedCount = decisions.filter(({ decision }) => decision.status === "blocked").length;
  const sanitizedRows = decisions.map(({ source, decision }) => ({
    client_ref: hash(source.id), status: decision.status, reason: decision.reason, evidence: decision.evidence || {},
  }));
  let applied = 0;
  if (options.apply) {
    if (blockedCount) throw new Error("Apply refused because at least one identity is blocked");
    await writeJson(options.backup, {
      schema_version: 1, created_at: new Date().toISOString(), contains_pii: true,
      rows: decisions.map(({ source, decision }) => ({ source, student: decision.student, chat: decision.chat })),
    });
    const completed = await applyReadyDecisions(
      decisions.filter(({ decision }) => decision.status === "ready"),
      {
        updateStudent: (decision) => updateStudentCas(db, options.companyId, decision),
        updateChat: (decision) => updateChatCas(db, options.companyId, decision),
        rollback: (rows) => rollbackCompleted(db, options.companyId, rows),
      },
    );
    applied = completed.length;
  }
  const report = {
    schema_version: 1, created_at: new Date().toISOString(), contains_pii: false,
    tool_version: 1, input_sha256: hash(clientsText, 64), requested_client_refs: [...options.refs].sort(),
    mode: options.apply ? "apply" : "dry-run", requested: decisions.length, ready: decisions.filter(({ decision }) => decision.status === "ready").length,
    already_applied: decisions.filter(({ decision }) => decision.status === "already_applied").length,
    blocked: blockedCount, applied, rows: sanitizedRows,
  };
  if (options.report) await writeJson(options.report, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return blockedCount ? 2 : 0;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().then((code) => { process.exitCode = code; }).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Identity repair failed"}\n`);
  process.exitCode = 1;
});
