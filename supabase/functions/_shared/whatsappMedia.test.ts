import {
  INLINE_OUTBOUND_VIDEO_MAX_BYTES,
  MAX_OUTBOUND_WHATSAPP_MEDIA_BYTES,
  resolveOutboundWhatsAppMediaType,
  validateOutboundWhatsAppMedia,
} from "./whatsappMedia.ts";

const base = {
  source: "chat-upload" as const,
  bucket: "whatsapp-media",
  path: "company-1/chat-1/video.mp4",
  companyId: "company-1",
  chatId: "chat-1",
  studentId: null,
  claimedMimeType: "video/mp4",
  objectMimeType: "video/mp4",
  objectSize: 12_000_000,
};

Deno.test("accepts a chat upload only inside the authenticated company and chat prefix", () => {
  const result = validateOutboundWhatsAppMedia(base);
  if (!result.ok) throw new Error(`Expected valid media, received ${result.code}`);
});

Deno.test("rejects a cross-chat or cross-tenant upload", () => {
  for (const path of [
    "other-company/chat-1/video.mp4",
    "company-1/other-chat/video.mp4",
  ]) {
    const result = validateOutboundWhatsAppMedia({ ...base, path });
    if (result.ok || result.code !== "whatsapp_media_scope_mismatch") {
      throw new Error(`Expected scope mismatch for ${path}`);
    }
  }
});

Deno.test("rejects external references and unapproved buckets", () => {
  const external = validateOutboundWhatsAppMedia({ ...base, path: "https://example.com/video.mp4" });
  if (external.ok || external.code !== "whatsapp_media_invalid_reference") {
    throw new Error("Expected an external URL to be rejected");
  }

  const bucket = validateOutboundWhatsAppMedia({ ...base, bucket: "public-assets" });
  if (bucket.ok || bucket.code !== "whatsapp_media_invalid_reference") {
    throw new Error("Expected an unapproved bucket to be rejected");
  }
});

Deno.test("rejects oversized media before provider delivery", () => {
  const result = validateOutboundWhatsAppMedia({
    ...base,
    objectSize: MAX_OUTBOUND_WHATSAPP_MEDIA_BYTES + 1,
  });
  if (result.ok || result.code !== "whatsapp_media_too_large") {
    throw new Error("Expected oversized media to be rejected");
  }
});

Deno.test("rejects a forged MIME type and unsafe active content", () => {
  const forged = validateOutboundWhatsAppMedia({
    ...base,
    claimedMimeType: "video/mp4",
    objectMimeType: "application/pdf",
  });
  if (forged.ok || forged.code !== "whatsapp_media_mime_mismatch") {
    throw new Error("Expected a forged MIME type to be rejected");
  }

  const html = validateOutboundWhatsAppMedia({
    ...base,
    path: "company-1/chat-1/page.html",
    claimedMimeType: "text/html",
    objectMimeType: "text/html",
  });
  if (html.ok || html.code !== "whatsapp_media_unsupported_type") {
    throw new Error("Expected active HTML content to be rejected");
  }
});

Deno.test("accepts a student document only inside that student's tenant folder", () => {
  const result = validateOutboundWhatsAppMedia({
    ...base,
    source: "student-upload",
    bucket: "student-files",
    path: "company-1/student-1/report.pdf",
    chatId: "chat-1",
    studentId: "student-1",
    claimedMimeType: "application/pdf",
    objectMimeType: "application/pdf",
  });
  if (!result.ok) throw new Error(`Expected valid student document, received ${result.code}`);
});

Deno.test("derives delivery type from the validated MIME instead of trusting the client", () => {
  const invalidPdf = resolveOutboundWhatsAppMediaType({
    mimeType: "application/pdf",
    size: 100,
    requestedMediaType: "image",
  });
  if (invalidPdf.ok || invalidPdf.code !== "whatsapp_media_delivery_type_mismatch") {
    throw new Error("Expected PDF disguised as an image to be rejected");
  }

  for (const requestedMediaType of ["document", "image"]) {
    const invalidAudio = resolveOutboundWhatsAppMediaType({
      mimeType: "audio/webm",
      size: 100,
      requestedMediaType,
    });
    if (invalidAudio.ok || invalidAudio.code !== "whatsapp_media_delivery_type_mismatch") {
      throw new Error(`Expected audio disguised as ${requestedMediaType} to be rejected`);
    }
  }
});

Deno.test("requires large videos to use the provider document path", () => {
  const largeVideo = resolveOutboundWhatsAppMediaType({
    mimeType: "video/mp4",
    size: INLINE_OUTBOUND_VIDEO_MAX_BYTES + 1,
    requestedMediaType: "document",
  });
  if (!largeVideo.ok || largeVideo.mediaType !== "document") {
    throw new Error("Expected a large video to use document delivery");
  }

  const inlineRequest = resolveOutboundWhatsAppMediaType({
    mimeType: "video/mp4",
    size: INLINE_OUTBOUND_VIDEO_MAX_BYTES + 1,
    requestedMediaType: "video",
  });
  if (inlineRequest.ok || inlineRequest.code !== "whatsapp_media_delivery_type_mismatch") {
    throw new Error("Expected an oversized inline-video request to be rejected");
  }
});
