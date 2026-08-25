import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const managerSource = readFileSync("supabase/functions/whatsapp-manager/index.ts", "utf8");
const dispatcherSource = readFileSync("supabase/functions/process-automation-sessions/index.ts", "utf8");
const crmSource = readFileSync("src/pages/admin/WhatsAppCRM.tsx", "utf8");

describe("WhatsApp recipient safety contracts", () => {
  it("binds every manual send with a chat to the server-side recipient", () => {
    expect(managerSource).toContain('.select("id, remote_jid, student_id, contact_name, instance_id")');
    expect(managerSource).toContain("resolveVerifiedWhatsAppRecipient({");
    expect(managerSource).toContain("chatRemoteJid: boundChat?.remote_jid");
    expect(managerSource).toContain("chatStudentId: boundChat?.student_id");
    expect(managerSource).toContain("number: evolutionTextRecipient(effectiveRemoteJid)");
  });

  it("binds text and media sends to the chat instance and requires it to be connected", () => {
    expect(managerSource).toContain('const outboundActions = new Set(["send-message", "send-media"])');
    expect(managerSource).toContain('.eq("id", boundChat.instance_id)');
    expect(managerSource).toContain('.eq("status", "connected")');
    expect(managerSource).toContain('code: "whatsapp_instance_not_connected"');
    expect(managerSource).toContain("outboundActions.has(action) && (instanceLookupError || !instanceRow)");
  });

  it("validates a new conversation against the student's registered phone", () => {
    expect(managerSource).toContain('.select("id, phone, whatsapp")');
    expect(managerSource).toContain("whatsapp_stored_recipient_mismatch");
  });

  it("uses the same provider recipient normalization in automations", () => {
    expect(dispatcherSource).toContain("number: evolutionTextRecipient(args.remoteJid)");
    expect(dispatcherSource).toContain("resolveVerifiedWhatsAppRecipient({");
    expect(dispatcherSource).toContain("envio automático bloqueado para revisão");
  });

  it("includes the student identity in CRM broadcasts", () => {
    expect(crmSource).toContain("studentId: r.id");
  });
});
