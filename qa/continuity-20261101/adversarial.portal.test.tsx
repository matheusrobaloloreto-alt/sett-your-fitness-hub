import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { calculateSessionMetrics, type SessionLog } from '@/lib/sessions/metrics';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ user: { id: 'user-a' }, from: vi.fn(), toast: vi.fn(), start: vi.fn(), abandon: vi.fn(), active: null as null | {id:string;workoutId:string;startedAt:number}, event: vi.fn(), rpc: vi.fn(), finish: vi.fn() }));
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
  overrides = {}; mocks.active = null; mocks.user = { id: 'user-a' }; mocks.toast.mockReset(); mocks.start.mockReset(); mocks.abandon.mockReset(); mocks.event.mockReset(); mocks.rpc.mockReset(); mocks.finish.mockReset(); sessionLogs = [];
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
describe('QA independente: continuidade sem mudar datas comerciais',()=>{
 it('keeps the latest published workout after cycle expiry within an unchanged valid contract',async()=>{
  fixture(); render(<StudentPortal/>);
  expect(await screen.findByText(oldWorkout.title)).toBeInTheDocument();
 });
 it('an empty newer cycle never hides the last published workout',async()=>{
  fixture([oldCycle,nextCycle]);render(<StudentPortal/>);
  expect(await screen.findByText(oldWorkout.title)).toBeInTheDocument();
 });
 it('a materialized future cycle never replaces the effective publication early',async()=>{
  fixture([oldCycle,{...nextCycle,start_date:'2026-11-02'}],[oldWorkout,nextWorkout]);render(<StudentPortal/>);
  expect(await screen.findByText(oldWorkout.title)).toBeInTheDocument();
  expect(screen.queryByText(nextWorkout.title)).toBeNull();
 });
 it('a new effective materialized publication replaces the old default',async()=>{
  fixture([oldCycle,nextCycle],[oldWorkout,nextWorkout]);render(<StudentPortal/>);
  expect(await screen.findByText(nextWorkout.title)).toBeInTheDocument();
  expect(screen.queryByText(oldWorkout.title)).toBeNull();
 });
 it.each([{prescription_cleared_at:'2026-10-30T10:00:00Z'},{status:'superseded'},{superseded_by_cycle_id:'replacement'},{superseded_at:'2026-10-30T10:00:00Z'}])('never revives an invalid source cycle %j',async patch=>{
  fixture([{...oldCycle,...patch}]);render(<StudentPortal/>);
  await screen.findByText('Portal carregado');
  expect(screen.queryByText(oldWorkout.title)).toBeNull();
  expect(mocks.start).not.toHaveBeenCalled();
 });
 it.each(['training_cycles','workouts'])('fails closed on %s read failure',async table=>{
  fixture();failureTable=table;render(<StudentPortal/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar seus dados');
  expect(screen.queryByText(oldWorkout.title)).toBeNull();expect(mocks.start).not.toHaveBeenCalled();
 });
 it('ignores a late old-company identity result after switching user/company',async()=>{
  fixture();let finish!:(value:object)=>void;slowStudent=new Promise(r=>{finish=r});
  const view=render(<StudentPortal/>);await act(async()=>{});
  mocks.user={id:'user-b'};slowStudent=null;student={id:'student-b',company_id:'company-b',full_name:'QA B',status:'active'};
  overrides={enrollments:[],training_cycles:[],workouts:[]};view.rerender(<StudentPortal/>);
  await screen.findByText('Portal carregado');
  await act(async()=>finish({data:{id:'student-a',company_id:'company-a',full_name:'QA A',status:'active'},error:null}));
  expect(screen.queryByText(oldWorkout.title)).toBeNull();expect(screen.queryByText('QA A')).toBeNull();
 });
 it('an active old session remains attached to its exact workout after replacement',()=>{
  const cycles=[{...oldCycle,workouts:[oldWorkout]},{...nextCycle,workouts:[nextWorkout]}];
  const found=resolveActiveWorkoutInCycles(cycles,oldWorkout.id);
  expect(found.kind).toBe('resolved');
  if(found.kind==='resolved'){expect(found.workout.id).toBe(oldWorkout.id);expect(found.cycle.id).toBe(oldCycle.id);}
  const missing=resolveActiveWorkoutInCycles([cycles[1]],oldWorkout.id);
  expect(missing).toEqual({kind:'stale',workoutId:oldWorkout.id});
 });
 it('portal never displays new exercise details as the active old workout',async()=>{
  fixture([oldCycle,nextCycle],[oldWorkout,nextWorkout]);mocks.active={id:'session-old',workoutId:oldWorkout.id,startedAt:Date.now()};
  render(<StudentPortal/>);fireEvent.click(await screen.findByRole('button',{name:'Abrir treino'}));
  await screen.findByText(/QA exercício: Antigo exercício/);
  expect(screen.queryByText(/QA exercício: Novo exercício/)).toBeNull();expect(mocks.start).not.toHaveBeenCalled();
 });
});

describe('QA independente: exclusões de continuidade',()=>{
 it.each([{superseded_at:'2026-10-30T10:00:00Z'},{superseded_by_revision_id:'revision-next'},{student_profile_archive_event_id:'archive'}])('never revives archived workout %j',async patch=>{
  fixture([oldCycle],[{...oldWorkout,...patch}]);render(<StudentPortal/>);
  await screen.findByText('Portal carregado');expect(screen.queryByText(oldWorkout.title)).toBeNull();expect(mocks.start).not.toHaveBeenCalled();
 });
 it.each(['inactive','archived','cancelled'])('does not unlock a %s student',async status=>{
  fixture();student={...(student as object),status};render(<StudentPortal/>);
  await screen.findByText('Portal carregado');expect(screen.queryByText(oldWorkout.title)).toBeNull();expect(mocks.start).not.toHaveBeenCalled();
 });
});

describe('QA independente: review não equivale a continuidade ambígua',()=>{
 it('keeps the last unambiguous publication when coverage is review due to an overlapping empty slot',async()=>{
  fixture([{...oldCycle,end_date:'2026-11-05'},nextCycle],[oldWorkout]);render(<StudentPortal/>);
  expect(await screen.findByText(oldWorkout.title)).toBeInTheDocument();
 });
 it('does not bypass a started clear tombstone through review fallback',async()=>{
  fixture([{...oldCycle,end_date:'2026-11-05'},{...nextCycle,prescription_cleared_at:'2026-11-01T10:00:00Z'}],[oldWorkout]);render(<StudentPortal/>);
  await screen.findByText('Portal carregado');expect(screen.queryByText(oldWorkout.title)).toBeNull();expect(mocks.start).not.toHaveBeenCalled();
 });
 it('does not pick an arbitrary workout from two materialized equal-start candidates in review',async()=>{
  fixture([{...oldCycle,start_date:'2026-10-01',end_date:'2026-11-05'},{...nextCycle,start_date:'2026-10-01',end_date:'2026-11-05'}],[oldWorkout,nextWorkout]);render(<StudentPortal/>);
  await screen.findByText('Portal carregado');expect(screen.queryByText(oldWorkout.title)).toBeNull();expect(screen.queryByText(nextWorkout.title)).toBeNull();expect(mocks.start).not.toHaveBeenCalled();
 });
});

it('QA legacy: keeps a current published workout whose company is inherited from its verified owned cycle',async()=>{
 fixture([{...oldCycle,end_date:'2026-11-10'}],[{...oldWorkout,company_id:null}]);render(<StudentPortal/>);
 expect(await screen.findByText(oldWorkout.title)).toBeInTheDocument();
});
