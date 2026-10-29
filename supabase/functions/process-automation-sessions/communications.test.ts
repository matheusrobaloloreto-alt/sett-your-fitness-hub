import { processSession } from './index.ts';
import { executeFlow } from '../whatsapp-webhook/index.ts';
import { DEFAULT_COMPANY_PRODUCT_SETTINGS } from '../_shared/company-product-settings.ts';

function assert(value: unknown, message: string) { if (!value) throw new Error(message); }
const jid = '5548999999999@s.whatsapp.net';
type Row = Record<string, any>;
function fixture(nodes: Row[], edges: Row[] = [], settings: Row = {}) {
  const updates: Row[] = [];
  const inserts: Row[] = [];
  const queries: Row[] = [];
  const attempts = new Map<string,string>();
  const admin = {
    rpc: (name: string, args: Row = {}) => {
      if(name==='checkpoint_automation_dispatch') {
        updates.push(args._patch);
        return Promise.resolve({data:null,error:null});
      }
      if (name === 'begin_automation_dispatch') {
        const prior = attempts.get(args._send_key);
        if (prior === 'in_flight') return Promise.resolve({ data:null,error:{ message:'dispatch_uncertain' } });
        if (!prior) attempts.set(args._send_key,'in_flight');
        return Promise.resolve({ data:prior || 'in_flight',error:null });
      }
      if (name === 'ack_automation_dispatch') attempts.set(args._send_key,'acked');
      return Promise.resolve({ data:true,error:null });
    },
    from(table: string) {
      const filters: Row = {};
      let update: Row | null = null;
      const result = () => {
        queries.push({ table, filters: { ...filters } });
        if (update) { updates.push(update); return { data: { id: 'session' }, error: null }; }
        const rows: Record<string, unknown> = {
          whatsapp_chats: { id: 'chat', company_id: 'company-a', student_id: 'student', remote_jid: jid, instance_id: 'instance' },
          students: { id: 'student', phone: '+55 48 99999-9999', whatsapp: null, country_code: 'BR' },
          whatsapp_instances: { instance_name: 'synthetic', status: 'connected' },
          company_product_settings: { settings, version: 1 },
          automation_flows: filters.id === '99999999-9999-9999-9999-999999999999' ? null : { id: filters.id, company_id: 'company-a', is_active: true },
          automation_flow_nodes: nodes.filter(n => !n.flow_id || n.flow_id === filters.flow_id),
          automation_flow_edges: edges.filter(e => !e.flow_id || e.flow_id === filters.flow_id),
          whatsapp_labels: { id: 'tag' }, whatsapp_chat_labels: { id: 'link' },
        };
        if (!(table in rows)) throw new Error(`Unexpected query ${table}`);
        return { data: rows[table], error: null };
      };
      const q: any = {
        select: () => q, eq: (k: string, v: unknown) => { filters[k] = v; return q; }, gt: () => q, order: () => q, limit: () => q,
        update: (row: Row) => { update = row; return q; },
        insert: (row: Row) => { inserts.push({ table, ...row }); return q; },
        single: async () => result(), maybeSingle: async () => result(),
        then: (resolve: (r: unknown) => unknown) => Promise.resolve(update ? result() : { data: null, error: null }).then(resolve),
      };
      // Collections are awaited directly, single-row readers use maybeSingle.
      if (table === 'automation_flow_nodes' || table === 'automation_flow_edges') q.then = (resolve: (r: unknown) => unknown) => Promise.resolve(result()).then(resolve);
      return q;
    },
  };
  const session = { id: 'session', dispatch_lease_token: 'synthetic-lease', flow_id: 'flow-a', chat_id: 'chat', current_node_id: 'message', context: { nome: 'Ana', student_id: 'student', trigger_type: 'weekly_contact', recipient_candidate: jid, recipient_generation: 1 } as Row };
  return { admin, session, updates, inserts, queries };
}
async function capture(run: (texts: string[]) => Promise<void>) {
  const original = globalThis.fetch;
  const texts: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    assert(String(url).startsWith('https://provider.invalid/'), 'Unexpected network destination');
    texts.push(JSON.parse(String(init?.body)).text);
    return new Response(JSON.stringify({ key: { id: 'synthetic-receipt' } }), { status: 200 });
  }) as typeof fetch;
  try { await run(texts); } finally { globalThis.fetch = original; }
}
const provider = { url: 'https://provider.invalid', key: 'synthetic' };

Deno.test('dispatcher sends edited weekly node rather than the default central copy', async () => {
  const f = fixture([{ id: 'message', node_type: 'content', data: { message: 'Custom {{primeiro_nome}}' } }], [], DEFAULT_COMPANY_PRODUCT_SETTINGS);
  await capture(async texts => {
    assert(await processSession(f.admin, f.session, provider) === 'completed', 'Not complete');
    assert(texts.join() === 'Custom Ana', 'Edited weekly text was ignored');
  });
});
Deno.test('dispatcher consumes company event override without leaking another company', async () => {
  const f = fixture([{ id: 'message', node_type: 'content', data: { message: 'Node', use_company_template: 'weekly_contact' } }], [], { messages: { weekly_contact: 'Central {{primeiro_nome}}' } });
  await capture(async texts => {
    await processSession(f.admin, f.session, provider);
    assert(texts.join() === 'Central Ana', 'Configured event not consumed');
    assert(f.queries.find(q => q.table === 'company_product_settings')?.filters.company_id === 'company-a', 'Unscoped settings');
  });
});
Deno.test('central weekly binding never overwrites the unbound follow-up node', async () => {
  const f = fixture([
    { id: 'message', node_type: 'content', data: { message: 'Initial', use_company_template: 'weekly_contact' } },
    { id: 'follow-up', node_type: 'content', data: { message: 'Sua resposta foi registrada, {{nome}}.' } },
  ], [{ source_node_id: 'message', target_node_id: 'follow-up' }], { messages: { weekly_contact: 'Central {{nome}}' } });
  await capture(async texts => {
    await processSession(f.admin, f.session, provider);
    assert(texts.join('|') === 'Central Ana|Sua resposta foi registrada, Ana.', 'Central template overwrote follow-up copy');
  });
});
Deno.test('dispatcher durably defers a 30-minute delay and resumes once due', async () => {
  const f = fixture([{ id: 'message', node_type: 'content', data: { message: 'Depois {{nome}}', delay_minutes: 30 } }]);
  await capture(async texts => {
    assert(await processSession(f.admin, f.session, provider) === 'scheduled', 'Delay ignored');
    assert(texts.length === 0, 'Delay sent immediately');
    const stored = f.updates[0];
    assert(stored.status === 'active' && stored.current_node_id === 'message' && stored.context.next_dispatch_at, 'No durable schedule');
    assert(await processSession(f.admin, { ...f.session, context: stored.context }, provider) === 'scheduled', 'Early resume ignored due date');
    const resumedContext = { ...stored.context, _delay: { ...stored.context._delay, due: '2020-01-01T00:00:00Z' } };
    assert(await processSession(f.admin, { ...f.session, context: resumedContext }, provider) === 'completed', 'Due delay did not resume');
    assert(texts.join() === 'Depois Ana', 'Due message missing');
  });
});
Deno.test('webhook persists long delay for the same dispatcher, without timer/sending', async () => {
  const f = fixture([{ id: 'message', node_type: 'content', data: { message: 'Depois', delay_minutes: 60 } }]);
  await capture(async texts => {
    await executeFlow(f.admin, 'company-a', jid, 'chat', 'synthetic', provider.url, {}, 'flow-a', 'message', { _dispatch_student_id: 'student' }, true);
    const scheduled = f.inserts.find(row => row.table === 'flow_sessions');
    assert(texts.length === 0 && scheduled?.status === 'active' && scheduled.context.next_dispatch_at, 'Webhook did not durably defer');
  });
});
Deno.test('dispatcher takes structured condition branch and applies typed tag', async () => {
  const f = fixture([
    { id: 'message', node_type: 'condition', data: { logic: 'and', conditions: [{ field: 'is_student', operator: 'eq', value: true }] } },
    { id: 'yes', node_type: 'action', data: { action_type: 'tag', tag_name: 'Typed' } },
    { id: 'no', node_type: 'content', data: { message: 'Wrong branch' } },
  ], [{ source_node_id: 'message', target_node_id: 'yes', source_handle: 'true' }, { source_node_id: 'message', target_node_id: 'no', source_handle: 'false' }]);
  await capture(async texts => { await processSession(f.admin, f.session, provider); assert(texts.length === 0, 'Wrong condition path'); });
  assert(f.queries.some(q => q.table === 'whatsapp_labels' && q.filters.name === 'Typed'), 'Tag action was a no-op');
});
Deno.test('cross-flow connection loads the actual target within the same company', async () => {
  const targetId = '11111111-1111-1111-1111-111111111111';
  const f = fixture([
    { id: 'message', flow_id: 'flow-a', node_type: 'flow_connection', data: { target_flow_id: targetId } },
    { id: 'target-start', flow_id: targetId, node_type: 'start', data: {} },
    { id: 'target-text', flow_id: targetId, node_type: 'content', data: { message: 'Target {{nome}}' } },
  ], [{ flow_id: targetId, source_node_id: 'target-start', target_node_id: 'target-text' }]);
  await capture(async texts => { await processSession(f.admin, f.session, provider); assert(texts.join() === 'Target Ana', 'Did not execute target'); });
  assert(f.queries.some(q => q.table === 'automation_flows' && q.filters.id === targetId && q.filters.company_id === 'company-a'), 'Target was not tenant scoped');
});
Deno.test('foreign or inactive connected target is blocked before any provider call', async () => {
  const f = fixture([{ id: 'message', node_type: 'flow_connection', data: { target_flow_id: '99999999-9999-9999-9999-999999999999' } }]);
  await capture(async texts => {
    let reason = '';
    try { await processSession(f.admin, f.session, provider); } catch (error) { reason = (error as Error).message; }
    assert(reason === 'flow_target_missing_inactive_or_foreign' && texts.length === 0, 'Foreign target was not blocked');
  });
});

Deno.test('terminal acknowledged content completes without repeating its final send', async () => {
  const f=fixture([{ id:'message',node_type:'content',data:{message:'Terminal'} }]);
  f.session.context._dispatch_content_ack='flow-a:message';
  await capture(async texts => {
    assert(await processSession(f.admin,f.session,provider)==='completed','Terminal retry did not complete');
    assert(texts.length===0,'Terminal content was resent');
    assert(f.updates.at(-1)?.current_node_id===null,'Terminal cursor retained after completion');
  });
});

for (const menu of [false,true]) Deno.test(`${menu?'menu':'reply'}: death after durable ACK before waiting checkpoint never resends`, async () => {
  const f=fixture([{id:'message',node_type:menu?'menu':'content',data:menu
    ?{prompt:'Choose',options:[{number:'1',text:'One'}]}
    :{message:'Reply',wait_for_reply:true,save_response_as:'name'}}],
    menu?[]:[{source_node_id:'message',target_node_id:'successor'}]);
  const rpc=f.admin.rpc.bind(f.admin); let fail=true;
  f.admin.rpc=(name:string,args:Row={}) => {
    if(name==='checkpoint_automation_dispatch' && args._patch.status==='waiting_response' && fail) {
      fail=false;
      return Promise.resolve({data:null,error:{message:'synthetic checkpoint death'}});
    }
    return rpc(name,args);
  };
  await capture(async texts=>{
    let failed=false;
    try { await processSession(f.admin,f.session,provider); } catch {failed=true;}
    assert(failed,'Checkpoint failure was hidden');
    assert(await processSession(f.admin,f.session,provider)==='waiting_response','Retry lost reply wait');
    assert(texts.length===1,'ACKed question/menu resent');
    const wait=f.updates.at(-1);
    if (!wait) throw new Error('Waiting checkpoint missing');
    assert(wait?.current_node_id===(menu?'message':'successor'),'Reply successor cursor changed');
    assert(menu?wait.context._menu_node===true:wait.context._reply_save_as==='name' && wait.context._reply_terminal===false,'Reply context changed');
  });
});

Deno.test('delayed A-B-A graph is rejected before any provider send', async () => {
  const f=fixture([
    {id:'message',node_type:'content',data:{message:'A',delay_minutes:1}},
    {id:'b',node_type:'content',data:{message:'B',delay_minutes:1}},
  ],[{source_node_id:'message',target_node_id:'b'},{source_node_id:'b',target_node_id:'message'}]);
  await capture(async texts=>{
    let reason='';
    try {await processSession(f.admin,f.session,provider);} catch(error) {reason=(error as Error).message;}
    assert(reason==='flow_graph_cycle_unsupported','Cyclic graph was accepted');
    assert(texts.length===0,'Cyclic graph sent before rejection');
  });
});
