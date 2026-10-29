import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
const copy = (max: number) => z.string().trim().min(1).max(max);
export const landingContentSchema = z.object({
  hero_title: copy(180), hero_body: copy(1200), trainer_cta: copy(60), student_cta: copy(60),
  footer_manifesto: copy(500), footer_description: copy(500), footer_edition: copy(100),
  support_url: z.union([z.literal(''), z.string().max(500).url().refine(v => v.startsWith('https://'))]),
  support_label: copy(60), layout: z.enum(['editorial', 'compact']), show_differentials: z.boolean(),
}).strict();
export const platformAchievementSchema = z.object({
  code: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/), title: copy(120), description: z.string().max(1000),
  criteria_type: z.enum(['workouts_total', 'external_total', 'cycles_completed']),
  criteria_value: z.number().int().min(1).max(10000), xp_reward: z.number().int().min(0).max(10000), is_active: z.boolean(),
}).strict();
export const platformContentSchema = z.object({
  cms: landingContentSchema,
  experience: z.object({ xp_workout: z.number().int().min(0).max(10000), xp_external_activity: z.number().int().min(0).max(10000), weekly_consistency_xp: z.number().int().min(0).max(10000), gamification_enabled: z.boolean() }).strict(),
  achievements: z.array(platformAchievementSchema).max(20),
}).strict().refine(v => new Set(v.achievements.map(a => a.code)).size === v.achievements.length, 'Códigos de conquistas duplicados.');
export type LandingContent = Required<z.infer<typeof landingContentSchema>>;
export interface PlatformContent { cms: LandingContent; experience: { xp_workout: number; xp_external_activity: number; weekly_consistency_xp: number; gamification_enabled: boolean }; achievements: Array<Required<z.infer<typeof platformAchievementSchema>>> }
export const DEFAULT_PLATFORM_CONTENT: PlatformContent = {
  cms: { hero_title: 'Treino é ciência. O resto é planilha.', hero_body: 'O Set existe para devolver ao treinador o que sempre foi dele: o controle exato do estresse mecânico aplicado em cada grupamento muscular. Onde a maioria oferece app de treino, entregamos sistema de prescrição.', trainer_cta: 'Sou Treinador', student_cta: 'Sou Aluno', footer_manifesto: 'Volume é verdade.\nCarga é compromisso.\nProgressão é prova.', footer_description: 'A plataforma onde o treino vira dado. Construído para o treinador sério.', footer_edition: 'Edição Primeira / v1.0', support_url: '', support_label: 'Suporte', layout: 'editorial', show_differentials: true },
  experience: { xp_workout: 50, xp_external_activity: 30, weekly_consistency_xp: 100, gamification_enabled: true },
  achievements: [{ code: 'primeiro_treino', title: 'Primeiro treino', description: 'Conclua um treino após a adoção destes padrões.', criteria_type: 'workouts_total', criteria_value: 1, xp_reward: 50, is_active: true }],
};
const stateSchema = z.object({ version: z.number().int().nonnegative(), published_version: z.number().int().nonnegative(), document: platformContentSchema });
export interface PlatformContentState { version: number; published_version: number; document: PlatformContent }
type Rpc = (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
export async function contentRpc(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await (supabase.rpc as unknown as Rpc)(name, args);
  if (error) throw new Error(error.code === 'PT409' ? 'A versão mudou. Sua edição foi preservada; recarregue antes de salvar.' : error.message || 'Não foi possível acessar o conteúdo.');
  return data;
}
export async function fetchPlatformContent() { return stateSchema.parse(await contentRpc('get_platform_content_editor')) as PlatformContentState; }
export async function savePlatformContent(document: PlatformContent, version: number, publish: boolean) {
  const result = stateSchema.parse(await contentRpc('save_platform_content', { _document: platformContentSchema.parse(document), _expected_version: version, _publish: publish })) as PlatformContentState;
  if (result.version !== version + 1) throw new Error('Versão de conteúdo não confirmada.');
  return result;
}
export async function fetchPublicPlatformContent() {
  const value = await contentRpc('get_public_platform_content');
  return value == null ? DEFAULT_PLATFORM_CONTENT.cms : landingContentSchema.parse(value) as LandingContent;
}
export async function fetchPlatformExperienceDefaults(companyId: string) {
  return z.object({ version: z.number().int().positive(), document: platformContentSchema }).parse(await contentRpc('get_platform_experience_defaults', { _company_id: companyId })) as { version: number; document: PlatformContent };
}
