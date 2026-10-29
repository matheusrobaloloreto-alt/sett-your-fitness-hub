import { z } from 'zod';
import { companyMediaSchema, assertCompanyMedia } from './companyContentMedia';
import { contentRpc } from './platformContent';
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const companyBrandSchema = z.object({ name: z.string().trim().min(1).max(80), handle: z.string().max(80), navy: color, ink: color, paper: color, sand: color,
  audience: z.string().max(500), voice: z.string().max(500), pillars: z.string().max(1000), logo: companyMediaSchema.optional() }).strict();
const slide = z.object({ role: z.enum(['capa', 'conteudo', 'cta']), title: z.string().trim().min(1).max(180), subtitle: z.string().max(300), body: z.string().max(1400), image: companyMediaSchema.optional() }).strict();
export const companyPostSchema = z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(120), scheduled_for: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]), status: z.enum(['draft', 'approved', 'archived']), format: z.enum(['carrossel', 'story']), aesthetic: z.enum(['l1_educativo', 'l2_feedback', 'l3_aviso', 'l4_evento_teaser']), slides: z.array(slide).min(1).max(20), caption: z.string().max(5000), hashtags: z.array(z.string().max(60)).max(30) }).strict().refine(p => p.status !== 'approved' || (!!p.caption.trim() && p.slides[0].role === 'capa' && p.slides[p.slides.length - 1].role === 'cta'), 'Aprovação exige capa, CTA e legenda.');
export const companyContentDocumentSchema = z.object({ brand: companyBrandSchema, posts: z.array(companyPostSchema).max(100) }).strict().refine(v => new Set(v.posts.map(p => p.id)).size === v.posts.length, 'Posts duplicados.');
export type CompanyPost = Required<Omit<z.infer<typeof companyPostSchema>, 'slides'>> & { slides: Array<Required<Omit<z.infer<typeof slide>, 'image'>> & { image?: z.infer<typeof companyMediaSchema> }> };
export interface CompanyContentDocument { brand: Required<Omit<z.infer<typeof companyBrandSchema>, 'logo'>> & { logo?: z.infer<typeof companyMediaSchema> }; posts: CompanyPost[] }
export const DEFAULT_COMPANY_BRAND: CompanyContentDocument['brand'] = { name: 'Minha empresa', handle: '', navy: '#0D1B3E', ink: '#111214', paper: '#F4F2ED', sand: '#C8A876', audience: '', voice: '', pillars: '' };
export function newCompanyPost(): CompanyPost { return { id: crypto.randomUUID(), title: 'Nova publicação', scheduled_for: '', status: 'draft', format: 'carrossel', aesthetic: 'l1_educativo', slides: [{ role: 'capa', title: 'Seu título', subtitle: '', body: '' }, { role: 'cta', title: 'Fale com nossa equipe', subtitle: '', body: '' }], caption: '', hashtags: [] }; }
const stateSchema = z.object({ company_id: z.string().uuid(), version: z.number().int().nonnegative(), document: companyContentDocumentSchema });
export interface CompanyContentState { company_id: string; version: number; document: CompanyContentDocument }
export function validateCompanyDocumentMedia(document: CompanyContentDocument, companyId: string) {
  if (document.brand.logo) assertCompanyMedia(document.brand.logo, companyId, 'logos');
  document.posts.forEach(post => post.slides.forEach(slide => { if (slide.image) assertCompanyMedia(slide.image, companyId, 'slides'); }));
}
function parseState(value: unknown, companyId: string) { const state = stateSchema.parse(value) as CompanyContentState; if (state.company_id !== companyId) throw new Error('Empresa divergente na resposta.'); validateCompanyDocumentMedia(state.document, companyId); return state; }
export async function fetchCompanyContent(companyId: string) { return parseState(await contentRpc('get_company_content', { _company_id: companyId }), companyId); }
export async function saveCompanyContent(companyId: string, document: CompanyContentDocument, version: number) {
  validateCompanyDocumentMedia(document, companyId);
  const saved = parseState(await contentRpc('save_company_content', { _company_id: companyId, _document: companyContentDocumentSchema.parse(document), _expected_version: version }), companyId);
  if (saved.version !== version + 1) throw new Error('Versão editorial não confirmada.');
  return saved;
}
export async function adoptPlatformExperience(companyId: string, platformVersion: number, settingsVersion: number) {
  const result = z.object({ adopted: z.literal(true), platform_version: z.number().int(), settings: z.object({ version: z.number().int(), settings: z.record(z.unknown()) }) }).parse(await contentRpc('adopt_platform_experience_defaults', { _company_id: companyId, _platform_version: platformVersion, _expected_settings_version: settingsVersion, _confirm: true }));
  if (result.platform_version !== platformVersion || result.settings.version !== settingsVersion + 1) throw new Error('Adoção não confirmada pelo servidor.');
  return result;
}
