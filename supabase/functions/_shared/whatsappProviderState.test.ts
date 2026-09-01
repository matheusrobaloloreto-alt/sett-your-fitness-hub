import {
  providerConnectionState,
  providerIssueFromResponse,
} from "./whatsappProviderState.ts";

Deno.test("classifies stale or missing provider instances separately from recipients", () => {
  if (
    providerIssueFromResponse(
      404,
      '{"response":{"message":["The instance does not exist"]}}',
    ) !== "whatsapp_instance_missing"
  ) throw new Error("missing instance was misclassified");

  if (
    providerIssueFromResponse(400, '{"message":"Connection Closed"}') !==
      "whatsapp_instance_not_connected"
  ) throw new Error("closed connection was misclassified");
});

Deno.test("classifies provider recipient and payload failures without returning raw content", () => {
  if (
    providerIssueFromResponse(400, '{"exists":false,"number":"sensitive"}') !==
      "whatsapp_recipient_rejected"
  ) throw new Error("recipient rejection was misclassified");

  if (
    providerIssueFromResponse(400, '{"message":"text is required"}') !==
      "whatsapp_provider_invalid_payload"
  ) throw new Error("invalid payload was misclassified");
});

Deno.test("maps live Evolution connection states", () => {
  if (
    providerConnectionState({ instance: { state: "open" } }) !== "connected"
  ) {
    throw new Error("open state should be connected");
  }
  if (
    providerConnectionState({ instance: { state: "connecting" } }) !==
      "waiting_qr"
  ) {
    throw new Error("connecting state should wait for QR");
  }
  if (
    providerConnectionState({ instance: { state: "close" } }) !== "disconnected"
  ) {
    throw new Error("closed state should be disconnected");
  }
});
