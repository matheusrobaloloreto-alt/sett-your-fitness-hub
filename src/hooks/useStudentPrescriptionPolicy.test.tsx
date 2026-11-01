import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
import { readStudentPrescriptionPolicy, studentPrescriptionPolicyQueryKey, useStudentPrescriptionPolicy } from './useStudentPrescriptionPolicy';
const scope = { companyId: 'company-a', studentId: 'student-a', userId: 'user-a' };
const response = (behavior: unknown = 'keep_until_replaced', patch = {}) => ({ data: { company_id: 'company-a', expired_workout_behavior: behavior, version: 1, ...patch }, error: null });
let clients: QueryClient[] = [];
function harness() {
 const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
 return { client, wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}
beforeEach(() => { mocks.rpc.mockReset().mockResolvedValue(response()); });
afterEach(() => { cleanup(); clients.forEach(c => c.clear()); clients = []; onlineManager.setOnline(true); });
describe('strict student prescription policy RPC boundary', () => {
 it.each(['keep_until_replaced', 'hide_on_expiry'])('reads server-authorized %s without querying settings tables', async value => {
  mocks.rpc.mockResolvedValue(response(value));
  expect((await readStudentPrescriptionPolicy(scope)).behavior).toBe(value);
  expect(mocks.rpc).toHaveBeenCalledWith('get_company_workout_expiry_policy', { _company_id: scope.companyId });
 });
 it('accepts the authoritative server default for an absent settings row', async () => {
  mocks.rpc.mockResolvedValue(response('keep_until_replaced', { version: 0 }));
  expect((await readStudentPrescriptionPolicy(scope)).behavior).toBe('keep_until_replaced');
 });
 it.each(['42P01', 'PGRST205', 'PGRST202', '42703', '42501', 'network'])('never turns %s into permissive defaults', async code => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code } });
  await expect(readStudentPrescriptionPolicy(scope)).rejects.toThrow();
 });
 it.each([null, [], {}, { company_id: 'company-a', version: 0 }, { company_id: 'company-a', version: 0, expired_workout_behavior: 'unknown' }, { company_id: 'foreign', version: 1, expired_workout_behavior: 'keep_until_replaced' }, { company_id: 'company-a', version: -1, expired_workout_behavior: 'keep_until_replaced' }])('fails closed on invalid RPC result %j', async data => {
  mocks.rpc.mockResolvedValue({ data, error: null }); await expect(readStudentPrescriptionPolicy(scope)).rejects.toThrow();
 });
 it('propagates rejected transport as unavailable', async () => {
  mocks.rpc.mockRejectedValue(new Error('offline')); await expect(readStudentPrescriptionPolicy(scope)).rejects.toThrow();
 });
});
describe('student policy lifecycle', () => {
 it('does not grant while loading and retries after infrastructure failure', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } }); const { wrapper } = harness();
  const view = renderHook(() => useStudentPrescriptionPolicy(scope), { wrapper });
  expect(view.result.current.allowContinuity).toBe(false);
  await waitFor(() => expect(view.result.current.error).toBeTruthy());
  await act(async () => { await view.result.current.retry(); });
  await waitFor(() => expect(view.result.current.allowContinuity).toBe(true));
 });
 it('a settings event revokes keep immediately and applies the next response', async () => {
  const { wrapper } = harness(); const view = renderHook(() => useStudentPrescriptionPolicy(scope), { wrapper });
  await waitFor(() => expect(view.result.current.allowContinuity).toBe(true));
  let finish!: (v: unknown) => void; mocks.rpc.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  act(() => { window.dispatchEvent(new CustomEvent('company-product-settings-changed', { detail: { companyId: 'company-a' } })); });
  expect(view.result.current.allowContinuity).toBe(false);
  await act(async () => { finish(response('hide_on_expiry')); });
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  expect(view.result.current.allowContinuity).toBe(false);
 });
 it('starts a fresh validation when settings change during the initial request', async () => {
  let finishOld!: (v: unknown) => void;
  mocks.rpc.mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; })).mockResolvedValue(response('hide_on_expiry'));
  const { wrapper } = harness(); const view = renderHook(() => useStudentPrescriptionPolicy(scope), { wrapper });
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
  act(() => { window.dispatchEvent(new CustomEvent('company-product-settings-changed', { detail: { companyId: scope.companyId } })); });
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
  await act(async () => { finishOld(response('keep_until_replaced')); });
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  expect(view.result.current.allowContinuity).toBe(false);
 });
 it('never reuses cached keep after a failed refetch', async () => {
  const { wrapper } = harness(); const view = renderHook(() => useStudentPrescriptionPolicy(scope), { wrapper });
  await waitFor(() => expect(view.result.current.allowContinuity).toBe(true));
  mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
  await act(async () => { await view.result.current.retry(); });
  expect(view.result.current.allowContinuity).toBe(false);
 });
 it('does not loosen a cached restrictive policy during validation', async () => {
  const { client, wrapper } = harness();
  client.setQueryData(studentPrescriptionPolicyQueryKey(scope), { ...scope, behavior: 'hide_on_expiry' });
  mocks.rpc.mockReturnValue(new Promise(() => {}));
  const view = renderHook(() => useStudentPrescriptionPolicy(scope), { wrapper });
  expect(view.result.current.allowContinuity).toBe(false);
  expect(view.result.current.loading).toBe(true);
 });
 it('does not grant cached keep while offline validation is paused', () => {
  const { client, wrapper } = harness();
  client.setQueryData(studentPrescriptionPolicyQueryKey(scope), { ...scope, behavior: 'keep_until_replaced' });
  onlineManager.setOnline(false);
  const view = renderHook(() => useStudentPrescriptionPolicy(scope), { wrapper });
  expect(view.result.current.loading).toBe(true);
  expect(view.result.current.allowContinuity).toBe(false);
 });
 it('does not reuse keep on user/company switch or resolve a stale response into the new tenant', async () => {
  let finish!: (v: unknown) => void;
  mocks.rpc.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValue({ data: null, error: { code: '42501' } });
  const { wrapper } = harness();
  const view = renderHook(({ tenant }) => useStudentPrescriptionPolicy(tenant), { wrapper, initialProps: { tenant: scope } });
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
  view.rerender({ tenant: { ...scope, companyId: 'foreign', userId: 'other' } });
  expect(view.result.current.allowContinuity).toBe(false);
  await act(async () => { finish(response()); });
  await waitFor(() => expect(view.result.current.error).toBeTruthy());
  expect(view.result.current.allowContinuity).toBe(false);
 });
 it('accepts invalidation of the existing company policy query prefix', async () => {
  const { client, wrapper } = harness(); const view = renderHook(() => useStudentPrescriptionPolicy(scope), { wrapper });
  await waitFor(() => expect(view.result.current.allowContinuity).toBe(true));
  mocks.rpc.mockResolvedValue(response('hide_on_expiry'));
  await act(async () => { await client.invalidateQueries({ queryKey: ['company-experience-policy', scope.companyId] }); });
  await waitFor(() => expect(view.result.current.allowContinuity).toBe(false));
 });
});
