export function shouldOfferWhatsAppRecipientReview(code: unknown): boolean {
  return code === "whatsapp_stored_recipient_mismatch";
}
