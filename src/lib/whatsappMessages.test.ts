import { describe, expect, it } from "vitest";
import {
  isUsableMediaUrl,
  normalizeWhatsAppPhoneKey,
  reconcileWhatsAppMessages,
  upsertWhatsAppMessage,
} from "./whatsappMessages";

const jwtWithExpiration = (expiration: number) => {
  const payload = btoa(JSON.stringify({ exp: expiration })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `header.${payload}.signature`;
};

describe("WhatsApp message reconciliation", () => {
  it("matches Brazilian mobile identities with and without the ninth digit", () => {
    expect(normalizeWhatsAppPhoneKey("5548991432057@s.whatsapp.net")).toBe("48991432057");
    expect(normalizeWhatsAppPhoneKey("554891432057@s.whatsapp.net")).toBe("48991432057");
  });

  it("replaces an optimistic row when realtime delivers the provider message", () => {
    const optimistic = { id: "temp-1", message_id_external: "provider-1", content: "Oi" };
    const persisted = { id: "db-1", message_id_external: "provider-1", content: "Oi" };
    expect(upsertWhatsAppMessage([optimistic], persisted)).toEqual([persisted]);
  });

  it("keeps one row when the manager response and realtime race", () => {
    const persisted = { id: "db-1", message_id_external: "provider-1" };
    expect(reconcileWhatsAppMessages([persisted, persisted])).toEqual([persisted]);
  });
});

describe("WhatsApp media URLs", () => {
  it("rejects an expired private-storage URL so it can be refreshed", () => {
    const token = jwtWithExpiration(1_000);
    expect(isUsableMediaUrl(`https://project.supabase.co/storage/v1/object/sign/whatsapp-media/file.ogg?token=${token}`, 2_000)).toBe(false);
  });

  it("accepts a signed URL with more than five minutes remaining", () => {
    const token = jwtWithExpiration(3_000);
    expect(isUsableMediaUrl(`https://project.supabase.co/storage/v1/object/sign/whatsapp-media/file.ogg?token=${token}`, 2_000)).toBe(true);
  });
});
