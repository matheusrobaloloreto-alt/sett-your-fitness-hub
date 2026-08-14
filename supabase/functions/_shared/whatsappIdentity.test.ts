import {
  directWhatsAppJidVariants,
  evolutionTextRecipient,
  normalizeWhatsAppPhoneKey,
  providerWhatsAppJidVariants,
  sameWhatsAppRecipient,
  storageObjectPathFromUrl,
} from "./whatsappIdentity.ts";

Deno.test("normalizes Brazilian mobile numbers with and without the ninth digit", () => {
  if (normalizeWhatsAppPhoneKey("+55 (48) 99143-2057") !== "48991432057") throw new Error("full number");
  if (normalizeWhatsAppPhoneKey("55 48 9143-2057") !== "48991432057") throw new Error("legacy JID");
  if (normalizeWhatsAppPhoneKey("48 9143-2057") !== "48991432057") throw new Error("local legacy number");
});

Deno.test("keeps Brazilian landlines unchanged", () => {
  if (normalizeWhatsAppPhoneKey("+55 (11) 3456-7890") !== "1134567890") throw new Error("landline");
});

Deno.test("builds all direct JID variants for a Brazilian mobile", () => {
  const variants = directWhatsAppJidVariants("5548991432057@s.whatsapp.net");
  for (const expected of [
    "5548991432057@s.whatsapp.net",
    "554891432057@s.whatsapp.net",
    "48991432057@s.whatsapp.net",
    "4891432057@s.whatsapp.net",
  ]) {
    if (!variants.includes(expected)) throw new Error(`missing ${expected}`);
  }
});

Deno.test("combines a provider LID with all phone JID variants", () => {
  const variants = providerWhatsAppJidVariants(
    "247961464385638@lid",
    ["5548991432057@s.whatsapp.net"],
  );
  for (const expected of [
    "247961464385638@lid",
    "5548991432057@s.whatsapp.net",
    "554891432057@s.whatsapp.net",
    "48991432057@s.whatsapp.net",
    "4891432057@s.whatsapp.net",
  ]) {
    if (!variants.includes(expected)) throw new Error(`missing ${expected}`);
  }
});

Deno.test("extracts the private storage object path from signed URLs", () => {
  const path = storageObjectPathFromUrl(
    "https://example.supabase.co/storage/v1/object/sign/whatsapp-media/company/chat/audio.ogg?token=secret",
    "whatsapp-media",
  );
  if (path !== "company/chat/audio.ogg") throw new Error("path");
});

Deno.test("binds equivalent direct recipients but rejects a different phone", () => {
  if (!sameWhatsAppRecipient("5548991432057@s.whatsapp.net", "+55 (48) 99143-2057")) {
    throw new Error("equivalent direct recipient rejected");
  }
  if (sameWhatsAppRecipient("5548991432057@s.whatsapp.net", "5511999999999@s.whatsapp.net")) {
    throw new Error("different recipient accepted");
  }
});

Deno.test("formats only direct phone JIDs for Evolution sendText", () => {
  if (evolutionTextRecipient("5548991432057@s.whatsapp.net") !== "5548991432057") {
    throw new Error("direct recipient");
  }
  if (evolutionTextRecipient("247961464385638@lid") !== "247961464385638@lid") {
    throw new Error("lid recipient");
  }
  if (evolutionTextRecipient("120363012345678@g.us") !== "120363012345678@g.us") {
    throw new Error("group recipient");
  }
});
