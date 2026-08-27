import { normalizeWhatsAppPhoneKey } from "../supabase/functions/_shared/whatsappIdentity.ts";

const present = (value) => String(value || "").trim() !== "";

export function summarizeActiveStudentContactCoverage(activeStudents, chats) {
  const chatCountByStudent = new Map();
  for (const chat of chats) {
    if (!chat.student_id) continue;
    chatCountByStudent.set(
      chat.student_id,
      (chatCountByStudent.get(chat.student_id) || 0) + 1,
    );
  }

  const contactRows = activeStudents.map((student) => {
    const normalized = new Set(
      [student.phone, student.whatsapp]
        .map((value) => normalizeWhatsAppPhoneKey(value))
        .filter(Boolean),
    );
    const rawPresent = present(student.phone) || present(student.whatsapp);
    const linkedChats = chatCountByStudent.get(student.id) || 0;
    return { normalized, rawPresent, linkedChats };
  });

  const withoutReliablePhone = contactRows.filter((row) => row.normalized.size === 0);

  return {
    active_students_with_reliable_phone: contactRows.filter((row) => row.normalized.size === 1).length,
    active_students_with_ambiguous_phone: contactRows.filter((row) => row.normalized.size > 1).length,
    active_students_without_reliable_phone: withoutReliablePhone.length,
    active_students_without_contact_values: withoutReliablePhone.filter((row) => !row.rawPresent).length,
    active_students_with_invalid_contact_values: withoutReliablePhone.filter((row) => row.rawPresent).length,
    active_students_with_linked_chat: contactRows.filter((row) => row.linkedChats > 0).length,
    active_students_without_reliable_phone_with_linked_chat: withoutReliablePhone.filter((row) => row.linkedChats > 0).length,
    active_students_with_multiple_linked_chats: contactRows.filter((row) => row.linkedChats > 1).length,
  };
}
