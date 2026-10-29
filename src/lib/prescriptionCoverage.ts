import type { PrescriptionEnrollment, PrescriptionScheduleCycle } from './prescriptionSchedule';

const DAY = 86400000;
/** Date-only values are calendar days; Date inputs use the caller's local business day. */
export function scheduleDay(value: string | Date | null | undefined): number {
  if (value instanceof Date) return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return NaN;
  const date = value.slice(0, 10);
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === date ? parsed : NaN;
}
export const scheduleDate = (day: number) => new Date(day).toISOString().slice(0, 10);
export interface ScheduleContext {
  enrollment: PrescriptionEnrollment;
  expectedStudentId?: string | null;
  expectedCompanyId?: string | null;
  today?: Date | string;
}
export function enrollmentTerm(enrollment: PrescriptionEnrollment, fallbackPlanDays?: number) {
  const contractStart = scheduleDay(enrollment.start_date ?? enrollment.training_start_date);
  const trainingStart = enrollment.training_start_date ? scheduleDay(enrollment.training_start_date) : contractStart;
  const start = Math.max(contractStart, trainingStart);
  const end = enrollment.end_date != null ? scheduleDay(enrollment.end_date)
    : contractStart + (Math.max(1, fallbackPlanDays ?? 42) - 1) * DAY;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 36600 * DAY) return null;
  return { start, end, contractStart, contract_start_date: scheduleDate(contractStart), start_date: scheduleDate(start), end_date: scheduleDate(end) };
}
export function cycleMatchesContext(cycle: PrescriptionScheduleCycle, context: ScheduleContext) {
  return cycle.enrollment_id === context.enrollment.id
    && (!context.expectedStudentId || cycle.student_id === context.expectedStudentId)
    && (!context.expectedCompanyId || cycle.company_id === context.expectedCompanyId);
}
/** Evidence flags must come from the reader; a missing flag never certifies a cycle as safe to quarantine. */
export function hasPrescriptionHistory(cycle: PrescriptionScheduleCycle): boolean {
  return Boolean(cycle.has_workouts || cycle.has_bundle || cycle.has_history || cycle.has_usable_workouts
    || cycle.prescribed_offline_at || cycle.prescribed_offline_by || cycle.prescribed_offline_note?.trim()
    || cycle.prescription_cleared_at || cycle.bundle_id || cycle.anamnese_id || cycle.notes?.trim() || cycle.objective?.trim()
    || (Array.isArray(cycle.workouts) ? cycle.workouts.length : cycle.workouts)
    || ['sent', 'viewed', 'delivered', 'published'].includes(cycle.delivery_status ?? ''));
}
export function hasCurrentDigitalPrescription(cycle: PrescriptionScheduleCycle): boolean {
  return !cycle.prescription_cleared_at && (cycle.has_usable_workouts ?? cycle.has_workouts) === true;
}
export interface CoverageSlot {
  position: number;
  start_date: string;
  end_date: string;
  cycleIds: string[];
  state: 'missing' | 'scheduled' | 'prepared' | 'delivered' | 'offline' | 'review';
  gaps: Array<{ start_date: string; end_date: string }>;
}
/** Read-only projection. Persisted IDs, dates, cycle numbers and phase are never rewritten. */
export function projectPrescriptionCoverage<T extends PrescriptionScheduleCycle>(args: ScheduleContext & {
  cycles: T[]; planDurationDays?: number; cycleDurationDays?: number; readError?: boolean;
}) {
  const term = enrollmentTerm(args.enrollment, args.planDurationDays);
  const today = scheduleDay(args.today ?? new Date());
  const notStarted = Boolean(term && today < term.start);
  const warnings: string[] = [];
  const owned = args.cycles.filter(cycle => cycleMatchesContext(cycle, args));
  const visible = owned.filter(cycle => cycle.status !== 'superseded' && !cycle.superseded_by_cycle_id);
  const historyCycles = owned.filter(cycle => hasPrescriptionHistory(cycle) && (!term
    || scheduleDay(cycle.start_date) < term.start || scheduleDay(cycle.end_date) > term.end
    || cycle.status === 'superseded' || Boolean(cycle.superseded_by_cycle_id)));
  if (args.readError) warnings.push('coverage_read_failed');
  if (!term) warnings.push('invalid_enrollment_term');
  if (historyCycles.length) warnings.push('history_outside_current_contract');
  const cycles = term ? visible.filter(cycle => scheduleDay(cycle.start_date) <= term.end && scheduleDay(cycle.end_date) >= term.start) : [];
  if (term && args.planDurationDays && Math.ceil((term.end - term.start) / DAY) + 1 !== args.planDurationDays) warnings.push('catalog_term_mismatch');
  const slots: CoverageSlot[] = [];
  const cycleDays = Math.max(1, Math.floor(args.cycleDurationDays ?? 42));
  if (!Number.isFinite(cycleDays) || cycleDays > 36600) throw new Error('Invalid cycle duration');
  if (term) for (let start = term.start; start <= term.end; start += cycleDays * DAY) {
    const end = Math.min(start + (cycleDays - 1) * DAY, term.end);
    const overlapping = cycles.filter(cycle => scheduleDay(cycle.start_date) <= end && scheduleDay(cycle.end_date) >= start);
    const gaps: CoverageSlot['gaps'] = [];
    let cursor = start;
    for (const cycle of [...overlapping].sort((a, b) => scheduleDay(a.start_date) - scheduleDay(b.start_date))) {
      const left = Math.max(start, scheduleDay(cycle.start_date));
      const right = Math.min(end, scheduleDay(cycle.end_date));
      if (left > cursor) gaps.push({ start_date: scheduleDate(cursor), end_date: scheduleDate(left - DAY) });
      cursor = Math.max(cursor, right + DAY);
    }
    if (cursor <= end) gaps.push({ start_date: scheduleDate(cursor), end_date: scheduleDate(end) });
    const overlap = overlapping.some((cycle, index) => overlapping.some((other, at) => at > index
      && scheduleDay(cycle.start_date) <= scheduleDay(other.end_date) && scheduleDay(other.start_date) <= scheduleDay(cycle.end_date)));
    const fullyDigital = gaps.length === 0 && overlapping.length > 0 && overlapping.every(hasCurrentDigitalPrescription);
    const fullyOffline = gaps.length === 0 && overlapping.length > 0 && overlapping.every(cycle => !cycle.prescription_cleared_at && Boolean(cycle.prescribed_offline_at));
    const state: CoverageSlot['state'] = args.readError || overlap ? 'review' : gaps.length ? 'missing' : fullyDigital
      ? (end < today || start > today ? 'prepared' : 'delivered') : fullyOffline ? 'offline'
      : overlapping.some(cycle => cycle.has_bundle) ? 'prepared' : 'scheduled';
    slots.push({ position: slots.length + 1, start_date: scheduleDate(start), end_date: scheduleDate(end), cycleIds: overlapping.map(cycle => cycle.id), state, gaps });
  }
  const currentCycles = term && ['active', 'awaiting_training', 'awaiting_renewal'].includes(args.enrollment.status) && today >= term.start && today <= term.end && !args.readError
    ? cycles.filter(cycle => scheduleDay(cycle.start_date) <= today && scheduleDay(cycle.end_date) >= today) : [];
  const currentSlot = slots.find(slot => scheduleDay(slot.start_date) <= today && scheduleDay(slot.end_date) >= today) ?? null;
  if (slots.some(slot => slot.gaps.length)) warnings.push('schedule_gap');
  if (slots.some(slot => slot.state === 'review')) warnings.push('schedule_overlap_or_review');
  return {
    enrollmentId: args.enrollment.id, term, cycles, historyCycles, slots, currentSlot, notStarted,
    hasCurrentWorkout: currentSlot?.state !== 'review' && currentCycles.some(hasCurrentDigitalPrescription),
    hasCurrentOfflinePrescription: currentCycles.some(cycle => !cycle.prescription_cleared_at && Boolean(cycle.prescribed_offline_at)),
    currentWorkoutCycleIds: currentCycles.filter(hasCurrentDigitalPrescription).map(cycle => cycle.id),
    warnings, reliable: Boolean(term) && !args.readError,
  };
}

/**
 * Adapter for get_prescription_schedule({ _enrollment_id }). The RPC returns only
 * schedule metadata and evidence booleans, never workout contents. Its contract
 * can be echoed unchanged as _expected_contract to reconcile_prescription_schedule.
 * For a repair: restore approved rows first, read this RPC, reconcile with CAS,
 * then read again and assert complete intervals. Do not infer publication from slots.
 */
export function projectPrescriptionScheduleReadback(
  raw: unknown,
  expected: { enrollmentId: string; studentId: string; companyId: string },
) {
  const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const invalid = () => { throw new Error('Invalid or cross-tenant schedule readback'); };
  if (!object(raw) || !object(raw.contract) || !Array.isArray(raw.cycles)) return invalid();
  const c = raw.contract;
  if (c.enrollment_id !== expected.enrollmentId || c.student_id !== expected.studentId || c.company_id !== expected.companyId
    || typeof c.status !== 'string' || typeof c.start_date !== 'string' || typeof c.end_date !== 'string'
    || typeof raw.business_date !== 'string' || !Number.isFinite(scheduleDay(raw.business_date))
    || !Number.isInteger(c.cycle_duration_days) || Number(c.cycle_duration_days)<1 || Number(c.cycle_duration_days)>36600) return invalid();
  const enrollment: PrescriptionEnrollment = { id: expected.enrollmentId, student_id: expected.studentId, company_id: expected.companyId,
    status: c.status, start_date: typeof c.contract_start_date === "string" ? c.contract_start_date : c.start_date, end_date: c.end_date, training_start_date: typeof c.training_start_date === "string" ? c.training_start_date : null };
  if (!enrollmentTerm(enrollment)) return invalid();
  const cycles: PrescriptionScheduleCycle[] = raw.cycles.map(row => {
    if (!object(row) || typeof row.id !== 'string' || row.enrollment_id !== expected.enrollmentId
      || row.student_id !== expected.studentId || row.company_id !== expected.companyId || typeof row.status !== 'string'
      || !Number.isInteger(row.cycle_number) || typeof row.start_date !== 'string' || typeof row.end_date !== 'string'
      || !Number.isFinite(scheduleDay(row.start_date)) || !Number.isFinite(scheduleDay(row.end_date))
      || scheduleDay(row.end_date)<scheduleDay(row.start_date)
      || typeof row.has_usable_workouts !== 'boolean' || typeof row.has_bundle !== 'boolean' || typeof row.has_history !== 'boolean') return invalid();
    return row as unknown as PrescriptionScheduleCycle;
  });
  return projectPrescriptionCoverage({ enrollment, cycles, cycleDurationDays: Number(c.cycle_duration_days),
    expectedStudentId: expected.studentId, expectedCompanyId: expected.companyId, today: raw.business_date });
}
