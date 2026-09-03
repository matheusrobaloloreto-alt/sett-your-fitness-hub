const DIRECT_JID_SUFFIX = "@s.whatsapp.net";
const LID_JID_SUFFIX = "@lid";
const GROUP_JID_SUFFIX = "@g.us";

function rawPhoneCandidate(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.includes("@") && !raw.endsWith(DIRECT_JID_SUFFIX)) return null;
  return raw.endsWith(DIRECT_JID_SUFFIX)
    ? raw.slice(0, -DIRECT_JID_SUFFIX.length)
    : raw;
}

function isUnambiguousNorthAmericanE164(phoneKey: string): boolean {
  // Brazilian local mobile keys use DDD + 9 + subscriber. An 11-digit key
  // beginning with country code 1 whose third digit is not 9 cannot be that
  // shape, so it can be preserved as a NANP E.164 destination safely.
  return /^1\d{10}$/.test(phoneKey) && phoneKey[2] !== "9";
}

function hasExplicitNonBrazilianCountryCode(value: unknown): boolean {
  const candidate = rawPhoneCandidate(value);
  const compact = candidate?.replace(/[\s().-]/g, "") || "";
  return /^\+(?!55)[1-9]\d{0,14}$/.test(compact);
}

export function normalizeWhatsAppPhoneKey(value: unknown): string | null {
  const candidate = rawPhoneCandidate(value);
  if (!candidate) return null;
  let digits = candidate.replace(/\D/g, "");
  if (!digits) return null;

  if (isUnambiguousNorthAmericanE164(digits)) return digits;
  if (hasExplicitNonBrazilianCountryCode(value) && digits.length >= 8 && digits.length <= 15) {
    return digits;
  }

  if (
    digits.startsWith("55") && (digits.length === 12 || digits.length === 13)
  ) {
    digits = digits.slice(2);
  } else if (
    digits.length >= 12 && digits.length <= 15 && !digits.startsWith("0")
  ) {
    // An explicit/fully-qualified international destination is already E.164.
    // Preserve it instead of truncating it into a plausible Brazilian local number.
    return digits;
  } else if (/^0\d{2}[1-9]{2}\d{8,9}$/.test(digits)) {
    // Brazilian carrier prefix: 0 + two-digit carrier + DDD + subscriber.
    digits = digits.slice(3);
  } else if (/^0[1-9]{2}\d{8}$/.test(digits)) {
    // Trunk-prefixed landline: 0 + DDD + eight-digit subscriber.
    digits = digits.slice(1);
  } else if (digits.length > 11) {
    digits = digits.slice(-11);
  }

  if (digits.length === 10 && /^[1-9]{2}[6-9]/.test(digits)) {
    digits = `${digits.slice(0, 2)}9${digits.slice(2)}`;
  }

  // Brazilian mobile numbers with 11 local digits must have 9 as the first
  // subscriber digit. Reject legacy/trunk-shaped values instead of turning
  // them into a plausible-looking but unverified WhatsApp destination.
  if (digits.length === 11 && digits[2] !== "9") return null;

  return digits.length === 10 || digits.length === 11 ? digits : null;
}

export function directWhatsAppJidVariants(remoteJid: unknown): string[] {
  const raw = String(remoteJid || "").trim();
  if (!raw.endsWith(DIRECT_JID_SUFFIX)) return raw ? [raw] : [];

  const phoneKey = normalizeWhatsAppPhoneKey(raw.split("@")[0]);
  if (!phoneKey) return [raw];

  if (isUnambiguousNorthAmericanE164(phoneKey)) {
    return [...new Set([raw, `${phoneKey}${DIRECT_JID_SUFFIX}`])];
  }
  if (phoneKey.length >= 12 && !phoneKey.startsWith("55")) {
    return [...new Set([raw, `${phoneKey}${DIRECT_JID_SUFFIX}`])];
  }

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

  // Provider-only identities are opaque. Their digits are not phone numbers,
  // so LIDs and group JIDs may only match by exact identity (handled above).
  if (
    leftRaw.endsWith(LID_JID_SUFFIX) || rightRaw.endsWith(LID_JID_SUFFIX) ||
    leftRaw.endsWith(GROUP_JID_SUFFIX) || rightRaw.endsWith(GROUP_JID_SUFFIX)
  ) return false;

  const leftPhone = normalizeWhatsAppPhoneKey(leftRaw);
  const rightPhone = normalizeWhatsAppPhoneKey(rightRaw);
  if (leftPhone && rightPhone) return leftPhone === rightPhone;

  // A new-chat draft may still send the exact E.164 digits before its provider
  // JID exists. Accept only an exact digit-for-digit match against the direct
  // JID; country/ownership validation happens in resolveVerifiedWhatsAppRecipient.
  const leftDirect = rawPhoneCandidate(leftRaw);
  const rightDirect = rawPhoneCandidate(rightRaw);
  const leftDigits = leftDirect?.replace(/\D/g, "") || "";
  const rightDigits = rightDirect?.replace(/\D/g, "") || "";
  const oneSideIsDirectJid = leftRaw.endsWith(DIRECT_JID_SUFFIX) ||
    rightRaw.endsWith(DIRECT_JID_SUFFIX);
  return oneSideIsDirectJid && /^\d{8,15}$/.test(leftDigits) &&
    leftDigits === rightDigits;
}

export type WhatsAppStudentIdentity = {
  id: string;
  phone?: unknown;
  whatsapp?: unknown;
  country_code?: unknown;
};

export type VerifiedWhatsAppRecipient =
  | { ok: true; remoteJid: string; studentId: string | null }
  | {
    ok: false;
    code:
      | "whatsapp_student_mismatch"
      | "whatsapp_student_not_found"
      | "whatsapp_student_phone_missing"
      | "whatsapp_student_phone_ambiguous"
      | "whatsapp_stored_recipient_mismatch"
      | "whatsapp_recipient_mismatch";
  };

function canonicalStudentDirectJid(
  student: WhatsAppStudentIdentity,
  trustedChatRemoteJid?: unknown,
): VerifiedWhatsAppRecipient {
  const countryCode = String(student.country_code || "BR").trim().toUpperCase();
  const trustedChat = rawPhoneCandidate(trustedChatRemoteJid);
  const trustedChatDigits = trustedChat?.replace(/\D/g, "") || "";
  const directJids = new Set(
    [student.whatsapp, student.phone]
      .map((value) => {
        let phoneKey = normalizeWhatsAppPhoneKey(value);
        let providerConfirmedBareInternational = false;
        let countryConfirmedBareInternational = false;
        if (!phoneKey && /^[A-Z]{2}$/.test(countryCode) && countryCode !== "BR") {
          const candidate = rawPhoneCandidate(value);
          const digits = candidate?.replace(/\D/g, "") || "";
          // Registration persists international destinations in E.164 digits,
          // while country_code is stored separately. The explicit non-BR
          // country therefore makes that otherwise ambiguous bare value safe
          // to preserve for a new chat as well as an already linked chat.
          countryConfirmedBareInternational = /^\d{8,15}$/.test(digits) &&
            !digits.startsWith("0");
          providerConfirmedBareInternational = Boolean(
            countryConfirmedBareInternational &&
              trustedChatDigits === digits &&
              String(trustedChatRemoteJid || "").trim().endsWith(DIRECT_JID_SUFFIX),
          );
          if (countryConfirmedBareInternational) phoneKey = digits;
        }
        if (!phoneKey) return null;
        const international = hasExplicitNonBrazilianCountryCode(value) ||
          isUnambiguousNorthAmericanE164(phoneKey) ||
          countryConfirmedBareInternational ||
          providerConfirmedBareInternational;
        return `${
          international ? phoneKey : `55${phoneKey}`
        }${DIRECT_JID_SUFFIX}`;
      })
      .filter((value): value is string => Boolean(value)),
  );
  if (directJids.size === 0) {
    return { ok: false, code: "whatsapp_student_phone_missing" };
  }
  if (directJids.size > 1) {
    return { ok: false, code: "whatsapp_student_phone_ambiguous" };
  }
  return {
    ok: true,
    remoteJid: [...directJids][0],
    studentId: student.id,
  };
}

/**
 * Resolves an outbound destination from independently persisted student data.
 * Student phones remain the canonical equivalence check. A stored direct JID
 * is only reused as the provider route after it and the client confirmation
 * both agree with that canonical identity.
 */
export function resolveVerifiedWhatsAppRecipient(args: {
  clientRemoteJid: unknown;
  chatRemoteJid?: unknown;
  chatStudentId?: unknown;
  requestedStudentId?: unknown;
  student?: WhatsAppStudentIdentity | null;
}): VerifiedWhatsAppRecipient {
  const clientRemoteJid = String(args.clientRemoteJid || "").trim();
  const chatRemoteJid = String(args.chatRemoteJid || "").trim();
  const chatStudentId = String(args.chatStudentId || "").trim() || null;
  const requestedStudentId = String(args.requestedStudentId || "").trim() ||
    null;

  if (
    chatStudentId && requestedStudentId && chatStudentId !== requestedStudentId
  ) {
    return { ok: false, code: "whatsapp_student_mismatch" };
  }

  const expectedStudentId = requestedStudentId || chatStudentId;
  if (expectedStudentId) {
    if (!args.student || args.student.id !== expectedStudentId) {
      return { ok: false, code: "whatsapp_student_not_found" };
    }
    const canonical = canonicalStudentDirectJid(
      args.student,
      chatRemoteJid,
    );
    if (!canonical.ok) return canonical;
    if (
      chatRemoteJid &&
      !sameWhatsAppRecipient(chatRemoteJid, canonical.remoteJid)
    ) {
      return { ok: false, code: "whatsapp_stored_recipient_mismatch" };
    }
    if (!sameWhatsAppRecipient(clientRemoteJid, canonical.remoteJid)) {
      return { ok: false, code: "whatsapp_recipient_mismatch" };
    }
    // A direct JID persisted from the provider is the routable identity. Once
    // it has passed the same canonical-student checks above, preserve its
    // exact legacy 8/9-digit form instead of reconstructing a different alias.
    if (expectedStudentId && chatRemoteJid.endsWith(DIRECT_JID_SUFFIX)) {
      return { ...canonical, remoteJid: chatRemoteJid };
    }
    return canonical;
  }

  if (chatRemoteJid && !sameWhatsAppRecipient(clientRemoteJid, chatRemoteJid)) {
    return { ok: false, code: "whatsapp_recipient_mismatch" };
  }
  return {
    ok: true,
    remoteJid: chatRemoteJid || clientRemoteJid,
    studentId: null,
  };
}

/**
 * Evolution's sendText endpoint expects a phone number for direct contacts.
 * Keep provider-only identifiers (LID) and group JIDs intact because they are
 * not phone numbers and stripping their suffix changes the destination.
 */
export function evolutionTextRecipient(remoteJid: unknown): string {
  const raw = String(remoteJid || "").trim();
  if (raw.endsWith(DIRECT_JID_SUFFIX)) {
    return raw.slice(0, -DIRECT_JID_SUFFIX.length);
  }
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

export function storageObjectPathFromUrl(
  url: unknown,
  bucket: string,
): string | null {
  const raw = String(url || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const markers = [
      `/storage/v1/object/sign/${bucket}/`,
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/authenticated/${bucket}/`,
    ];
    const marker = markers.find((candidate) =>
      parsed.pathname.includes(candidate)
    );
    if (!marker) return null;
    return decodeURIComponent(parsed.pathname.split(marker)[1] || "") || null;
  } catch {
    return null;
  }
}
