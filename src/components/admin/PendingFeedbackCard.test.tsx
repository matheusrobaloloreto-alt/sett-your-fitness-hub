import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PendingFeedbackCard } from './PendingFeedbackCard';

const api = vi.hoisted(() => ({ failRead: false, failWrite: false, failNames: false,
  reads: [] as string[], writes: [] as string[][],
  readHook: null as null | ((table: string, filters: string[]) => Promise<unknown>),
  writeHook: null as null | (() => Promise<unknown>),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
  let write = false; const filters: string[] = [];
  const q: Record<string, unknown> = {};
  for (const method of ['select', 'order', 'limit']) q[method] = () => q;
  q.eq = (key: string, value: string) => { filters.push(`${key}:${value}`); return q; };
  q.in = () => q;
  q.update = () => { write = true; return q; };
  q.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
    if (write) api.writes.push(filters);
    else api.reads.push(table);
    if (write && api.writeHook) return api.writeHook().then(resolve, reject);
    if (!write && api.readHook) return api.readHook(table, filters).then(resolve, reject);
    return Promise.resolve(resolve({ data: write ? (api.failWrite ? [] : [{ id: 'feedback-1' }])
      : table === 'students' ? [{ id: 'student-1', full_name: 'Pessoa teste' }]
      : [{ id: 'feedback-1', student_id: 'student-1', nps: 8, created_at: '2026-11-01T12:00:00Z' }],
      error: (!write && (api.failRead || (table === 'students' && api.failNames))) || (write && api.failWrite) ? { message: 'offline' } : null }));
  };
  return q;
} } }));
beforeEach(() => { api.failRead = false; api.failWrite = false; api.failNames = false; api.writes = []; api.reads = []; api.readHook = null; api.writeHook = null; });
afterEach(cleanup);
const mount = (companyId: string | null = 'company-a') => render(<MemoryRouter><PendingFeedbackCard companyId={companyId} /></MemoryRouter>);

describe('pending cycle feedback reads and review', () => {
  it('shows read failure instead of an empty queue and can retry', async () => {
    api.failRead = true; mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Não foi possível/);
    expect(screen.queryByText(/Nenhum feedback aguardando/)).not.toBeInTheDocument();
    api.failRead = false; fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Pessoa teste')).toBeInTheDocument();
  });
  it('keeps a feedback pending when its review was not confirmed', async () => {
    api.failWrite = true; mount(); await screen.findByText('Pessoa teste');
    fireEvent.click(screen.getByRole('button', { name: 'Revisado' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/revisão/);
    expect(screen.getByText('Pessoa teste')).toBeInTheDocument();
  });
  it('scopes a review to its company and removes it only after ACK', async () => {
    mount(); await screen.findByText('Pessoa teste');
    fireEvent.click(screen.getByRole('button', { name: 'Revisado' }));
    await waitFor(() => expect(screen.queryByText('Pessoa teste')).not.toBeInTheDocument());
    expect(api.writes[0]).toContain('company_id:company-a');
  });
  it('does not run an unscoped query without a company', async () => {
    mount(null); await act(async () => {});
    expect(screen.queryByText('Pessoa teste')).not.toBeInTheDocument();
    expect(screen.getByText(/Selecione uma empresa/)).toBeInTheDocument();
    expect(api.reads).toEqual([]);
  });
  it('reports names enrichment failure without claiming an empty queue', async () => {
    api.failNames = true; mount();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/Nenhum feedback aguardando/)).not.toBeInTheDocument();
  });
  it('read-only mode performs no reads or mutations', async () => {
    render(<MemoryRouter><PendingFeedbackCard companyId="company-a" readOnly /></MemoryRouter>);
    await act(async () => {});
    expect(api.reads).toEqual([]); expect(api.writes).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Revisado' })).not.toBeInTheDocument();
  });
  it('ignores a review failure that arrives after switching company', async () => {
    let finish!: (value: unknown) => void;
    api.writeHook = () => new Promise(resolve => { finish = resolve; });
    const view = mount(); await screen.findByText('Pessoa teste');
    fireEvent.click(screen.getByRole('button', { name: 'Revisado' }));
    await waitFor(() => expect(api.writes).toHaveLength(1));
    view.rerender(<MemoryRouter><PendingFeedbackCard companyId="company-b" /></MemoryRouter>);
    await screen.findByText('Pessoa teste');
    await act(async () => finish({ data: null, error: { message: 'late error from A' } }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Pessoa teste')).toBeInTheDocument();
  });
  it('ignores an earlier company read when the new company has no feedbacks', async () => {
    let finish!: (value: unknown) => void;
    api.readHook = (table, filters) => table === 'cycle_feedback' && filters.includes('company_id:company-a')
      ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ data: [], error: null });
    const view = mount();
    await waitFor(() => expect(api.reads).toContain('cycle_feedback'));
    view.rerender(<MemoryRouter><PendingFeedbackCard companyId="company-b" /></MemoryRouter>);
    await screen.findByText(/Nenhum feedback aguardando/);
    await act(async () => finish({ data: [{ id: 'old', student_id: 'old-student' }], error: null }));
    expect(screen.getByText(/Nenhum feedback aguardando/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revisado' })).not.toBeInTheDocument();
  });
});
