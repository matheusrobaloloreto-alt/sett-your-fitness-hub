// Bind a provider echo to the authenticated manual send that returned its ID.
// Keep the original message timestamp and any delivery state recorded by the webhook.
export async function attributeManualWhatsAppEcho(
  admin: any,
  companyId: string,
  chatId: string,
  receipt: string,
  actorId: string,
) {
  return await admin.from("whatsapp_messages")
    .update({ sender_id: actorId, origin: "panel_manual" })
    .eq("company_id", companyId)
    .eq("chat_id", chatId)
    .eq("message_id_external", receipt)
    .eq("is_from_me", true)
    .in("origin", ["provider_live", "provider_history_sync"])
    .is("sender_id", null)
    .select("*")
    .maybeSingle();
}
