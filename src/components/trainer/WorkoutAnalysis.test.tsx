import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ rows: [{ status: 'completed', duration_seconds: 60, total_volume: 250 }], fail: false, allowedCompany: "company-a", today: "2026-11-03", reads: [] as string[], enrollments: [] as any[], cycles: [] as any[], workouts: [] as any[], targets: [] as any[], logs: [] as Array<{ weight: number; reps_done: number }> }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
 mock.reads.push(table);
 const filters: Record<string, unknown> = {};
 const query: any = { select: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query; }, maybeSingle: async () => ({ data: filters.company_id === mock.allowedCompany ? { id: filters.id, company_id: mock.allowedCompany } : null, error: null }), gte: () => query, lte: () => query, in: () => query, is: () => query, or: () => query, order: () => query, limit: () => query,
 then: (resolve: any) => Promise.resolve({ data: mock.fail ? null : table === "workout_logs" ? mock.logs.map(row => ({ student_id: filters.student_id, ...row })) : table === "enrollments" ? mock.enrollments : table === "training_cycles" ? mock.cycles : table === "workouts" ? mock.workouts : mock.rows.map(row => ({ student_id: filters.student_id, company_id: mock.allowedCompany, ...row })), error: mock.fail ? { message: 'failed' } : null }).then(resolve) }; return query;
}, rpc: async () => ({ data: mock.targets, error: null }) } }));
vi.mock('@/lib/businessDate', () => ({ businessDateYmd: () => mock.today }));
vi.mock('@/components/BnitoFloatingAssistant', () => ({ BnitoContextButton: () => null }));
import { WorkoutAnalysis } from './WorkoutAnalysis';
afterEach(cleanup);
it('reports completion separately from adherence without inventing historical muscle attribution', async () => {
 render(<WorkoutAnalysis companyId="company-a" studentId="a" />);
 await waitFor(() => expect(screen.getByText('250kg')).toBeInTheDocument());
 expect(screen.getByText('Conclusão das sessões iniciadas')).toBeInTheDocument();
 expect(screen.getByText(/Sem dados para distribuição muscular/)).toBeInTheDocument();
 expect(screen.queryByText('Aderência')).not.toBeInTheDocument();
});
it('clears the previous student summary on read error', async () => {
 mock.fail = false;
 const view = render(<WorkoutAnalysis companyId="company-a" studentId="a" />);
 await screen.findByText('250kg');
 mock.fail = true;
 view.rerender(<WorkoutAnalysis companyId="company-a" studentId="b" />);
 await screen.findByText(/Não foi possível carregar/);
 expect(screen.queryByText('250kg')).not.toBeInTheDocument();
});

it('reads the executed muscle snapshot without consulting the current exercise array', async () => {
 mock.fail = false;
 mock.rows = [{ status: 'completed', duration_seconds: 60, total_volume: 250, exercises_summary: [{ name: 'Historical exercise', muscleGroup: 'Quadríceps', sets: [{ weight: 0, reps: 10 }] }] }] as any;
 render(<WorkoutAnalysis companyId="company-a" studentId="c" />);
 expect(await screen.findByText('Quadríceps')).toBeInTheDocument();
 expect(screen.getByText(/snapshot da sessão/)).toBeInTheDocument();
});

it('preserves legacy log volume without inferring any completed session', async () => {
 mock.fail = false; mock.rows = []; mock.logs = [{ weight: 10, reps_done: 12 }];
 render(<WorkoutAnalysis companyId="company-a" studentId="legacy" />);
 expect(await screen.findByText('120kg')).toBeInTheDocument();
 expect(screen.getByText(/conclusão não inferida/)).toBeInTheDocument();
 expect(screen.queryByText('100%')).not.toBeInTheDocument();
});
it('distinguishes an empty successful read from a failed read', async () => {
 mock.fail = false; mock.rows = []; mock.logs = [];
 render(<WorkoutAnalysis companyId="company-a" studentId="empty" />);
 expect(await screen.findByText(/Sem dados para distribuição muscular/)).toBeInTheDocument();
 expect(screen.queryByRole('alert')).not.toBeInTheDocument();
 expect(screen.queryByText('100%')).not.toBeInTheDocument();
});

it('fails closed for a student outside the requested company before reading sessions or logs', async () => {
 mock.fail = false; mock.reads = [];
 render(<WorkoutAnalysis studentId="other-company-student" companyId="company-b" />);
 expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar');
 expect(mock.reads).toEqual(['students']);
});
it('does not perform an unscoped read without company context', async () => {
 mock.reads = [];
 render(<WorkoutAnalysis studentId="a" companyId={null} />);
 expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar');
 expect(mock.reads).toEqual([]);
});

function currentPrescription() {
 mock.today = "2026-11-03";
 mock.fail = false; mock.allowedCompany = 'company-a';
 mock.enrollments = [{ id: 'enrollment-a', student_id: 'a', company_id: 'company-a', status: 'active', start_date: '2020-01-01', end_date: '2030-01-01' }];
 mock.cycles = [{ id: 'cycle-a', cycle_number: 18, enrollment_id: 'enrollment-a', student_id: 'a', company_id: 'company-a', status: 'active', start_date: '2020-01-01', end_date: '2030-01-01' }];
 mock.workouts = [{ id: 'workout-a', cycle_id: 'cycle-a', company_id: 'company-a', updated_at: '2020-01-01T00:00:00Z', exercises: [{ exercise_id: 'exercise-a', exercise_name: 'Agachamento', muscle_group: 'Quadríceps', sets: '12' }] }];
 mock.targets = [];
 mock.rows = [{ workout_id: 'workout-a', session_date: '2026-11-02', status: 'completed', total_volume: 250, total_sets_completed: 1, total_sets_prescribed: 12, exercises_summary: [{ name: 'Agachamento', muscleGroup: 'Quadríceps', sets: [{ weight: 25, reps: 10 }] }] }] as any;
}
it('preserves current weekly prescription independently of a historical execution without compatible snapshot', async () => {
 currentPrescription();
 (mock.rows[0] as any).workout_id = 'old-workout';
 render(<WorkoutAnalysis studentId="a" companyId="company-a" />);
 expect(await screen.findByText(/12 séries prescritas\/sem/)).toBeInTheDocument();
 expect(screen.getByText(/Ciclo 18 · vigência 01\/01\/2020 a 01\/01\/2030/)).toBeInTheDocument();
 expect(screen.queryByText(/cycle-a/)).not.toBeInTheDocument();
 expect(screen.getByText(/Comparação e alertas indisponíveis/)).toBeInTheDocument();
 expect(screen.getByText('250kg')).toBeInTheDocument();
 expect(screen.queryByText(/sub-treinado/)).not.toBeInTheDocument();
});
it('restores comparison and volume alerts only with complete compatible snapshots', async () => {
 currentPrescription();
 render(<WorkoutAnalysis studentId="a" companyId="company-a" />);
 expect(await screen.findByText(/12 séries prescritas\/sem/)).toBeInTheDocument();
 expect(screen.getByText(/Comparação disponível/)).toBeInTheDocument();
 expect(screen.getByText(/sub-treinado/)).toBeInTheDocument();
});
it.each(['cycle', 'workout', 'exercise', 'target'])('rejects foreign %s data in nested prescription reads while keeping session evidence', async foreign => {
 currentPrescription();
 if (foreign === 'cycle') mock.cycles[0].student_id = 'another-student';
 if (foreign === 'workout') mock.workouts[0].company_id = 'another-company';
 if (foreign === 'exercise') mock.workouts[0].exercises[0].company_id = 'another-company';
 if (foreign === 'target') mock.targets = [{ exercise_id: 'foreign-exercise', muscle_group_name: 'Peitoral', role: 'primary', is_primary: true }];
 render(<WorkoutAnalysis studentId="a" companyId="company-a" />);
 expect(await screen.findByText(/Prescrição atual indisponível/)).toBeInTheDocument();
 expect(screen.getByText('250kg')).toBeInTheDocument();
 expect(screen.queryByText(/12 séries prescritas\/sem/)).not.toBeInTheDocument();
 expect(screen.queryByText(/sub-treinado/)).not.toBeInTheDocument();
});

it.each(['incomplete', 'changed workout', 'boundary update', 'fractional basis'])('keeps prescription visible but refuses alerts for %s evidence', async reason => {
 currentPrescription();
 if (reason === 'incomplete') (mock.rows[0] as any).total_sets_completed = 2;
 if (reason === 'boundary update') mock.workouts[0].updated_at = '2026-10-05T12:00:00Z';
 if (reason === 'changed workout') mock.workouts[0].updated_at = '2026-11-03T10:00:00Z';
 if (reason === 'fractional basis') mock.targets = [
  { exercise_id: 'exercise-a', muscle_group_name: 'Quadríceps', role: 'primary', is_primary: true },
  { exercise_id: 'exercise-a', muscle_group_name: 'Glúteos', role: 'secondary', is_primary: false },
 ];
 render(<WorkoutAnalysis studentId="a" companyId="company-a" />);
 expect(await screen.findByText(/12 séries prescritas\/sem/)).toBeInTheDocument();
 expect(screen.getByText(/Comparação e alertas indisponíveis/)).toBeInTheDocument();
 expect(screen.queryByText(/sub-treinado/)).not.toBeInTheDocument();
 if (reason === 'fractional basis') {
  expect(screen.getByText(/6 séries prescritas\/sem/)).toBeInTheDocument();
  expect(screen.getByText(/Distribuição executada indisponível para este grupo/)).toBeInTheDocument();
 }
});
it('does not remap a historical snapshot group when the current exercise changes', async () => {
 currentPrescription(); mock.workouts[0].exercises[0].muscle_group = 'Peitoral';
 mock.workouts[0].exercises[0].exercise_name = 'Supino';
 render(<WorkoutAnalysis studentId="a" companyId="company-a" />);
 await screen.findByText(/12 séries prescritas\/sem/);
 expect(screen.getByText('Quadríceps')).toBeInTheDocument();
 expect(screen.getByText('Peitoral')).toBeInTheDocument();
 expect(screen.getByText(/Comparação e alertas indisponíveis/)).toBeInTheDocument();
});

it('rejects foreign session rows even if a backend mock ignores query filters', async () => {
 currentPrescription(); (mock.rows[0] as any).student_id = 'foreign-student';
 render(<WorkoutAnalysis studentId="a" companyId="company-a" />);
 expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar');
 expect(screen.queryByText('250kg')).not.toBeInTheDocument();
});
it('accepts a legacy null-company session only after validating the student company', async () => {
 currentPrescription(); (mock.rows[0] as any).company_id = null;
 render(<WorkoutAnalysis studentId="a" companyId="company-a" />);
 expect(await screen.findByText('250kg')).toBeInTheDocument();
});
it('never attributes foreign nested snapshot metadata to the student distribution', async () => {
 currentPrescription();
 (mock.rows[0] as any).exercises_summary[0].company_id = 'foreign-company';
 (mock.rows[0] as any).exercises_summary[0].muscleGroup = 'Peitoral';
 render(<WorkoutAnalysis studentId="a" companyId="company-a" />);
 expect(await screen.findByText(/12 séries prescritas\/sem/)).toBeInTheDocument();
 expect(screen.queryByText('Peitoral')).not.toBeInTheDocument();
 expect(screen.getByText(/Comparação e alertas indisponíveis/)).toBeInTheDocument();
});

function weeklyPrescription() {
 currentPrescription();
 Object.assign(mock.cycles[0], { start_date: '2026-10-20', end_date: '2026-12-01', duration_weeks: 6 });
 Object.assign(mock.workouts[0].exercises[0], { sets: '2', weekly_prescription: [2, 3, 5, 7, 7, 3].map((sets, index) => ({
  week: index + 1, block: 'base', sets, reps: '10', rir: '2', rest_seconds: 60, tempo: '2020',
 })) });
}
it('uses week three sets rather than persisted first-week base and never mutates persisted rows', async () => {
 weeklyPrescription(); const before = JSON.stringify({ cycles: mock.cycles, workouts: mock.workouts });
 render(<WorkoutAnalysis studentId="a" companyId="company-a" />);
 expect(await screen.findByText(/5 séries prescritas\/sem/)).toBeInTheDocument();
 expect(screen.queryByText(/2 séries prescritas\/sem/)).not.toBeInTheDocument();
 expect(screen.getByText(/semana 3/)).toBeInTheDocument();
 expect(JSON.stringify({ cycles: mock.cycles, workouts: mock.workouts })).toBe(before);
});
it('refreshes the current prescribed volume when the business week changes', async () => {
 weeklyPrescription();
 const view = render(<WorkoutAnalysis studentId="a" companyId="company-a" />);
 await screen.findByText(/5 séries prescritas\/sem/); view.unmount();
 mock.today = '2026-11-10';
 render(<WorkoutAnalysis studentId="a" companyId="company-a" />);
 expect(await screen.findByText(/7 séries prescritas\/sem/)).toBeInTheDocument();
 expect(screen.getByText(/semana 4/)).toBeInTheDocument();
});
it('leaves legacy sets unchanged across business weeks', async () => {
 currentPrescription(); mock.workouts[0].exercises[0].sets = '3';
 const before = JSON.stringify(mock.workouts);
 const view = render(<WorkoutAnalysis studentId="a" companyId="company-a" />);
 await screen.findByText(/3 séries prescritas\/sem/); view.unmount(); mock.today = '2026-11-10';
 render(<WorkoutAnalysis studentId="a" companyId="company-a" />);
 expect(await screen.findByText(/3 séries prescritas\/sem/)).toBeInTheDocument();
 expect(JSON.stringify(mock.workouts)).toBe(before);
});
it('does not compare a multi-week historical window to only the current weekly prescription', async () => {
 weeklyPrescription();
 Object.assign(mock.cycles[0], { start_date: '2026-09-15', end_date: '2026-12-08', duration_weeks: 12 });
 mock.workouts[0].exercises[0].weekly_prescription = Array.from({ length: 12 }, (_, index) => ({
  week: index + 1, block: 'base', sets: index < 4 ? 2 : 5, reps: '10', rir: '2', rest_seconds: 60, tempo: '2020',
 }));
 Object.assign(mock.rows[0], { session_date: '2026-11-02', total_sets_prescribed: 5 });
 render(<WorkoutAnalysis studentId="a" companyId="company-a" />);
 expect(await screen.findByText(/5 séries prescritas\/sem/)).toBeInTheDocument();
 expect(screen.getByText(/semana 8/)).toBeInTheDocument();
 expect(screen.getByText(/Comparação e alertas indisponíveis/)).toBeInTheDocument();
 expect(screen.queryByText(/sub-treinado/)).not.toBeInTheDocument();
});

it('resolves and labels a mixed legacy/weekly cycle without replacing legacy parameters', async () => {
 weeklyPrescription(); const weekly = mock.workouts[0];
 mock.workouts.unshift({ ...weekly, id: 'legacy-b', exercises: [{ ...weekly.exercises[0], exercise_id: 'legacy-ex', sets: '3', weekly_prescription: undefined }] });
 const before = JSON.stringify(mock.workouts);
 render(<WorkoutAnalysis studentId="a" companyId="company-a" />);
 expect(await screen.findByText(/8 séries prescritas\/sem/)).toBeInTheDocument();
 expect(screen.getByText(/semana 3/)).toBeInTheDocument();
 expect(JSON.stringify(mock.workouts)).toBe(before);
});

it('preserves a null-company legacy workout only under the already validated cycle', async () => {
 currentPrescription(); mock.workouts[0].company_id = null;
 render(<WorkoutAnalysis studentId="a" companyId="company-a" />);
 expect(await screen.findByText(/12 séries prescritas\/sem/)).toBeInTheDocument();
 expect(screen.queryByText(/Prescrição atual indisponível/)).not.toBeInTheDocument();
});
