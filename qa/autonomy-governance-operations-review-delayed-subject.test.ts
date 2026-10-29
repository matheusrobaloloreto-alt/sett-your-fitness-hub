import { processSession } from '../supabase/functions/process-automation-sessions/index.ts';
import { executeFlow } from '../supabase/functions/whatsapp-webhook/index.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const jid = '5548999999999@s.whatsapp.net';
type Row = Record<string, any>;
type Options = { generic?: boolean; legacy?: boolean; missing?: boolean; changedInitial?: boolean;
  changedSecond?: boolean; unlinkedSecond?: boolean; changedAtBegin?: boolean; menu?: boolean; delay?: boolean };
function fixture(options: Options = {}) {
  const calls: string[] = [];
  const patches: Row[] = [];
  const writes: Row[] = [];
  let reads = 0;
  let changed = false;
  const context: Row = options.missing ? {} : options.legacy ? { student_id: 'student-a' }
    : { _dispatch_student_id: options.generic ? null : 'student-a' };
  const nodes = [{ id: 'message', node_type: options.menu ? 'menu' : 'content', data: options.menu
    ? { prompt: 'Synthetic menu', options: [{ number: '1', text: 'Continue' }] }
    : { message: options.generic ? 'Synthetic welcome' : 'Synthetic private context A', wait_for_reply: true, delay_minutes: options.delay ? 60 : 0 } }];
  const admin = {
    rpc(name: string, args: Row = {}) {
      calls.push(name);
      if (name === 'checkpoint_automation_dispatch') patches.push(args._patch);
      if (name === 'begin_automation_dispatch') {
        if (options.changedAtBegin) changed = true;
        return Promise.resolve({ data: 'in_flight', error: null });
      }
      return Promise.resolve({ data: true, error: null });
    },
    from(table: string) {
      const filters: Row = {};
      let mutation: Row | null = null;
      const result = () => {
        if (mutation) { writes.push({ table, ...mutation }); return { data: null, error: null }; }
        if (table === 'whatsapp_chats') {
          reads++;
          const subject = options.changedInitial || changed || (reads > 1 && options.changedSecond)
            ? 'student-b' : reads > 1 && options.unlinkedSecond ? null : options.generic ? null : 'student-a';
          return { data: { id: 'chat', company_id: 'company', instance_id: 'instance', remote_jid: jid, student_id: subject }, error: null };
        }
        const rows: Row = {
          students: { id: filters.id, phone: '+55 48 99999-9999', whatsapp: null, country_code: 'BR' },
          whatsapp_instances: { instance_name: 'synthetic', status: 'connected' },
          automation_flows: { id: 'flow', company_id: 'company', is_active: true },
          automation_flow_nodes: nodes, automation_flow_edges: [], company_product_settings: { settings: {}, version: 1 },
        };
        assert(table in rows, `Unexpected table ${table}`);
        return { data: rows[table], error: null };
      };
      const q: any = { select: () => q, eq: (k: string, v: unknown) => { filters[k] = v; return q; },
        order: () => q, limit: () => q, single: async () => result(), maybeSingle: async () => result(),
        insert: (v: Row) => { mutation = v; return q; }, update: (v: Row) => { mutation = v; return q; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve) };
      return q;
    },
  };
  const session = { id: 'session', flow_id: 'flow', chat_id: 'chat', current_node_id: 'message', dispatch_lease_token: 'synthetic-lease', context };
  return { admin, session, calls, patches, writes, readCount: () => reads };
}
async function capture(run: () => Promise<unknown>) {
  const original = globalThis.fetch;
  let sends = 0;
  globalThis.fetch = (async (url: unknown) => {
    assert(String(url) === 'https://provider.invalid/message/sendText/synthetic', 'unexpected network');
    sends++;
    return new Response(JSON.stringify({ key: { id: 'synthetic-receipt' } }));
  }) as typeof fetch;
  try {
    let error = ''; let value: unknown;
    try { value = await run(); } catch (e) { error = e instanceof Error ? e.message : String(e); }
    return { sends, error, value };
  } finally { globalThis.fetch = original; }
}
const provider = { url: 'https://provider.invalid', key: 'synthetic' };

for (const options of [{}, { legacy: true }, { generic: true }, { menu: true }]) {
  Deno.test(`QA2 delayed cron legitimate subject persists ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    const p = await capture(() => processSession(f.admin, f.session, provider));
    assert(p.error === '' && p.sends === 1 && p.value === 'waiting_response', `normal dispatch failed: ${p.error}`);
    assert(f.patches.at(-1)?.context._dispatch_student_id === (options.generic ? null : 'student-a'), 'protected snapshot not persisted');
  });
}
for (const options of [{ missing: true }, { missing: true, generic: true }, { changedInitial: true },
  { changedSecond: true }, { unlinkedSecond: true }, { generic: true, changedSecond: true },
  { menu: true, changedSecond: true }]) {
  Deno.test(`QA2 delayed cron refuses unknown/reassigned subject ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    const p = await capture(() => processSession(f.admin, f.session, provider));
    assert(p.sends === 0 && ['dispatch_subject_snapshot_missing', 'dispatch_subject_changed'].includes(p.error), `subject not refused: ${JSON.stringify(p)}`);
    assert(f.writes.length === 0 && f.patches.length === 0 && !f.calls.includes('begin_automation_dispatch'), 'unknown/reassigned subject advanced');
  });
}
Deno.test('QA2 webhook scheduled subject survives cron continuation without rebinding', async () => {
  const f = fixture({ delay: true });
  const scheduled = await capture(() => executeFlow(f.admin, 'company', jid, 'chat', 'synthetic', provider.url, {},
    'flow', 'message', { _dispatch_student_id: 'student-a', _dispatch_inbound_event: 'event' }, true));
  assert(scheduled.error === '' && scheduled.sends === 0, 'webhook delay failed');
  const stored = f.writes.find(w => w.table === 'flow_sessions');
  assert(stored?.context._dispatch_student_id === 'student-a', 'webhook dropped subject');
  const context = { ...stored.context, _delay: { ...stored.context._delay, due: '2020-01-01T00:00:00Z' } };
  const sent = await capture(() => processSession(f.admin, { ...f.session, context }, provider));
  assert(sent.error === '' && sent.sends === 1, `delayed continuation failed: ${sent.error}`);
});
for (const options of [{ changedAtBegin: true }, { generic: true, changedAtBegin: true }]) {
  Deno.test(`QA2 delayed subject revocation during durable begin fences final I/O ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    const p = await capture(() => processSession(f.admin, f.session, provider));
    assert(f.calls.includes('begin_automation_dispatch'), 'test missed durable boundary');
    assert(p.sends === 0 && p.error !== '', `P1: subject changed during begin but send proceeded; sends=${p.sends}`);
    assert(!f.calls.includes('ack_automation_dispatch') && f.writes.length === 0, 'revoked subject acknowledged/logged');
  });
}
