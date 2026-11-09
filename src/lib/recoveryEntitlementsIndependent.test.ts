import * as messageSequence from '../../supabase/functions/_shared/message-sequence';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { URL as NodeURL } from 'node:url';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as recovery from '../../supabase/functions/_shared/automation-recovery';
import * as entitlements from '../../supabase/functions/_shared/company-feature-entitlements';
import * as product from '../../supabase/functions/_shared/company-product-settings';
import * as communication from '../../supabase/functions/_shared/communication-policy';
import * as flow from '../../supabase/functions/_shared/automation-flow';
import * as redaction from '../../supabase/functions/_shared/provider-error-redaction';
import * as identity from '../../supabase/functions/_shared/whatsappIdentity';

type Reply = { data: unknown; error: unknown };
type Delivery = Record<string, unknown>;
const company = '00000000-0000-4000-8000-000000000001';
const studentId = '00000000-0000-4000-8000-000000000002';
const delivery: Delivery = {
  id: '00000000-0000-4000-8000-000000000003', company_id: company,
  student_id: studentId, enrollment_id: '00000000-0000-4000-8000-000000000004',
  training_cycle_id: '00000000-0000-4000-8000-000000000005',
  dispatch_lease_token: '00000000-0000-4000-8000-000000000006', retry_count: 0,
};

function dispatcher(client: unknown, network: typeof fetch) {
  const source = readFileSync(new NodeURL('../../supabase/functions/process-automation-sessions/index.ts', import.meta.url), 'utf8');
  const parsed = ts.createSourceFile('dispatcher.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const isolated = ts.factory.updateSourceFile(parsed, parsed.statements.filter(statement =>
    !ts.isImportDeclaration(statement) && !(ts.isIfStatement(statement) && statement.expression.getText(parsed).includes('import.meta.main'))));
  const javascript = ts.transpileModule(ts.createPrinter().printFile(isolated), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  runInNewContext(javascript, {
    exports, ...messageSequence, ...recovery, ...entitlements, ...product, ...communication, ...flow, ...redaction, ...identity,
    crypto: webcrypto, TextEncoder, Uint8Array, Request, Response, Date,
    // Provider I/O is simulated; jsdom's AbortSignal lacks native Deno timeout.
    AbortSignal: { timeout: () => new AbortController().signal },
    btoa: (value: string) => Buffer.from(value, 'binary').toString('base64'),
    fetch: network, console: { log() {}, error() {} }, createClient: () => client,
    Deno: { env: { get: () => undefined } },
  });
  return exports;
}

function intercycleAdapter(options: { stale?: boolean; prepared?: 'acked' | 'prepared' } = {}) {
  const writes: Array<{ table: string; patch: Record<string, unknown> }> = [];
  const events: string[] = [];
  let persistedHash = 'hash-of-already-delivered-successor-invite';
  const rpc = vi.fn(async (name: string): Promise<Reply> => {
    events.push(name);
    if (name === 'process_intercycle_anamnesis_schedule') return { data: 0, error: null };
    if (name === 'claim_intercycle_anamnesis_deliveries') return { data: [{ ...delivery }], error: null };
    if (name === 'service_company_feature_allowed') return { data: true, error: null };
    if (name === 'prepare_automation_dispatch') return options.stale
      ? { data: null, error: { message: 'dispatch_lease_lost' } }
      : { data: options.prepared ?? 'prepared', error: null };
    if (name === 'ack_automation_dispatch') return { data: null, error: null };
    if (name === 'authorize_automation_dispatch') return { data: null, error: null };
    if (name === 'checkpoint_automation_dispatch') return options.stale
      ? { data: null, error: { message: 'dispatch_lease_lost' } }
      : { data: null, error: null };
    throw new Error(`Unexpected RPC ${name}`);
  });
  const reads: Record<string, unknown> = {
    students: { id: studentId, full_name: 'Synthetic Student', phone: '48999990001', whatsapp: '48999990001', country_code: '55', intercycle_anamnesis_enabled: true },
    training_cycles: { id: delivery.training_cycle_id, student_id: studentId, company_id: company, enrollment_id: delivery.enrollment_id, status: 'active', superseded_at: null },
    enrollments: { id: delivery.enrollment_id, status: 'active' },
    whatsapp_chats: { id: 'synthetic-chat', student_id: studentId, company_id: company, remote_jid: '5548999990001@s.whatsapp.net', instance_id: 'synthetic-instance' },
    whatsapp_instances: { instance_name: 'synthetic', status: 'connected' },
    company_product_settings: null,
  };
  const client = { rpc, from(table: string) {
    let mutation = false;
    const result = (): Reply => mutation
      ? { data: options.stale ? null : { id: delivery.id }, error: null }
      : { data: reads[table] ?? null, error: null };
    const query = {
      select: (_columns?: string) => query,
      eq: (_key: string, _value: unknown) => query,
      gt: (_key: string, _value: unknown) => query,
      order: (_key: string, _options: unknown) => query,
      limit: (_count: number) => query,
      maybeSingle: async () => result(),
      single: async () => result(),
      update: (patch: Record<string, unknown>) => { mutation = true; writes.push({ table, patch }); return query; },
      insert: async (patch: Record<string, unknown>) => { writes.push({ table, patch }); return { error: null }; },
      upsert: async (patch: Record<string, unknown>) => {
        events.push(`upsert:${table}`);
        writes.push({ table, patch });
        if (table === 'intercycle_anamnesis_invites') persistedHash = String(patch.token_sha256);
        return { error: null };
      },
      then: (resolve: (value: Reply) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return query;
  } };
  return { client, rpc, writes, events, reads, hash: () => persistedHash };
}

describe('independent recovery intercycle adversarial ordering (adapter, no database)', () => {
  it('a stale worker cannot replace an invite already delivered by its successor', async () => {
    const adapter = intercycleAdapter({ stale: true });
    const originalHash = adapter.hash();
    const network = vi.fn<typeof fetch>(() => { throw new Error('Provider network forbidden'); });
    const handler = dispatcher(adapter.client, network);
    await handler.processIntercycleAnamnesisDeliveries({ admin: adapter.client, provider: { url: 'http://127.0.0.1:1', key: 'synthetic' } })
      .catch(error => { expect(String(error)).toContain('dispatch_lease_lost'); });
    expect(network).not.toHaveBeenCalled();
    expect(adapter.hash(), `events: ${adapter.events.join(', ')}`).toBe(originalHash);
  });

  it('a durable ACK replay preserves the invite hash instead of rotating an unsent token', async () => {
    const adapter = intercycleAdapter({ prepared: 'acked' });
    const originalHash = adapter.hash();
    const network = vi.fn<typeof fetch>(() => { throw new Error('Provider network forbidden'); });
    const handler = dispatcher(adapter.client, network);
    await handler.processIntercycleAnamnesisDeliveries({ admin: adapter.client, provider: { url: 'http://127.0.0.1:1', key: 'synthetic' } });
    expect(network).not.toHaveBeenCalled();
    expect(adapter.hash()).toBe(originalHash);
  });

  it('control: a fresh send persists intent before simulated provider I/O and ACKs its receipt', async () => {
    const adapter = intercycleAdapter();
    const network = vi.fn<typeof fetch>(async () => {
      adapter.events.push('simulated-provider');
      return new Response(JSON.stringify({ key: { id: 'synthetic-receipt' } }), { status: 200 });
    });
    const handler = dispatcher(adapter.client, network);
    await handler.processIntercycleAnamnesisDeliveries({ admin: adapter.client, provider: { url: 'http://127.0.0.1:1', key: 'synthetic' } });
    expect(network, JSON.stringify(adapter.events)).toHaveBeenCalledTimes(1);
    expect(adapter.events.filter(name => ['prepare_automation_dispatch', 'authorize_automation_dispatch', 'simulated-provider', 'ack_automation_dispatch'].includes(name)))
      .toEqual(['prepare_automation_dispatch', 'authorize_automation_dispatch', 'simulated-provider', 'ack_automation_dispatch']);
    expect(adapter.rpc).toHaveBeenCalledWith('ack_automation_dispatch', expect.objectContaining({ _provider_message_id: 'synthetic-receipt' }));
  });
});

describe('independent delayed graph revisits (adapter, no database)', () => {
  it('rejects a persisted delayed cycle before ledger or provider while accepting an acyclic diamond', async () => {
    const adapter = intercycleAdapter({ prepared: 'acked' });
    const flowId = '00000000-0000-4000-8000-000000000010';
    const nodeA = '00000000-0000-4000-8000-000000000011';
    const nodeB = '00000000-0000-4000-8000-000000000012';
    adapter.reads.automation_flows = { id: flowId, company_id: company, is_active: true };
    adapter.reads.automation_flow_nodes = [
      { id: nodeA, node_type: 'content', data: { message: 'Synthetic next visit A', delay_minutes: 1 } },
      { id: nodeB, node_type: 'content', data: { message: 'Synthetic B', delay_minutes: 1 } },
    ];
    adapter.reads.automation_flow_edges = [
      { source_node_id: nodeA, target_node_id: nodeB },
      { source_node_id: nodeB, target_node_id: nodeA },
    ];
    const network = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ key: { id: 'synthetic-new-visit' } }), { status: 200 }));
    const handler = dispatcher(adapter.client, network);
    // A persisted pre-migration cycle must be rejected even after a real delay
    // would have yielded into a fresh invocation and reset the visited set.
    const session = {
      id: 'synthetic-delayed-cycle-session', flow_id: flowId, chat_id: 'synthetic-chat',
      current_node_id: nodeA, dispatch_lease_token: delivery.dispatch_lease_token,
      context: {
        student_id: studentId, _dispatch_content_ack: `${flowId}:${nodeB}`,
        _delay: { key: `${flowId}:${nodeA}`, due: '2026-01-01T00:00:00.000Z' },
      },
    };
    await expect(handler.processSession(adapter.client, session, { url: 'http://127.0.0.1:1', key: 'synthetic' }))
      .rejects.toThrow('flow_graph_cycle_unsupported');
    expect(adapter.rpc.mock.calls.some(([name]) => name === 'prepare_automation_dispatch')).toBe(false);
    expect(network).not.toHaveBeenCalled();
    expect(adapter.writes).toEqual([]);
    expect(() => recovery.assertAcyclicDispatchGraph([
      { source_node_id: 'start', target_node_id: 'left' },
      { source_node_id: 'start', target_node_id: 'right' },
      { source_node_id: 'left', target_node_id: 'end' },
      { source_node_id: 'right', target_node_id: 'end' },
    ])).not.toThrow();
  });
});

describe('independent helper failure boundaries (no database)', () => {
  it.each([null, false, 'true', 1, {}, []])('entitlement RPC value %j does not grant a capability', async data => {
    await expect(entitlements.requireCompanyFeature({ rpc: async () => ({ data, error: null }) }, company, 'hasAutomation'))
      .rejects.toMatchObject({ status: 403, message: 'company_feature_denied' });
  });

  it('entitlement lookup error is unavailable even when data says true', async () => {
    await expect(entitlements.requireCompanyFeature({ rpc: async () => ({ data: true, error: { message: 'synthetic' } }) }, company, 'hasWhatsApp'))
      .rejects.toMatchObject({ status: 503, message: 'company_feature_unavailable' });
  });

  it('server checkpoint denial cannot acknowledge fenced ownership or fall back to direct PATCH', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'dispatch_lease_lost' } }));
    const from = vi.fn(() => { throw new Error('Direct checkpoint PATCH forbidden'); });
    const client = { rpc, from };
    await expect(recovery.fencedDispatchUpdate(client, 'flow', { id: 'synthetic-session', dispatch_lease_token: 'synthetic-lease' }, { status: 'completed' }))
      .rejects.toThrow('dispatch_lease_lost');
    expect(rpc).toHaveBeenCalledWith('checkpoint_automation_dispatch', {
      _kind: 'flow', _owner_id: 'synthetic-session', _lease_token: 'synthetic-lease', _patch: { status: 'completed' },
    });
    expect(from).not.toHaveBeenCalled();
  });
});
