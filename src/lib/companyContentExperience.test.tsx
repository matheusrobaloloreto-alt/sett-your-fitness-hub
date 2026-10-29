import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), settings: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/lib/companyProductSettings', () => ({ fetchCompanyProductSettings: mocks.settings }));
import { PlatformExperienceAdoption } from '@/components/content/PlatformExperienceAdoption';
import { DEFAULT_PLATFORM_CONTENT } from './platformContent';
const company = '11111111-1111-4111-8111-111111111111';
beforeEach(() => {
  mocks.rpc.mockReset(); mocks.settings.mockReset();
  mocks.settings.mockResolvedValue({ version: 4, settings: { experience: { xp_workout: 77 } } });
  mocks.rpc.mockImplementation(async name => ({ data: name === 'get_platform_experience_defaults' ? { version: 2, document: DEFAULT_PLATFORM_CONTENT } : { adopted: true, platform_version: 2, settings: { version: 5, settings: { experience: { xp_workout: 77 } } } }, error: null }));
});
afterEach(cleanup);
it('requires prospective confirmation, sends CAS only, then reads settings back', async () => {
  render(<PlatformExperienceAdoption companyId={company} />);
  await screen.findByText(/Versão 2:/);
  expect(screen.getByRole('button', { name: 'Adotar versão publicada' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Adotar versão publicada' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('77 XP por treino'));
  expect(mocks.rpc).toHaveBeenCalledWith('adopt_platform_experience_defaults', { _company_id: company, _platform_version: 2, _expected_settings_version: 4, _confirm: true });
  expect(mocks.settings).toHaveBeenCalledTimes(2);
});
it('preserves confirmation and reports a server conflict without claiming adoption', async () => {
  mocks.rpc.mockImplementation(async name => name === 'get_platform_experience_defaults' ? { data: { version: 2, document: DEFAULT_PLATFORM_CONTENT }, error: null } : { data: null, error: { code: 'PT409' } });
  render(<PlatformExperienceAdoption companyId={company} />); await screen.findByText(/Versão 2:/);
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Adotar versão publicada' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('A versão mudou'));
  expect(screen.getByRole('checkbox')).toBeChecked(); expect(mocks.settings).toHaveBeenCalledTimes(1);
});
