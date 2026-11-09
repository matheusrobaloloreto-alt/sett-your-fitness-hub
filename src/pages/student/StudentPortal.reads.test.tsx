import { act, cleanup, fireEvent, render as renderWithTestingLibrary, screen, waitFor } from '@testing-library/react';
import type { PropsWithChildren, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { calculateSessionMetrics, type SessionLog } from '@/lib/sessions/metrics';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queryClients: QueryClient[] = [];
function render(ui: ReactNode) {
 const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
 queryClients.push(client);
 return renderWithTestingLibrary(ui, { wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}

const mocks = vi.hoisted(() => ({ user: { id: 'user-a' }, from: vi.fn(), toast: vi.fn(), start: vi.fn(), abandon: vi.fn(), event: vi.fn(), rpc: vi.fn(), finish: vi.fn(), active: null as null | { id: string; workoutId: string; startedAt: number } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user, signOut: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/hooks/useWorkoutSession', () => ({ useWorkoutSession: () => ({ isHydrated: true, activeSession: mocks.active, isActive: Boolean(mocks.active), summary: null, elapsed: 0, formatTime: () => '00:00', startSession: mocks.start, abandonSession: mocks.abandon, finishSession: mocks.finish }) }));
// Exercise view navigation without waiting on animation frames in jsdom.
vi.mock('framer-motion', async (importOriginal) => ({
  ...await importOriginal<typeof import('framer-motion')>(),
  AnimatePresence: ({ children }: PropsWithChildren) => <>{children}</>,
}));
vi.mock('@/lib/benitoProductEvents', () => ({ emitBenitoProductEvent: mocks.event }));
vi.mock('@/components/student/WorkoutTimer', async (importOriginal) => {
 const { WorkoutTimer } = await importOriginal<typeof import('@/components/student/WorkoutTimer')>();
 return {
  WorkoutTimer: (props: Parameters<typeof WorkoutTimer>[0]) => renewalScenario ? <WorkoutTimer {...props} /> : <>
   <button onClick={props.onStart}>Test iniciar</button>
   <button onClick={props.onAbandon}>Test abandonar</button>
   <button onClick={props.onFinish}>Test finalizar</button>
  </>,
 };
});
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
vi.mock('@/components/student/StudentHome', async (importOriginal) => {
 const { StudentHome } = await importOriginal<typeof import('@/components/student/StudentHome')>();
 return {
  StudentHome: (props: Parameters<typeof StudentHome>[0]) => renewalScenario ? <StudentHome {...props} /> : <div>
   <p>Portal carregado</p><button onClick={() => props.onNavigate("treino")}>Abrir treino</button>
   {props.selectedCycle?.workouts.map(w => <p key={w.title}>{w.title}</p>)}
  </div>,
 };
});
import StudentPortal from './StudentPortal';

let failureTable: string | null;
let enrollmentBlocker: Record<string, unknown> | null;
let rejectRead: boolean;
let student: object | null;
let slowStudent: Promise<object> | null;
let withPrescription: boolean;
let longContract: boolean;
let pendingSlot: boolean;
let pendingOnly: boolean;
let policyMode: 'keep_until_replaced' | 'hide_on_expiry';
let policyFailure: boolean;
let policyRead: Promise<unknown> | null;
let continuityScenario: 'published' | 'future' | 'cleared' | 'archived' | 'foreign' | 'cancelled' | null;
let renewalScenario: 'empty' | 'offline' | 'published' | null;
let expiredEnrollment: boolean;
let offlinePrescription: boolean;
let overlappingPrescription: boolean | 'different-start' | 'empty';
let sessionLogs: Array<SessionLog & { id: string; session_date: string }> = [];
beforeEach(() => {
  mocks.user = { id: 'user-a' }; mocks.toast.mockReset(); mocks.start.mockReset(); mocks.abandon.mockReset(); mocks.event.mockReset(); mocks.rpc.mockReset(); mocks.finish.mockReset(); sessionLogs = [];
  mocks.active = null;
  policyMode = 'keep_until_replaced'; policyFailure = false; policyRead = null;
  mocks.rpc.mockImplementation((name: string) => {
    if (name !== 'get_company_workout_expiry_policy') return Promise.resolve({ data: null, error: null });
    if (policyRead) return policyRead;
    return Promise.resolve(policyFailure ? { data: null, error: { code: '42P01' } } : { data: { company_id: 'company-a', expired_workout_behavior: policyMode, version: 1 }, error: null });
  });
  enrollmentBlocker = null;
  expiredEnrollment = false; offlinePrescription = false; continuityScenario = null; renewalScenario = null;
  failureTable = null; rejectRead = false; slowStudent = null; withPrescription = false; longContract = false; pendingSlot = false; pendingOnly = false; overlappingPrescription = false;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-29T15:00:00Z'));
  student = { id: 'student-a', full_name: 'Fixture A', company_id: 'company-a', status: 'active' };
  mocks.from.mockImplementation((table: string) => {
    let single = false;
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const query = {
      select: () => query, is: () => query, or: () => query, lte: () => query, order: () => query, limit: () => query, range: () => query,
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
      in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
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
        if (expiredEnrollment) prescriptionRows.enrollments = [{ ...(prescriptionRows.enrollments as object[])[0], status: 'awaiting_renewal', start_date: '2026-03-30', end_date: '2026-09-13' }];
        if (enrollmentBlocker) prescriptionRows.enrollments = [...(prescriptionRows.enrollments as object[]), enrollmentBlocker];
        if (offlinePrescription) {
          prescriptionRows.training_cycles = [{ ...(prescriptionRows.training_cycles as object[])[0], prescribed_offline_at: '2026-10-01T12:00:00Z' }];
          prescriptionRows.workouts = [];
        }
        if (overlappingPrescription) {
          prescriptionRows.training_cycles = [...(prescriptionRows.training_cycles as object[]), { ...(prescriptionRows.training_cycles as object[])[0], id: 'cycle-overlap', ...(overlappingPrescription !== true ? { start_date: '2026-10-15' } : {}) }];
          if (overlappingPrescription !== 'empty') {
            prescriptionRows.workouts = [...(prescriptionRows.workouts as object[]), { ...(prescriptionRows.workouts as object[])[0], id: 'workout-overlap', cycle_id: 'cycle-overlap' }];
          }
        }
        if (pendingSlot) {
          prescriptionRows.training_cycles = [
            { id: 'cycle-old', enrollment_id: 'enrollment-a', student_id: 'student-a', company_id: 'company-a', cycle_number: 12, start_date: '2026-09-01', end_date: '2026-10-08', status: 'completed', duration_weeks: 6, delivery_status: 'viewed' },
            { id: 'cycle-pending', enrollment_id: 'enrollment-a', student_id: 'student-a', company_id: 'company-a', cycle_number: 13, start_date: '2026-10-09', end_date: '2026-11-19', status: 'active', duration_weeks: 6, delivery_status: 'pending' },
          ];
          prescriptionRows.workouts = [{ company_id: 'company-a', id: 'workout-old', title: 'Treino anterior', cycle_id: 'cycle-old', exercises: [{ exercise_id: 'exercise-a', exercise_name: 'Fixture exercise', sets: '3', reps: '10' }] }];
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
        if (continuityScenario && pendingSlot) {
          const cycleRows = prescriptionRows.training_cycles as Array<Record<string, unknown>>;
          const workoutRows = prescriptionRows.workouts as Array<Record<string, unknown>>;
          if (continuityScenario === 'published' || continuityScenario === 'future') {
            cycleRows[1] = { ...cycleRows[1], start_date: continuityScenario === 'future' ? '2026-11-02' : '2026-10-09' };
            workoutRows.push({ ...workoutRows[0], id: 'workout-next', title: 'Nova prescrição', cycle_id: 'cycle-pending' });
          }
          if (continuityScenario === 'cleared') cycleRows[1].prescription_cleared_at = '2026-10-20T12:00:00Z';
          if (continuityScenario === 'archived') workoutRows[0].student_profile_archive_event_id = 'archive-event';
          if (continuityScenario === 'foreign') workoutRows[0].company_id = 'foreign-company';
          if (continuityScenario === 'cancelled') prescriptionRows.enrollments = [{ ...(prescriptionRows.enrollments as object[])[0], status: 'cancelled' }];
        }
        if (renewalScenario) {
          const owner = { student_id: 'student-a', company_id: 'company-a' };
          prescriptionRows.enrollments = [
            { ...owner, id: 'enrollment-new', plan_id: 'plan-a', status: 'active', start_date: '2026-10-09', training_start_date: '2026-10-09', end_date: '2026-12-31', carried_over_cycle_id: 'cycle-old' },
            { ...owner, id: 'enrollment-old', plan_id: 'plan-a', status: 'completed', start_date: '2026-08-28', end_date: '2026-10-08' },
          ];
          prescriptionRows.plans = { name: 'Fixture plan', duration_days: 84, cycle_duration_days: 42 };
          prescriptionRows.training_cycles = [
            { ...owner, id: 'cycle-old', enrollment_id: 'enrollment-old', cycle_number: 4, start_date: '2026-08-28', end_date: '2026-10-08', status: 'completed', duration_weeks: 6, delivery_status: 'viewed' },
            {
              ...owner, id: 'cycle-renewed', enrollment_id: 'enrollment-new', cycle_number: 1,
              start_date: '2026-10-09', end_date: '2026-11-19', duration_weeks: 6,
              status: renewalScenario === 'published' ? 'active' : 'pending',
              delivery_status: renewalScenario === 'published' ? 'sent' : 'pending',
              prescribed_offline_at: renewalScenario === 'offline' ? '2026-10-09T12:00:00Z' : null,
            },
            { ...owner, id: 'cycle-renewed-future', enrollment_id: 'enrollment-new', cycle_number: 2, start_date: '2026-11-20', end_date: '2026-12-31', status: 'pending', duration_weeks: 6 },
          ];
          const workout = (id: string, cycle_id: string, title: string) => ({
            id, cycle_id, title, company_id: owner.company_id,
            exercises: [{ exercise_id: 'exercise-a', exercise_name: 'Fixture exercise', sets: '3', reps: '10' }],
          });
          prescriptionRows.workouts = [
            workout('workout-carried', 'cycle-old', 'Treino da matrícula anterior'),
            ...(renewalScenario === 'published' ? [workout('workout-replacement', 'cycle-renewed', 'Treino da renovação')] : []),
            ...(renewalScenario === 'offline' ? [{ ...workout('workout-marker', 'cycle-renewed', 'Marcador legado'), exercises: [] }] : []),
          ];
          const rows = prescriptionRows[table];
          if (Array.isArray(rows)) {
            const matched = rows.filter(row => filters.every(filter => filter(row)));
            prescriptionRows[table] = single ? matched[0] ?? null : matched;
          }
        }
        return Promise.resolve({ data: table === 'students' ? student : withPrescription && table in prescriptionRows ? prescriptionRows[table] : single ? null : [], error: null }).then(resolve, reject);
      },
    }; return query;
  });
});
afterEach(() => { cleanup(); queryClients.forEach(client => client.clear()); queryClients.length = 0; vi.useRealTimers(); });

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
  it('labels an empty slot as pending while retaining the last digital workout and separate session history', async () => {
    withPrescription = true; pendingSlot = true;
    render(<StudentPortal />);
    expect(await screen.findByText('Aguardando prescrição')).toBeInTheDocument();
    expect(screen.getByText(/ciclo 12, válido até 08\/10\/2026/)).toBeInTheDocument();
    expect(await screen.findByText('Treino anterior')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver calendário e sessões' }));
    expect(await screen.findByRole('heading', { name: 'Histórico' })).toBeInTheDocument();
    expect(screen.getAllByText('Treino anterior').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Test iniciar' })).not.toBeInTheDocument();
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it('continues the last digital workout through an empty next slot with functional start and no publication ACK', async () => {
    withPrescription = true; pendingSlot = true;
    mocks.start.mockResolvedValue({ ok: true });
    render(<StudentPortal />);
    await screen.findByText('Portal carregado');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir treino' }));
    expect(await screen.findByText('Seu último treino continua disponível até a próxima prescrição.')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Test iniciar' }));
    expect(mocks.start).toHaveBeenCalledWith('workout-old');
    expect(mocks.rpc).not.toHaveBeenCalledWith('mark_training_cycle_viewed', expect.anything());
  });
  it.each([
    ['keep_until_replaced', 'empty', 'workout-carried'],
    ['hide_on_expiry', 'empty', null],
    ['keep_until_replaced', 'offline', 'workout-carried'],
    ['hide_on_expiry', 'offline', null],
    ['keep_until_replaced', 'published', 'workout-replacement'],
    ['hide_on_expiry', 'published', 'workout-replacement'],
  ] as const)('uses the real workout screen with %s and renewal state %s', async (policy, renewal, workoutId) => {
    withPrescription = true;
    renewalScenario = renewal;
    policyMode = policy;
    mocks.start.mockResolvedValue({ ok: true });
    render(<StudentPortal />);

    fireEvent.click(await screen.findByRole('button', { name: 'Abrir treino' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Abrir treino' })).not.toBeInTheDocument());
    if (renewal === 'empty') {
      expect(await screen.findByRole('heading', { name: 'Aguardando prescrição' })).toBeInTheDocument();
      expect(mocks.rpc).not.toHaveBeenCalledWith('mark_training_cycle_viewed', expect.anything());
    }
    if (renewal === 'offline') {
      expect(await screen.findByRole('heading', { name: 'Prescrição externa' })).toBeInTheDocument();
      expect(screen.queryByText('Marcador legado')).not.toBeInTheDocument();
      expect(mocks.rpc).not.toHaveBeenCalledWith('mark_training_cycle_viewed', expect.anything());
    }
    if (!workoutId) {
      await waitFor(() => expect(screen.queryByText('Verificando a disponibilidade do seu último treino…')).not.toBeInTheDocument());
      expect(screen.queryByRole('button', { name: 'Iniciar Treino' })).not.toBeInTheDocument();
      expect(mocks.start).not.toHaveBeenCalled();
      return;
    }
    const start = await screen.findByRole('button', { name: 'Iniciar Treino' });
    expect(start).toBeEnabled();
    await act(async () => { fireEvent.click(start); });
    expect(mocks.start.mock.calls).toEqual([[workoutId]]);
  });
  it('hides an expired source when the company chooses automatic expiry', async () => {
    withPrescription = true; pendingSlot = true; policyMode = 'hide_on_expiry';
    render(<StudentPortal />);
    await screen.findByText('Portal carregado');
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Abrir treino' }));
    expect(screen.queryByRole('button', { name: 'Test iniciar' })).toBeNull();
    expect(screen.queryByText('Seu último treino continua disponível até a próxima prescrição.')).toBeNull();
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it('can finish an existing resolved session after expiry is hidden without enabling another start', async () => {
    withPrescription = true; pendingSlot = true; policyMode = 'hide_on_expiry';
    mocks.active = { id: 'session-active', workoutId: 'workout-old', startedAt: Date.now() - 60000 };
    mocks.finish.mockImplementation(async (logs, exercises, bests, unknown) => ({
      id: 'session-active', workoutId: 'workout-old', completedAt: '2026-10-29T15:00:00Z', durationSeconds: 60,
      ...calculateSessionMetrics('workout-old', logs, exercises, bests, unknown),
    }));
    render(<StudentPortal />);
    const finish = await screen.findByRole('button', { name: 'Finalizar sessão em andamento' });
    expect(screen.queryByRole('button', { name: 'Test iniciar' })).toBeNull();
    await act(async () => { fireEvent.click(finish); });
    expect(mocks.finish).toHaveBeenCalledTimes(1);
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.abandon).not.toHaveBeenCalled();
  });
  it.each(['cleared', 'archived', 'foreign', 'cancelled'] as const)('does not use an active session to bypass the %s source guard', async scenario => {
    withPrescription = true; pendingSlot = true; policyMode = 'hide_on_expiry'; continuityScenario = scenario;
    mocks.active = { id: 'session-active', workoutId: 'workout-old', startedAt: Date.now() - 60000 };
    render(<StudentPortal />);
    await screen.findByText('Portal carregado');
    expect(screen.queryByRole('button', { name: 'Finalizar sessão em andamento' })).toBeNull();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.finish).not.toHaveBeenCalled();
  });
  it('hides on expiry even when the previously valid coverage projection is still cached', async () => {
    withPrescription = true; policyMode = 'hide_on_expiry';
    const view = render(<StudentPortal />);
    await screen.findByText('Prescrição existente');
    vi.setSystemTime(new Date('2026-11-12T15:00:00Z'));
    view.rerender(<StudentPortal />);
    expect(screen.queryByText('Prescrição existente')).toBeNull();
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it('fails closed only for expired continuity when the settings read fails, then retries', async () => {
    withPrescription = true; pendingSlot = true; policyFailure = true;
    render(<StudentPortal />);
    await screen.findByText('Não foi possível verificar a disponibilidade do seu último treino.');
    expect(screen.queryByText('Treino anterior')).toBeNull();
    expect(mocks.start).not.toHaveBeenCalled();
    policyFailure = false;
    fireEvent.click(screen.getByRole('button', { name: 'Verificar disponibilidade novamente' }));
    expect(await screen.findByText('Treino anterior')).toBeInTheDocument();
  });
  it('keeps the currently covered workout available despite settings failure', async () => {
    withPrescription = true; policyFailure = true;
    render(<StudentPortal />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir treino' }));
    expect(await screen.findByRole('button', { name: 'Test iniciar' })).toBeInTheDocument();
  });
  it('keeps the previous workout until a future materialized replacement starts', async () => {
    withPrescription = true; pendingSlot = true; continuityScenario = 'future';
    render(<StudentPortal />);
    await screen.findByText('Portal carregado');
    expect(await screen.findByText('Treino anterior')).toBeInTheDocument();
    expect(screen.queryByText('Nova prescrição')).toBeNull();
  });
  it('switches to the next started materialized prescription', async () => {
    withPrescription = true; pendingSlot = true; continuityScenario = 'published';
    mocks.start.mockResolvedValue({ ok: true });
    render(<StudentPortal />);
    await screen.findByText('Portal carregado');
    expect(screen.getByText('Nova prescrição')).toBeInTheDocument();
    expect(screen.queryByText('Seu último treino continua disponível até a próxima prescrição.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir treino' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Test iniciar' }));
    expect(mocks.start).toHaveBeenCalledWith('workout-next');
  });
  it.each(['cleared', 'archived', 'foreign', 'cancelled'] as const)('never enables continuity past %s guard', async scenario => {
    withPrescription = true; pendingSlot = true; continuityScenario = scenario;
    render(<StudentPortal />);
    await screen.findByText('Portal carregado');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir treino' }));
    expect(screen.queryByRole('button', { name: 'Test iniciar' })).toBeNull();
    expect(screen.queryByText('Seu último treino continua disponível até a próxima prescrição.')).toBeNull();
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it.each([true, 'different-start'] as const)('blocks execution for overlapping prescriptions (%s)', async overlap => {
    withPrescription = true; overlappingPrescription = overlap;
    render(<StudentPortal />);
    expect(await screen.findByText('Aguardando prescrição')).toBeInTheDocument();
    expect(screen.queryByText('Prescrição existente')).not.toBeInTheDocument();
    expect(screen.queryByText('Seu último treino continua disponível até a próxima prescrição.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir treino' }));
    expect(screen.queryByRole('button', { name: 'Test iniciar' })).not.toBeInTheDocument();
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it.each(['keep_until_replaced', 'hide_on_expiry'] as const)('keeps a unique current workout beside an empty overlapping slot under %s', async mode => {
    withPrescription = true; overlappingPrescription = 'empty'; policyMode = mode;
    mocks.start.mockResolvedValue({ ok: true });
    render(<StudentPortal />);
    await screen.findByText('Prescrição existente');
    expect(screen.getByRole('heading', { name: 'Agenda em revisão' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir treino' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Test iniciar' }));
    expect(mocks.start).toHaveBeenCalledWith('workout-a');
    expect(mocks.rpc).not.toHaveBeenCalledWith('mark_training_cycle_viewed', expect.anything());
  });
  it('does not mark an empty restored slot as viewed', async () => {
    withPrescription = true; pendingSlot = true; pendingOnly = true;
    render(<StudentPortal />);
    await screen.findByText('Aguardando prescrição');
    expect(mocks.rpc).not.toHaveBeenCalledWith('mark_training_cycle_viewed', expect.anything());
  });
  it('keeps history accessible even without a selected cycle', async () => {
    render(<StudentPortal />);
    expect(await screen.findByText('Aguardando prescrição')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver calendário e sessões' }));
    expect(await screen.findByRole('heading', { name: 'Histórico' })).toBeInTheDocument();
  });
  it('opens published prescription exercises even with no eligible enrollment, without acknowledging or starting a session', async () => {
    withPrescription = true; expiredEnrollment = true; policyMode = 'hide_on_expiry';
    render(<StudentPortal />);
    await screen.findByText('Aguardando prescrição');
    fireEvent.click(screen.getByRole('button', { name: 'Consultar prescrições publicadas' }));
    expect(await screen.findByText('Prescrição existente')).toBeInTheDocument();
    expect(screen.getByText('Fixture exercise')).toBeInTheDocument();
    expect(screen.getByText(/renovação pendente/)).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalledWith('mark_training_cycle_viewed', expect.anything());
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it('distinguishes external prescription from missing digital publication', async () => {
    withPrescription = true; offlinePrescription = true;
    render(<StudentPortal />);
    expect(await screen.findByText('Prescrição externa')).toBeInTheDocument();
    expect(screen.queryByText('Aguardando prescrição')).toBeNull();
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it('does not offer prescription history to inactive profiles', async () => {
    student = { ...(student as object), status: 'inactive' };
    render(<StudentPortal />);
    await screen.findByText('Portal carregado');
    expect(screen.queryByRole('button', { name: 'Consultar prescrições publicadas' })).toBeNull();
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

it.each(['keep_until_replaced','hide_on_expiry','error'] as const)('gates expired enrollment execution by strict policy: %s',async mode=>{
 withPrescription=true;expiredEnrollment=true;policyMode=mode==='hide_on_expiry'?'hide_on_expiry':'keep_until_replaced';policyFailure=mode==='error';
 render(<StudentPortal/>);
 await screen.findByText('Portal carregado');
 fireEvent.click(screen.getByRole('button',{name:'Abrir treino'}));
 if(mode==='keep_until_replaced'){fireEvent.click(await screen.findByRole('button',{name:'Test iniciar'}));expect(mocks.start).toHaveBeenCalled();}
 else {expect(screen.queryByRole('button',{name:'Test iniciar'})).toBeNull();expect(mocks.start).not.toHaveBeenCalled();}
 expect(mocks.rpc).not.toHaveBeenCalledWith('mark_training_cycle_viewed',expect.anything());
});

it.each([
 {start_date:'2026-10-15',end_date:'2026-10-28'},
 {start_date:null,end_date:null,created_at:'2026-10-20'},
 {start_date:'invalid',end_date:'2026-10-28'},
])('blocks execution before a newer cancelled/unknown-order enrollment: %j',async dates=>{
 withPrescription=true;
 enrollmentBlocker={id:'cancelled-newer',student_id:'student-a',company_id:'company-a',status:'cancelled',...dates};
 render(<StudentPortal/>);
 await screen.findByText('Portal carregado');
 fireEvent.click(screen.getByRole('button',{name:'Abrir treino'}));
 expect(screen.queryByRole('button',{name:'Test iniciar'})).toBeNull();
 expect(mocks.start).not.toHaveBeenCalled();
});
