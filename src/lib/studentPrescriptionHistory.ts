import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { orderWorkoutsByPrescription } from './workoutPresence';
type Cycle = Pick<Database['public']['Tables']['training_cycles']['Row'], 'id' | 'enrollment_id' | 'student_id' | 'company_id' | 'cycle_number' | 'start_date' | 'end_date' | 'status' | 'delivery_status'> & Partial<Database['public']['Tables']['training_cycles']['Row']>;
type Workout = Pick<Database['public']['Tables']['workouts']['Row'], 'id' | 'company_id' | 'cycle_id' | 'exercises'> & Partial<Database['public']['Tables']['workouts']['Row']>;
type Enrollment = { id: string; student_id: string; company_id: string; status: string; end_date?: string | null };
export type PrescriptionScope = { studentId: string; companyId: string; today: string };
export type PublishedPrescription = Omit<Cycle, 'workouts'> & { workouts: Workout[]; enrollmentExpired: boolean };
export function selectPublishedPrescriptions(cycles: Cycle[], workouts: Workout[], enrollments: Enrollment[], scope: PrescriptionScope): PublishedPrescription[] {
 const ownEnrollments = new Map(enrollments.filter(e => e.student_id === scope.studentId && e.company_id === scope.companyId && ['active', 'awaiting_training', 'awaiting_renewal', 'expired', 'completed'].includes(e.status)).map(e => [e.id, e]));
 return cycles.flatMap(c => {
  const enrollment = ownEnrollments.get(c.enrollment_id ?? '');
  if (!enrollment || c.student_id !== scope.studentId || c.company_id !== scope.companyId || !c.start_date || c.start_date > scope.today || !['active', 'completed'].includes(c.status ?? '') || c.prescription_cleared_at || c.superseded_at || c.superseded_by_cycle_id) return [];
  const visible = orderWorkoutsByPrescription(workouts.filter(w => w.cycle_id === c.id && w.company_id === scope.companyId && !w.superseded_at && !w.superseded_by_revision_id && !w.student_profile_archive_event_id && Array.isArray(w.exercises) && w.exercises.length > 0));
  return visible.length ? [{ ...c, workouts: visible, enrollmentExpired: Boolean(enrollment.end_date && enrollment.end_date < scope.today) }] : [];
 });
}
const PAGE_SIZE = 20;
/** Uses the signed-in client's RLS, then verifies owner, tenant and enrollment again. No writes/ACK. */
export async function loadPublishedPrescriptions(
 client: SupabaseClient<Database>,
 scope: PrescriptionScope & { userId: string },
 offset = 0,
 isStale = () => false,
 workoutId?: string,
) {
 const read = async <T,>(query: PromiseLike<{ data: T; error: unknown }>) => {
  const result = await query;
  if (isStale()) throw new Error('Obsolete prescription request');
  if (result.error) throw new Error('Prescription history unavailable');
  return result.data;
 };
 const owner = await read(client.from('students').select('id, company_id, status').eq('id', scope.studentId).eq('company_id', scope.companyId).eq('user_id', scope.userId).maybeSingle());
 if (!owner || owner.id !== scope.studentId || owner.company_id !== scope.companyId || ['inactive', 'archived'].includes(owner.status ?? '')) return { prescriptions: [], hasMore: false };
 // For a calendar link, fetch only the exact workout's metadata before validating its cycle and enrollment.
 const link = workoutId ? await read(client.from('workouts').select('id, cycle_id')
  .eq('company_id', scope.companyId).eq('id', workoutId)
  .is('superseded_at', null).is('superseded_by_revision_id', null).is('student_profile_archive_event_id', null).maybeSingle()) : null;
 if (workoutId && (!link?.cycle_id || link.id !== workoutId)) return { prescriptions: [], hasMore: false };
 let cycleQuery = client.from('training_cycles').select('id, enrollment_id, student_id, company_id, cycle_number, start_date, end_date, status, delivery_status, prescription_cleared_at, superseded_at, superseded_by_cycle_id').eq('student_id', scope.studentId).eq('company_id', scope.companyId).lte('start_date', scope.today).in('status', ['active', 'completed']).is('superseded_at', null).is('superseded_by_cycle_id', null).is('prescription_cleared_at', null);
 if (link) cycleQuery = cycleQuery.eq('id', link.cycle_id);
 const cycles = await read(cycleQuery.order('start_date', { ascending: false }).order('id').range(offset, offset + PAGE_SIZE - 1));
 if (!cycles?.length) return { prescriptions: [], hasMore: false };
 const enrollments = await read(client.from('enrollments').select('id, company_id, student_id, status, end_date').eq('student_id', scope.studentId).eq('company_id', scope.companyId).in('id', [...new Set(cycles.map(c => c.enrollment_id).filter((id): id is string => !!id))]));
 // Validate the cycle/enrollment relation before fetching exercise payloads.
 const ownedEnrollmentIds = new Set((enrollments ?? []).filter(e => e.student_id === scope.studentId && e.company_id === scope.companyId && ['active', 'awaiting_training', 'awaiting_renewal', 'expired', 'completed'].includes(e.status)).map(e => e.id));
 const ownedCycles = cycles.filter(c => c.company_id === scope.companyId && c.student_id === scope.studentId && ownedEnrollmentIds.has(c.enrollment_id ?? ''));
 if (!ownedCycles.length) return { prescriptions: [], hasMore: cycles.length === PAGE_SIZE };
 const workouts: Workout[] = [];
 for (let page = 0; ; page++) {
  let workoutQuery = client.from('workouts').select('id, company_id, cycle_id, name, title, description, exercises, sort_order, superseded_at, superseded_by_revision_id, student_profile_archive_event_id').eq('company_id', scope.companyId).in('cycle_id', ownedCycles.map(c => c.id)).is('superseded_at', null).is('superseded_by_revision_id', null).is('student_profile_archive_event_id', null);
  if (workoutId) workoutQuery = workoutQuery.eq('id', workoutId);
  const rows = await read(workoutQuery.order('id').range(page * 100, page * 100 + 99));
  workouts.push(...(rows ?? []));
  if (!rows || rows.length < 100) break;
 }
 return { prescriptions: selectPublishedPrescriptions(cycles, workouts, enrollments ?? [], scope), hasMore: cycles.length === PAGE_SIZE };
}
export const prescriptionHistoryPageSize = PAGE_SIZE;
