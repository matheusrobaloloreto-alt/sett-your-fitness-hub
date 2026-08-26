export const MAX_OUTBOUND_WHATSAPP_MEDIA_BYTES = 512 * 1024 * 1024;
export const INLINE_OUTBOUND_VIDEO_MAX_BYTES = 64 * 1024 * 1024;

export type OutboundWhatsAppMediaSource = "chat-upload" | "student-upload";
export type OutboundWhatsAppMediaType = "image" | "video" | "audio" | "document";

type OutboundWhatsAppMediaInput = {
  source: OutboundWhatsAppMediaSource;
  bucket: string;
  path: string;
  companyId: string;
  chatId: string | null;
  studentId: string | null;
  claimedMimeType: string | null;
  objectMimeType: string | null;
  objectSize: number | null;
};

type OutboundWhatsAppMediaResult =
  | { ok: true; mimeType: string; size: number }
  | {
    ok: false;
    code:
      | "whatsapp_media_invalid_reference"
      | "whatsapp_media_scope_mismatch"
      | "whatsapp_media_missing"
      | "whatsapp_media_too_large"
      | "whatsapp_media_mime_mismatch"
      | "whatsapp_media_unsupported_type";
  };

const STUDENT_UPLOAD_BUCKETS = new Set(["student-files", "evaluations", "whatsapp-media"]);

function normalizeMimeType(value: unknown): string {
  return String(value || "").split(";", 1)[0].trim().toLowerCase();
}

function isSafeMediaMimeType(value: string): boolean {
  if (value.startsWith("image/")) return value !== "image/svg+xml";
  if (value.startsWith("video/") || value.startsWith("audio/")) return true;
  return new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/zip",
    "text/plain",
    "text/csv",
  ]).has(value);
}

function isSafeStoragePath(path: string): boolean {
  return !!path &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.split("/").some((part) => !part || part === "." || part === "..") &&
    !path.includes("://");
}

export function validateOutboundWhatsAppMedia(
  input: OutboundWhatsAppMediaInput,
): OutboundWhatsAppMediaResult {
  if (!isSafeStoragePath(input.path)) {
    return { ok: false, code: "whatsapp_media_invalid_reference" };
  }

  let expectedPrefix = "";
  if (input.source === "chat-upload") {
    if (input.bucket !== "whatsapp-media" || !input.chatId) {
      return { ok: false, code: "whatsapp_media_invalid_reference" };
    }
    expectedPrefix = `${input.companyId}/${input.chatId}/`;
  } else if (input.source === "student-upload") {
    if (!STUDENT_UPLOAD_BUCKETS.has(input.bucket) || !input.studentId) {
      return { ok: false, code: "whatsapp_media_invalid_reference" };
    }
    expectedPrefix = `${input.companyId}/${input.studentId}/`;
  } else {
    return { ok: false, code: "whatsapp_media_invalid_reference" };
  }

  if (!input.path.startsWith(expectedPrefix)) {
    return { ok: false, code: "whatsapp_media_scope_mismatch" };
  }

  const size = Number(input.objectSize);
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, code: "whatsapp_media_missing" };
  }
  if (size > MAX_OUTBOUND_WHATSAPP_MEDIA_BYTES) {
    return { ok: false, code: "whatsapp_media_too_large" };
  }

  const claimedMime = normalizeMimeType(input.claimedMimeType);
  const objectMime = normalizeMimeType(input.objectMimeType);
  if (!objectMime) return { ok: false, code: "whatsapp_media_missing" };
  if (claimedMime && claimedMime !== objectMime) {
    return { ok: false, code: "whatsapp_media_mime_mismatch" };
  }
  if (!isSafeMediaMimeType(objectMime)) {
    return { ok: false, code: "whatsapp_media_unsupported_type" };
  }

  return { ok: true, mimeType: objectMime, size };
}

export function resolveOutboundWhatsAppMediaType(input: {
  mimeType: string;
  size: number;
  requestedMediaType: unknown;
}):
  | { ok: true; mediaType: OutboundWhatsAppMediaType }
  | { ok: false; code: "whatsapp_media_delivery_type_mismatch" } {
  const mimeType = normalizeMimeType(input.mimeType);
  const requested = String(input.requestedMediaType || "").trim().toLowerCase();
  let expected: OutboundWhatsAppMediaType;

  if (mimeType.startsWith("image/")) expected = "image";
  else if (mimeType.startsWith("audio/")) expected = "audio";
  else if (mimeType.startsWith("video/")) {
    expected = input.size > INLINE_OUTBOUND_VIDEO_MAX_BYTES ? "document" : "video";
  } else expected = "document";

  if (requested && requested !== expected) {
    return { ok: false, code: "whatsapp_media_delivery_type_mismatch" };
  }
  return { ok: true, mediaType: expected };
}
