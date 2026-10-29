import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ pain: false, open: vi.fn(), plans: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ companyId: 'company-a', role: 'admin' }) }));
vi.mock('@/contexts/MasterContext', () => ({ useMaster: () => ({ isViewingCompany: false }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/components/AthleticClubStar', () => ({ AthleticClubStar: () => null }));
vi.mock('@/lib/studentChat', () => ({ openStudentChat: mocks.open, createPlansLink: mocks.plans }));
vi.mock('@/hooks/useCompanyExperiencePolicy', async () => {
  const { DEFAULT_COMPANY_PRODUCT_SETTINGS } = await import('../../../supabase/functions/_shared/company-product-settings');
  return { useCompanyExperiencePolicy: () => ({ policy: DEFAULT_COMPANY_PRODUCT_SETTINGS.experience, error: null }) };
});
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: (table: string) => {
    const days = (count: number) => new Date(Date.now() + count * 86400000).toISOString();
    const data = () => ({
      students: [{ id: 'student-a', full_name: 'Synthetic Student', status: 'active' }],
      payments: [], workout_sessions: [{ student_id: 'student-a', completed_at: days(-1) }],
      whatsapp_chats: [{ id: 'chat-a', student_id: 'student-a' }],
      training_cycles: [{ student_id: 'student-a', end_date: days(5).slice(0, 10), status: 'active' }],
      student_body_limitations: mocks.pain ? [{ student_id: 'student-a', region: 'Synthetic', severity: 'moderada' }] : [],
      functional_assessments: [],
    } as Record<string, unknown[]>)[table] ?? [];
    const query = { select: () => query, neq: () => query, eq: () => query, in: () => query, not: () => query, order: () => query,
      then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: data(), error: null }).then(resolve) };
    return query;
  },
} }));
import { AtRiskStudents } from './AtRiskStudents';
beforeEach(() => { mocks.pain = false; mocks.open.mockReset().mockResolvedValue(undefined); mocks.plans.mockReset().mockResolvedValue('https://example.invalid/payment'); });
afterEach(cleanup);
it('passes the company renewal event and canonical values to the draft helper', async () => {
  render(<AtRiskStudents />);
  fireEvent.click(await screen.findByRole('button', { name: 'Abrir conversa interna com Synthetic Student' }));
  await waitFor(() => expect(mocks.open).toHaveBeenCalled());
  expect(mocks.open).toHaveBeenCalledWith(expect.objectContaining({
    companyId: 'company-a', messageEvent: 'renewal_due', studentId: 'student-a',
    messageValues: { nome: 'Synthetic Student', primeiro_nome: 'Synthetic', link: 'https://example.invalid/payment', prazo: '5' },
  }));
});
it('preserves the clinical pain draft instead of replacing it with a renewal event', async () => {
  mocks.pain = true;
  render(<AtRiskStudents />);
  fireEvent.click(await screen.findByRole('button', { name: 'Abrir conversa interna com Synthetic Student' }));
  await waitFor(() => expect(mocks.open).toHaveBeenCalled());
  expect(mocks.open.mock.calls[0][0].messageEvent).toBeUndefined();
  expect(mocks.open.mock.calls[0][0].message).toContain('dor');
  expect(mocks.plans).not.toHaveBeenCalled();
});
