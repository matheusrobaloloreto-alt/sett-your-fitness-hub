import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BnContentStudioCalendar } from './BnContentStudioCalendar';
vi.mock('@/lib/bnContentStudio', () => ({ generateBnContentCalendar: vi.fn() }));
vi.mock('@/lib/bnContentRenderer', () => ({ downloadBnContentBlob: vi.fn() }));
afterEach(cleanup);
it('presents civil dates without timezone conversion and keeps unknown values intact', () => {
  const calendar = { id: 'calendar', created_at: '2026-11-03T12:00:00Z', calendar: { date: '2026-11-03', layout_id: 'L1', future_field: 'future_code' } };
  render(<BnContentStudioCalendar calendars={[calendar] as never} available={false} onCreated={vi.fn()} />);
  expect(screen.getAllByText('03/11/2026').length).toBeGreaterThan(0);
  expect(screen.getByText('L1 · Educativo')).toBeInTheDocument();
  expect(screen.getByText('future_code')).toBeInTheDocument();
  expect(calendar.calendar.date).toBe('2026-11-03');
});
