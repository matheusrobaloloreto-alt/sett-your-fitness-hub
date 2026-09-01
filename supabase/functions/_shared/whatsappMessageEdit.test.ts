import {
  isTransientWhatsAppEditCommitError,
  messageEditEligibility,
  normalizeEditedMessageText,
  WHATSAPP_MESSAGE_EDIT_WINDOW_MS,
} from "./whatsappMessageEdit.ts";

const NOW = Date.parse("2026-09-01T15:00:00.000Z");

const editableMessage = {
  source: "outgoing",
  type: "text",
  is_from_me: true,
  message_id_external: "provider-message-id",
  timestamp: "2026-09-01T14:50:00.000Z",
  created_at: "2026-09-01T14:49:00.000Z",
};

Deno.test("allows an outgoing provider text inside the 15 minute window", () => {
  const result = messageEditEligibility(editableMessage, NOW);
  if (!result.ok) throw new Error(`expected editable message, got ${result.code}`);
  if (result.sentAt !== Date.parse(editableMessage.timestamp)) {
    throw new Error("timestamp must take precedence over created_at");
  }
});

Deno.test("uses created_at only when timestamp is absent", () => {
  const result = messageEditEligibility({
    ...editableMessage,
    timestamp: null,
  }, NOW);
  if (!result.ok || result.sentAt !== Date.parse(editableMessage.created_at)) {
    throw new Error("created_at fallback was not used");
  }
});

Deno.test("fails closed for expired, future or malformed timestamps", () => {
  const expired = messageEditEligibility({
    ...editableMessage,
    timestamp: new Date(NOW - WHATSAPP_MESSAGE_EDIT_WINDOW_MS - 1).toISOString(),
  }, NOW);
  if (expired.ok || expired.code !== "whatsapp_edit_window_expired") {
    throw new Error("expired messages must be rejected");
  }

  const future = messageEditEligibility({
    ...editableMessage,
    timestamp: new Date(NOW + 1).toISOString(),
  }, NOW);
  if (future.ok || future.code !== "whatsapp_edit_timestamp_invalid") {
    throw new Error("future messages must be rejected");
  }

  for (const timestamp of ["", "2026-09-01", "not-a-date"]) {
    const malformed = messageEditEligibility({
      ...editableMessage,
      timestamp,
      created_at: timestamp,
    }, NOW);
    if (malformed.ok || malformed.code !== "whatsapp_edit_timestamp_invalid") {
      throw new Error(`malformed timestamp must be rejected: ${timestamp}`);
    }
  }
});

Deno.test("rejects incoming, non-text and provider-less messages", () => {
  const incoming = messageEditEligibility({ ...editableMessage, source: "incoming" }, NOW);
  const media = messageEditEligibility({ ...editableMessage, type: "image" }, NOW);
  const providerless = messageEditEligibility({ ...editableMessage, message_id_external: null }, NOW);
  const notFromMe = messageEditEligibility({ ...editableMessage, is_from_me: false }, NOW);

  if (incoming.ok || incoming.code !== "whatsapp_edit_not_outgoing") throw new Error("incoming accepted");
  if (media.ok || media.code !== "whatsapp_edit_not_text") throw new Error("media accepted");
  if (providerless.ok || providerless.code !== "whatsapp_edit_external_id_missing") {
    throw new Error("message without provider id accepted");
  }
  if (notFromMe.ok || notFromMe.code !== "whatsapp_edit_not_outgoing") {
    throw new Error("provider message not marked fromMe accepted");
  }
});

Deno.test("normalizes edited text and rejects empty, unchanged or oversized content", () => {
  const normalized = normalizeEditedMessageText("  nova mensagem  ", "mensagem anterior");
  if (!normalized.ok || normalized.text !== "nova mensagem") {
    throw new Error("edited text was not normalized");
  }

  const empty = normalizeEditedMessageText("   ", "mensagem anterior");
  const unchanged = normalizeEditedMessageText(" mesma ", "mesma");
  const oversized = normalizeEditedMessageText("a".repeat(4097), "mensagem anterior");
  if (empty.ok || empty.code !== "whatsapp_edit_content_invalid") throw new Error("empty accepted");
  if (unchanged.ok || unchanged.code !== "whatsapp_edit_content_unchanged") throw new Error("unchanged accepted");
  if (oversized.ok || oversized.code !== "whatsapp_edit_content_invalid") throw new Error("oversized accepted");
});

Deno.test("retries only known transient database failures", () => {
  for (const code of ["40001", "40P01", "55P03", "57014", "PGRST000", "PGRST003"]) {
    if (!isTransientWhatsAppEditCommitError({ code })) {
      throw new Error(`transient database code rejected: ${code}`);
    }
  }
  for (const code of ["42883", "23514", "P0002", "unknown", ""]) {
    if (isTransientWhatsAppEditCommitError({ code })) {
      throw new Error(`deterministic database code retried: ${code}`);
    }
  }
});
