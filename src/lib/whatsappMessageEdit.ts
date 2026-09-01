export {
  isTransientWhatsAppEditCommitError,
  messageEditEligibility,
  normalizeEditedMessageText,
  WHATSAPP_MESSAGE_EDIT_MAX_LENGTH,
  WHATSAPP_MESSAGE_EDIT_WINDOW_MS,
  type MessageEditEligibility,
  type WhatsAppMessageEditErrorCode,
} from "../../supabase/functions/_shared/whatsappMessageEdit";

export function shouldApplyWhatsAppMessageEditResult(args: {
  activeChatId: string | null;
  editChatId: string;
  message: { chat_id?: unknown } | null | undefined;
}): boolean {
  return args.activeChatId === args.editChatId &&
    args.message?.chat_id === args.editChatId;
}
