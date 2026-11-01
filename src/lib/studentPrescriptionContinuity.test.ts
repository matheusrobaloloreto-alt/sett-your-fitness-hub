import { describe, expect, it } from 'vitest';
import { selectStudentDigitalContinuity, type PrescriptionScheduleCycle } from './prescriptionSchedule';
import { projectPrescriptionCoverage } from './prescriptionCoverage';
const enrollment = { id: 'enrollment', student_id: 'student', company_id: 'company', status: 'active', start_date: '2026-01-01', end_date: '2027-02-28' };
const context = { enrollment, expectedStudentId: 'student', expectedCompanyId: 'company', today: new Date(2026, 10, 1, 12) };
const past: PrescriptionScheduleCycle = { id: 'past', enrollment_id: 'enrollment', student_id: 'student', company_id: 'company', cycle_number: 8, start_date: '2026-09-14', end_date: '2026-10-25', status: 'completed', has_workouts: true };
const empty = { ...past, id: 'next', cycle_number: 9, start_date: '2026-10-26', end_date: '2026-12-06', status: 'active', has_workouts: false };
describe('student digital continuity within the preserved contract', () => {
 it('keeps C8 usable while C9 is empty without rewriting coverage or dates', () => {
  const input = structuredClone([past, empty]);
  expect(selectStudentDigitalContinuity(input, context)?.id).toBe('past');
  expect(input).toEqual([past, empty]);
  expect(projectPrescriptionCoverage({ ...context, cycles: [past, empty], cycleDurationDays: 42 }).hasCurrentWorkout).toBe(false);
 });
 it('replaces only when the next materialized stage has started', () => {
  expect(selectStudentDigitalContinuity([past, { ...empty, has_workouts: true }], context)?.id).toBe('next');
  expect(selectStudentDigitalContinuity([past, { ...empty, has_workouts: true, start_date: '2026-11-02' }], context)?.id).toBe('past');
 });
 it('does not treat offline flags, ACK or an empty marker as digital publication', () => {
  expect(selectStudentDigitalContinuity([past, { ...empty, prescribed_offline_at: 'now', delivery_status: 'viewed' }], context)?.id).toBe('past');
  expect(selectStudentDigitalContinuity([{ ...empty, has_bundle: true }], context)).toBeNull();
 });
 it.each(['inactive', 'cancelled', 'expired'])('never grants continuity for %s enrollment', status => {
  expect(selectStudentDigitalContinuity([past], { ...context, enrollment: { ...enrollment, status } })).toBeNull();
 });
 it('does not authorize an expired or not-started contract', () => {
  expect(selectStudentDigitalContinuity([past], { ...context, enrollment: { ...enrollment, end_date: '2026-10-31' } })).toBeNull();
  expect(selectStudentDigitalContinuity([past], { ...context, enrollment: { ...enrollment, start_date: '2026-11-02' } })).toBeNull();
 });
 it.each([{ student_id: 'foreign' }, { company_id: 'foreign' }, { enrollment_id: 'foreign' }, { status: 'cancelled' }, { status: 'superseded' }, { superseded_by_cycle_id: 'other' }, { superseded_at: 'now' }, { prescription_cleared_at: 'now' }])('excludes invalid source %j', patch => {
  expect(selectStudentDigitalContinuity([{ ...past, ...patch }], context)).toBeNull();
 });
 it('blocks previous prescriptions behind a started clear tombstone, but not a future one', () => {
  expect(selectStudentDigitalContinuity([past, { ...empty, prescription_cleared_at: 'now' }], context)).toBeNull();
  expect(selectStudentDigitalContinuity([past, { ...empty, prescription_cleared_at: 'now', start_date: '2026-11-02' }], context)?.id).toBe('past');
 });
 it('a later published stage can replace an earlier clear without reviving it', () => {
  expect(selectStudentDigitalContinuity([{ ...past, prescription_cleared_at: 'now' }, { ...empty, has_workouts: true }], context)?.id).toBe('next');
 });
 it('ranks stages by start date rather than imported cycle number or active status', () => {
  expect(selectStudentDigitalContinuity([{ ...past, cycle_number: 99, status: 'active' }, { ...empty, has_workouts: true }], context)?.id).toBe('next');
 });
 it('fails closed on ambiguous same-stage materialization and wrong enrollment scope', () => {
  expect(selectStudentDigitalContinuity([past, { ...past, id: 'duplicate' }], context)).toBeNull();
  expect(selectStudentDigitalContinuity([past], { ...context, enrollment: { ...enrollment, company_id: 'foreign' } })).toBeNull();
 });
});
