import { describe, expect, it } from "vitest";
import { shouldOfferWhatsAppRecipientReview } from "@/lib/whatsappRecipientReview";

describe("WhatsApp recipient review", () => {
  it("offers a manual repair only for a persisted chat/student destination mismatch", () => {
    expect(shouldOfferWhatsAppRecipientReview("whatsapp_stored_recipient_mismatch")).toBe(true);
    expect(shouldOfferWhatsAppRecipientReview("whatsapp_recipient_mismatch")).toBe(false);
    expect(shouldOfferWhatsAppRecipientReview("provider_unavailable")).toBe(false);
    expect(shouldOfferWhatsAppRecipientReview(undefined)).toBe(false);
  });
});
