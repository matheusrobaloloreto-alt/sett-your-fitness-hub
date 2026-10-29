import test from 'node:test';
import assert from 'node:assert/strict';
import { companyOperationTransitionAllowed } from '../supabase/functions/_shared/company-operation-transitions.ts';

test('QA2 final Edge call includes inactive status and rejects lost-to-fiscal before mutation', async () => {
  const sources: unknown[] = [];
  const client = { rpc: async (_name: string, args: Record<string, unknown>) => {
    sources.push(args._source);
    return { data: args._source === 'interested', error: null };
  } };
  const student = { sales_stage: null, status: 'inactive' };
  assert.equal(await companyOperationTransitionAllowed(client, 'synthetic-company', student.sales_stage,
    'fiscal_registration_pending', student.status), false);
  assert.deepEqual(sources, ['lost']);
});

test('QA2 pending null stage stays under original financial lifecycle rather than operational policy', async () => {
  let calls = 0;
  const client = { rpc: async () => { calls++; return { data: false, error: null }; } };
  assert.equal(await companyOperationTransitionAllowed(client, 'synthetic-company', null,
    'fiscal_registration_pending', 'pending'), true);
  assert.equal(calls, 0);
  // This means only "no extra operational denial"; it does not activate or mark a payment paid.
});

test('QA2 interested null stage requires exact true RPC acknowledgement', async () => {
  for (const data of [null, false, {}, 'true']) {
    const client = { rpc: async () => ({ data, error: null }) };
    assert.equal(await companyOperationTransitionAllowed(client, 'synthetic-company', null,
      'fiscal_registration_pending', 'interested'), false);
  }
});

test('QA2 explicit operational transition fails closed on RPC and transport errors', async () => {
  const denied = { rpc: async () => ({ data: true, error: { code: '42501' } }) };
  const unavailable = { rpc: async () => { throw new Error('synthetic private detail'); } };
  for (const client of [denied, unavailable]) {
    assert.equal(await companyOperationTransitionAllowed(client, 'synthetic-company', 'interested', 'contacted'), false);
  }
});
