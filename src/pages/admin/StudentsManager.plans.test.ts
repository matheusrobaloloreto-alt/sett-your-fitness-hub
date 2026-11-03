import { expect, it } from 'vitest';
import { selectPrescriptionEnrollment } from '@/lib/prescriptionSchedule';
const semester = { id: 'semester', plan_id: 'semester-plan', status: 'active', student_id: 'student', company_id: 'company', start_date: '2026-09-01', end_date: '2027-03-01' };
it.each(['influencer-plan', 'annual-plan'])('keeps chosen %s distinct from current semester contract', chosen => {
 const student = { selected_plan_id: chosen };
 const history = [{ ...semester, id: 'annual', plan_id: 'annual-plan', status: 'completed' }, semester];
 expect(selectPrescriptionEnrollment(history, { today: '2026-11-03', expectedStudentId: 'student', expectedCompanyId: 'company' })?.plan_id).toBe('semester-plan');
 expect(student.selected_plan_id).toBe(chosen);
 expect(history[0].status).toBe('completed');
});
it('does not label absent, future or expired contracts as current', () => {
 for (const rows of [[], [{ ...semester, start_date: '2027-01-01' }], [{ ...semester, end_date: '2026-10-01' }]]) {
  expect(selectPrescriptionEnrollment(rows, { today: '2026-11-03' })).toBeNull();
 }
});
