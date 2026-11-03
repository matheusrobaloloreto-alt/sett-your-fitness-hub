import type { PropsWithChildren } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ company: 'company-a', read: vi.fn(), toast: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ role: 'admin', companyId: mock.company, session: { user: { id: 'admin' } } }) }));
vi.mock('@/contexts/MasterContext', () => ({ useMaster: () => ({ viewingCompany: null, isViewingCompany: false }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mock.toast }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useSearchParams: () => [new URLSearchParams()] }));
vi.mock('@/components/BnitoFloatingAssistant', () => ({ BnitoContextButton: () => null }));
vi.mock('@/components/admin/StudentChatButton', () => ({ StudentChatButton: () => null }));
vi.mock('@/components/AthleticClubStar', () => ({ AthleticClubStar: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
 rpc: async () => ({ data: [], error: null }),
 from: (table: string) => {
  const filters: Record<string, unknown> = {}; let selection = '';
  const query: any = { select: (value: string) => { selection = value; return query; },
   eq: (key: string, value: unknown) => { filters[key] = value; return query; },
   in: (key: string, value: unknown) => { filters[key] = value; return query; }, order: () => query,
   then: (resolve: any, reject: any) => Promise.resolve(mock.read(table, filters, selection)).then(resolve, reject) };
  return query;
 }
} }));
// Loader tests exercise the mounted page, not Radix's portal/positioning lifecycle.
vi.mock('@/components/ui/select', () => ({
 Select: ({ children }: PropsWithChildren) => <div>{children}</div>,
 SelectTrigger: ({ children }: PropsWithChildren) => <div>{children}</div>,
 SelectContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
 SelectItem: ({ children }: PropsWithChildren) => <span>{children}</span>,
 SelectValue: () => null,
}));
import StudentsManager from './StudentsManager';
const student = (company: string) => ({ id: `student-${company}`, company_id: company, full_name: `Aluno ${company}`, email: 'fixture@example.invalid', status: 'active', selected_plan_id: 'chosen', created_at: '2026-01-01', user_id: 'user', assigned_trainer_id: null });
function response(table: string, filters: Record<string, unknown>, selection: string) {
 const company = String(filters.company_id || String((filters.student_id as string[])?.[0] || '').replace('student-', ''));
 if (table === 'students') return { data: [student(company)], error: null };
 if (table === 'enrollments') return { data: [{ id: `e-${company}`, student_id: `student-${company}`, company_id: company, status: 'active', start_date: '2020-01-01', end_date: '2030-01-01', plan_id: 'contracted' }], error: null };
 if (table === 'plans') return { data: selection === 'id, name' ? [{ id: 'contracted', name: `Contrato ${company}` }] : [{ id: 'chosen', name: 'Influenciador(a)', plan_kind: 'influencer', duration_weeks: 6 }], error: null };
 return { data: [], error: null };
}
function deferred() { let resolve!: (value: unknown) => void; const promise = new Promise(value => { resolve = value; }); return { resolve, promise }; }
beforeEach(() => { mock.company = 'company-a'; mock.read.mockReset().mockImplementation(response); });
afterEach(cleanup);
it.each(['students', 'plan metadata'])('ignores delayed A %s after B is displayed', async phase => {
 const pending = deferred();
 mock.read.mockImplementation((table, filters, selection) => {
  if (filters.company_id === 'company-a' && (phase === 'students' ? table === 'students' : table === 'plans' && selection === 'id, name')) return pending.promise;
  return response(table, filters, selection);
 });
 const view = render(<StudentsManager />);
 await waitFor(() => expect(mock.read).toHaveBeenCalledWith(phase === 'students' ? 'students' : 'plans', expect.objectContaining({ company_id: 'company-a' }), phase === 'students' ? '*' : 'id, name'));
 mock.company = 'company-b'; view.rerender(<StudentsManager />);
 await screen.findByRole('button', { name: 'Aluno company-b' });
 await act(async () => { pending.resolve(response(phase === 'students' ? 'students' : 'plans', { company_id: 'company-a' }, phase === 'students' ? '*' : 'id, name')); });
 expect(screen.queryByRole('button', { name: 'Aluno company-a' })).not.toBeInTheDocument();
 expect(screen.getByText('Plano contratado vigente: Contrato company-b')).toBeInTheDocument();
});
it.each(['error', 'absent'])('keeps the known contract when its plan metadata is %s', async mode => {
 mock.read.mockImplementation((table, filters, selection) => table === 'plans' && selection === 'id, name'
  ? { data: [], error: mode === 'error' ? { message: 'metadata unavailable' } : null } : response(table, filters, selection));
 render(<StudentsManager />);
 expect(await screen.findByText('Plano contratado vigente: nome indisponível')).toBeInTheDocument();
 expect(screen.queryByText('Sem plano contratado vigente')).not.toBeInTheDocument();
});
it('shows an enrollment read failure instead of declaring absence of contract', async () => {
 mock.read.mockImplementation((table, filters, selection) => table === 'enrollments'
  ? { data: null, error: { message: 'enrollment unavailable' } } : response(table, filters, selection));
 render(<StudentsManager />);
 expect(await screen.findByText('Contrato indisponível: falha de leitura')).toBeInTheDocument();
 expect(screen.queryByText('Sem plano contratado vigente')).not.toBeInTheDocument();
});

it.each([null, '', '   '])('preserves the current enrollment without inventing a plan or sending invalid UUID metadata (%j)', async planId => {
 mock.read.mockImplementation((table, filters, selection) => {
  const result = response(table, filters, selection);
  if (table === 'enrollments') return { data: result.data.map(row => ({ ...row, plan_id: planId })), error: null };
  if (table === 'plans' && selection === 'id, name') return { data: [], error: { message: 'invalid input syntax for type uuid' } };
  return result;
 });
 render(<StudentsManager />);
 expect(await screen.findByRole('button', { name: 'Aluno company-a' })).toBeInTheDocument();
 expect(screen.getByText('Matrícula vigente sem plano vinculado')).toBeInTheDocument();
 expect(screen.queryByText('Sem plano contratado vigente')).not.toBeInTheDocument();
 expect(screen.queryByText('Plano contratado vigente: nome indisponível')).not.toBeInTheDocument();
 expect(screen.queryByRole('alert')).not.toBeInTheDocument();
 expect(mock.read.mock.calls.filter(([table, , selection]) => table === 'plans' && selection === 'id, name')).toEqual([]);
});
