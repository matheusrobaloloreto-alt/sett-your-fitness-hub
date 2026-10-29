/** Webhook-owned sends share the durable attempt ledger. No provider retry. */
export type DispatchRpc = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

export async function webhookOccurrence(event: unknown, purpose: string): Promise<string> {
  if (typeof event !== 'string' || !event.trim() || event.length > 500 || !purpose) {
    throw new Error('dispatch_event_identity_required');
  }
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([event, purpose])));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
}

export async function dispatchWebhookText(args: {
  admin: DispatchRpc; companyId: string; chatId: string; occurrence: string;
  beforeSend: () => Promise<void>;
  send: () => Promise<string>;
}): Promise<string | null> {
  const claimed = await args.admin.rpc('claim_webhook_dispatch', {
    _company_id: args.companyId, _chat_id: args.chatId, _occurrence: args.occurrence,
  });
  if (claimed.error || !claimed.data || typeof claimed.data !== 'object') throw new Error('dispatch_claim_unavailable');
  const owner = claimed.data as { id?: string; token?: string; state?: string };
  if (owner.state === 'acked') return null; // Never call the provider on receipt replay.
  if (owner.state !== 'claimed' || !owner.id || !owner.token) throw new Error('dispatch_uncertain');
  const attempt = { _kind: 'webhook', _owner_id: owner.id, _lease_token: owner.token, _send_key: 'text' };
  let started = false;
  try {
    await args.beforeSend();
    const begun = await args.admin.rpc('begin_automation_dispatch', attempt);
    if (begun.error || begun.data !== 'in_flight') throw new Error('dispatch_begin_unavailable');
    started = true;
    // Recheck current commercial/recipient identity, then fence against the
    // server clock immediately before I/O (the checks may themselves be slow).
    await args.beforeSend();
    const authorized = await args.admin.rpc('authorize_automation_dispatch', attempt);
    if (authorized.error) throw new Error('dispatch_uncertain');
    const receipt = await args.send();
    if (!receipt?.trim() || receipt.length > 200 || Array.from(receipt).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) {
      throw new Error('dispatch_receipt_missing');
    }
    const ack = await args.admin.rpc('ack_automation_dispatch', { ...attempt, _provider_message_id: receipt });
    if (ack.error) throw new Error('dispatch_uncertain');
    return receipt;
  } catch {
    // A failed/lost begin response may itself have persisted intent. The server
    // inspects the ledger; the client flag is deliberately not authoritative.
    try { await args.admin.rpc('park_webhook_dispatch', { _owner_id: owner.id, _lease_token: owner.token }); } catch { /* Ledger still blocks resend. */ }
    throw new Error(started ? 'dispatch_uncertain' : 'dispatch_not_completed');
  }
}
