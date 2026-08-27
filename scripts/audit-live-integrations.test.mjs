import assert from "node:assert/strict";
import test from "node:test";
import { summarizeActiveStudentContactCoverage } from "./audit-live-integrations-core.mjs";

test("contact coverage distinguishes reliable, absent, invalid and ambiguous destinations", () => {
  const result = summarizeActiveStudentContactCoverage([
    { id: "br", phone: "+55 (48) 99999-1111", whatsapp: null },
    { id: "nanp", phone: "+1 407 789 5013", whatsapp: "+1 407 789 5013" },
    { id: "absent", phone: null, whatsapp: "" },
    { id: "invalid", phone: "42077707180", whatsapp: "42077707180" },
    { id: "ambiguous", phone: "+55 (48) 99999-2222", whatsapp: "+55 (48) 99999-3333" },
  ], [
    { id: "chat-br", student_id: "br" },
    { id: "chat-invalid", student_id: "invalid" },
    { id: "chat-invalid-2", student_id: "invalid" },
    { id: "unlinked", student_id: null },
  ]);

  assert.deepEqual(result, {
    active_students_with_reliable_phone: 2,
    active_students_with_ambiguous_phone: 1,
    active_students_without_reliable_phone: 2,
    active_students_without_contact_values: 1,
    active_students_with_invalid_contact_values: 1,
    active_students_with_linked_chat: 2,
    active_students_without_reliable_phone_with_linked_chat: 1,
    active_students_with_multiple_linked_chats: 1,
  });
});

test("contact coverage is empty-safe", () => {
  assert.deepEqual(summarizeActiveStudentContactCoverage([], []), {
    active_students_with_reliable_phone: 0,
    active_students_with_ambiguous_phone: 0,
    active_students_without_reliable_phone: 0,
    active_students_without_contact_values: 0,
    active_students_with_invalid_contact_values: 0,
    active_students_with_linked_chat: 0,
    active_students_without_reliable_phone_with_linked_chat: 0,
    active_students_with_multiple_linked_chats: 0,
  });
});
