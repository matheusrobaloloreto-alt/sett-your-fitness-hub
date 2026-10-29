import { type MessagePart, MESSAGE_MEDIA_PATH } from './company-product-settings.ts';
import { webhookOccurrence } from './dispatch-reconciliation-webhook.ts';
import { requireCompanyFeature } from './company-feature-entitlements.ts';

export type SequenceScope = { kind: 'flow' | 'intercycle'; ownerId: string; leaseToken: string };
export type SequenceArgs = {
  admin: any; companyId: string; chatId: string; occurrence: string;
  parts: MessagePart[]; recipient: string; instanceName: string; evoUrl: string; evoKey: string;
  beforeSend: () => Promise<void>; scope?: SequenceScope; metadata?: Record<string, unknown>;
  prepare?: (metadata: Record<string, unknown>) => Promise<void>;
};
async function rpc(admin: any, name: string, args: Record<string, unknown>) {
  const result = await admin.rpc(name, args);
  if (result.error) throw new Error(String(result.error.message || '').includes('dispatch_uncertain') ? 'dispatch_uncertain' : 'sequence_rpc_unavailable');
  return result.data;
}

/** The first snapshot wins. No regeneration after configuration changes or partial delivery. */
export async function dispatchMessageSequence(args: SequenceArgs): Promise<void> {
  if (!/^[1-9]\d{7,14}@s\.whatsapp\.net$/.test(args.recipient)) throw new Error('sequence_recipient_invalid');
  const occurrence = await webhookOccurrence(args.occurrence, 'company-message-sequence');
  const snapshot = await rpc(args.admin, 'snapshot_company_message_sequence', {
    _company_id: args.companyId, _chat_id: args.chatId, _occurrence: occurrence,
    _snapshot: { parts: args.parts.flatMap(part => part.type === 'audio' && part.text.trim() ? [{ ...part, text: '' }, { id: part.id + '_caption', type: 'text', text: part.text }] : [part]), recipient: args.recipient, instanceName: args.instanceName, metadata: args.metadata || {} },
    _scope: args.scope || null,
  });
  if (snapshot.snapshot.recipient !== args.recipient || snapshot.snapshot.instanceName !== args.instanceName) throw new Error('sequence_recipient_changed');
  const beforeSend = async () => {
    await requireCompanyFeature(args.admin, args.companyId, 'hasWhatsApp');
    await args.beforeSend();
  };
  for (let index = 0; index < snapshot.snapshot.parts.length; index++) {
    const part: MessagePart = snapshot.snapshot.parts[index];
    // Receipt replay skips even signing/downloading old media. Never resend confirmed parts.
    if (snapshot.states[index] === 'acked') continue;
    if (snapshot.states[index] !== 'pending') throw new Error('dispatch_uncertain');
    await beforeSend();
    await args.prepare?.(snapshot.snapshot.metadata);
    let endpoint = 'sendText';
    let body: Record<string, unknown> = { number: args.recipient.replace(/@.*$/, ''), text: part.text };
    if (part.type !== 'text') {
      const media = part.media;
      if (!media || media.bucket !== 'whatsapp-media' || !MESSAGE_MEDIA_PATH.test(media.path) || !media.path.startsWith(args.companyId + '/message-settings/')) throw new Error('sequence_media_scope_invalid');
      const bucket = await args.admin.storage.getBucket(media.bucket);
      if (bucket.error || bucket.data?.public !== false) throw new Error('sequence_media_not_private');
      const split = media.path.lastIndexOf('/');
      const listing = await args.admin.storage.from(media.bucket).list(media.path.slice(0, split), { search: media.path.slice(split + 1), limit: 100 });
      const object = listing.data?.find((item: any) => item.name === media.path.slice(split + 1));
      if (listing.error || object?.metadata?.mimetype !== media.mimeType || !Number.isSafeInteger(Number(object?.metadata?.size)) || Number(object?.metadata?.size) < 1 || Number(object?.metadata?.size) > 16 * 1024 * 1024) throw new Error('sequence_media_metadata_invalid');
      const downloaded = await args.admin.storage.from(media.bucket).download(media.path);
      if (downloaded.error || !downloaded.data || downloaded.data.size !== Number(object.metadata.size)) throw new Error('sequence_media_unavailable');
      const bytes = new Uint8Array(await downloaded.data.slice(0, 16).arrayBuffer());
      if (!messageMediaSignatureMatches(bytes, media.mimeType)) throw new Error('sequence_media_signature_invalid');
      const { data, error } = await args.admin.storage.from(media.bucket).createSignedUrl(media.path, 300);
      if (error || !data?.signedUrl) throw new Error('sequence_media_unavailable');
      // Use sendMedia for audio too: no unsafe second endpoint on an uncertain first response.
      endpoint = 'sendMedia';
      body = { number: args.recipient.replace(/@.*$/, ''), mediatype: part.type, mimetype: media.mimeType, media: data.signedUrl, fileName: media.fileName, caption: part.text };
    }
    const claim = await rpc(args.admin, 'claim_company_message_part', { _sequence_id: snapshot.id, _index: index, _scope: args.scope || null });
    if (claim.state === 'acked') continue;
    if (claim.state !== 'in_flight' || !claim.token) throw new Error('dispatch_uncertain');
    try {
      await beforeSend();
      await rpc(args.admin, 'authorize_company_message_part', { _sequence_id: snapshot.id, _index: index, _token: claim.token, _scope: args.scope || null });
      const response = await fetch(`${args.evoUrl}/message/${endpoint}/${encodeURIComponent(args.instanceName)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: args.evoKey },
        body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error('dispatch_uncertain');
      const payload = await response.json();
      const receipt = payload?.key?.id;
      if (typeof receipt !== 'string' || !receipt.trim() || receipt.length > 200 || /[\x00-\x1f\x7f]/.test(receipt)) throw new Error('dispatch_uncertain');
      await rpc(args.admin, 'ack_company_message_part', { _sequence_id: snapshot.id, _index: index, _token: claim.token, _receipt: receipt });
      // History is a projection. Receipt persists first so projection failures cannot repeat provider I/O.
      try {
        await args.admin.from('whatsapp_messages').insert({ company_id: args.companyId, chat_id: args.chatId,
          type: part.type, content: part.text, media_type: part.media?.mimeType || null,
          sender_id: snapshot.snapshot.metadata?.actorId || null,
          media_storage_path: part.media?.path || null, source: 'outgoing', origin: snapshot.snapshot.metadata?.actorId ? 'panel_manual' : 'automation', is_from_me: true,
          message_id_external: receipt, timestamp: new Date().toISOString() });
        await args.admin.from('whatsapp_chats').update({ last_message: part.text || `[${part.type}]`, last_message_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...(snapshot.snapshot.metadata?.actorId ? { last_sender_id: snapshot.snapshot.metadata.actorId } : {}) }).eq('id', args.chatId).eq('company_id', args.companyId);
      } catch { /* Durable receipt remains authoritative. */ }
    } catch { throw new Error('dispatch_uncertain'); }
  }
}

/** Preserve old send semantics until configured; resume an existing snapshot even after removal. */
export async function dispatchConfiguredMessageSequence(args: SequenceArgs & { configured: boolean; legacyAttempt?: { kind: string; ownerId: string; key: string }; legacyWebhookOccurrence?: string }): Promise<boolean> {
  const occurrence = await webhookOccurrence(args.occurrence, 'company-message-sequence');
  const existing = await args.admin.from('company_message_sequences').select('id')
    .eq('company_id', args.companyId).eq('chat_id', args.chatId).eq('occurrence', occurrence).maybeSingle();
  if (existing.error) throw new Error('sequence_lookup_unavailable');
  if (!existing.data) {
    if (!args.configured) return false;
    let legacy = args.legacyAttempt;
    if (args.legacyWebhookOccurrence) {
      const prior = await args.admin.from('webhook_dispatch_owners').select('id').eq('company_id',args.companyId).eq('chat_id',args.chatId).eq('occurrence',args.legacyWebhookOccurrence).maybeSingle();
      if (prior.error) throw new Error('sequence_lookup_unavailable');
      if (prior.data) legacy = { kind:'webhook', ownerId:prior.data.id, key:'text' };
    }
    if (legacy) {
      const prior = await args.admin.from('automation_dispatch_attempts').select('state').eq('kind',legacy.kind).eq('owner_id',legacy.ownerId).eq('send_key',legacy.key).maybeSingle();
      if (prior.error) throw new Error('sequence_lookup_unavailable');
      if (prior.data?.state === 'acked') return false; // Existing legacy sender replays its ACK, with no provider I/O.
      if (prior.data) throw new Error('dispatch_uncertain');
    }
  }
  await dispatchMessageSequence(args);
  return true;
}

export function messageMediaSignatureMatches(bytes: Uint8Array, mime: string): boolean {
  const ascii = (start: number, text: string) => text.split('').every((c, i) => bytes[start + i] === c.charCodeAt(0));
  if (mime === 'image/png') return bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((b,i) => bytes[i]===b);
  if (mime === 'image/jpeg') return bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
  if (mime === 'image/webp') return ascii(0,'RIFF') && ascii(8,'WEBP');
  if (mime === 'video/mp4' || mime === 'audio/mp4') return ascii(4,'ftyp');
  if (mime === 'audio/ogg') return ascii(0,'OggS');
  if (mime === 'audio/webm') return [26,69,223,163].every((b,i)=>bytes[i]===b);
  if (mime === 'audio/mpeg') return ascii(0,'ID3') || (bytes[0]===255 && (bytes[1] & 224)===224);
  return false;
}
