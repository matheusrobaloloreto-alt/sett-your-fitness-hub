import test from "node:test";
import assert from "node:assert/strict";

import {
  applyReadyDecisions,
  buildRepairDecision,
  normalizeName,
  normalizePhone,
} from "./mfit-identity-contact-repair.mjs";

const base = () => ({
  source: { id: "mfit-1", nome: "Aluna Teste", telefone: "+55 (11) 99999-0000" },
  students: [{ id: "student-1", company_id: "company-1", full_name: "Aluna Teste", phone: null, whatsapp: null, updated_at: "s1" }],
  chats: [{ id: "chat-1", company_id: "company-1", student_id: null, remote_jid: "5511999990000@s.whatsapp.net", contact_name: "Aluna Teste", updated_at: "c1" }],
  messages: [{ chat_id: "chat-1", message_id_external: "provider-1", is_from_me: false, source: "webhook" }],
  aliases: [{ canonical_chat_id: "chat-1", alias_jid: "123@lid" }],
});

test("normalizes names and Brazilian phones deterministically", () => {
  assert.equal(normalizeName("Áluna  Teste"), "aluna teste");
  assert.equal(normalizePhone("+55 (11) 99999-0000"), "11999990000");
});

test("approves one exact-name student with one provider-backed phone chat", () => {
  const decision = buildRepairDecision(base());
  assert.equal(decision.status, "ready");
  assert.equal(decision.student.id, "student-1");
  assert.equal(decision.chat.id, "chat-1");
  assert.equal(decision.e164Phone, "+5511999990000");
});

test("fails closed when the exact-name student is ambiguous", () => {
  const input = base();
  input.students.push({ ...input.students[0], id: "student-2" });
  assert.equal(buildRepairDecision(input).reason, "exact_name_student_ambiguous");
});

test("fails closed when provider contact name differs", () => {
  const input = base();
  input.chats[0].contact_name = "Outra Pessoa";
  assert.equal(buildRepairDecision(input).reason, "provider_contact_name_mismatch");
});

test("fails closed when the phone chat belongs to another student", () => {
  const input = base();
  input.chats[0].student_id = "student-2";
  assert.equal(buildRepairDecision(input).reason, "chat_linked_to_other_student");
});

test("fails closed when another student already owns the phone", () => {
  const input = base();
  input.students.push({
    id: "student-2",
    company_id: "company-1",
    full_name: "Outra Pessoa",
    phone: "+5511999990000",
    whatsapp: null,
    updated_at: "s2",
  });
  assert.equal(buildRepairDecision(input).reason, "phone_owned_by_other_student");
});

test("fails closed without an inbound provider-backed message", () => {
  const input = base();
  input.messages[0].is_from_me = true;
  assert.equal(buildRepairDecision(input).reason, "no_inbound_provider_evidence");
});

test("recognizes an already-applied link", () => {
  const input = base();
  input.students[0].phone = "+5511999990000";
  input.students[0].whatsapp = "+5511999990000";
  input.chats[0].student_id = "student-1";
  assert.equal(buildRepairDecision(input).status, "already_applied");
});

test("fails closed when a phone alias points to a second canonical chat", () => {
  const input = base();
  input.aliases.push({ canonical_chat_id: "chat-2", alias_jid: "5511999990000@s.whatsapp.net" });
  assert.equal(buildRepairDecision(input).reason, "phone_alias_points_to_other_chat");
});

test("fails closed when the target student is already linked to another canonical chat", () => {
  const input = base();
  input.chats.push({
    id: "chat-2",
    company_id: "company-1",
    student_id: "student-1",
    remote_jid: "5511888880000@s.whatsapp.net",
    contact_name: "Aluna Teste",
    updated_at: "c2",
  });
  assert.equal(buildRepairDecision(input).reason, "student_linked_to_other_chat");
});

test("rolls back the current student when its chat CAS fails", async () => {
  const items = [{ source: { id: "mfit-1" }, decision: buildRepairDecision(base()) }];
  const rollbackCalls = [];
  await assert.rejects(() => applyReadyDecisions(items, {
    updateStudent: async () => ({ id: "student-1" }),
    updateChat: async () => { throw new Error("chat_compare_and_swap_failed"); },
    rollback: async (completed) => { rollbackCalls.push(completed); },
  }), /chat_compare_and_swap_failed/);
  assert.equal(rollbackCalls.length, 1);
  assert.equal(rollbackCalls[0].length, 1);
  assert.equal(rollbackCalls[0][0].studentAfter.id, "student-1");
  assert.equal(rollbackCalls[0][0].chatAfter, undefined);
});
