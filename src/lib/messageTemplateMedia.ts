export type MessageTemplateAttachment = {
  path: string;
  name: string;
  mimeType: string;
  size: number;
};

export type MediaMessageTemplate = {
  id: string;
  title: string;
  content: string;
  shortcut: string | null;
  attachments?: unknown;
};

export function parseMessageTemplateAttachments(value: unknown): MessageTemplateAttachment[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const attachment = item as Record<string, unknown>;
    if (
      typeof attachment.path !== "string" ||
      !/^[a-zA-Z0-9_-]+\/templates\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(attachment.path) ||
      typeof attachment.name !== "string" || !attachment.name.trim() ||
      typeof attachment.mimeType !== "string" ||
      !/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(attachment.mimeType) ||
      typeof attachment.size !== "number" || !Number.isSafeInteger(attachment.size) || attachment.size < 0
    ) return [];

    return [{
      path: attachment.path,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
    }];
  });
}

export function createMessageTemplateAttachmentPath(companyId: string, templateId: string, fileName: string): string {
  if (![companyId, templateId].every((id) => /^[a-zA-Z0-9_-]+$/.test(id))) {
    throw new Error("Identificador de empresa ou template inválido");
  }
  const extension = (fileName.includes(".") ? fileName.split(".").pop() : "bin")
    ?.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 16) || "bin";
  return `${companyId}/templates/${templateId}/${crypto.randomUUID()}.${extension}`;
}

export function scopedMessageTemplateAttachments(value: unknown, companyId: string | null | undefined, templateId: string) {
  const attachments = parseMessageTemplateAttachments(value);
  if (!companyId || (value != null && (!Array.isArray(value) || attachments.length !== value.length))
    || attachments.some((attachment) => !attachment.path.startsWith(`${companyId}/templates/${templateId}/`))) {
    throw new Error("Esta mensagem rápida contém anexos inválidos. Corrija o template antes de enviar.");
  }
  return attachments;
}

export function isMessageTemplateSendAcknowledged(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  if (payload.success === false || payload.ok === false || (payload.success !== true && payload.ok !== true)) return false;
  const message = payload.message && typeof payload.message === "object"
    ? payload.message as Record<string, unknown> : null;
  return [payload.messageId, message?.id].some((id) => typeof id === "string" && id.trim().length > 0);
}
