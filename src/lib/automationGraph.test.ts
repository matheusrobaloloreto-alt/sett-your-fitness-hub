import { expect, it, vi } from 'vitest';
import { saveAutomationGraph, requireDeletedAutomationFlow, isAutomationGraphConflict } from './automationGraph';

it.each(['PT409', '40001'])('classifies %s as conflict without retrying or claiming a revision', async code => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: { code } });
  expect(isAutomationGraphConflict({ code })).toBe(true);
  expect(isAutomationGraphConflict({ code: '42501' })).toBe(false);
  expect(isAutomationGraphConflict(null)).toBe(false);
  await expect(saveAutomationGraph({ rpc }, 'company', 'flow', 4, [], [])).rejects.toMatchObject({
    code, message: 'Outra pessoa alterou este fluxo. Recarregue antes de salvar novamente.',
  });
  expect(rpc).toHaveBeenCalledOnce();
});

it('never acknowledges failed or zero-row deletion', () => {
  expect(() => requireDeletedAutomationFlow({ data: null, error: { code: '42501' } }, 'flow')).toThrow();
  expect(() => requireDeletedAutomationFlow({ data: [], error: null }, 'flow')).toThrow();
  expect(() => requireDeletedAutomationFlow({ data: [{ id: 'other' }], error: null }, 'flow')).toThrow();
  expect(() => requireDeletedAutomationFlow({ data: [{ id: 'flow' }], error: null }, 'flow')).not.toThrow();
});

it('uses one OCC RPC and propagates partial-write failures without fallback DML', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '23514', message: 'synthetic edge failure' } });
  await expect(saveAutomationGraph({ rpc }, 'company', 'flow', 4, [], [])).rejects.toMatchObject({ code: '23514' });
  expect(rpc).toHaveBeenCalledOnce();
  expect(rpc).toHaveBeenCalledWith('save_company_automation_graph', { _company_id: 'company', _flow_id: 'flow', _expected_revision: 4, _nodes: [], _edges: [] });
});
it('requires an actual incremented server revision and exposes stale revisions', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { revision: 5 }, error: null });
  expect(await saveAutomationGraph({ rpc }, 'company', 'flow', 4, [], [])).toBe(5);
  rpc.mockResolvedValue({ data: { revision: 4 }, error: null });
  await expect(saveAutomationGraph({ rpc }, 'company', 'flow', 4, [], [])).rejects.toThrow();
  rpc.mockResolvedValue({ data: null, error: { code: '40001' } });
  await expect(saveAutomationGraph({ rpc }, 'company', 'flow', 4, [], [])).rejects.toMatchObject({ code: '40001' });
});
