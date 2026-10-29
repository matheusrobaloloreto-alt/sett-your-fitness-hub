import { describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
vi.stubGlobal('crypto', webcrypto);
import { dispatchWebhookText, webhookOccurrence } from '../../supabase/functions/_shared/dispatch-reconciliation-webhook';
import { parseReconciliationRows } from '../../supabase/functions/_shared/dispatch-reconciliation';

function fixture(overrides: Record<string, unknown> = {}) {
  const rpc = vi.fn(async (name: string) => {
    if (name in overrides) return overrides[name] as { data: unknown; error: unknown };
    return { data: name === 'claim_webhook_dispatch' ? { id: 'owner', token: 'lease', state: 'claimed' }
      : name === 'begin_automation_dispatch' ? 'in_flight' : null, error: null };
  });
  const beforeSend = vi.fn(async () => {});
  const send = vi.fn(async () => 'receipt');
  return { admin: { rpc }, companyId: 'tenant', chatId: 'chat', occurrence: 'a'.repeat(64), beforeSend, send };
}

describe('communications durable webhook boundary', () => {
  it('hashes event + purpose deterministically and rejects missing event identities', async () => {
    const a = await webhookOccurrence('inbound-id', 'flow:node');
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(await webhookOccurrence('inbound-id', 'flow:node')).toBe(a);
    expect(await webhookOccurrence('inbound-id', 'flow:other')).not.toBe(a);
    expect(await webhookOccurrence('other-id', 'flow:node')).not.toBe(a);
    for (const missing of [null, '', '  ', undefined]) await expect(webhookOccurrence(missing, 'bnito')).rejects.toThrow('identity');
  });
  it('durably begins and authorizes before one I/O, then ACKs exact receipt', async () => {
    const f=fixture(); expect(await dispatchWebhookText(f)).toBe('receipt');
    expect(f.admin.rpc.mock.calls.map(([name])=>name)).toEqual(['claim_webhook_dispatch','begin_automation_dispatch','authorize_automation_dispatch','ack_automation_dispatch']);
    expect(f.beforeSend).toHaveBeenCalledTimes(2);
    expect(f.beforeSend.mock.invocationCallOrder[1]).toBeLessThan(f.send.mock.invocationCallOrder[0]);
    expect(f.admin.rpc).toHaveBeenLastCalledWith('ack_automation_dispatch', expect.objectContaining({ _kind: 'webhook', _provider_message_id: 'receipt', _lease_token: 'lease' }));
  });
  it('skips provider and side-effecting checks entirely for durable receipt replay', async () => {
    const f=fixture({ claim_webhook_dispatch: { data: {state:'acked'}, error:null } });
    expect(await dispatchWebhookText(f)).toBeNull();
    expect(f.send).not.toHaveBeenCalled(); expect(f.beforeSend).not.toHaveBeenCalled();
    expect(f.admin.rpc).toHaveBeenCalledTimes(1);
  });
  it('refuses a concurrent or uncertain owner before provider I/O', async () => {
    const f=fixture({claim_webhook_dispatch:{data:{state:'pending'},error:null}});
    await expect(dispatchWebhookText(f)).rejects.toThrow('dispatch_uncertain');
    expect(f.send).not.toHaveBeenCalled();
  });
  for (const stage of ['send','receipt','ack','authorize','begin']) it(`parks ${stage} failure without retries, fake ACK or lost-lease progress`, async()=>{
    const f=fixture(stage==='ack'?{ack_automation_dispatch:{data:null,error:{}}}:stage==='authorize'?{authorize_automation_dispatch:{data:null,error:{}}}:stage==='begin'?{begin_automation_dispatch:{data:null,error:{}}}:{});
    if(stage==='send') f.send.mockRejectedValue(new Error('synthetic timeout with private body'));
    if(stage==='receipt') f.send.mockResolvedValue('');
    await expect(dispatchWebhookText(f)).rejects.toThrow(/^dispatch_/);
    expect(f.send.mock.calls.length).toBeLessThanOrEqual(1);
    expect(f.admin.rpc).toHaveBeenLastCalledWith('park_webhook_dispatch',{_owner_id:'owner',_lease_token:'lease'});
    if(stage!=='ack') expect(f.admin.rpc.mock.calls.filter(([n])=>n==='ack_automation_dispatch')).toHaveLength(0);
  });
  it('revocation or recipient change during authorization stops actual I/O',async()=>{
    const f=fixture(); f.beforeSend.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('revoked'));
    await expect(dispatchWebhookText(f)).rejects.toThrow('dispatch_uncertain');
    expect(f.send).not.toHaveBeenCalled();
  });
  it('pre-send check failure parks only its own claim and performs no I/O',async()=>{
    const f=fixture();f.beforeSend.mockRejectedValue(new Error('foreign student'));
    await expect(dispatchWebhookText(f)).rejects.toThrow('dispatch_not_completed');
    expect(f.send).not.toHaveBeenCalled();
    expect(f.admin.rpc.mock.calls.map(([n])=>n)).toEqual(['claim_webhook_dispatch','park_webhook_dispatch']);
  });
});

describe('communications safe projection',()=>{
  const row={ id:'case',source:'flow',name:'Fluxo',status:'failed',updated_at:null,revision:0,last_action:null,ack_count:0,unknown_count:1 };
  it('projects only operational evidence, discarding accidental private fields',()=>{
    expect(parseReconciliationRows([{...row,phone:'private',token:'private',content:'private'}])).toEqual([row]);
  });
  it('rejects malformed results instead of showing an empty successful queue',()=>{
    for(const bad of [null,{},[{...row,source:'send_anything'}],[{...row,revision:-1}],[{...row,unknown_count:'1'}]]) expect(()=>parseReconciliationRows(bad)).toThrow();
  });
});
