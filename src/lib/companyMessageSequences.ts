import { WHATSAPP_EVENTS, type CompanyProductSettings, type MessageEvent, type MessagePart, type WhatsAppEvent } from '@/lib/companyProductSettings';

export type { WhatsAppEvent } from '@/lib/companyProductSettings';
export type MessageBlock = MessagePart;
export type MessageBlockType = MessagePart['type'];
export type MessageMedia = NonNullable<MessagePart['media']>;
export type SequenceSettings = CompanyProductSettings;
export const MAX_MESSAGE_BLOCKS = 10;

export function isWhatsAppEvent(event: MessageEvent): event is WhatsAppEvent {
  return WHATSAPP_EVENTS.some(whatsappEvent => whatsappEvent === event);
}

// A derived block is display-only. Opening an event must never migrate saved settings.
export function displayMessageSequence(settings: SequenceSettings, event: WhatsAppEvent): MessageBlock[] {
  return settings.message_sequences?.[event] ?? [{ id: `legacy-${event}`, type: 'text', text: settings.messages[event] }];
}

export function editMessageSequence(settings: SequenceSettings, event: WhatsAppEvent, blocks: MessageBlock[]): SequenceSettings {
  if (!blocks.length || blocks.length > MAX_MESSAGE_BLOCKS) throw new Error('Use de 1 a 10 mensagens por evento.');
  return {
    ...settings,
    // Sequence edits never overwrite the saved legacy text.
    message_sequences: { ...settings.message_sequences, [event]: blocks },
  };
}
