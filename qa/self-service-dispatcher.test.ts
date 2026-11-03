import { handleAutomationRequest } from '../supabase/functions/process-automation-sessions/index.ts';

function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

Deno.test('actual dispatcher HTTP handler sends through loopback fake provider and enforces consent', async () => {
  const sent: Array<{ text: string; number: string }> = [];
  const writes: Array<{ table: string; values: Record<string, unknown> }> = [];
  const calls: string[] = [];
  let consent = true;
  let claimed = false;
  const jid = '5548999999999@s.whatsapp.net';
  const session = { id: 'synthetic-session', flow_id: 'synthetic-flow', chat_id: 'synthetic-chat', current_node_id: 'message',
    context: { trigger_type: 'weekly_contact', student_id: 'synthetic-student', nome: 'Synthetic',
      recipient_candidate: jid, recipient_generation: 1, recipient_country_code: 'BR' } };
  // This adapter is deliberately synthetic: handler/provider HTTP is real, SQL/Auth is NOT covered here.
  const admin = {
    rpc(name: string) {
      calls.push(name);
      const data = name === 'claim_automation_sessions' ? (claimed ? [] : (claimed = true, [session]))
        : name === 'claim_intercycle_anamnesis_deliveries' ? []
        : name === 'weekly_contact_consent_is_current' ? consent : 0;
      return Promise.resolve({ data, error: null });
    },
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let write: Record<string, unknown> | null = null;
      const result = () => {
        if (write) { writes.push({ table, values: write }); return { data: null, error: null }; }
        const rows: Record<string, unknown> = {
          whatsapp_chats: { id: 'synthetic-chat', company_id: 'company-a', student_id: 'synthetic-student', remote_jid: jid, instance_id: 'instance' },
          students: { id: 'synthetic-student', phone: '+5548999999999', country_code: 'BR' },
          whatsapp_instances: { instance_name: 'synthetic', status: 'connected' },
          automation_flows: { id: 'synthetic-flow', company_id: 'company-a', is_active: true },
          automation_flow_nodes: [{ id: 'message', node_type: 'content', data: { message: 'Old node text', use_company_template: 'weekly_contact' } }],
          automation_flow_edges: [],
          whatsapp_labels: { id: 'synthetic-label' },
          whatsapp_chat_labels: { id: 'synthetic-chat-label' },
          company_product_settings: { settings: { messages: { weekly_contact: 'Saved override for {{primeiro_nome}}' } }, version: 1 },
        };
        if (!(table in rows)) throw new Error(`Unexpected synthetic dependency ${table}`);
        if (['students','company_product_settings','whatsapp_instances','automation_flows'].includes(table)) {
          check(filters.company_id === 'company-a', `Unscoped ${table}`);
        }
        return { data: rows[table], error: null };
      };
      const query: Record<string, any> = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        order: () => query, limit: () => query,
        update: (values: Record<string, unknown>) => { write = values; return query; },
        insert: (values: Record<string, unknown>) => { write = values; return query; },
        upsert: (values: Record<string, unknown>) => { write = values; return query; },
        single: async () => result(), maybeSingle: async () => result(),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return query;
    },
  };
  const provider = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, async request => {
    check(new URL(request.url).pathname === '/message/sendText/synthetic', 'Unexpected provider route');
    sent.push(await request.json());
    return Response.json({ key: { id: 'synthetic-receipt' } });
  });
  const names = ['AUTOMATION_CRON_SECRET','EVOLUTION_API_URL','EVOLUTION_API_KEY','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const previous = new Map(names.map(name => [name, Deno.env.get(name)]));
  Deno.env.set('AUTOMATION_CRON_SECRET','synthetic-local-only');
  Deno.env.set('EVOLUTION_API_URL',`http://127.0.0.1:${provider.addr.port}`);
  Deno.env.set('EVOLUTION_API_KEY','synthetic-provider-only');
  Deno.env.set('SUPABASE_URL','http://127.0.0.1:57421');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','synthetic-injected-adapter-only');
  const dispatcher = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, request => handleAutomationRequest(request, { admin }));
  const call = (authorized = true) => fetch(`http://127.0.0.1:${dispatcher.addr.port}`, {
    method: 'POST', headers: authorized ? { 'x-cron-secret': 'synthetic-local-only' } : {},
  });
  try {
    const denied = await call(false);
    check(denied.status === 401, 'Missing dispatcher credential was accepted');
    await denied.body?.cancel();
    const success = await call();
    const result = await success.json();
    check(success.ok && result.completed === 1, `Dispatcher did not complete the synthetic session: ${JSON.stringify({ result, writes })}`);
    check(sent.length === 1 && sent[0].text === 'Saved override for Synthetic', 'Persisted template was not consumed by the actual handler');
    check(calls.filter(name => name === 'weekly_contact_consent_is_current').length >= 2, 'Consent was not rechecked before send');
    check(writes.some(write => write.table === 'whatsapp_messages'), 'Synthetic provider receipt was not persisted');
    await (await call()).json();
    check(sent.length === 1, 'Empty claim replay resent a message');
    consent = false; claimed = false;
    const blocked = await (await call()).json();
    check(blocked.failed === 1 && sent.length === 1, 'Revoked consent still reached fake provider');
  } finally {
    await dispatcher.shutdown(); await provider.shutdown();
    for (const [name, value] of previous) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
});
