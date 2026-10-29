import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { calculateSessionMetrics, type SessionLog } from '@/lib/sessions/metrics';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ user: { id: 'user-a' }, from: vi.fn(), toast: vi.fn(), start: vi.fn(), abandon: vi.fn(), event: vi.fn(), rpc: vi.fn(), finish: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user, signOut: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/hooks/useWorkoutSession', () => ({ useWorkoutSession: () => ({ isHydrated: true, activeSession: null, isActive: false, summary: null, startSession: mocks.start, abandonSession: mocks.abandon, finishSession: mocks.finish }) }));
vi.mock('@/lib/benitoProductEvents', () => ({ emitBenitoProductEvent: mocks.event }));
vi.mock('@/components/student/WorkoutTimer', () => ({ WorkoutTimer: ({ onStart, onAbandon, onFinish }: { onStart: () => void; onAbandon: () => void; onFinish: () => void }) => <><button onClick={onStart}>Test iniciar</button><button onClick={onAbandon}>Test abandonar</button><button onClick={onFinish}>Test finalizar</button></> }));
vi.mock('@/components/student/ExerciseCard', () => ({ ExerciseCard: () => null }));
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
import StudentPortal from './StudentPortal';

let failureTable: string | null;
let rejectRead: boolean;
let student: object | null;
let slowStudent: Promise<object> | null;
let withPrescription: boolean;
let longContract: boolean;
let pendingSlot: boolean;
let pendingOnly: boolean;
let overlappingPrescription: boolean;
let sessionLogs: Array<SessionLog & { id: string; session_date: string }> = [];
beforeEach(() => {
  mocks.user = { id: 'user-a' }; mocks.toast.mockReset(); mocks.start.mockReset(); mocks.abandon.mockReset(); mocks.event.mockReset(); mocks.rpc.mockReset(); mocks.finish.mockReset(); sessionLogs = [];
  failureTable = null; rejectRead = false; slowStudent = null; withPrescription = false; longContract = false; pendingSlot = false; pendingOnly = false; overlappingPrescription = false;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-29T15:00:00Z'));
  student = { id: 'student-a', full_name: 'Fixture A', company_id: 'company-a', status: 'active' };
  mocks.from.mockImplementation((table: string) => {
    let single = false;
    const query = {
      select: () => query, eq: () => query, is: () => query, in: () => query, order: () => query, limit: () => query, range: () => query,
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
          workouts: [{ id: 'workout-a', title: 'Prescrição existente', cycle_id: 'cycle-a', exercises: [{ exercise_id: 'exercise-a', exercise_name: 'Fixture exercise', sets: '3', reps: '10', rest: '60' }] }],
          exercise_library: [],
          workout_logs: sessionLogs,
        };
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
        return Promise.resolve({ data: table === 'students' ? student : withPrescription && table in prescriptionRows ? prescriptionRows[table] : single ? null : [], error: null }).then(resolve, reject);
      },
    }; return query;
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('StudentPortal authoritative reads', () => {
  it.each(['students', 'nutrition_plans', 'running_plans', 'student_anamneses', 'enrollments', 'workout_logs', 'workout_sessions', 'workout_feedback', 'student_goals'])('shows unavailable rather than empty after %s RLS error, then retries', async table => {
    failureTable = table;
    render(<StudentPortal />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar seus dados');
    expect(screen.queryByText('Nenhum perfil de aluno vinculado à sua conta.')).not.toBeInTheDocument();
    expect(screen.queryByText('Portal carregado')).not.toBeInTheDocument();
    failureTable = null;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Portal carregado')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it.each(['plans', 'training_cycles', 'workouts', 'exercise_library'])('keeps %s failures distinct from a missing prescription and recovers existing content', async table => {
    withPrescription = true; failureTable = table;
    render(<StudentPortal />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar seus dados');
    expect(screen.queryByText('Portal carregado')).not.toBeInTheDocument();
    failureTable = null;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Prescrição existente')).toBeInTheDocument();
  });
  it('uses the contract window rather than hiding current content behind a historical active cycle and catalog cap', async () => {
    withPrescription = true; longContract = true;
    render(<StudentPortal />);
    expect(await screen.findByText('Prescrição existente')).toBeInTheDocument();
  });
  it('labels a restored empty slot as awaiting prescription and retains history without offering an expired workout', async () => {
    withPrescription = true; pendingSlot = true;
    render(<StudentPortal />);
    expect(await screen.findByText('Aguardando prescrição')).toBeInTheDocument();
    expect(screen.getByText(/ciclo 12, válido até 08\/10\/2026/)).toBeInTheDocument();
    expect(screen.queryByText('Treino anterior')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver histórico de treinos' }));
    expect(await screen.findByRole('heading', { name: 'Histórico' })).toBeInTheDocument();
    expect(screen.getAllByText('Treino anterior').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Test iniciar' })).not.toBeInTheDocument();
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it('uses canonical coverage to avoid advertising overlapping prescriptions as ready', async () => {
    withPrescription = true; overlappingPrescription = true;
    render(<StudentPortal />);
    expect(await screen.findByText('Aguardando prescrição')).toBeInTheDocument();
    expect(screen.queryByText('Prescrição existente')).not.toBeInTheDocument();
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it('does not mark an empty restored slot as viewed', async () => {
    withPrescription = true; pendingSlot = true; pendingOnly = true;
    render(<StudentPortal />);
    await screen.findByText('Aguardando prescrição');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('keeps history accessible even without a selected cycle', async () => {
    render(<StudentPortal />);
    expect(await screen.findByText('Aguardando prescrição')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver histórico de treinos' }));
    expect(await screen.findByRole('heading', { name: 'Histórico' })).toBeInTheDocument();
  });
  it('distinguishes a successful no-profile response', async () => {
    student = null;
    render(<StudentPortal />);
    expect(await screen.findByText('Nenhum perfil de aluno vinculado à sua conta.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('offers retry on rejected transport without exposing exception details', async () => {
    failureTable = 'students'; rejectRead = true;
    render(<StudentPortal />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/fixture offline/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
  it('ignores an old user read after switching to another user with no profile', async () => {
    let resolve!: (value: object) => void;
    slowStudent = new Promise(r => { resolve = r; });
    const view = render(<StudentPortal />);
    await act(async () => {});
    mocks.user = { id: 'user-b' }; slowStudent = null; student = null;
    view.rerender(<StudentPortal />);
    await screen.findByText('Nenhum perfil de aluno vinculado à sua conta.');
    await act(async () => { resolve({ data: { id: 'student-a', full_name: 'Fixture A', company_id: 'company-a', status: 'active' }, error: null }); });
    expect(screen.queryByText('Fixture A')).not.toBeInTheDocument();
    expect(screen.getByText('Nenhum perfil de aluno vinculado à sua conta.')).toBeInTheDocument();
  });
});


describe('StudentPortal session acknowledgements', () => {
  it.each(['start', 'abandon'] as const)('does not celebrate %s failure and celebrates only a confirmed retry', async operation => {
    withPrescription = true;
    mocks[operation].mockResolvedValue({ ok: false, reason: 'unavailable' });
    render(<StudentPortal />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir treino' }));
    const label = operation === 'start' ? 'Test iniciar' : 'Test abandonar';
    const title = operation === 'start' ? 'Treino iniciado!' : 'Treino abandonado';
    const action = await screen.findByRole('button', { name: label });
    await act(async () => fireEvent.click(action));
    expect(mocks.toast.mock.calls.some(([args]) => args.title === title)).toBe(false);
    expect(mocks.event.mock.calls.some(([args]) => args.action === 'started')).toBe(false);
    mocks[operation].mockResolvedValue({ ok: true, value: { id: 'session-a', workoutId: 'workout-a' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: label })));
    expect(mocks.toast.mock.calls.filter(([args]) => args.title === title)).toHaveLength(1);
  });
});


describe('StudentPortal PR baseline integration', () => {
  it.each([false, null, undefined, true])('uses only confirmed history and passes unknown baseline separately (historical completed=%s)', async completed => {
    withPrescription = true;
    sessionLogs = [
      { id: 'previous-confirmed', workout_id: 'workout-a', exercise_index: 0, set_number: 1, weight: 10, reps_done: 10, completed: true, session_date: '2026-10-27' },
      { id: 'previous-ambiguous', workout_id: 'workout-a', exercise_index: 0, set_number: 2, weight: 15, reps_done: 10, completed, session_date: '2026-10-28' },
      { id: 'current-confirmed', workout_id: 'workout-a', exercise_index: 0, set_number: 1, weight: 20, reps_done: 10, completed: true, session_date: '2026-10-29' },
      { id: 'current-false', workout_id: 'workout-a', exercise_index: 0, set_number: 2, weight: 80, reps_done: 10, completed: false, session_date: '2026-10-29' },
    ];
    const original = JSON.stringify(sessionLogs);
    let summary: ReturnType<typeof calculateSessionMetrics> | undefined;
    mocks.finish.mockImplementation(async (logs, exercises, bests, unknown) => {
      summary = calculateSessionMetrics('workout-a', logs, exercises, bests, unknown);
      return { id: 'session-finished', workoutId: 'workout-a', completedAt: '2026-10-29T15:00:00Z', durationSeconds: 60, ...summary };
    });
    render(<StudentPortal />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir treino' }));
    const finish = await screen.findByRole('button', { name: 'Test finalizar' });
    await act(async () => fireEvent.click(finish));
    expect(mocks.finish).toHaveBeenCalledTimes(1);
    expect(mocks.finish.mock.calls[0][2]).toEqual({ 'ex-0': completed === true ? 15 : 10 });
    expect(mocks.finish.mock.calls[0][3]).toEqual(new Set(completed === true ? [] : [0]));
    expect(summary).toMatchObject({ totalSetsCompleted: 1, totalVolume: 200 });
    expect(summary?.exercisesSummary[0]).toMatchObject({ maxWeight: 20, isPR: completed === true });
    expect(JSON.stringify(sessionLogs)).toBe(original);
  });
});
