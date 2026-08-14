const DIRECT_JID_SUFFIX = "@s.whatsapp.net";

export function normalizeWhatsAppPhoneKey(value: unknown): string | null {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  } else if (digits.length > 11) {
    digits = digits.slice(-11);
  }

  if (digits.length === 10 && /^[1-9]{2}[6-9]/.test(digits)) {
    digits = `${digits.slice(0, 2)}9${digits.slice(2)}`;
  }

  return digits.length === 10 || digits.length === 11 ? digits : null;
}

export function directWhatsAppJidVariants(remoteJid: unknown): string[] {
  const raw = String(remoteJid || "").trim();
  if (!raw.endsWith(DIRECT_JID_SUFFIX)) return raw ? [raw] : [];

  const phoneKey = normalizeWhatsAppPhoneKey(raw.split("@")[0]);
  if (!phoneKey) return [raw];

  const localVariants = new Set<string>([phoneKey]);
  if (phoneKey.length === 11 && phoneKey[2] === "9") {
    localVariants.add(`${phoneKey.slice(0, 2)}${phoneKey.slice(3)}`);
  }

  const variants = new Set<string>([raw]);
  for (const local of localVariants) {
    variants.add(`${local}${DIRECT_JID_SUFFIX}`);
    variants.add(`55${local}${DIRECT_JID_SUFFIX}`);
  }
  return [...variants];
}

export function sameWhatsAppRecipient(left: unknown, right: unknown): boolean {
  const leftRaw = String(left || "").trim();
  const rightRaw = String(right || "").trim();
  if (!leftRaw || !rightRaw) return false;
  if (leftRaw === rightRaw) return true;

  const leftPhone = normalizeWhatsAppPhoneKey(leftRaw);
  const rightPhone = normalizeWhatsAppPhoneKey(rightRaw);
  return Boolean(leftPhone && rightPhone && leftPhone === rightPhone);
}

/**
 * Evolution's sendText endpoint expects a phone number for direct contacts.
 * Keep provider-only identifiers (LID) and group JIDs intact because they are
 * not phone numbers and stripping their suffix changes the destination.
 */
export function evolutionTextRecipient(remoteJid: unknown): string {
  const raw = String(remoteJid || "").trim();
  if (raw.endsWith(DIRECT_JID_SUFFIX)) return raw.slice(0, -DIRECT_JID_SUFFIX.length);
  return raw;
}

export function providerWhatsAppJidVariants(
  remoteJid: unknown,
  alternateJids: unknown[] = [],
): string[] {
  const primary = String(remoteJid || "").trim();
  if (!primary) return [];
  if (primary.endsWith("@g.us")) return [primary];

  const variants = new Set<string>();
  for (const candidate of [primary, ...alternateJids]) {
    const jid = String(candidate || "").trim();
    if (!jid || jid.endsWith("@g.us")) continue;
    for (const variant of directWhatsAppJidVariants(jid)) variants.add(variant);
  }
  return [...variants];
}

export function storageObjectPathFromUrl(url: unknown, bucket: string): string | null {
  const raw = String(url || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const markers = [
      `/storage/v1/object/sign/${bucket}/`,
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/authenticated/${bucket}/`,
    ];
    const marker = markers.find((candidate) => parsed.pathname.includes(candidate));
    if (!marker) return null;
    return decodeURIComponent(parsed.pathname.split(marker)[1] || "") || null;
  } catch {
    return null;
  }
}
