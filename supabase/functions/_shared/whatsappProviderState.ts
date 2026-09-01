export type WhatsAppProviderIssue =
  | "whatsapp_instance_not_connected"
  | "whatsapp_instance_missing"
  | "whatsapp_provider_unauthorized"
  | "whatsapp_provider_busy"
  | "whatsapp_recipient_rejected"
  | "whatsapp_provider_invalid_payload"
  | "whatsapp_provider_failure";

export function providerIssueFromResponse(
  status: number,
  rawBody: string,
): WhatsAppProviderIssue {
  const body = String(rawBody || "").toLowerCase();

  if (status === 401 || status === 403) return "whatsapp_provider_unauthorized";
  if (status === 408 || status === 429) return "whatsapp_provider_busy";
  if (
    body.includes("instance") &&
    (body.includes("does not exist") || body.includes("not found"))
  ) return "whatsapp_instance_missing";
  if (
    body.includes("not connected") ||
    body.includes("connection closed") ||
    body.includes("connection is closed") ||
    body.includes("logged out")
  ) return "whatsapp_instance_not_connected";
  if (
    body.includes("not on whatsapp") ||
    body.includes("number does not exist") ||
    body.includes("invalid whatsapp number") ||
    body.includes('"exists":false')
  ) return "whatsapp_recipient_rejected";
  if (
    status === 400 &&
    (body.includes("required") || body.includes("invalid format") ||
      body.includes("validation"))
  ) return "whatsapp_provider_invalid_payload";
  return "whatsapp_provider_failure";
}

export function providerConnectionState(payload: unknown):
  | "connected"
  | "waiting_qr"
  | "disconnected" {
  const value = payload as Record<string, unknown> | null;
  const instance = value?.instance as Record<string, unknown> | undefined;
  const raw = String(instance?.state || value?.state || "").toLowerCase();
  if (raw === "open" || raw === "connected") return "connected";
  if (raw === "connecting" || raw === "waiting_qr") return "waiting_qr";
  return "disconnected";
}
