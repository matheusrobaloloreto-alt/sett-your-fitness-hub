import {
  directWhatsAppJidVariants,
  evolutionTextRecipient,
  normalizeWhatsAppPhoneKey,
  providerWhatsAppJidVariants,
  resolveVerifiedWhatsAppRecipient,
  sameWhatsAppRecipient,
  storageObjectPathFromUrl,
} from "./whatsappIdentity.ts";

Deno.test("normalizes Brazilian mobile numbers with and without the ninth digit", () => {
  if (normalizeWhatsAppPhoneKey("+55 (48) 99143-2057") !== "48991432057") {
    throw new Error("full number");
  }
  if (normalizeWhatsAppPhoneKey("55 48 9143-2057") !== "48991432057") {
    throw new Error("legacy JID");
  }
  if (normalizeWhatsAppPhoneKey("48 9143-2057") !== "48991432057") {
    throw new Error("local legacy number");
  }
});

Deno.test("keeps Brazilian landlines unchanged", () => {
  if (normalizeWhatsAppPhoneKey("+55 (11) 3456-7890") !== "1134567890") {
    throw new Error("landline");
  }
  if (normalizeWhatsAppPhoneKey("011 3456-7890") !== "1134567890") {
    throw new Error("trunk-prefixed landline");
  }
  if (normalizeWhatsAppPhoneKey("015 11 3456-7890") !== "1134567890") {
    throw new Error("carrier-prefixed landline");
  }
});

Deno.test("normalizes North American E.164 numbers without forcing country code 55", () => {
  if (normalizeWhatsAppPhoneKey("+1 (407) 789-5013") !== "14077895013") {
    throw new Error("formatted NANP number");
  }
  if (normalizeWhatsAppPhoneKey("+1 (297) 555-0123") !== "12975550123") {
    throw new Error("explicit NANP number overlapping a Brazilian local shape");
  }
  if (
    normalizeWhatsAppPhoneKey("14077895013@s.whatsapp.net") !==
      "14077895013"
  ) {
    throw new Error("provider NANP JID");
  }
});

Deno.test("preserves explicit E.164 destinations outside Brazil and NANP", () => {
  for (const [input, expected] of [
    ["+351 912 345 678", "351912345678"],
    ["+44 7700 900123", "447700900123"],
  ]) {
    if (normalizeWhatsAppPhoneKey(input) !== expected) throw new Error(`did not preserve ${input}`);
    const result = resolveVerifiedWhatsAppRecipient({
      clientRemoteJid: `${expected}@s.whatsapp.net`,
      chatRemoteJid: `${expected}@s.whatsapp.net`,
      requestedStudentId: "student-international",
      student: { id: "student-international", whatsapp: input },
    });
    if (!result.ok || result.remoteJid !== `${expected}@s.whatsapp.net`) {
      throw new Error(`international recipient was rewritten: ${input}`);
    }
  }
});

Deno.test("builds all direct JID variants for a Brazilian mobile", () => {
  const variants = directWhatsAppJidVariants("5548991432057@s.whatsapp.net");
  for (
    const expected of [
      "5548991432057@s.whatsapp.net",
      "554891432057@s.whatsapp.net",
      "48991432057@s.whatsapp.net",
      "4891432057@s.whatsapp.net",
    ]
  ) {
    if (!variants.includes(expected)) throw new Error(`missing ${expected}`);
  }
});

Deno.test("does not generate Brazilian aliases for a North American direct JID", () => {
  const variants = directWhatsAppJidVariants("14077895013@s.whatsapp.net");
  if (variants.length !== 1 || variants[0] !== "14077895013@s.whatsapp.net") {
    throw new Error(`unexpected international variants: ${variants.join(",")}`);
  }
});

Deno.test("combines a provider LID with all phone JID variants", () => {
  const variants = providerWhatsAppJidVariants(
    "247961464385638@lid",
    ["5548991432057@s.whatsapp.net"],
  );
  for (
    const expected of [
      "247961464385638@lid",
      "5548991432057@s.whatsapp.net",
      "554891432057@s.whatsapp.net",
      "48991432057@s.whatsapp.net",
      "4891432057@s.whatsapp.net",
    ]
  ) {
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
  if (
    !sameWhatsAppRecipient(
      "5548991432057@s.whatsapp.net",
      "+55 (48) 99143-2057",
    )
  ) {
    throw new Error("equivalent direct recipient rejected");
  }
  if (
    sameWhatsAppRecipient(
      "5548991432057@s.whatsapp.net",
      "5511999999999@s.whatsapp.net",
    )
  ) {
    throw new Error("different recipient accepted");
  }
});

Deno.test("never interprets LID or group identifiers as phone numbers", () => {
  const lid = "247961464385638@lid";
  const group = "120363012345678@g.us";
  if (normalizeWhatsAppPhoneKey(lid) !== null) {
    throw new Error("LID parsed as phone");
  }
  if (normalizeWhatsAppPhoneKey(group) !== null) {
    throw new Error("group parsed as phone");
  }
  if (!sameWhatsAppRecipient(lid, lid)) throw new Error("exact LID rejected");
  if (!sameWhatsAppRecipient(group, group)) {
    throw new Error("exact group rejected");
  }
  if (sameWhatsAppRecipient(lid, "+55 (61) 46438-5638")) {
    throw new Error("LID matched phone digits");
  }
  if (sameWhatsAppRecipient(group, "+55 (63) 01234-5678")) {
    throw new Error("group matched phone digits");
  }
  if (sameWhatsAppRecipient(lid, "247961464385639@lid")) {
    throw new Error("different LIDs matched");
  }
  if (sameWhatsAppRecipient(group, "120363012345679@g.us")) {
    throw new Error("different groups matched");
  }
});

Deno.test("resolves a correctly linked chat from the student's canonical phone", () => {
  const result = resolveVerifiedWhatsAppRecipient({
    clientRemoteJid: "4891432057@s.whatsapp.net",
    chatRemoteJid: "5548991432057@s.whatsapp.net",
    chatStudentId: "student-a",
    requestedStudentId: "student-a",
    student: { id: "student-a", whatsapp: "+55 (48) 99143-2057" },
  });
  if (!result.ok || result.remoteJid !== "5548991432057@s.whatsapp.net") {
    throw new Error("canonical student recipient not resolved");
  }
});

Deno.test("preserves the verified provider JID for a Brazilian legacy chat", () => {
  const result = resolveVerifiedWhatsAppRecipient({
    clientRemoteJid: "551199999999@s.whatsapp.net",
    chatRemoteJid: "551199999999@s.whatsapp.net",
    chatStudentId: "student-legacy-br",
    requestedStudentId: "student-legacy-br",
    student: { id: "student-legacy-br", whatsapp: "+55 (11) 99999-9999" },
  });
  if (!result.ok || result.remoteJid !== "551199999999@s.whatsapp.net") {
    throw new Error("verified provider JID was replaced by a reconstructed alias");
  }
});

Deno.test("preserves a verified legacy JID when an unlinked chat names the student explicitly", () => {
  const result = resolveVerifiedWhatsAppRecipient({
    clientRemoteJid: "551199999999@s.whatsapp.net",
    chatRemoteJid: "551199999999@s.whatsapp.net",
    requestedStudentId: "student-explicit-br",
    student: { id: "student-explicit-br", phone: "+55 (11) 99999-9999" },
  });
  if (!result.ok || result.remoteJid !== "551199999999@s.whatsapp.net") {
    throw new Error("verified explicit-student provider JID was replaced");
  }
});

Deno.test("resolves a linked North American chat without prepending country code 55", () => {
  const result = resolveVerifiedWhatsAppRecipient({
    clientRemoteJid: "14077895013@s.whatsapp.net",
    chatRemoteJid: "14077895013@s.whatsapp.net",
    chatStudentId: "student-us",
    requestedStudentId: "student-us",
    student: { id: "student-us", whatsapp: "+1 (407) 789-5013" },
  });
  if (!result.ok || result.remoteJid !== "14077895013@s.whatsapp.net") {
    throw new Error("canonical North American recipient not resolved");
  }

  const overlappingShape = resolveVerifiedWhatsAppRecipient({
    clientRemoteJid: "12975550123@s.whatsapp.net",
    chatRemoteJid: "12975550123@s.whatsapp.net",
    chatStudentId: "student-nanp",
    requestedStudentId: "student-nanp",
    student: { id: "student-nanp", whatsapp: "+1 (297) 555-0123" },
  });
  if (
    !overlappingShape.ok ||
    overlappingShape.remoteJid !== "12975550123@s.whatsapp.net"
  ) {
    throw new Error("explicit NANP recipient was treated as Brazilian local");
  }
});

Deno.test("blocks a corrupted chat JID even when its student_id is correct", () => {
  const result = resolveVerifiedWhatsAppRecipient({
    clientRemoteJid: "5511999999999@s.whatsapp.net",
    chatRemoteJid: "5511999999999@s.whatsapp.net",
    chatStudentId: "student-a",
    requestedStudentId: "student-a",
    student: { id: "student-a", whatsapp: "+55 (48) 99143-2057" },
  });
  if (result.ok || result.code !== "whatsapp_stored_recipient_mismatch") {
    throw new Error("corrupted stored recipient accepted");
  }
});

Deno.test("validates an unlinked chat against the explicitly requested student", () => {
  const accepted = resolveVerifiedWhatsAppRecipient({
    clientRemoteJid: "+55 (48) 99143-2057",
    chatRemoteJid: "5548991432057@s.whatsapp.net",
    requestedStudentId: "student-a",
    student: { id: "student-a", phone: "4891432057" },
  });
  if (!accepted.ok) throw new Error("verified unlinked chat rejected");

  const rejected = resolveVerifiedWhatsAppRecipient({
    clientRemoteJid: "5511999999999@s.whatsapp.net",
    chatRemoteJid: "5511999999999@s.whatsapp.net",
    requestedStudentId: "student-a",
    student: { id: "student-a", phone: "4891432057" },
  });
  if (rejected.ok || rejected.code !== "whatsapp_stored_recipient_mismatch") {
    throw new Error("unlinked corrupted chat accepted");
  }
});

Deno.test("blocks a chat linked to a different student and opaque IDs without verified aliases", () => {
  const wrongStudent = resolveVerifiedWhatsAppRecipient({
    clientRemoteJid: "5548991432057@s.whatsapp.net",
    chatRemoteJid: "5548991432057@s.whatsapp.net",
    chatStudentId: "student-b",
    requestedStudentId: "student-a",
    student: { id: "student-a", phone: "48991432057" },
  });
  if (wrongStudent.ok || wrongStudent.code !== "whatsapp_student_mismatch") {
    throw new Error("different student accepted");
  }

  for (const opaqueJid of ["247961464385638@lid", "120363012345678@g.us"]) {
    const opaque = resolveVerifiedWhatsAppRecipient({
      clientRemoteJid: opaqueJid,
      chatRemoteJid: opaqueJid,
      chatStudentId: "student-a",
      requestedStudentId: "student-a",
      student: { id: "student-a", phone: "48991432057" },
    });
    if (opaque.ok || opaque.code !== "whatsapp_stored_recipient_mismatch") {
      throw new Error(`opaque identity ${opaqueJid} accepted as student phone`);
    }
  }
});

Deno.test("formats only direct phone JIDs for Evolution sendText", () => {
  if (
    evolutionTextRecipient("5548991432057@s.whatsapp.net") !== "5548991432057"
  ) {
    throw new Error("direct recipient");
  }
  if (evolutionTextRecipient("247961464385638@lid") !== "247961464385638@lid") {
    throw new Error("lid recipient");
  }
  if (
    evolutionTextRecipient("120363012345678@g.us") !== "120363012345678@g.us"
  ) {
    throw new Error("group recipient");
  }
});
