import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const managerSource = readFileSync("supabase/functions/whatsapp-manager/index.ts", "utf8");
const dispatcherSource = readFileSync("supabase/functions/process-automation-sessions/index.ts", "utf8");
const crmSource = readFileSync("src/pages/admin/WhatsAppCRM.tsx", "utf8");

describe("WhatsApp recipient safety contracts", () => {
  it("binds every manual send with a chat to the server-side recipient", () => {
    expect(managerSource).toContain('.select("id, remote_jid, student_id, contact_name")');
    expect(managerSource).toContain("sameWhatsAppRecipient(remoteJid, boundChat.remote_jid)");
    expect(managerSource).toContain('code: "whatsapp_recipient_mismatch"');
    expect(managerSource).toContain("number: evolutionTextRecipient(effectiveRemoteJid)");
  });

  it("validates a new conversation against the student's registered phone", () => {
    expect(managerSource).toContain('.select("id, phone, whatsapp")');
    expect(managerSource).toContain('code: "whatsapp_student_recipient_mismatch"');
  });

  it("uses the same provider recipient normalization in automations", () => {
    expect(dispatcherSource).toContain("number: evolutionTextRecipient(args.remoteJid)");
    expect(dispatcherSource).toContain("expectedStudentId !== chat.student_id");
    expect(dispatcherSource).toContain("envio automático bloqueado para revisão");
  });

  it("includes the student identity in CRM broadcasts", () => {
    expect(crmSource).toContain("studentId: r.id");
  });
});
