import { OPEN_ENROLLMENT_STATUSES } from './studentRoster';

interface QueueEnrollment {
  id: string;
  company_id: string;
  student_id: string;
  status: string;
  start_date?: string | null;
  training_start_date?: string | null;
  created_at?: string | null;
}

/** Select the student's current operational contract, not every historical renewal.
 * Expiry alone does not remove an overdue prescription. Future renewals do not
 * supersede today's contract. This projection never mutates enrollment/history.
 */
export function selectDashboardPrescriptionEnrollments<T extends QueueEnrollment>(rows: T[], today: string): T[] {
  const started = rows.filter(row => {
    const start = row.start_date ?? row.training_start_date;
    return OPEN_ENROLLMENT_STATUSES.includes(row.status) && !!start
      && /^\d{4}-\d{2}-\d{2}$/.test(start) && start <= today;
  }).sort((a, b) => {
    const date = (b.start_date ?? b.training_start_date)!.localeCompare((a.start_date ?? a.training_start_date)!);
    return date || Number(b.status === 'active') - Number(a.status === 'active')
      || (b.created_at ?? '').localeCompare(a.created_at ?? '') || a.id.localeCompare(b.id);
  });
  const current = new Map<string, T>();
  for (const row of started) {
    const key = `${row.company_id}:${row.student_id}`;
    if (!current.has(key)) current.set(key, row);
  }
  return [...current.values()];
}
