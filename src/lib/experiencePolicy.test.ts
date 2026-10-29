import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { cadenceTone } from './contactCadence';
import { deriveStudentStatus, riskReasons } from './studentStatus';
import { DEFAULT_COMPANY_PRODUCT_SETTINGS } from './companyProductSettings';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
import { awardCompanyXp, validateAchievement } from './gamification';

const policy = { ...DEFAULT_COMPANY_PRODUCT_SETTINGS.experience, cadence_warning_hours: 12, cadence_critical_hours: 48, risk_no_workout_days: 5, renewal_notice_days: 14 };
const active = { hasAnamnesis: true, hasAssessment: true, hasActiveWorkout: true };
describe('company experience consumers', () => {
  it('uses per-company cadence boundaries and retains legacy defaults', () => {
    expect(cadenceTone(13, policy)).toBe('warn');
    expect(cadenceTone(49, policy)).toBe('late');
    expect(cadenceTone(13)).toBe('ok');
    expect(cadenceTone(49)).toBe('warn');
  });
  it('uses risk/renewal thresholds without overriding clinical or inactive signals', () => {
    expect(deriveStudentStatus({ ...active, daysSinceLastTraining: 5 }, policy)).toBe('risco');
    expect(deriveStudentStatus({ ...active, cycleEndsInDays: 13 }, policy)).toBe('renovacao');
    expect(deriveStudentStatus({ ...active, baseStatus: 'inactive', daysSinceLastTraining: 20 }, policy)).toBe('inativo');
    expect(riskReasons({ ...active, daysSinceLastTraining: 5, cycleEndsInDays: 13 }, policy)).toEqual(['Sem treinar há 5 dias', 'Ciclo vence em 13 dias']);
  });
  it('sends event evidence, never a client XP amount, and propagates RPC errors', async () => {
    rpc.mockResolvedValue({ data: 'event-id', error: null });
    expect(await awardCompanyXp('student', 'workout', 'session')).toBe('event-id');
    expect(rpc).toHaveBeenLastCalledWith('award_company_xp', { _student_id: 'student', _event_type: 'workout', _source_id: 'session' });
    rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    await expect(awardCompanyXp('other', 'workout', 'session')).rejects.toMatchObject({ code: '42501' });
  });
  it('restricts achievement criteria and rewards before sending', () => {
    const a = { code: 'sessions_5', title: 'Cinco treinos', description: '', criteria_type: 'workouts_total', criteria_value: 5, xp_reward: 75, is_active: true };
    expect(validateAchievement(a)).toEqual(a);
    for (const change of [{ criteria_type: 'sql' }, { criteria_value: 0 }, { xp_reward: 10001 }, { title: '' }]) {
      expect(() => validateAchievement({ ...a, ...change })).toThrow();
    }
  });
  it('migration uses authoritative event evidence, tenant checks, history and readonly awards', () => {
    const sql = readFileSync('supabase/migrations/20261026093918_company_experience_gamification.sql', 'utf8');
    for (const key of ['award_company_xp', 'xp_workout', 'xp_external_activity', 'weekly_consistency_xp', 'gamification_enabled', 'workout_sessions', 'external_activities', '42501', 'on conflict do nothing', 'save_company_achievement', 'company_achievement_history']) expect(sql).toContain(key);
    expect(sql).not.toMatch(/(?:update|delete from)\s+public\.(?:xp_events|student_achievements)\b/i);
  });
});
