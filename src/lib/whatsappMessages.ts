export type WhatsAppMessageIdentity = {
  id: string;
  message_id_external?: string | null;
};

export function normalizeWhatsAppPhoneKey(value: unknown): string | null {
  const raw = String(value || "").trim();
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  else if (raw.endsWith("@s.whatsapp.net") && digits.length >= 8 && digits.length <= 15) return digits;
  else if (digits.length > 11) digits = digits.slice(-11);
  if (digits.length === 10 && /^[1-9]{2}[6-9]/.test(digits)) {
    digits = `${digits.slice(0, 2)}9${digits.slice(2)}`;
  }
  return digits.length === 10 || digits.length === 11 ? digits : null;
}

export function sameWhatsAppMessage(
  left: WhatsAppMessageIdentity,
  right: WhatsAppMessageIdentity,
) {
  return left.id === right.id || Boolean(
    left.message_id_external
    && right.message_id_external
    && left.message_id_external === right.message_id_external,
  );
}

export function reconcileWhatsAppMessages<T extends WhatsAppMessageIdentity>(messages: T[]) {
  const result: T[] = [];
  for (const message of messages) {
    const index = result.findIndex((current) => sameWhatsAppMessage(current, message));
    if (index === -1) result.push(message);
    else if (result[index].id.startsWith("temp-") || !message.id.startsWith("temp-")) result[index] = message;
  }
  return result;
}

export function upsertWhatsAppMessage<T extends WhatsAppMessageIdentity>(messages: T[], message: T) {
  const index = messages.findIndex((current) => sameWhatsAppMessage(current, message));
  if (index === -1) return [...messages, message];
  const next = [...messages];
  next[index] = message;
  return reconcileWhatsAppMessages(next);
}

function decodeJwtExpiration(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
    return typeof decoded.exp === "number" ? decoded.exp : null;
  } catch {
    return null;
  }
}

export function isUsableMediaUrl(url: string | null | undefined, nowSeconds = Date.now() / 1000) {
  if (!url) return false;
  if (url.startsWith("data:") || url.startsWith("blob:")) return true;
  try {
    const parsed = new URL(url);
    if (!parsed.pathname.includes("/storage/v1/object/")) return false;
    if (!parsed.pathname.includes("/object/sign/")) return true;
    const token = parsed.searchParams.get("token");
    const expiration = token ? decodeJwtExpiration(token) : null;
    return expiration !== null && expiration > nowSeconds + 5 * 60;
  } catch {
    return false;
  }
}
