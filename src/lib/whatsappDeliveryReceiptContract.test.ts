import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const webhook = readFileSync("supabase/functions/whatsapp-webhook/index.ts", "utf8");
const manager = readFileSync("supabase/functions/whatsapp-manager/index.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260903110927_track_whatsapp_delivery_receipts.sql",
  "utf8",
);

describe("WhatsApp delivery receipt contract", () => {
  it("subscribes every managed Evolution webhook to message updates", () => {
    expect(webhook).toContain('event === "MESSAGES_UPDATE"');
    expect(webhook).toContain('"messages.update"');
    expect(manager.match(/"MESSAGES_UPDATE"/g)?.length).toBeGreaterThanOrEqual(3);
    expect(manager).toContain('"messages.update"');
  });

  it("reconciles legacy connected instances during the normal status check", () => {
    expect(manager).toContain("const ensureDeliveryWebhook = async () =>");
    expect(manager).toMatch(
      /if \(mappedStatus === "connected"\) \{\s*const webhookResult = await ensureDeliveryWebhook\(\);\s*deliveryWebhookConfigured = webhookResult\.ok;/,
    );
    expect(manager).toMatch(
      /return json\(\{\s*status: mappedStatus,\s*phone: connectedPhone,\s*deliveryWebhookConfigured,/,
    );
    expect(manager).toContain('console.error("delivery webhook provider error: network_failure")');
  });

  it("matches receipts only inside the resolved company and outgoing messages", () => {
    expect(webhook).toContain('.eq("company_id", instance.company_id)');
    expect(webhook).toContain('.eq("message_id_external", receipt.messageExternalId)');
    expect(webhook).toContain('.eq("is_from_me", true)');
  });

  it("stores provider metadata without persisting the raw webhook payload", () => {
    expect(migration).toContain("provider_status text");
    expect(migration).toContain("delivered_at timestamptz");
    expect(migration).toContain("read_at timestamptz");
    expect(migration).not.toContain("payload json");
  });
});
