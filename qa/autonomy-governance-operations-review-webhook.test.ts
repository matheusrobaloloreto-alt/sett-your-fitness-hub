// Independent QA2: actual exported sender; synthetic adapters, no network/model.
import { executeFlow, sendText } from '../supabase/functions/whatsapp-webhook/index.ts';
import { webhookOccurrence } from '../supabase/functions/_shared/dispatch-reconciliation-webhook.ts';
import { assertResponseVariable } from '../supabase/functions/_shared/automation-flow.ts';

const jid = '5548999999999@s.whatsapp.net';
function assert(value: unknown, reason: string): asserts value {
  if (!value) throw new Error(reason);
}
type Options = { changedStudent?: boolean; unlinkStudent?: boolean; leaseLost?: boolean; replay?: boolean; ackLost?: boolean; claimDenied?: boolean; generic?: boolean; attachStudent?: boolean; changedBeforeFirstCheck?: boolean };
async function probe(options: Options = {}) {
  const calls: string[] = [];
  let chatReads = 0;
  let sends = 0;
  let history = 0;
  let rejected = false;
  const admin = {
    rpc(name: string) {
      calls.push(name);
      if (name === 'service_company_feature_allowed') return Promise.resolve({ data: true, error: null });
      if (name === 'claim_webhook_dispatch') return Promise.resolve({
        data: options.replay ? { state: 'acked' } : { state: 'claimed', id: 'owner', token: 'lease' },
        error: options.claimDenied ? { code: '42501' } : null,
      });
      if (name === 'begin_automation_dispatch') return Promise.resolve({ data: 'in_flight', error: null });
      if (name === 'authorize_automation_dispatch') return Promise.resolve({ data: null, error: options.leaseLost ? { message: 'dispatch_lease_lost' } : null });
      if (name === 'ack_automation_dispatch') return Promise.resolve({ data: null, error: options.ackLost ? { message: 'synthetic unavailable' } : null });
      if (name === 'park_webhook_dispatch') return Promise.resolve({ data: null, error: null });
      throw new Error(`Unexpected RPC: ${name}`);
    },
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const result = () => {
        if (table === 'whatsapp_chats') {
          chatReads++;
          return { data: { id: 'chat', company_id: 'company', remote_jid: jid, instance_id: 'instance',
            student_id: options.generic ? (chatReads > 1 && options.attachStudent ? 'student-b' : null)
              : options.changedBeforeFirstCheck ? 'student-b'
              : chatReads > 1 && options.unlinkStudent ? null : chatReads > 1 && options.changedStudent ? 'student-b' : 'student-a' }, error: null };
        }
        if (table === 'whatsapp_instances') return { data: { id: 'instance', instance_name: 'synthetic', status: 'connected' }, error: null };
        // Model phone reassignment: current student B now owns this same number.
        if (table === 'students') return { data: { id: filters.id, phone: '+55 48 99999-9999', whatsapp: null, country_code: 'BR' }, error: null };
        throw new Error(`Unexpected table: ${table}`);
      };
      const query = {
        select: () => query,
        eq: (name: string, value: unknown) => { filters[name] = value; return query; },
        maybeSingle: async () => result(),
        insert: async () => { assert(table === 'whatsapp_messages', 'unexpected write'); history++; return { data: null, error: null }; },
      };
      return query;
    },
  };
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: unknown) => {
    assert(String(url) === 'https://provider.invalid/message/sendText/synthetic', 'unexpected network destination');
    sends++;
    return new Response(JSON.stringify({ key: { id: 'synthetic-receipt' } }));
  }) as typeof fetch;
  try {
    try {
      await sendText('https://provider.invalid', 'synthetic', { apikey: 'synthetic' }, 'company', jid,
        options.generic ? 'Synthetic generic welcome' : 'Synthetic private plan for student A', admin, 'chat',
        () => webhookOccurrence('synthetic-inbound', options.generic ? 'welcome' : 'bnito'), options.generic ? null : 'student-a');
    } catch { rejected = true; }
    return { calls, chatReads, sends, history, rejected };
  } finally { globalThis.fetch = original; }
}

Deno.test('QA2 explicit generic null subject sends normally while chat remains unlinked', async () => {
  const p = await probe({ generic: true });
  assert(!p.rejected && p.sends === 1 && p.history === 1 && p.chatReads === 2, 'explicit generic welcome failed');
});
Deno.test('QA2 generic null subject cannot send after null-to-student reassignment', async () => {
  const p = await probe({ generic: true, attachStudent: true });
  assert(p.chatReads === 2 && p.rejected && p.sends === 0 && p.history === 0, 'generic subject silently upgraded to student');
});
Deno.test('QA2 composed student identity is enforced on first check before durable intent', async () => {
  const p = await probe({ changedBeforeFirstCheck: true });
  assert(p.chatReads === 1 && p.rejected && p.sends === 0 && p.history === 0, 'first check accepted another student');
  assert(!p.calls.includes('begin_automation_dispatch'), 'subject mismatch persisted dispatch intent');
});
Deno.test('QA2 missing flow subject fails after entitlement checks but before business data reads/writes', async () => {
  let reads = 0;
  const admin = { from: () => { reads++; throw new Error('unexpected read'); }, rpc: (name: string) => {
    assert(name === 'service_company_feature_allowed', 'unexpected business RPC');
    return Promise.resolve({ data: true, error: null });
  } };
  let message = '';
  try {
    await executeFlow(admin, 'company', jid, 'chat', 'synthetic', 'https://provider.invalid', { apikey: 'synthetic' },
      'flow', 'node', { _dispatch_inbound_event: 'event' }, true);
  } catch (error) { message = error instanceof Error ? error.message : String(error); }
  assert(reads === 0 && message === 'dispatch_subject_snapshot_missing', 'legacy subject absence reached business I/O');
});
Deno.test('QA2 reply-variable validation cannot overwrite either protected subject field', () => {
  for (const field of ['_dispatch_student_id', 'student_id']) {
    let rejected = false;
    try { assertResponseVariable(field); } catch { rejected = true; }
    assert(rejected, `reply can overwrite ${field}`);
  }
});

Deno.test('QA2 unchanged student reaches authorization, receipt ACK, then history', async () => {
  const p = await probe();
  assert(!p.rejected && p.sends === 1 && p.history === 1 && p.chatReads === 2, 'valid sender path failed');
  assert(p.calls.indexOf('authorize_automation_dispatch') < p.calls.indexOf('ack_automation_dispatch'), 'ACK before authorization');
});
Deno.test('QA2 stale lease fences provider I/O', async () => {
  const p = await probe({ leaseLost: true });
  assert(p.rejected && p.sends === 0 && p.history === 0, 'stale lease sent');
});
Deno.test('QA2 denied claim does not send', async () => {
  const p = await probe({ claimDenied: true });
  assert(p.rejected && p.sends === 0, 'claim failure sent');
});
Deno.test('QA2 durable receipt replay never sends', async () => {
  const p = await probe({ replay: true });
  assert(!p.rejected && p.sends === 0 && p.history === 0, 'durable receipt replay sent');
});
Deno.test('QA2 lost ACK parks without history success', async () => {
  const p = await probe({ ackLost: true });
  assert(p.rejected && p.sends === 1 && p.history === 0 && p.calls.includes('park_webhook_dispatch'), 'lost ACK advanced');
});
for (const options of [{ changedStudent: true }, { unlinkStudent: true }]) {
  Deno.test(`QA2 private student context must not send after chat identity revocation ${JSON.stringify(options)}`, async () => {
    const p = await probe(options);
    assert(p.chatReads === 2, 'test did not reach both recipient checks');
    assert(p.rejected && p.sends === 0 && p.history === 0,
      `P1: student identity changed but private context was sent; sends=${p.sends}, history=${p.history}`);
  });
}
