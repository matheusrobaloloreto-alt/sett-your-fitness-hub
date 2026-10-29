import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { selectStudioEnrollment, projectStudioSchedule } from './PrescriptionStudio';
import { longitudinalPhase, type PrescriptionScheduleCycle } from '@/lib/prescriptionSchedule';
const enrollment = { id: 'current', student_id: 'synthetic-student', company_id: 'synthetic-company', status: 'awaiting_training', start_date: '2026-10-01', end_date: '2027-04-25', plans: { duration_days: 42, cycle_duration_days: 42 } };
const cycle = (patch: Partial<PrescriptionScheduleCycle> = {}): PrescriptionScheduleCycle => ({ id: 'slot', enrollment_id: 'current', student_id: 'synthetic-student', company_id: 'synthetic-company', cycle_number: 31, start_date: '2026-10-01', end_date: '2026-11-11', status: 'pending', ...patch });
describe('Studio real enrollment and schedule integration', () => {
 it('selects by actual dates and tenant instead of stale active status or most recent foreign row', () => {
  const selected = selectStudioEnrollment([
   { ...enrollment, id: 'old', status: 'active', end_date: '2026-09-30' },
   { ...enrollment, id: 'foreign', status: 'active', company_id: 'foreign' },
   { ...enrollment, id: 'future', status: 'active', start_date: '2027-05-01', end_date: '2027-12-31' }, enrollment,
  ], 'synthetic-student', 'synthetic-company', '2026-10-29');
  expect(selected?.id).toBe('current');
 });
 it('preserves pending slots to the real contract end without synthesizing workouts or renumbering', () => {
  const rows = [cycle(), cycle({ id: 'last', cycle_number: 45, start_date: '2027-04-01', end_date: '2027-04-25' })];
  const before = JSON.stringify(rows);
  const result = projectStudioSchedule(enrollment, rows, 'synthetic-student', 'synthetic-company', '2026-10-29');
  expect(result.cycles.map(item => item.cycle_number)).toEqual([31, 45]);
  expect(result.hasCurrentWorkout).toBe(false);
  expect(result.slots.at(-1)?.end_date).toBe('2027-04-25');
  expect(result.currentSlot?.state).toBe('scheduled');
  expect(JSON.stringify(rows)).toBe(before);
 });
 it('retains superseded offline history and overlapping versions and their explicit phases', () => {
  const history = cycle({ id: 'history', start_date: '2025-01-01', end_date: '2025-02-11', status: 'superseded', prescribed_offline_at: '2025-01-01T10:00:00Z' });
  const original = cycle({ sequence_phase: 'consolidacao', sequence_number: 4 });
  const alternate = cycle({ id: 'alternate', cycle_number: 99, start_date: '2026-10-02', has_workouts: true });
  const result = projectStudioSchedule(enrollment, [history, original, alternate], 'synthetic-student', 'synthetic-company', '2026-10-29');
  expect(result.historyCycles.map(item => item.id)).toEqual(['history']);
  expect(result.cycles.map(item => item.id)).toEqual(['slot', 'alternate']);
  expect(result.currentSlot?.state).toBe('review');
  expect(longitudinalPhase(original.cycle_number, original)).toBe('consolidacao');
 });
 it('fails closed on missing scope or invalid enrollment dates', () => {
  expect(() => selectStudioEnrollment([enrollment], 'synthetic-student', '')).toThrow();
  expect(() => projectStudioSchedule(enrollment, [], 'foreign', 'synthetic-company')).toThrow(/escopo/);
  expect(() => projectStudioSchedule({ ...enrollment, end_date: '2025-01-01' }, [], 'synthetic-student', 'synthetic-company')).toThrow(/inválida/);
 });
});
