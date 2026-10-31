import { describe, it, expect } from 'vitest';
import { selectPublishedPrescriptions } from './studentPrescriptionHistory';
const scope = { studentId: 'student', companyId: 'company', today: '2026-10-30' };
const enrollment = { id: 'enrollment', student_id: 'student', company_id: 'company', status: 'awaiting_renewal', end_date: '2026-09-13' };
const cycle = { id: 'cycle', enrollment_id: 'enrollment', student_id: 'student', company_id: 'company', cycle_number: 5, start_date: '2026-09-21', end_date: '2026-11-01', status: 'active', delivery_status: 'viewed' };
const workout = { id: 'workout', company_id: 'company', cycle_id: 'cycle', title: 'Treino A', exercises: [{ exercise_name: 'Agachamento', sets: 3, reps: 10 }] };
const select = (c = cycle, w = workout, e = enrollment) => selectPublishedPrescriptions([c], [w], [e], scope);
describe('published prescription read access is independent from operational coverage', () => {
 it('keeps published digital work after the enrollment expires', () => expect(select()).toHaveLength(1));
 it.each([1, 13])('keeps past cycle %s despite a new empty cycle', cycle_number => {
  expect(selectPublishedPrescriptions([{ ...cycle, cycle_number, end_date: '2026-10-01' }, { ...cycle, id: 'empty', prescribed_offline_at: '2026-10-02' }], [workout], [enrollment], scope)).toHaveLength(1);
 });
 it('retains legacy materialized prescriptions without a delivery ACK', () => expect(select({ ...cycle, delivery_status: null })).toHaveLength(1));
 it('returns no history when there are no workouts', () => expect(selectPublishedPrescriptions([cycle], [], [enrollment], scope)).toEqual([]));
 it('keeps valid current published prescriptions readable', () => expect(select(cycle, workout, { ...enrollment, status: 'active', end_date: '2026-12-01' })).toHaveLength(1));
 it.each([{ status: 'superseded' }, { status: 'quarantined' }, { prescription_cleared_at: 'now' }, { superseded_by_cycle_id: 'other' }, { superseded_at: 'now' }, { start_date: '2026-11-01' }, { company_id: 'foreign' }, { student_id: 'foreign' }, { status: 'draft' }])('excludes invalid cycle %j', patch => expect(select({ ...cycle, ...patch })).toEqual([]));
 it.each([{ student_profile_archive_event_id: 'archive' }, { superseded_at: 'now' }, { superseded_by_revision_id: 'next' }, { company_id: 'foreign' }, { cycle_id: 'foreign' }])('excludes invalid workout %j', patch => expect(select(cycle, { ...workout, ...patch })).toEqual([]));
 it.each([{ company_id: 'foreign' }, { student_id: 'foreign' }, { id: 'foreign' }, { status: 'inactive' }])('excludes invalid enrollment %j', patch => expect(select(cycle, workout, { ...enrollment, ...patch })).toEqual([]));
});

import { loadPublishedPrescriptions } from './studentPrescriptionHistory';
import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
function fakeClient(options: { inactive?: boolean; foreignOwner?: boolean; error?: string; stale?: boolean } = {}) {
 const calls: Array<[string, string, ...unknown[]]> = [];
 const from = vi.fn((table: string) => {
  const rows: Record<string, unknown> = { students: { id: options.foreignOwner ? 'foreign' : scope.studentId, company_id: scope.companyId, status: options.inactive ? 'inactive' : 'active' }, enrollments: [enrollment], training_cycles: [cycle], workouts: [workout] };
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'lte', 'in', 'is', 'order', 'range', 'maybeSingle']) query[method] = (...args: unknown[]) => { calls.push([table, method, ...args]); return query; };
  query.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows[table], error: options.error === table ? new Error('denied') : null }).then(resolve);
  return query;
 });
 return { client: { from } as unknown as SupabaseClient<Database>, from, calls };
}
describe('owner/RLS scoped prescription loader', () => {
 it('uses owner and tenant filters, enrollment validation and bounded pages', async () => {
  const { client, calls } = fakeClient();
  const result = await loadPublishedPrescriptions(client, { ...scope, userId: 'user' });
  expect(result.prescriptions).toHaveLength(1);
  expect(calls).toContainEqual(['students', 'eq', 'user_id', 'user']);
  for (const table of ['students', 'training_cycles', 'enrollments', 'workouts']) expect(calls).toContainEqual([table, 'eq', 'company_id', 'company']);
  expect(calls).toContainEqual(['training_cycles', 'eq', 'student_id', 'student']);
  expect(calls).toContainEqual(['enrollments', 'eq', 'student_id', 'student']);
  expect(calls).toContainEqual(['workouts', 'is', 'student_profile_archive_event_id', null]);
  expect(calls).toContainEqual(['training_cycles', 'range', 0, 19]);
  expect(calls.some(c => c[1] === 'select' && c[2] === '*')).toBe(false);
 });
 it.each([{ inactive: true }, { foreignOwner: true }])('stops before history for invalid owner %j', async options => {
  const { client, from } = fakeClient(options);
  expect((await loadPublishedPrescriptions(client, { ...scope, userId: 'user' })).prescriptions).toEqual([]);
  expect(from).toHaveBeenCalledTimes(1);
 });
 it.each(['students', 'training_cycles', 'enrollments', 'workouts'])('fails closed after %s error', async error => {
  await expect(loadPublishedPrescriptions(fakeClient({ error }).client, { ...scope, userId: 'user' })).rejects.toThrow('unavailable');
 });
 it('rejects stale ownership response before reading cycles', async () => {
  const { client, from } = fakeClient();
  await expect(loadPublishedPrescriptions(client, { ...scope, userId: 'user' }, 0, () => true)).rejects.toThrow('Obsolete');
  expect(from).toHaveBeenCalledTimes(1);
 });
});
