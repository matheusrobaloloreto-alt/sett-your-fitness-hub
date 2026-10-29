import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), save: vi.fn(), readError: null as { message: string } | null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
vi.mock('@/lib/gamification', async () => ({ ...await vi.importActual('@/lib/gamification'), saveCompanyAchievement: mocks.save }));
import CompanyAchievements from './CompanyAchievements';

beforeEach(() => {
  mocks.readError = null; mocks.save.mockReset();
  mocks.from.mockImplementation(() => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: mocks.readError }) }) }) }));
});
afterEach(cleanup);
async function draft() {
  fireEvent.click(await screen.findByRole('button', { name: 'Nova conquista' }));
  fireEvent.change(screen.getByLabelText('Codigo'), { target: { value: 'sessions_5' } });
  fireEvent.change(screen.getByLabelText('Titulo'), { target: { value: 'Cinco treinos' } });
}
describe('company achievement editor', () => {
  it('allows only one save while an RPC is pending, even within one event batch', async () => {
    let finish!: (value: unknown) => void;
    mocks.save.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<CompanyAchievements companyId="company-a" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nova conquista' })).toBeEnabled());
    await draft();
    const button = screen.getByRole('button', { name: 'Salvar conquista' });
    act(() => { button.click(); button.click(); });
    expect(mocks.save).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ id: 'achievement' }); });
  });
  it('keeps editing unavailable when the list could not be read', async () => {
    mocks.readError = { message: 'Read unavailable' };
    render(<CompanyAchievements companyId="company-a" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Read unavailable');
    expect(screen.getByRole('button', { name: 'Nova conquista' })).toBeDisabled();
    expect(screen.queryByLabelText('Titulo')).not.toBeInTheDocument();
  });
  it('preserves the draft and exposes an unsuccessful save', async () => {
    mocks.save.mockRejectedValue({ message: 'Settings version conflict' });
    render(<CompanyAchievements companyId="company-a" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nova conquista' })).toBeEnabled());
    await draft();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar conquista' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Settings version conflict');
    expect(screen.getByLabelText('Titulo')).toHaveValue('Cinco treinos');
  });
});

it('offers help for every editable achievement field without saving or granting rewards', async () => {
  render(<CompanyAchievements companyId="company-a" />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Nova conquista' })).toBeEnabled());
  await draft();
  for (const label of ['Codigo', 'Titulo', 'Descricao', 'Criterio da conquista', 'Meta', 'Pontos', 'Ativa']) {
    const help = screen.getByRole('button', { name: `Sobre ${label}` });
    expect(help).toHaveAttribute('type', 'button');
    fireEvent.click(help);
    expect(screen.getByRole('tooltip')).toHaveTextContent('O que é:');
    expect(screen.getByRole('tooltip')).toHaveTextContent('O que muda:');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Efeito:');
    fireEvent.keyDown(help, { key: 'Escape' });
  }
  expect(mocks.save).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Codigo')).toHaveValue('sessions_5');
  expect(screen.getByLabelText('Titulo')).toHaveValue('Cinco treinos');
  fireEvent.click(screen.getByRole('button', { name: 'Sobre Meta' }));
  expect(screen.getByRole('tooltip')).toHaveTextContent('contagens existentes podem satisfazer');
  fireEvent.keyDown(screen.getByRole('button', { name: 'Sobre Meta' }), { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: 'Sobre Ativa' }));
  expect(screen.getByRole('tooltip')).toHaveTextContent('Conquistas obtidas e XP registrados permanecem preservados');
});
