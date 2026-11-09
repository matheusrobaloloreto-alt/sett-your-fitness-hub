import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { fetchCompanyProductSettings, normalizeCompanyProductSettings } from '@/lib/companyProductSettings';
import { openStudentChat } from '@/lib/studentChat';
import { DashboardAlerts } from './DashboardAlerts';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ role: 'admin', companyId: 'company-a', user: { id: 'staff' } }) }));
vi.mock('@/contexts/MasterContext', () => ({ useMaster: () => ({ isViewingCompany: false }) }));
vi.mock('@/components/BnitoFloatingAssistant', () => ({ BnitoContextButton: () => null }));
vi.mock('@/components/AthleticClubStar', () => ({ AthleticClubStar: () => null }));
vi.mock('@/lib/businessDate', () => ({ businessDateYmd: () => '2026-11-09' }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const rows = table === 'students' ? [{ id: 'student-a', full_name: 'Ana Exemplo', birth_date: '2000-11-09' }] : [];
      return Object.assign(Promise.resolve({ data: rows, error: null }), {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
      });
    },
  },
}));
vi.mock('@/lib/companyProductSettings', async original => ({
  ...await original<typeof import('@/lib/companyProductSettings')>(),
  fetchCompanyProductSettings: vi.fn(),
}));
vi.mock('@/lib/studentChat', async original => ({
  ...await original<typeof import('@/lib/studentChat')>(),
  buildStudentChatMap: vi.fn(async () => ({ 'student-a': 'chat-a' })),
  openStudentChat: vi.fn(async () => {}),
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it.each([
  { scenario: 'configured', template: '{{nome}}, parabéns da {{empresa}}!', expected: 'Ana Exemplo, parabéns da Empresa A!' },
  { scenario: 'default', template: undefined, expected: 'Feliz aniversário, Ana! 🎉 Que esse novo ciclo venha cheio de saúde, energia e conquistas. Tamo junto pra você chegar nos seus objetivos. 💪' },
])('opens only the $scenario birthday draft in the selected company', async ({ template, expected }) => {
  vi.mocked(fetchCompanyProductSettings).mockResolvedValue({
    settings: normalizeCompanyProductSettings({
      brand: { company_name: 'Empresa A' },
      ...(template && { messages: { birthday: template } }),
    }),
    version: template ? 2 : 0,
  });
  const client = new QueryClient();
  render(<QueryClientProvider client={client}><MemoryRouter>
    <DashboardAlerts section="birthdays" trainerId="trainer-a" />
  </MemoryRouter></QueryClientProvider>);

  const button = await screen.findByRole('button', { name: 'Mensagem' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  expect(fetchCompanyProductSettings).toHaveBeenCalledExactlyOnceWith('company-a');
  expect(openStudentChat).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    companyId: 'company-a',
    chatId: 'chat-a',
    studentId: 'student-a',
    message: expected,
  }));
});
