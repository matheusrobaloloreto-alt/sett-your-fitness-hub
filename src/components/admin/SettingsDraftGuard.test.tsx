import { useState } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { runWithSettingsExitConfirmation, useSettingsDraft } from '@/lib/settingsDraftProtection';
import { SettingsDraftGuard } from './SettingsDraftGuard';

function Editor() {
  const [draft, setDraft] = useState('');
  const location = useLocation();
  useSettingsDraft(Boolean(draft));
  return <>
    <label>Rascunho<input value={draft} onChange={e => setDraft(e.target.value)} hidden={location.search === '?tab=hidden'} /></label>
    <Link to="?tab=hidden" replace>Outra aba</Link>
    <Link to="?tab=visible" replace>Mostrar editor</Link>
  </>;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

it('preserves a hidden draft on cancelled app exit and back; clean navigation resumes after discard', async () => {
  const signOut = vi.fn();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  window.history.replaceState(null, '', '/dashboard');
  render(<BrowserRouter>
    <Link to="/dashboard">Dashboard</Link>
    <Link to="/settings">Configurações</Link>
    <button onClick={() => runWithSettingsExitConfirmation(signOut)}>Sair</button>
    <Routes>
      <Route path="/dashboard" element={<h1>Visão geral</h1>} />
      <Route path="/settings" element={<SettingsDraftGuard><Editor /></SettingsDraftGuard>} />
    </Routes>
  </BrowserRouter>);
  fireEvent.click(screen.getByText('Configurações'));
  fireEvent.change(await screen.findByLabelText('Rascunho'), { target: { value: 'Em edição' } });
  fireEvent.click(screen.getByText('Outra aba'));
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Dashboard'));
  fireEvent.click(screen.getByText('Sair'));
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(signOut).not.toHaveBeenCalled();
  expect(location.pathname).toBe('/settings');

  window.history.back();
  await waitFor(() => expect(confirm).toHaveBeenCalledTimes(3));
  await waitFor(() => expect(location.href).toMatch(/settings\?tab=hidden$/));
  fireEvent.click(screen.getByText('Mostrar editor'));
  expect(screen.getByLabelText('Rascunho')).toHaveValue('Em edição');

  const reload = new Event('beforeunload', { cancelable: true });
  expect(window.dispatchEvent(reload)).toBe(false);
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByText('Dashboard'));
  expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeVisible();
  window.history.back();
  expect(await screen.findByLabelText('Rascunho')).toHaveValue('');
  fireEvent.click(screen.getByText('Dashboard'));
  expect(confirm).toHaveBeenCalledTimes(4);
});
