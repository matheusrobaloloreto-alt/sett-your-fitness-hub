import {
  extractWhatsAppDeliveryUpdates,
  normalizeWhatsAppDeliveryStatus,
  shouldApplyWhatsAppDeliveryStatus,
} from "./whatsappDeliveryStatus.ts";

Deno.test("extracts Evolution MESSAGES_UPDATE delivery receipts", () => {
  const [update] = extractWhatsAppDeliveryUpdates({
    event: "MESSAGES_UPDATE",
    instance: "example",
    data: {
      keyId: "provider-message-id",
      remoteJid: "recipient@s.whatsapp.net",
      fromMe: true,
      status: "DELIVERY_ACK",
      instanceId: "provider-instance-id",
    },
  });
  if (update?.messageExternalId !== "provider-message-id") throw new Error("message id");
  if (update?.normalizedStatus !== "delivered") throw new Error("delivery status");
});

Deno.test("normalizes numeric and played/read receipts", () => {
  if (normalizeWhatsAppDeliveryStatus(4) !== "read") throw new Error("numeric read");
  if (normalizeWhatsAppDeliveryStatus("PLAYED") !== "read") throw new Error("played");
});

Deno.test("never downgrades delivered/read messages with late provider events", () => {
  if (shouldApplyWhatsAppDeliveryStatus("read", "delivered")) throw new Error("read downgraded");
  if (shouldApplyWhatsAppDeliveryStatus("delivered", "failed")) throw new Error("delivery downgraded");
  if (!shouldApplyWhatsAppDeliveryStatus("accepted", "delivered")) throw new Error("delivery ignored");
});

Deno.test("ignores unknown and deleted updates for delivery state", () => {
  if (extractWhatsAppDeliveryUpdates({ data: { keyId: "x", status: "UNKNOWN" } }).length) {
    throw new Error("unknown accepted");
  }
  if (shouldApplyWhatsAppDeliveryStatus("read", "deleted")) throw new Error("deleted applied");
});
