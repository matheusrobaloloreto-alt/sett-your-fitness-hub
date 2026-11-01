import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { calculateSessionMetrics, type SessionLog } from '@/lib/sessions/metrics';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ policy: {allowContinuity:true,loading:false,error:null as unknown,retry:vi.fn()}, user: { id: 'user-a' }, from: vi.fn(), toast: vi.fn(), start: vi.fn(), abandon: vi.fn(), active: null as null | {id:string;workoutId:string;startedAt:number}, event: vi.fn(), rpc: vi.fn(), finish: vi.fn() }));
vi.mock('@/hooks/useStudentPrescriptionPolicy',()=>({useStudentPrescriptionPolicy:()=>mocks.policy}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user, signOut: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/hooks/useWorkoutSession', () => ({ useWorkoutSession: () => ({ isHydrated: true, activeSession: mocks.active, isActive: !!mocks.active, summary: null, elapsed: 0, formatTime: () => '00:00', startSession: mocks.start, abandonSession: mocks.abandon, finishSession: mocks.finish }) }));
vi.mock('@/lib/benitoProductEvents', () => ({ emitBenitoProductEvent: mocks.event }));
vi.mock('@/components/student/WorkoutTimer', () => ({ WorkoutTimer: ({ onStart, onAbandon, onFinish }: { onStart: () => void; onAbandon: () => void; onFinish: () => void }) => <><button onClick={onStart}>Test iniciar</button><button onClick={onAbandon}>Test abandonar</button><button onClick={onFinish}>Test finalizar</button></> }));
vi.mock('@/components/student/ExerciseCard', () => ({ ExerciseCard: ({exercise}: {exercise:{exercise_name:string}}) => <p>QA exercício: {exercise.exercise_name}</p> }));
vi.mock('@/hooks/useWakeLock', () => ({ useWakeLock: () => {} }));
vi.mock('@/hooks/usePublishedInstrument', () => ({ usePublishedInstrumentState: () => ({ loaded: true }) }));
vi.mock('@/components/student/RestTimer', () => ({ useRestTimer: () => ({ activeRest: null, startRest: vi.fn(), clearRest: vi.fn() }) }));
vi.mock('@/lib/appPerformanceTelemetry', () => ({ recordAppPerformanceSample: vi.fn() }));
vi.mock('@/components/AthleticClubStar', () => ({ AthleticClubProvider: ({ children }: PropsWithChildren) => <>{children}</>, AthleticClubStar: () => null }));
vi.mock('@/components/EditorialPageHeader', () => ({ EditorialPageHeader: ({ context }: { context: React.ReactNode }) => <header>{context}</header> }));
vi.mock('@/components/PersonalThemeToggle', () => ({ PersonalThemeIconToggle: () => null }));
vi.mock('@/components/student/AnnouncementsBell', () => ({ AnnouncementsBell: () => null }));
vi.mock('@/components/student/PushBanner', () => ({ PushBanner: () => null }));
vi.mock('@/components/PlatformAdSlot', () => ({ PlatformAdSlot: () => null }));
vi.mock('@/components/student/CheckinCard', () => ({ CheckinCard: () => null }));
vi.mock('@/components/student/WeeklyGoalEditor', () => ({ WeeklyGoalEditor: () => null }));
vi.mock('@/components/student/MonthlyLeaderboard', () => ({ MonthlyLeaderboard: () => null }));
vi.mock('@/components/student/CycleFeedbackBanner', () => ({ CycleFeedbackBanner: () => null }));
vi.mock('@/components/student/StudentHome', () => ({ StudentHome: ({ selectedCycle, onNavigate }: { selectedCycle?: { workouts: { title: string }[] }; onNavigate: (view: string) => void }) => <div><p>Portal carregado</p><button onClick={() => onNavigate("treino")}>Abrir treino</button>{selectedCycle?.workouts.map(w => <p key={w.title}>{w.title}</p>)}</div> }));
import StudentPortal from '@/pages/student/StudentPortal';
import { projectPrescriptionCoverage } from '@/lib/prescriptionCoverage';
import { resolveActiveWorkoutInCycles } from '@/lib/weeklyStrengthPeriodization';

let overrides: Record<string, unknown> = {};
let failureTable: string | null;
let rejectRead: boolean;
let student: object | null;
let slowStudent: Promise<object> | null;
let withPrescription: boolean;
let longContract: boolean;
let pendingSlot: boolean;
let pendingOnly: boolean;
let expiredEnrollment: boolean;
let offlinePrescription: boolean;
let overlappingPrescription: boolean;
let sessionLogs: Array<SessionLog & { id: string; session_date: string }> = [];
beforeEach(() => {
  overrides = {}; mocks.policy={allowContinuity:true,loading:false,error:null,retry:vi.fn()}; mocks.active = null; mocks.user = { id: 'user-a' }; mocks.toast.mockReset(); mocks.start.mockReset(); mocks.abandon.mockReset(); mocks.event.mockReset(); mocks.rpc.mockReset(); mocks.finish.mockReset(); sessionLogs = [];
  expiredEnrollment = false; offlinePrescription = false;
  failureTable = null; rejectRead = false; slowStudent = null; withPrescription = false; longContract = false; pendingSlot = false; pendingOnly = false; overlappingPrescription = false;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-01T15:00:00Z'));
  student = { id: 'student-a', full_name: 'Fixture A', company_id: 'company-a', status: 'active' };
  mocks.from.mockImplementation((table: string) => {
    let single = false;
    const query = {
      select: () => query, eq: () => query, or: () => query, is: () => query, lte: () => query, in: () => query, order: () => query, limit: () => query, range: () => query,
      maybeSingle: () => { single = true; return query; },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        if (table === 'students' && slowStudent) return slowStudent.then(resolve, reject);
        if (failureTable === table) {
          const error = { code: '42501', message: 'fixture denied' };
          return (rejectRead ? Promise.reject(new TypeError('fixture offline')) : Promise.resolve({ data: null, error })).then(resolve, reject);
        }
        const prescriptionRows: Record<string, unknown> = {
          enrollments: [{ id: 'enrollment-a', student_id: 'student-a', company_id: 'company-a', plan_id: 'plan-a', status: 'active', start_date: '2026-10-01', end_date: '2027-01-01' }],
          plans: { name: 'Fixture plan', duration_days: 92, cycle_duration_days: 42 },
          training_cycles: [{ id: 'cycle-a', enrollment_id: 'enrollment-a', student_id: 'student-a', company_id: 'company-a', cycle_number: 1, start_date: '2026-10-01', end_date: '2026-11-11', status: 'active', duration_weeks: 6, delivery_status: 'viewed' }],
          workouts: [{ company_id: 'company-a', id: 'workout-a', title: 'Prescrição existente', cycle_id: 'cycle-a', exercises: [{ exercise_id: 'exercise-a', exercise_name: 'Fixture exercise', sets: '3', reps: '10', rest: '60' }] }],
          exercise_library: [],
          workout_logs: sessionLogs,
        };
        if (expiredEnrollment) prescriptionRows.enrollments = [{ ...(prescriptionRows.enrollments as object[])[0], status: 'awaiting_renewal', end_date: '2026-09-13' }];
        if (offlinePrescription) {
          prescriptionRows.training_cycles = [{ ...(prescriptionRows.training_cycles as object[])[0], prescribed_offline_at: '2026-10-01T12:00:00Z' }];
          prescriptionRows.workouts = [];
        }
        if (overlappingPrescription) {
          prescriptionRows.training_cycles = [...(prescriptionRows.training_cycles as object[]), { ...(prescriptionRows.training_cycles as object[])[0], id: 'cycle-overlap' }];
          prescriptionRows.workouts = [...(prescriptionRows.workouts as object[]), { ...(prescriptionRows.workouts as object[])[0], id: 'workout-overlap', cycle_id: 'cycle-overlap' }];
        }
        if (pendingSlot) {
          prescriptionRows.training_cycles = [
            { id: 'cycle-old', enrollment_id: 'enrollment-a', student_id: 'student-a', company_id: 'company-a', cycle_number: 12, start_date: '2026-09-01', end_date: '2026-10-08', status: 'completed', duration_weeks: 6, delivery_status: 'viewed' },
            { id: 'cycle-pending', enrollment_id: 'enrollment-a', student_id: 'student-a', company_id: 'company-a', cycle_number: 13, start_date: '2026-10-09', end_date: '2026-11-19', status: 'active', duration_weeks: 6, delivery_status: 'pending' },
          ];
          prescriptionRows.workouts = [{ id: 'workout-old', title: 'Treino anterior', cycle_id: 'cycle-old', exercises: [{ exercise_id: 'exercise-a', exercise_name: 'Fixture exercise', sets: '3', reps: '10' }] }];
          prescriptionRows.workout_sessions = [{ id: 'history-session', workout_id: 'workout-old', session_date: '2026-10-08', status: 'completed', duration_seconds: 300, total_volume: 100, total_sets_completed: 3 }];
        }
        if (pendingOnly) {
          prescriptionRows.training_cycles = (prescriptionRows.training_cycles as { id: string }[]).filter(c => c.id === 'cycle-pending');
          prescriptionRows.workouts = [];
          prescriptionRows.workout_sessions = [];
        }
        if (longContract) {
          prescriptionRows.enrollments = [{ id: 'enrollment-a', student_id: 'student-a', company_id: 'company-a', plan_id: 'plan-a', status: 'active', start_date: '2026-01-01', end_date: '2027-01-01' }];
          prescriptionRows.plans = { name: 'Fixture plan', duration_days: 42, cycle_duration_days: 42 };
          prescriptionRows.training_cycles = [{ id: 'cycle-old', enrollment_id: 'enrollment-a', student_id: 'student-a', company_id: 'company-a', cycle_number: 1, start_date: '2026-01-01', end_date: '2026-02-11', status: 'active' }, ...(prescriptionRows.training_cycles as object[])];
        }
        Object.assign(prescriptionRows, overrides);
        return Promise.resolve({ data: table === 'students' ? student : withPrescription && table in prescriptionRows ? prescriptionRows[table] : single ? null : [], error: null }).then(resolve, reject);
      },
    }; return query;
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });


const oldCycle = { id:'cycle-old',enrollment_id:'enrollment-a',student_id:'student-a',company_id:'company-a',cycle_number:5,start_date:'2026-09-21',end_date:'2026-10-31',status:'active',duration_weeks:6,delivery_status:'viewed' };
const oldWorkout = { id:'workout-old',company_id:'company-a',cycle_id:'cycle-old',title:'QA antigo publicado',exercises:[{exercise_id:'exercise-a',exercise_name:'Antigo exercício',sets:'3',reps:'10',rest:'60'}] };
const nextCycle = { ...oldCycle,id:'cycle-next',cycle_number:6,start_date:'2026-11-01',end_date:'2026-12-12',status:'active',delivery_status:'pending' };
const nextWorkout = { ...oldWorkout,id:'workout-next',cycle_id:'cycle-next',title:'QA novo publicado',exercises:[{exercise_id:'exercise-b',exercise_name:'Novo exercício',sets:'3',reps:'8',rest:'60'}] };
function fixture(cycles:object[]=[oldCycle],workouts:object[]=[oldWorkout]) {
 withPrescription=true;
 overrides={enrollments:[{id:'enrollment-a',student_id:'student-a',company_id:'company-a',status:'awaiting_renewal',start_date:'2026-03-30',end_date:'2027-01-01'}],training_cycles:cycles,workouts};
}

describe('QA semantic freeze probe: coverage and active-session completion', () => {
 it('hides a default expired selection even when coverage was valid before the date changed', async () => {
  fixture([{ ...oldCycle, end_date: '2026-11-10' }]);
  mocks.policy.allowContinuity = false;
  const view = render(<StudentPortal />);
  expect(await screen.findByText(oldWorkout.title)).toBeInTheDocument();
  vi.setSystemTime(new Date('2026-11-11T15:00:00Z'));
  view.rerender(<StudentPortal />);
  expect(screen.queryByText(oldWorkout.title)).toBeNull();
  expect(mocks.start).not.toHaveBeenCalled();
 });
 it.each([true, false])('respects keep=%s with true current coverage and a newer expired materialized stage', async keep => {
  const current = { ...oldCycle, id: 'current-long', cycle_number: 1, start_date: '2026-10-01', end_date: '2026-11-10' };
  const expired = { ...oldCycle, id: 'latest-expired', cycle_number: 2, status: 'completed', start_date: '2026-10-15', end_date: '2026-10-25' };
  const currentWorkout = { ...oldWorkout, id: 'current-workout', cycle_id: current.id, title: 'QA período longo' };
  const latestWorkout = { ...oldWorkout, id: 'latest-workout', cycle_id: expired.id, title: 'QA etapa mais recente vencida' };
  const enrollment = { id: 'enrollment-a', student_id: 'student-a', company_id: 'company-a', status: 'active', start_date: '2026-03-30', end_date: '2027-01-01' };
  expect(projectPrescriptionCoverage({ enrollment, cycles: [current, expired].map(c => ({ ...c, has_usable_workouts: true })), expectedStudentId: 'student-a', expectedCompanyId: 'company-a', today: '2026-11-01', planDurationDays: 92, cycleDurationDays: 42 }).hasCurrentWorkout).toBe(true);
  fixture([current, expired], [currentWorkout, latestWorkout]);
  mocks.policy.allowContinuity = keep;
  render(<StudentPortal />);
  await screen.findByText('Portal carregado');
  if (keep) expect(await screen.findByText(latestWorkout.title)).toBeInTheDocument();
  else expect(screen.queryByText(latestWorkout.title)).toBeNull();
  expect(screen.queryByText(currentWorkout.title)).toBeNull();
 });
 it('selects a current materialized C1 over a historical C99 even before delivery ACK', async () => {
  const history = { ...oldCycle, id: 'historical-99', cycle_number: 99, status: 'completed', start_date: '2024-01-01', end_date: '2024-02-11' };
  const current = { ...nextCycle, cycle_number: 1, start_date: '2026-10-01', end_date: '2026-11-11', delivery_status: 'pending' };
  fixture([history, current], [{ ...oldWorkout, cycle_id: history.id }, nextWorkout]);
  render(<StudentPortal />);
  expect(await screen.findByText(nextWorkout.title)).toBeInTheDocument();
  expect(screen.queryByText(oldWorkout.title)).toBeNull();
 });
 it('preserves a finish action for an already active resolved session under hide-on-expiry', async () => {
  fixture();
  mocks.active = { id: 'session-existing', workoutId: oldWorkout.id, startedAt: new Date('2026-10-31T23:00:00Z').getTime() };
  mocks.policy.allowContinuity = false;
  render(<StudentPortal />);
  await screen.findByRole('button', { name: 'Encerrar sessão ativa' });
  // Abandoning is a different operation; an existing session must remain finishable.
  expect(screen.queryByRole('button', { name: 'Finalizar sessão em andamento' })).not.toBeNull();
  expect(screen.queryByRole('button', { name: 'Test iniciar' })).toBeNull();
  expect(mocks.start).not.toHaveBeenCalled();
  expect(mocks.abandon).not.toHaveBeenCalled();
 });
});
