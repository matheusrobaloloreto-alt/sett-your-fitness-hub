import { supabase } from '@/integrations/supabase/client';
export const ACHIEVEMENT_CRITERIA = ['workouts_total', 'external_total', 'cycles_completed'] as const;
export interface AchievementDefinition {
  code: string; title: string; description: string; criteria_type: string;
  criteria_value: number; xp_reward: number; is_active: boolean;
}
export interface CompanyAchievement extends AchievementDefinition { id: string; updated_at: string }
interface GamificationClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
}
const client = supabase as unknown as GamificationClient;
export async function fetchStudentAchievementCatalog(studentId: string): Promise<unknown[]> {
  const { data, error } = await client.rpc('get_student_achievement_catalog', { _student_id: studentId });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Catalogo de conquistas invalido.');
  return data;
}
export async function awardCompanyXp(studentId: string, event: 'workout' | 'external_activity', sourceId: string): Promise<string | null> {
  const { data, error } = await client.rpc('award_company_xp', { _student_id: studentId, _event_type: event, _source_id: sourceId });
  if (error) throw error;
  return data as string | null;
}
export function validateAchievement(input: AchievementDefinition): AchievementDefinition {
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(input.code) || !input.title.trim() || input.title.length > 120 || input.description.length > 1000
    || !(ACHIEVEMENT_CRITERIA as readonly string[]).includes(input.criteria_type)
    || !Number.isInteger(input.criteria_value) || input.criteria_value < 1 || input.criteria_value > 10000
    || !Number.isInteger(input.xp_reward) || input.xp_reward < 0 || input.xp_reward > 10000 || typeof input.is_active !== 'boolean') {
    throw new Error('Conquista invalida. Revise criterio, meta e pontos.');
  }
  return { ...input, title: input.title.trim() };
}
export async function saveCompanyAchievement(companyId: string, input: AchievementDefinition, existing?: Pick<CompanyAchievement, 'id' | 'updated_at'>): Promise<CompanyAchievement> {
  const definition = validateAchievement(input);
  const { data, error } = await client.rpc('save_company_achievement', {
    _company_id: companyId, _definition: definition, _achievement_id: existing?.id ?? null, _expected_updated_at: existing?.updated_at ?? null,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || !('id' in data)) throw new Error('Servidor nao confirmou a conquista.');
  return data as CompanyAchievement;
}
