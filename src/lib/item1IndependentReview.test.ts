import { createElement } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CycleFeedbackBanner } from '@/components/student/CycleFeedbackBanner';
import { StudentWorkoutFeedbackCard } from '@/components/admin/StudentWorkoutFeedbackCard';
import { defaultFormDefinition } from '@/lib/formDefinitions';
import { usePublishedInstrumentState } from '@/hooks/usePublishedInstrument';
import { StudentHistory } from '@/components/student/StudentHistory';

// Component race reproductions only: no Auth, REST, SQL, or provider evidence.
const { rpc, from, toast } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), toast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc, from } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const cycleProps = {
  studentId: 'synthetic-student', companyId: 'synthetic-company',
  enrollmentId: 'synthetic-enrollment-A', cycleId: 'synthetic-cycle-A',
  enrollmentEndDate: new Date(Date.now() + 2 * 86400000).toISOString(),
};
const nextCycleProps = { ...cycleProps, enrollmentId: 'synthetic-enrollment-B', cycleId: 'synthetic-cycle-B' };
function fillCycle() {
  fireEvent.change(document.getElementById('question-nps')!, { target: { value: '9' } });
  fireEvent.change(document.getElementById('question-goals_aligned')!, { target: { value: 'true' } });
  fireEvent.change(document.getElementById('question-wants_adjustment')!, { target: { value: 'false' } });
}
const feedback = (suffix: string) => ({
  id: `synthetic-feedback-${suffix}`, created_at: '2026-10-26T10:00:00Z',
  workout_title: `Synthetic workout ${suffix}`, notes: 'Synthetic feedback',
  trainer_reply: null, trainer_replied_at: null, trainer_reply_author_name: null,
});

const historySession = {
  id: 'synthetic-session-1', workout_id: 'synthetic-workout', session_date: '2026-10-26',
  status: 'completed', completed_at: '2026-10-26T10:00:00Z', duration_seconds: 600,
  total_sets_completed: 0, total_sets_prescribed: 3, total_volume: 0,
};
const historyFeedback = {
  id: 'synthetic-history-feedback-1', workout_session_id: historySession.id,
  notes: 'Synthetic reflection without set logs', trainer_reply: 'Synthetic reply to completed session',
  trainer_replied_at: '2026-10-26T11:00:00Z', trainer_reply_author_name: 'Synthetic trainer',
};
const historyLog = {
  workout_id: historySession.workout_id, session_date: historySession.session_date,
  exercise_index: 0, set_number: 1, weight: 10, reps_done: 5,
};
const historyWorkouts = [{ id: historySession.workout_id, title: 'Synthetic history workout' }];

describe('item1 actual StudentHistory session/feedback identity', () => {
  it('shows a completed session reply and author without any set logs', () => {
    render(createElement(StudentHistory, {
      allLogs: [], workouts: historyWorkouts, sessions: [historySession], feedbacks: [historyFeedback],
    }));
    expect(screen.queryByText(historyFeedback.trainer_reply)).toBeInTheDocument();
    expect(screen.queryByText('Resposta de Synthetic trainer')).toBeInTheDocument();
    expect(screen.queryByText(/Nenhuma sess.o registrada ainda/)).not.toBeInTheDocument();
  });

  it('control: shows the identical session reply when one set log exists', () => {
    render(createElement(StudentHistory, {
      allLogs: [historyLog], workouts: historyWorkouts, sessions: [historySession], feedbacks: [historyFeedback],
    }));
    expect(screen.getByText(historyFeedback.trainer_reply)).toBeInTheDocument();
    expect(screen.getByText('Resposta de Synthetic trainer')).toBeInTheDocument();
  });

  it('preserves both concrete session replies for the same workout on the same day', () => {
    const secondSession = { ...historySession, id: 'synthetic-session-2', completed_at: '2026-10-26T18:00:00Z' };
    const secondFeedback = { ...historyFeedback, id: 'synthetic-history-feedback-2', workout_session_id: secondSession.id, trainer_reply: 'Synthetic reply to SECOND session' };
    render(createElement(StudentHistory, {
      allLogs: [historyLog], workouts: historyWorkouts,
      sessions: [historySession, secondSession], feedbacks: [historyFeedback, secondFeedback],
    }));
    expect(screen.getByText(historyFeedback.trainer_reply)).toBeInTheDocument();
    expect(screen.queryByText(secondFeedback.trainer_reply)).toBeInTheDocument();
  });

  it.each([1, 2])('preserves known workout/day log volume exactly once with %i sessions whose summary totals are unknown', count => {
    const sessions = Array.from({ length: count }, (_, index) => ({
      ...historySession, id: `synthetic-unknown-totals-${index}`,
      total_volume: null, total_sets_completed: null,
    }));
    render(createElement(StudentHistory, {
      allLogs: [{ ...historyLog, weight: 100, reps_done: 10 }], workouts: historyWorkouts, sessions,
    }));
    // Preserve the known group total once; never copy it into both session rows.
    expect(screen.queryAllByText('1.0t')).toHaveLength(1);
  });
});
const rowA = feedback('A');
const rowB = feedback('B');
const serverReply = { ...rowA, trainer_reply: 'Synthetic reply A', trainer_replied_at: '2026-10-26T11:00:00Z', trainer_reply_author_name: 'Synthetic author' };
type ReadResult = { data: typeof rowA[]; error: null };
type ReplyResult = { data: typeof serverReply | null; error: { message: string } | null };

async function beginOverlappingReplies() {
  const older = deferred<ReplyResult>();
  const newer = deferred<ReplyResult>();
  from.mockImplementation(() => ({ select: () => ({ eq: (_key: string, studentId: string) => ({
    order: () => ({ limit: () => Promise.resolve({ data: [studentId === 'A' ? rowA : rowB], error: null }) }),
  }) }) }));
  rpc.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
  const view = render(createElement(StudentWorkoutFeedbackCard, { studentId: 'A' }));
  fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Synthetic older reply' } });
  fireEvent.click(screen.getByRole('button', { name: 'Responder ao aluno' }));
  view.rerender(createElement(StudentWorkoutFeedbackCard, { studentId: 'B' }));
  await screen.findByText(rowB.workout_title);
  view.rerender(createElement(StudentWorkoutFeedbackCard, { studentId: 'A' }));
  fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Synthetic newer reply' } });
  fireEvent.click(screen.getByRole('button', { name: 'Responder ao aluno' }));
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(rpc.mock.calls.map(call => call[1]._feedback_id)).toEqual([rowA.id, rowA.id]);
  return { view, older, newer };
}

beforeEach(() => {
  vi.resetAllMocks();
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, String(value)),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  });
  rpc.mockResolvedValue({ data: { id: 'synthetic-form-v1', version: 1, definition: defaultFormDefinition('cycle_feedback') }, error: null });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('item1 independent component race repros (no integrated DB claims)', () => {
  it('starts the next enrollment with empty answers instead of carrying the previous cycle', async () => {
    const view = render(createElement(CycleFeedbackBanner, cycleProps));
    await screen.findByRole('button', { name: 'Enviar feedback' });
    fillCycle();
    view.rerender(createElement(CycleFeedbackBanner, nextCycleProps));
    expect(screen.getByRole('spinbutton')).toHaveValue(null);
  });

  it('does not hide enrollment B when the pending insert for enrollment A resolves', async () => {
    const insertResult = deferred<{ error: null }>();
    const insert = vi.fn(() => insertResult.promise);
    from.mockReturnValue({ insert });
    const view = render(createElement(CycleFeedbackBanner, cycleProps));
    await screen.findByRole('button', { name: 'Enviar feedback' });
    fillCycle();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar feedback' }));
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ cycle_id: cycleProps.cycleId }));
    view.rerender(createElement(CycleFeedbackBanner, nextCycleProps));
    await act(async () => insertResult.resolve({ error: null }));
    expect(localStorage.getItem('cycle_feedback_done_synthetic-enrollment-A')).toBe('1');
    expect(localStorage.getItem('cycle_feedback_done_synthetic-enrollment-B')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enviar feedback' })).toBeInTheDocument();
  });

  it('keeps a confirmed reply visible after A -> B -> A with an older read resolving last', async () => {
    const replyResult = deferred<{ data: typeof serverReply; error: null }>();
    const olderRead = deferred<ReadResult>();
    let readsA = 0;
    from.mockImplementation(() => ({ select: () => ({ eq: (_key: string, studentId: string) => ({
      order: () => ({ limit: () => studentId === 'A'
        ? (++readsA === 1 ? Promise.resolve({ data: [rowA], error: null }) : olderRead.promise)
        : Promise.resolve({ data: [rowB], error: null }) }),
    }) }) }));
    rpc.mockReturnValue(replyResult.promise);
    const view = render(createElement(StudentWorkoutFeedbackCard, { studentId: 'A' }));
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: serverReply.trainer_reply } });
    fireEvent.click(screen.getByRole('button', { name: 'Responder ao aluno' }));
    expect(rpc).toHaveBeenCalledWith('reply_to_workout_feedback', { _feedback_id: rowA.id, _trainer_reply: serverReply.trainer_reply });
    view.rerender(createElement(StudentWorkoutFeedbackCard, { studentId: 'B' }));
    await screen.findByText(rowB.workout_title);
    view.rerender(createElement(StudentWorkoutFeedbackCard, { studentId: 'A' }));
    await waitFor(() => expect(readsA).toBe(2));
    await act(async () => replyResult.resolve({ data: serverReply, error: null }));
    await act(async () => olderRead.resolve({ data: [rowA], error: null }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Resposta registrada' }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText(/Respondido por Synthetic author/)).toBeInTheDocument();
    expect(screen.queryByText(serverReply.trainer_reply)).toBeInTheDocument();
  });

  it('does not attribute a late successful A reply to the visible student B', async () => {
    const replyResult = deferred<{ data: typeof serverReply; error: null }>();
    from.mockImplementation(() => ({ select: () => ({ eq: (_key: string, studentId: string) => ({
      order: () => ({ limit: () => Promise.resolve({ data: [studentId === 'A' ? rowA : rowB], error: null }) }),
    }) }) }));
    rpc.mockReturnValue(replyResult.promise);
    const view = render(createElement(StudentWorkoutFeedbackCard, { studentId: 'A' }));
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: serverReply.trainer_reply } });
    fireEvent.click(screen.getByRole('button', { name: 'Responder ao aluno' }));
    view.rerender(createElement(StudentWorkoutFeedbackCard, { studentId: 'B' }));
    await screen.findByText(rowB.workout_title);
    await act(async () => replyResult.resolve({ data: serverReply, error: null }));
    expect(screen.queryByText(serverReply.trainer_reply)).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Resposta registrada' }));
  });

  it('ignores a late company A form definition after the hook switches to company B', async () => {
    const a = deferred<{ data: unknown; error: null }>();
    const b = deferred<{ data: unknown; error: null }>();
    rpc.mockImplementation((_name: string, args: { _company_id: string }) => args._company_id === 'A' ? a.promise : b.promise);
    const view = renderHook(({ company }) => usePublishedInstrumentState(company, 'cycle_feedback'), { initialProps: { company: 'A' } });
    view.rerender({ company: 'B' });
    const definition = defaultFormDefinition('cycle_feedback');
    await act(async () => b.resolve({ data: { id: 'form-B', version: 2, definition }, error: null }));
    expect(view.result.current.published?.id).toBe('form-B');
    await act(async () => a.resolve({ data: { id: 'form-A', version: 1, definition }, error: null }));
    expect(view.result.current.published?.id).toBe('form-B');
    expect(view.result.current.loaded).toBe(true);
  });
});

describe('item1 F3 follow-up monotonic reply acknowledgements', () => {
  it.each(['visible reply', 'confirmed cache after navigation'])('keeps the newer server ACK despite a later older ACK: %s', async mode => {
    const { view, older, newer } = await beginOverlappingReplies();
    const newRow = { ...serverReply, trainer_reply: 'Synthetic newer reply', trainer_replied_at: '2026-10-26T12:00:00Z' };
    const oldRow = { ...serverReply, trainer_reply: 'Synthetic older reply', trainer_replied_at: '2026-10-26T11:00:00Z' };
    await act(async () => newer.resolve({ data: newRow, error: null }));
    expect(screen.getByText(newRow.trainer_reply)).toBeInTheDocument();
    await act(async () => older.resolve({ data: oldRow, error: null }));
    if (mode === 'confirmed cache after navigation') {
      view.rerender(createElement(StudentWorkoutFeedbackCard, { studentId: 'B' }));
      await screen.findByText(rowB.workout_title);
      view.rerender(createElement(StudentWorkoutFeedbackCard, { studentId: 'A' }));
      await screen.findByText(rowA.workout_title);
    }
    expect(screen.queryByText(newRow.trainer_reply)).toBeInTheDocument();
    expect(screen.queryByText(oldRow.trainer_reply)).not.toBeInTheDocument();
  });

  it('does not let an older failed RPC release the pending newer save for the same feedback', async () => {
    const { older, newer } = await beginOverlappingReplies();
    const button = screen.getByRole('button', { name: 'Responder ao aluno' });
    expect(button).toBeDisabled();
    await act(async () => older.resolve({ data: null, error: { message: 'Synthetic older request failed' } }));
    expect(button).toBeDisabled();
    await act(async () => newer.resolve({ data: serverReply, error: null }));
  });
});
