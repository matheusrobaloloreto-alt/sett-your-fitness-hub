// Imports the 69 manager cases, including both BR regressions; adds two negative controls (71 total).
// deno test --cached-only --no-lock --allow-read --allow-env qa/message-sequences-jid-regression.test.ts
import { Fixture, equal } from '../supabase/functions/whatsapp-manager/whatsappSignature.integration.test.ts';
const canonical = '5548999990001@s.whatsapp.net';
const legacy = '554899990001@s.whatsapp.net';
const part = { id: 'one', type: 'text', text: 'Synthetic independent QA' };

Deno.test('JID fence: real stored route change after snapshot blocks claim and provider send', async () => {
  const f = new Fixture(); f.newContact = true; f.storedJid = legacy;
  const rpc = f.client.rpc;
  let claims = 0;
  f.client.rpc = (name: string, args: Record<string, unknown>) => {
    const result = rpc(name, args);
    if (name === 'snapshot_company_message_sequence') f.storedJid = '5548999990002@s.whatsapp.net';
    if (name === 'claim_company_message_part') claims++;
    return result;
  };
  const result = await f.request({ action: 'send-message-sequence', chatId: null, remoteJid: canonical, requestId: 'qa-fence', parts: [part] });
  equal(result.status, 422); equal(result.body.code, 'sequence_not_completed');
  equal(claims, 0); equal(f.sends.length, 0); equal(f.sequenceSnapshot.recipient, legacy);
});

Deno.test('JID fence: unrelated confirmed recipient cannot reuse an explicit chat', async () => {
  const f = new Fixture(); f.storedJid = legacy;
  const result = await f.request({ action: 'send-message-sequence', remoteJid: '5548999990002@s.whatsapp.net',
    requestId: 'qa-unrelated', parts: [part] });
  equal(result.status, 422); equal(result.body.code, 'sequence_not_completed');
  equal(f.sends.length, 0); equal(f.sequenceSnapshot, undefined);
});
