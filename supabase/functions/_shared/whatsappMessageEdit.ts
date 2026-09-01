export const WHATSAPP_MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;
export const WHATSAPP_MESSAGE_EDIT_MAX_LENGTH = 4096;

const TRANSIENT_EDIT_COMMIT_CODES = new Set([
  "40001",
  "40P01",
  "55P03",
  "57014",
  "PGRST000",
  "PGRST001",
  "PGRST002",
  "PGRST003",
]);

export type WhatsAppMessageEditErrorCode =
  | "whatsapp_edit_not_outgoing"
  | "whatsapp_edit_not_text"
  | "whatsapp_edit_external_id_missing"
  | "whatsapp_edit_timestamp_invalid"
  | "whatsapp_edit_window_expired"
  | "whatsapp_edit_content_invalid"
  | "whatsapp_edit_content_unchanged";

type EditCandidate = {
  source?: unknown;
  type?: unknown;
  is_from_me?: unknown;
  message_id_external?: unknown;
  timestamp?: unknown;
  created_at?: unknown;
};

export type MessageEditEligibility =
  | { ok: true; sentAt: number; expiresAt: number }
  | { ok: false; code: WhatsAppMessageEditErrorCode };

const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

function parseIsoTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || !ISO_TIMESTAMP.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isTransientWhatsAppEditCommitError(
  error: { code?: unknown } | null | undefined,
): boolean {
  return typeof error?.code === "string" &&
    TRANSIENT_EDIT_COMMIT_CODES.has(error.code);
}

export function messageEditEligibility(
  message: EditCandidate,
  now = Date.now(),
): MessageEditEligibility {
  if (message.source !== "outgoing" || message.is_from_me === false) {
    return { ok: false, code: "whatsapp_edit_not_outgoing" };
  }
  if (message.type !== "text") {
    return { ok: false, code: "whatsapp_edit_not_text" };
  }
  if (
    typeof message.message_id_external !== "string" ||
    !message.message_id_external.trim()
  ) {
    return { ok: false, code: "whatsapp_edit_external_id_missing" };
  }

  const preferredTimestamp =
    typeof message.timestamp === "string" && message.timestamp.trim()
      ? message.timestamp
      : message.created_at;
  const sentAt = parseIsoTimestamp(preferredTimestamp);
  if (sentAt === null || !Number.isFinite(now) || sentAt > now) {
    return { ok: false, code: "whatsapp_edit_timestamp_invalid" };
  }
  if (now - sentAt > WHATSAPP_MESSAGE_EDIT_WINDOW_MS) {
    return { ok: false, code: "whatsapp_edit_window_expired" };
  }

  return {
    ok: true,
    sentAt,
    expiresAt: sentAt + WHATSAPP_MESSAGE_EDIT_WINDOW_MS,
  };
}

export function normalizeEditedMessageText(
  value: unknown,
  currentContent: unknown,
):
  | { ok: true; text: string }
  | { ok: false; code: WhatsAppMessageEditErrorCode } {
  if (typeof value !== "string") {
    return { ok: false, code: "whatsapp_edit_content_invalid" };
  }
  const text = value.trim();
  if (!text || text.length > WHATSAPP_MESSAGE_EDIT_MAX_LENGTH) {
    return { ok: false, code: "whatsapp_edit_content_invalid" };
  }
  if (text === String(currentContent ?? "").trim()) {
    return { ok: false, code: "whatsapp_edit_content_unchanged" };
  }
  return { ok: true, text };
}
