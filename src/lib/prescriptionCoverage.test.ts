import { describe, expect, it } from 'vitest';
import { projectPrescriptionCoverage, scheduleDay, enrollmentTerm } from './prescriptionCoverage';
import { selectPrescriptionTargets, type PrescriptionScheduleCycle } from './prescriptionSchedule';
const enrollment = { id: 'enrollment-synthetic', company_id: 'company-synthetic', student_id: 'student-synthetic', status: 'active', start_date: '2026-01-01', end_date: '2026-12-31' };
const context = { enrollment, expectedCompanyId: enrollment.company_id, expectedStudentId: enrollment.student_id, today: new Date(2026, 0, 20) };
const cycle = (patch: Partial<PrescriptionScheduleCycle> = {}): PrescriptionScheduleCycle => ({ id: 'cycle-synthetic', enrollment_id: enrollment.id, company_id: enrollment.company_id, student_id: enrollment.student_id, cycle_number: 18, start_date: '2026-01-01', end_date: '2026-02-11', status: 'active', ...patch });
describe('shared prescription coverage projection', () => {
 it('distinguishes a current empty slot and a bundle from a delivered workout', () => {
  for (const item of [cycle(), cycle({ has_bundle: true }), cycle({ has_workouts: true, has_usable_workouts: false })]) {
   const result = projectPrescriptionCoverage({ ...context, cycles: [item], planDurationDays: 168 });
   expect(result.hasCurrentWorkout).toBe(false);
   expect(result.slots).toHaveLength(9);
   expect(result.slots.at(-1)?.end_date).toBe('2026-12-31');
   expect(result.warnings).toContain('schedule_gap');
   expect(result.warnings).toContain('catalog_term_mismatch');
  }
 });
 it('requires materialized, current, uncleared and correctly owned content', () => {
  expect(projectPrescriptionCoverage({ ...context, cycles: [cycle({ has_usable_workouts: true })] }).hasCurrentWorkout).toBe(true);
  for (const patch of [{ start_date: '2026-02-12', end_date: '2026-03-25' }, { end_date: '2026-01-19' }, { prescription_cleared_at: '2026-01-20T10:00:00Z' }, { company_id: 'foreign' }, { student_id: 'foreign' }, { enrollment_id: 'foreign' }, { status: 'superseded' }]) {
   expect(projectPrescriptionCoverage({ ...context, cycles: [cycle({ has_usable_workouts: true, ...patch })] }).hasCurrentWorkout).toBe(false);
  }
 });
 it('retains superseded offline history without using it as current agenda or digital delivery', () => {
  const offline = cycle({ prescribed_offline_at: '2025-01-01T10:00:00Z', start_date: '2025-01-01', end_date: '2025-02-11', status: 'superseded' });
  const result = projectPrescriptionCoverage({ ...context, cycles: [offline, cycle()] });
  expect(result.historyCycles).toEqual([offline]);
  expect(result.cycles).toHaveLength(1);
  expect(result.hasCurrentWorkout).toBe(false);
 });
 it('shows current offline prescription separately and never autogenerates over it', () => {
  const offline = cycle({ prescribed_offline_at: '2026-01-01T10:00:00Z' });
  const result = projectPrescriptionCoverage({ ...context, cycles: [offline] });
  expect(result.hasCurrentOfflinePrescription).toBe(true);
  expect(result.hasCurrentWorkout).toBe(false);
  expect(result.currentSlot?.state).toBe('offline');
  expect(selectPrescriptionTargets({ cycles: [offline], mode: 'remaining', today: context.today })).toEqual([]);
 });
 it('classifies overlap as review without manufacturing a green delivery', () => {
  const result = projectPrescriptionCoverage({ ...context, cycles: [cycle({ has_usable_workouts: true }), cycle({ id: 'duplicate', cycle_number: 19, start_date: '2026-01-02' })] });
  expect(result.currentSlot?.state).toBe('review');
  expect(result.hasCurrentWorkout).toBe(false);
 });
 it('keeps missing reads explicit and never treats an empty result as confirmed coverage', () => {
  const result = projectPrescriptionCoverage({ ...context, cycles: [], readError: true });
  expect(result.reliable).toBe(false);
  expect(result.warnings).toContain('coverage_read_failed');
  expect(result.hasCurrentWorkout).toBe(false);
 });
 it('uses inclusive civil dates, rejects impossible dates and honors enrollment expiry', () => {
  expect(Number.isNaN(scheduleDay('2026-02-30'))).toBe(true);
  expect(enrollmentTerm({ ...enrollment, end_date: '2025-12-31' })).toBeNull();
  const end = cycle({ start_date: '2026-12-01', end_date: '2026-12-31', has_usable_workouts: true });
  expect(projectPrescriptionCoverage({ ...context, cycles: [end], today: new Date(2026, 11, 31) }).hasCurrentWorkout).toBe(true);
  expect(projectPrescriptionCoverage({ ...context, cycles: [end], today: new Date(2027, 0, 1) }).hasCurrentWorkout).toBe(false);
 });
});

import { projectPrescriptionScheduleReadback } from './prescriptionCoverage';
it('validates RPC scope and uses the server business date without mutating the readback', () => {
 const data = { business_date: '2026-01-20', contract: { ...enrollment, enrollment_id: enrollment.id, cycle_duration_days: 42 },
  cycles: [cycle({ has_usable_workouts: true, has_bundle: false, has_history: true })] };
 const before = JSON.stringify(data);
 const expected = { enrollmentId: enrollment.id, studentId: enrollment.student_id, companyId: enrollment.company_id };
 expect(projectPrescriptionScheduleReadback(data, expected).hasCurrentWorkout).toBe(true);
 expect(() => projectPrescriptionScheduleReadback(data, { ...expected, companyId: 'foreign' })).toThrow(/cross-tenant/);
 expect(JSON.stringify(data)).toBe(before);
});
it('keeps a commercially current enrollment not-started until the explicit delayed training date', () => {
 const delayed = { ...enrollment, training_start_date: '2026-03-01' };
 const result = projectPrescriptionCoverage({ ...context, enrollment: delayed, cycles: [cycle({ has_usable_workouts: true })] });
 expect(result.notStarted).toBe(true);
 expect(result.hasCurrentWorkout).toBe(false);
 expect(result.currentSlot).toBeNull();
 expect(result.term?.start_date).toBe('2026-03-01');
 expect(result.term?.end_date).toBe('2026-12-31');
 expect(result.term?.contract_start_date).toBe('2026-01-01');
});
