import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const managerSource = readFileSync(
  "supabase/functions/whatsapp-manager/index.ts",
  "utf8",
);
const dispatcherSource = readFileSync(
  "supabase/functions/process-automation-sessions/index.ts",
  "utf8",
);
const webhookSource = readFileSync(
  "supabase/functions/whatsapp-webhook/index.ts",
  "utf8",
);
const crmSource = readFileSync("src/pages/admin/WhatsAppCRM.tsx", "utf8");
const supabaseConfig = readFileSync("supabase/config.toml", "utf8");

describe("WhatsApp recipient safety contracts", () => {
  it("binds every manual send with a chat to the server-side recipient", () => {
    expect(managerSource).toContain(
      '.select("id, remote_jid, student_id, contact_name, instance_id")',
    );
    expect(managerSource).toContain("resolveVerifiedWhatsAppRecipient({");
    expect(managerSource).toContain("chatRemoteJid: boundChat?.remote_jid");
    expect(managerSource).toContain("chatStudentId: boundChat?.student_id");
    expect(managerSource).toContain(
      "number: evolutionTextRecipient(effectiveRemoteJid)",
    );
  });

  it("binds text, media and edit operations to the chat instance and requires it to be connected", () => {
    expect(managerSource).toMatch(
      /const outboundActions = new Set\(\[[\s\S]*"send-message",[\s\S]*"send-media",[\s\S]*"edit-message",[\s\S]*\]\)/,
    );
    expect(managerSource).toContain('.eq("id", boundChat.instance_id)');
    expect(managerSource).toContain('.eq("status", "connected")');
    expect(managerSource).toContain('code: "whatsapp_instance_not_connected"');
    expect(managerSource).toContain(
      "outboundActions.has(action) && (instanceLookupError || !instanceRow)",
    );
  });

  it("revalidates the provider session live and persists a stale connection as disconnected", () => {
    expect(managerSource).toContain(
      "const verifyLiveOutboundInstance = async () =>",
    );
    expect(managerSource).toContain(
      "/instance/connectionState/${instanceName}",
    );
    expect(managerSource).toMatch(
      /await persistInstance\(\{\s*status: "disconnected",\s*phone_number: null,\s*qr_code: null,?\s*\}\)/,
    );
    expect(managerSource.match(/await verifyLiveOutboundInstance\(\)/g))
      .toHaveLength(3);
  });

  it("pins JWT verification for the manual WhatsApp manager deploy", () => {
    expect(supabaseConfig).toMatch(
      /\[functions\.whatsapp-manager\]\s+verify_jwt\s*=\s*true/,
    );
  });

  it("keeps provider diagnostics admin-only, read-only and redacted", () => {
    expect(managerSource).toContain('"provider-diagnostics"');
    expect(managerSource).toContain("probeProviderEndpoint(");
    expect(managerSource).toContain("probeZapiFallback({");
    expect(managerSource).toContain(
      "expectedPhone: instanceRow?.phone_number || null",
    );
    expect(managerSource).not.toContain(
      'json({ error: "Evolution API error", details: errText }',
    );
    expect(managerSource).not.toMatch(/details:\s*errText/);
    expect(managerSource).not.toMatch(
      /console\.(?:error|warn)\([^\n]*errText/,
    );
    expect(managerSource).not.toContain("details: webhookError,");
    expect(managerSource).toContain(
      '"delivery webhook provider error:",',
    );
    expect(managerSource).toContain(
      "providerErrorDetails(response.status, issue, rawBody);",
    );
    expect(managerSource).not.toContain("JSON.stringify(createData)");
    expect(managerSource).toContain(
      '"[createFreshInstance] provider response:",',
    );
  });

  it("redacts provider bodies from webhook repair logs", () => {
    expect(webhookSource).not.toContain(
      'console.error("[repair-sync] webhook/set failed:", await webhookRes.text())',
    );
    expect(webhookSource).toContain(
      "sanitizeProviderErrorForLog(\n            webhookRes.status,",
    );
    expect(webhookSource).not.toContain(
      'console.error("[flow] Send failed:", await res.text())',
    );
    expect(webhookSource).toContain(
      "sanitizeProviderErrorForLog(res.status, issue, rawBody)",
    );
  });

  it("validates a new conversation against the student's registered phone", () => {
    expect(managerSource).toContain('.select("id, phone, whatsapp")');
    expect(managerSource).toContain("whatsapp_stored_recipient_mismatch");
  });

  it("uses the same provider recipient normalization in automations", () => {
    expect(dispatcherSource).toContain(
      "number: evolutionTextRecipient(args.remoteJid)",
    );
    expect(dispatcherSource).toContain("resolveVerifiedWhatsAppRecipient({");
    expect(dispatcherSource).toContain(
      "envio automático bloqueado para revisão",
    );
  });

  it("includes the student identity in CRM broadcasts", () => {
    expect(crmSource).toContain("studentId: r.id");
  });
});
