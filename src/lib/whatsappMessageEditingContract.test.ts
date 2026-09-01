import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const managerPath = resolve(root, "supabase/functions/whatsapp-manager/index.ts");
const chatPath = resolve(root, "src/pages/admin/WhatsAppChat.tsx");
const migrationPath = resolve(
  root,
  "supabase/migrations/20260901150000_whatsapp_message_edit_audit.sql",
);

describe("WhatsApp message editing contract", () => {
  it("pins edit-message to the stored connected instance and derives the recipient server-side", () => {
    const manager = readFileSync(managerPath, "utf8");

    expect(manager).toMatch(/outboundActions[\s\S]*edit-message/);
    expect(manager).toContain('action === "edit-message"');
    expect(manager).toContain(
      "verifyOutboundRecipient(\n        boundChat.remote_jid,\n        boundChat.student_id,\n      )",
    );
    expect(manager).toContain("const effectiveEditJid = verifiedRecipient.remoteJid");
    expect(manager).toContain("number: evolutionTextRecipient(effectiveEditJid)");
    expect(manager).toContain("remoteJid: effectiveEditJid");
    expect(manager).toContain('/chat/updateMessage/${instanceName}`');
    expect(manager).toContain('method: "POST"');
    expect(manager).toContain("fromMe: true");
  });

  it("validates the persisted tenant/chat/message and commits only after provider success", () => {
    const manager = readFileSync(managerPath, "utf8");
    const editStart = manager.indexOf('action === "edit-message"');
    const editEnd = manager.indexOf('action === "delete-message"', editStart);
    const editBranch = manager.slice(editStart, editEnd);

    expect(editStart).toBeGreaterThan(0);
    expect(editBranch).toContain('.from("whatsapp_messages")');
    expect(editBranch).toContain('.eq("chat_id", boundChat.id)');
    expect(editBranch).toContain('.eq("company_id", resolvedCompanyId)');
    expect(editBranch).toContain('.eq("message_id_external", messageId)');
    expect(editBranch).not.toContain("body.remoteJid");

    const providerCall = editBranch.indexOf("fetch(providerUrl");
    const identityCheck = editBranch.indexOf("verifyOutboundRecipient(");
    const commit = editBranch.indexOf('"commit_whatsapp_message_edit"');
    expect(identityCheck).toBeGreaterThan(0);
    expect(providerCall).toBeGreaterThan(identityCheck);
    expect(providerCall).toBeGreaterThan(0);
    expect(commit).toBeGreaterThan(providerCall);
    expect(editBranch.match(/fetch\(providerUrl/g)).toHaveLength(1);
    expect(editBranch).toContain("isTransientWhatsAppEditCommitError(commitResult.error)");
    expect(editBranch.match(/await commitLocalEdit\(\)/g)).toHaveLength(2);
  });

  it("offers a bounded edit mode and marks edited messages", () => {
    const chat = readFileSync(chatPath, "utf8");

    expect(chat).toContain("messageEditEligibility");
    expect(chat).toContain("editingMessage");
    expect(chat).toContain('action: "edit-message"');
    expect(chat).toContain("Cancelar edição");
    expect(chat).toContain("editada");
    const saveStart = chat.indexOf("const handleSaveMessageEdit = async () =>");
    const saveEnd = chat.indexOf("const handleDeleteMessage", saveStart);
    const saveBranch = chat.slice(saveStart, saveEnd);
    const routingGate = saveBranch.indexOf("shouldApplyWhatsAppMessageEditResult({");
    const messageApply = saveBranch.indexOf("setMessages((prev)");
    expect(routingGate).toBeGreaterThan(0);
    expect(saveBranch).toContain("activeChatId: selectedChatIdRef.current");
    expect(saveBranch).toContain("message: updatedMessage");
    expect(messageApply).toBeGreaterThan(routingGate);
    expect(chat.match(/opacity-100 transition-opacity[^"]*md:opacity-0 md:group-hover:opacity-100/g))
      .toHaveLength(3);
  });

  it("ships an auditable service-role-only database commit", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("edited_at timestamptz");
    expect(migration).toContain("edited_by uuid");
    expect(migration).toContain("commit_whatsapp_message_edit");
    expect(migration).toMatch(/revoke all[\s\S]*from public, anon, authenticated/i);
    expect(migration).toMatch(/grant execute[\s\S]*to service_role/i);
    expect(migration).toContain("coalesce(newer.timestamp, newer.created_at)");
    expect(migration).toContain("coalesce(v_message.timestamp, v_message.created_at)");
    expect(migration).toMatch(
      /statement_timestamp\(\)[\s\S]*coalesce\(v_message\.timestamp, v_message\.created_at\)[\s\S]*interval '15 minutes'/,
    );
  });
});
