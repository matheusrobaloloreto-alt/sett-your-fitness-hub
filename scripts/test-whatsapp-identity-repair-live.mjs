import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const args = new Set(process.argv.slice(2));
const expectedProject = "ifymocggowdlqqcxugko";
const url = String(process.env.TEST_SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || "";

if (!args.has(`--confirm-project=${expectedProject}`)) {
  throw new Error(`Refusing live fixture without --confirm-project=${expectedProject}`);
}
if (!url.includes(expectedProject) || !serviceKey) {
  throw new Error("This test only runs against the isolated SETT staging project.");
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

async function rest(path, init = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${init.method || "GET"} ${path}: ${response.status} ${text}`);
  }
  return payload;
}

const companyId = randomUUID();
const studentId = randomUUID();
const instanceId = randomUUID();
const canonicalChatId = randomUUID();
const duplicateChatId = randomUUID();
const canonicalMessageId = randomUUID();
const feedbackMessageId = randomUUID();
const unsafeProviderMessageId = randomUUID();
const conflictingStudentId = randomUUID();
const canonicalPhone = "48991432057";
const canonicalJid = `55${canonicalPhone}@s.whatsapp.net`;
const malformedJid = "5542077707180@s.whatsapp.net";

try {
  await rest("companies", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ id: companyId, name: `Identity repair ${companyId.slice(0, 8)}`, slug: `identity-repair-${companyId}` }),
  });
  await rest("students", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      id: studentId,
      company_id: companyId,
      full_name: "Fixture Student",
      status: "active",
      whatsapp: "42077707180",
    }),
  });
  await rest("whatsapp_instances", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      id: instanceId,
      company_id: companyId,
      instance_name: `fixture-${companyId}`,
      status: "connected",
    }),
  });
  await rest("whatsapp_chats", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([
      {
        id: canonicalChatId,
        company_id: companyId,
        instance_id: instanceId,
        remote_jid: canonicalJid,
        student_id: null,
        contact_name: "Fixture historical contact",
        last_message: "Provider history",
        last_message_at: "2026-08-25T12:00:00Z",
      },
      {
        id: duplicateChatId,
        company_id: companyId,
        instance_id: instanceId,
        remote_jid: malformedJid,
        student_id: studentId,
        contact_name: "Fixture Student",
        last_message: "Feedback interno",
        last_message_at: "2026-08-24T12:00:00Z",
      },
    ]),
  });
  await rest("whatsapp_messages", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([
      {
        id: canonicalMessageId,
        chat_id: canonicalChatId,
        company_id: companyId,
        content: "Provider history",
        type: "text",
        source: "incoming",
        is_from_me: false,
        status: "received",
        message_id_external: `fixture-provider-${canonicalMessageId}`,
        sender_id: null,
        timestamp: "2026-08-25T12:00:00Z",
      },
      {
        id: feedbackMessageId,
        chat_id: duplicateChatId,
        company_id: companyId,
        content: "Feedback interno",
        type: "text",
        source: "incoming",
        is_from_me: false,
        status: "received",
        message_id_external: null,
        sender_id: studentId,
        timestamp: "2026-08-24T12:00:00Z",
      },
    ]),
  });

  await rest("whatsapp_messages", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      id: unsafeProviderMessageId,
      chat_id: duplicateChatId,
      company_id: companyId,
      content: "Provider message that must block repair",
      type: "text",
      source: "incoming",
      is_from_me: false,
      status: "received",
      message_id_external: `fixture-provider-${unsafeProviderMessageId}`,
      sender_id: null,
      timestamp: "2026-08-24T13:00:00Z",
    }),
  });

  await assert.rejects(
    rest("rpc/repair_whatsapp_student_chat_identity", {
      method: "POST",
      body: JSON.stringify({
        _student_id: studentId,
        _canonical_chat_id: canonicalChatId,
        _duplicate_chat_id: duplicateChatId,
      }),
    }),
    /duplicate chat contains provider or outbound history/,
  );
  const chatsAfterRejectedRepair = await rest(
    `whatsapp_chats?company_id=eq.${companyId}&select=id`,
  );
  assert.equal(chatsAfterRejectedRepair.length, 2);
  await rest(`whatsapp_messages?id=eq.${unsafeProviderMessageId}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });

  await rest("students", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      id: conflictingStudentId,
      company_id: companyId,
      full_name: "Conflicting Fixture Student",
      status: "active",
      whatsapp: canonicalPhone,
    }),
  });
  // The existing student-link trigger may eagerly claim the historical chat
  // for the conflicting fixture. Restore the intended student explicitly so
  // this assertion reaches the RPC's own same-company uniqueness guard.
  await rest(`whatsapp_chats?id=eq.${canonicalChatId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ student_id: studentId }),
  });
  await assert.rejects(
    rest("rpc/repair_whatsapp_student_chat_identity", {
      method: "POST",
      body: JSON.stringify({
        _student_id: studentId,
        _canonical_chat_id: canonicalChatId,
        _duplicate_chat_id: duplicateChatId,
      }),
    }),
    /canonical recipient belongs to another student/,
  );
  await rest(`students?id=eq.${conflictingStudentId}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });

  await rest(`whatsapp_chats?id=eq.${duplicateChatId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ remote_jid: "invalid@s.whatsapp.net" }),
  });
  await rest(`students?id=eq.${studentId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ whatsapp: "invalid" }),
  });
  await assert.rejects(
    rest("rpc/repair_whatsapp_student_chat_identity", {
      method: "POST",
      body: JSON.stringify({
        _student_id: studentId,
        _canonical_chat_id: canonicalChatId,
        _duplicate_chat_id: duplicateChatId,
      }),
    }),
    /canonical recipient is invalid or not distinct/,
  );
  await rest(`whatsapp_chats?id=eq.${duplicateChatId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ remote_jid: malformedJid }),
  });
  await rest(`students?id=eq.${studentId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ whatsapp: "42077707180" }),
  });

  const repair = await rest("rpc/repair_whatsapp_student_chat_identity", {
    method: "POST",
    body: JSON.stringify({
      _student_id: studentId,
      _canonical_chat_id: canonicalChatId,
      _duplicate_chat_id: duplicateChatId,
    }),
  });
  assert.equal(repair.ok, true);
  assert.equal(repair.moved_messages, 1);

  const [student] = await rest(`students?id=eq.${studentId}&select=whatsapp`);
  assert.equal(student.whatsapp, canonicalPhone);

  const chats = await rest(`whatsapp_chats?company_id=eq.${companyId}&select=id,student_id,remote_jid`);
  assert.deepEqual(chats, [{ id: canonicalChatId, student_id: studentId, remote_jid: canonicalJid }]);

  const messages = await rest(`whatsapp_messages?company_id=eq.${companyId}&select=id,chat_id&order=id`);
  assert.equal(messages.length, 2);
  assert.ok(messages.every((message) => message.chat_id === canonicalChatId));

  const aliases = await rest(`whatsapp_jid_aliases?company_id=eq.${companyId}&select=alias_jid,canonical_chat_id`);
  assert.deepEqual(aliases, [{ alias_jid: malformedJid, canonical_chat_id: canonicalChatId }]);

  const repairs = await rest(`whatsapp_identity_repairs?company_id=eq.${companyId}&select=student_id,canonical_chat_id,duplicate_chat_id,moved_message_ids`);
  assert.equal(repairs.length, 1);
  assert.equal(repairs[0].student_id, studentId);
  assert.equal(repairs[0].canonical_chat_id, canonicalChatId);
  assert.equal(repairs[0].duplicate_chat_id, duplicateChatId);
  assert.deepEqual(repairs[0].moved_message_ids, [feedbackMessageId]);

  console.log("WhatsApp identity repair staging fixture: PASS");
} finally {
  await rest(`companies?id=eq.${companyId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
}
