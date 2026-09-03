export type WhatsAppDeliveryUpdate = {
  messageExternalId: string;
  providerStatus: string;
  normalizedStatus: "pending" | "accepted" | "delivered" | "read" | "failed" | "deleted";
};

const STATUS_BY_NUMBER: Record<number, string> = {
  0: "ERROR",
  1: "PENDING",
  2: "SERVER_ACK",
  3: "DELIVERY_ACK",
  4: "READ",
  5: "PLAYED",
};

export function normalizeWhatsAppDeliveryStatus(
  value: unknown,
): WhatsAppDeliveryUpdate["normalizedStatus"] | null {
  const raw = typeof value === "number"
    ? STATUS_BY_NUMBER[value]
    : String(value ?? "").trim().toUpperCase();
  if (raw === "ERROR" || raw === "FAILED") return "failed";
  if (raw === "PENDING") return "pending";
  if (raw === "SERVER_ACK" || raw === "SENT" || raw === "ACCEPTED") return "accepted";
  if (raw === "DELIVERY_ACK" || raw === "DELIVERED") return "delivered";
  if (raw === "READ" || raw === "PLAYED") return "read";
  if (raw === "DELETED") return "deleted";
  return null;
}

export function whatsappDeliveryRank(status: unknown): number {
  switch (String(status ?? "").toLowerCase()) {
    case "pending": return 0;
    case "sent":
    case "accepted": return 1;
    case "delivered": return 2;
    case "read": return 3;
    default: return -1;
  }
}

export function shouldApplyWhatsAppDeliveryStatus(
  currentStatus: unknown,
  nextStatus: WhatsAppDeliveryUpdate["normalizedStatus"],
): boolean {
  if (nextStatus === "deleted") return false;
  const currentRank = whatsappDeliveryRank(currentStatus);
  if (nextStatus === "failed") return currentRank < 2;
  return whatsappDeliveryRank(nextStatus) >= currentRank;
}

function deliveryRecords(body: any): any[] {
  const candidates = [body?.data?.records, body?.data, body?.messages, body?.message];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === "object") return [candidate];
  }
  return [];
}

export function extractWhatsAppDeliveryUpdates(body: any): WhatsAppDeliveryUpdate[] {
  return deliveryRecords(body).flatMap((record) => {
    const messageExternalId = record?.keyId ?? record?.messageId ??
      record?.key?.id ?? record?.id ?? null;
    const providerStatusValue = record?.status ?? record?.update?.status ?? null;
    const normalizedStatus = normalizeWhatsAppDeliveryStatus(providerStatusValue);
    if (!messageExternalId || !normalizedStatus) return [];
    const providerStatus = typeof providerStatusValue === "number"
      ? (STATUS_BY_NUMBER[providerStatusValue] || String(providerStatusValue))
      : String(providerStatusValue).trim().toUpperCase();
    return [{
      messageExternalId: String(messageExternalId),
      providerStatus,
      normalizedStatus,
    }];
  });
}
