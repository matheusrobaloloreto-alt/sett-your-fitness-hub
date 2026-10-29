import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ enabled: false, rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/hooks/useStudentGamification', () => ({ useStudentGamification: () => ({ enabled: mocks.enabled, error: null }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
import { MonthlyLeaderboard } from './MonthlyLeaderboard';
import { AchievementsPanel } from './AchievementsPanel';
beforeEach(() => {
  mocks.enabled = false; mocks.rpc.mockReset(); mocks.from.mockReset();
  mocks.rpc.mockResolvedValue({ data: [{ top3: [{ display_name: 'Synthetic A.', xp: 75, rank: 1 }], caller: { rank: 1, xp: 75, total_participantes: 1 } }], error: null });
});
afterEach(cleanup);
describe('student gamification policy', () => {
  it('hides rankings and badges without requesting their data when disabled', async () => {
    const { container } = render(<><MonthlyLeaderboard companyId="a" /><AchievementsPanel studentId="s" /></>);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
  });
  it('shows the existing ranking when enabled and removes it immediately when disabled', async () => {
    mocks.enabled = true;
    const view = render(<MonthlyLeaderboard companyId="a" />);
    expect(await screen.findByText('Synthetic A.')).toBeInTheDocument();
    mocks.enabled = false; view.rerender(<MonthlyLeaderboard companyId="a" />);
    expect(screen.queryByText('Synthetic A.')).not.toBeInTheDocument();
  });
});
