import { describe, expect, it } from 'vitest';
import { selectDashboardPrescriptionEnrollments as select } from './dashboardPrescriptionEnrollments';

const base = { id: 'current', company_id: 'bn', student_id: 'vivian', status: 'active', start_date: '2026-05-21', training_start_date: '2026-05-25', created_at: '2026-05-21' };
const old = { ...base, id: 'old', status: 'awaiting_renewal', start_date: '2026-02-10', training_start_date: '2026-04-06' };
describe('prescription queue enrollment authority', () => {
  it('reproduces Vivian three operational records and retains the current one', () => {
    expect(select([old, { ...old, id: 'old-2', start_date: '2026-04-06' }, base], '2026-11-11')).toEqual([base]);
  });
  it('retains Themis current awaiting-training contract over historical renewal', () => {
    const current = { ...base, student_id: 'themis', status: 'awaiting_training', start_date: '2026-07-14' };
    expect(select([{ ...old, student_id: 'themis' }, current], '2026-11-11')).toEqual([current]);
  });
  it('does not let a future renewal hide the current prescription', () => {
    expect(select([base, { ...base, id: 'future', start_date: '2026-12-01' }], '2026-11-11')).toEqual([base]);
  });
  it('keeps overdue contracts and ordinary single-enrollment students', () => {
    expect(select([base], '2027-01-01')).toEqual([base]);
  });
  it('never merges students by name or across tenants', () => {
    expect(select([base, { ...base, id: 'other', student_id: 'other' }, { ...base, id: 'tenant', company_id: 'other' }], '2026-11-11')).toHaveLength(3);
  });
  it('ignores closed contracts, even if newer', () => {
    for (const status of ['cancelled', 'inactive', 'completed']) {
      expect(select([base, { ...base, id: status, status, start_date: '2026-10-01' }], '2026-11-11')).toEqual([base]);
    }
  });
  it('selects a new started contract even before its training date is chosen', () => {
    const next = { ...base, id: 'new', start_date: '2026-11-01', training_start_date: null, status: 'awaiting_training' };
    expect(select([old, next], '2026-11-11')).toEqual([next]);
  });
  it('is stable across read order and does not mutate input', () => {
    const input = [old, base]; const before = structuredClone(input);
    expect(select(input, '2026-11-11')).toEqual(select([...input].reverse(), '2026-11-11'));
    expect(input).toEqual(before);
  });
  it('supports legacy contracts with only a training start date', () => {
    expect(select([{ ...base, start_date: null }], '2026-11-11')).toHaveLength(1);
  });
});
