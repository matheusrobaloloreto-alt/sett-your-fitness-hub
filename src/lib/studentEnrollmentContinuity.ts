import { selectPrescriptionEnrollment, type PrescriptionEnrollment } from './prescriptionSchedule';
import { enrollmentTerm, scheduleDay } from './prescriptionCoverage';

/** Student execution only; staff/commercial eligibility and expiry policy stay unchanged.
 * Historical completed duplicates are not revocations. Newer/same-start cancellations,
 * competing operational contracts and records whose ordering is unknown remain barriers.
 */
export function selectStudentPrescriptionEnrollment<T extends PrescriptionEnrollment>(
  rows: T[],
  scope: { today: string | Date; expectedStudentId: string; expectedCompanyId: string },
): T | null {
  const today = scheduleDay(scope.today);
  if (!scope.expectedStudentId || !scope.expectedCompanyId || !Number.isFinite(today)) return null;
  const owned = rows.filter(row => row.student_id === scope.expectedStudentId && row.company_id === scope.expectedCompanyId);
  const operational = (row: T) => ['active', 'awaiting_training', 'awaiting_renewal'].includes(row.status);
  const started = owned.filter(row => operational(row) && enrollmentTerm(row) && enrollmentTerm(row)!.contractStart <= today)
    .sort((a, b) => enrollmentTerm(b)!.contractStart - enrollmentTerm(a)!.contractStart);
  const latest = started[0];
  if (!latest) return null;
  const term = enrollmentTerm(latest)!;
  for (const row of owned) {
    if (row === latest) continue;
    const start = scheduleDay(row.start_date ?? row.training_start_date);
    // An explicitly future contract cannot yet supersede today's prescription.
    if (Number.isFinite(start) && start > today) continue;
    const otherTerm = enrollmentTerm(row);
    if (!otherTerm) {
      // Do not discard malformed blockers. Only dates proving the entire record
      // predates this contract can establish historical irrelevance (never created_at alone).
      const end = scheduleDay(row.end_date);
      const trainingStart = row.training_start_date == null ? start : scheduleDay(row.training_start_date);
      if (Number.isFinite(start) && Number.isFinite(end) && Number.isFinite(trainingStart)
        && start <= end && Math.max(start, end, trainingStart) < term.contractStart) continue;
      return null;
    }
    if (otherTerm.contractStart < term.contractStart) continue;
    // A completed, contained duplicate beside one operational contract is retained
    // history. Explicit inactive/cancelled states are never accepted by this exception.
    if (row.status === 'completed' && otherTerm.contractStart === term.contractStart && otherTerm.end <= term.end) continue;
    return null;
  }
  if (today < term.start) return null;
  const current = selectPrescriptionEnrollment([latest], scope);
  return current ?? (term.end < today ? latest : null);
}
