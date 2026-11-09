export type FeedbackOrigin = {
  company_id: string;
  student_id: string;
  message_id: string;
  chat_id: string;
  instance_id: string;
  remote_jid: string;
  provider_message_id: string;
};

type InboundMessage = {
  id: string;
  company_id: string | null;
  chat_id: string;
  origin: string;
  source: string | null;
  is_from_me: boolean | null;
  sender_id: string | null;
  message_id_external: string | null;
  status?: string | null;
};

type Chat = Pick<FeedbackOrigin, "company_id" | "student_id" | "instance_id" | "remote_jid"> & { id: string };

export function isFeedbackMessage(origin: FeedbackOrigin, message: InboundMessage): boolean {
  return /^[1-9]\d{7,14}@s\.whatsapp\.net$/.test(origin.remote_jid)
    && origin.provider_message_id.trim().length > 0
    && message.id === origin.message_id && message.chat_id === origin.chat_id
    && message.company_id === origin.company_id && message.sender_id === origin.remote_jid
    && message.message_id_external === origin.provider_message_id && message.status !== "deleted"
    && message.source === "incoming" && message.is_from_me === false
    && (message.origin === "provider_live" || message.origin === "provider_history_sync");
}

export function isFeedbackOrigin(origin: FeedbackOrigin, message: InboundMessage, chat: Chat): boolean {
  return isFeedbackMessage(origin, message)
    && chat.id === origin.chat_id && chat.company_id === origin.company_id
    && chat.student_id === origin.student_id && chat.instance_id === origin.instance_id && chat.remote_jid === origin.remote_jid;
}

export function mayAcknowledgeFeedback(feedback: { needs_adjustment: boolean; trainer_replied_at: string | null; pain_areas: unknown }): boolean {
  return feedback.needs_adjustment === false && feedback.trainer_replied_at === null
    && Array.isArray(feedback.pain_areas) && feedback.pain_areas.length === 0;
}

type MessageKey = { id: string; fromMe: boolean; remoteJid: string };

export function hasReactionReceipt(value: unknown, target: MessageKey): string | null {
  const receipt = value as {
    key?: Partial<MessageKey>;
    message?: { reactionMessage?: { key?: Partial<MessageKey>; text?: string } };
  } | null;
  const reaction = receipt?.message?.reactionMessage;
  const outbound = receipt?.key;
  if (reaction?.text !== "👍" || reaction.key?.id !== target.id || reaction.key.fromMe !== target.fromMe
    || reaction.key.remoteJid !== target.remoteJid || outbound?.fromMe !== true || outbound.remoteJid !== target.remoteJid
    || typeof outbound.id !== "string" || !outbound.id.trim() || outbound.id === target.id) return null;
  return outbound.id;
}
