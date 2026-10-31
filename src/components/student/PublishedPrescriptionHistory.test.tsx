import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('@/lib/studentPrescriptionHistory', () => ({ loadPublishedPrescriptions: mocks.load, prescriptionHistoryPageSize: 20 }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { PublishedPrescriptionHistory } from './PublishedPrescriptionHistory';
const props = { userId: 'user', studentId: 'student', companyId: 'company', today: '2026-10-30' };
const result = { prescriptions: [{ id: 'cycle', cycle_number: 1, start_date: '2026-09-01', end_date: '2026-10-01', enrollmentExpired: true, workouts: [{ id: 'workout', title: 'Treino publicado', exercises: [{ exercise_name: 'Agachamento', sets: 3, reps: 10, rest: 60 }] }] }], hasMore: false };
beforeEach(() => mocks.load.mockReset());
afterEach(cleanup);
describe('read-only published prescription public UI', () => {
 it('loads independently on demand and exposes full exercise metrics without session actions', async () => {
  mocks.load.mockResolvedValue(result);
  render(<PublishedPrescriptionHistory {...props} />);
  expect(mocks.load).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Consultar prescrições publicadas' }));
  expect(await screen.findByText('Treino publicado')).toBeInTheDocument();
  expect(screen.getByText('Agachamento')).toBeInTheDocument();
  expect(screen.getByText('Descanso:')).toBeInTheDocument();
  expect(screen.getByText(/renovação pendente/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /iniciar|salvar|registrar/i })).toBeNull();
 });
 it('renders dates, weekly metrics and series as student-facing text without technical payloads', async () => {
  const fixture = structuredClone(result);
  fixture.prescriptions[0].end_date = '2026-11-01';
  Object.assign(fixture.prescriptions[0].workouts[0].exercises[0], {
   tempo: '3010', set_types: ['warmup', 'normal', 'failure'],
   weekly_prescription: [{ week: 2, block: 'intensificacao', sets: 4, reps: '6–8', rest_seconds: 90, tempo: '4020', rir: '2', method: 'restpause', set_types: ['warmup', 'normal'], instruction: 'Mantenha a técnica', hidden_internal: { do_not_render: true } }],
  });
  mocks.load.mockResolvedValue(fixture);
  const view = render(<PublishedPrescriptionHistory {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar prescrições publicadas' }));
  expect(await screen.findByText('Ciclo 1 · 01/09/2026 a 01/11/2026')).toBeInTheDocument();
  expect(screen.getByText('Semana 2 · Intensificação')).toBeInTheDocument();
  expect(screen.getByText('3-0-1-0')).toBeInTheDocument();
  expect(screen.getByText('4-0-2-0')).toBeInTheDocument();
  expect(screen.getByText('90 s')).toBeInTheDocument();
  expect(screen.getAllByText('Série 1: Série de Aquecimento')).toHaveLength(2);
  expect(screen.getByText('Série 3: Série até a Falha')).toBeInTheDocument();
  expect(screen.getByText('Rest-pause')).toBeInTheDocument();
  expect(screen.getByText('Mantenha a técnica')).toBeInTheDocument();
  expect(screen.getByText('Matrícula vencida: renovação pendente.')).toBeInTheDocument();
  expect(screen.queryByText(/Período encerrado:/)).toBeNull();
  expect(view.baseElement.textContent).not.toMatch(/weekly_prescription|set_types|hidden_internal|do_not_render|\{\s*"/);
 });
 it('reports failure instead of empty history and retries', async () => {
  mocks.load.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ prescriptions: [], hasMore: false });
  render(<PublishedPrescriptionHistory {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar prescrições publicadas' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível');
  expect(screen.queryByText(/Nenhuma prescrição/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(await screen.findByText(/Nenhuma prescrição/)).toBeInTheDocument();
 });
 it('discards an obsolete user response', async () => {
  let finish!: (value: unknown) => void;
  mocks.load.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValue({ prescriptions: [], hasMore: false });
  const view = render(<PublishedPrescriptionHistory {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar prescrições publicadas' }));
  view.rerender(<PublishedPrescriptionHistory {...props} userId="other" studentId="other" />);
  await screen.findByText(/Nenhuma prescrição/);
  finish(result);
  expect(screen.queryByText('Treino publicado')).toBeNull();
 });
});
