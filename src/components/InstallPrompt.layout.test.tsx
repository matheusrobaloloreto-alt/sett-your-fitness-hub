import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { InstallPrompt } from './InstallPrompt';
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
it('yields to the chat and releases its footprint when dismissed or unmounted', () => {
  vi.useFakeTimers();
  vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Android');
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 140 } as DOMRect);
  const view = render(<MemoryRouter><InstallPrompt /></MemoryRouter>);
  act(() => { vi.advanceTimersByTime(2500); });
  expect(screen.getByRole('dialog', { name: 'Instalar o app' })).toBeInTheDocument();
  expect(document.documentElement.style.getPropertyValue('--sett-install-height')).toBe('140px');
  act(() => { window.dispatchEvent(new CustomEvent('sett:chat-layout', { detail: { open: true } })); });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.documentElement.style.getPropertyValue('--sett-install-height')).toBe('0px');
  act(() => { window.dispatchEvent(new CustomEvent('sett:chat-layout', { detail: { open: false } })); });
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  view.unmount();
  expect(document.documentElement.style.getPropertyValue('--sett-install-height')).toBe('');
});

it.each([
  '/cadastro/bn-performance-training',
  '/CADASTRO/bn-performance-training/',
  '/c%61dastro/bn-performance-training',
  '/cadastro',
  '/inscricao',
  '/inscricao/bn-performance-training',
  '/cadastro-fiscal/test-token',
  '/anamnese',
  '/anamnese/test-student',
  '/anamnese-convite/test-token',
  '/anamnese-interciclos/test-token',
  '/pagamento/test-token?source=renewal',
])('keeps the iPhone install banner off %s', (path) => {
  vi.useFakeTimers();
  vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('iPhone');

  render(<MemoryRouter initialEntries={[path]}><InstallPrompt /></MemoryRouter>);
  act(() => { vi.advanceTimersByTime(2500); });

  expect(screen.queryByRole('dialog', { name: 'Instalar o app' })).not.toBeInTheDocument();
});

it('hides a visible iPhone banner on navigation to pre-registration and restores it in the app', () => {
  vi.useFakeTimers();
  vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('iPhone');
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 140 } as DOMRect);

  render(
    <MemoryRouter initialEntries={['/aluno']}>
      <InstallPrompt />
      <Link to="/cadastro/bn-performance-training">Pré-cadastro</Link>
      <Link to="/aluno">App</Link>
    </MemoryRouter>,
  );
  act(() => { vi.advanceTimersByTime(2500); });
  expect(screen.getByRole('dialog', { name: 'Instalar o app' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('link', { name: 'Pré-cadastro' }));
  expect(screen.queryByRole('dialog', { name: 'Instalar o app' })).not.toBeInTheDocument();
  expect(document.documentElement.style.getPropertyValue('--sett-install-height')).toBe('0px');

  fireEvent.click(screen.getByRole('link', { name: 'App' }));
  expect(screen.getByRole('dialog', { name: 'Instalar o app' })).toBeInTheDocument();
  expect(document.documentElement.style.getPropertyValue('--sett-install-height')).toBe('140px');
});
