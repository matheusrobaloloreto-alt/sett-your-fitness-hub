import { describe, expect, it } from 'vitest';
import { DEFAULT_PLATFORM_CONTENT, platformContentSchema, landingContentSchema } from './platformContent';
import { companyContentDocumentSchema, DEFAULT_COMPANY_BRAND, newCompanyPost } from './companyContent';

describe('governed content contracts', () => {
  it('accepts safe CMS defaults and rejects executable links, unknown layout and unbounded XP', () => {
    expect(platformContentSchema.parse(DEFAULT_PLATFORM_CONTENT).cms.hero_title).toBeTruthy();
    expect(landingContentSchema.safeParse({ ...DEFAULT_PLATFORM_CONTENT.cms, support_url: 'javascript:alert(1)' }).success).toBe(false);
    expect(landingContentSchema.safeParse({ ...DEFAULT_PLATFORM_CONTENT.cms, layout: 'script' }).success).toBe(false);
    expect(platformContentSchema.safeParse({ ...DEFAULT_PLATFORM_CONTENT, experience: { ...DEFAULT_PLATFORM_CONTENT.experience, xp_workout: 10001 } }).success).toBe(false);
  });
  it('rejects unknown fields and invalid achievement criteria', () => {
    expect(platformContentSchema.safeParse({ ...DEFAULT_PLATFORM_CONTENT, injected: true }).success).toBe(false);
    expect(platformContentSchema.safeParse({ ...DEFAULT_PLATFORM_CONTENT, achievements: [{ ...DEFAULT_PLATFORM_CONTENT.achievements[0], criteria_type: 'paid' }] }).success).toBe(false);
  });
  it('uses a company identity without inheriting BN and bounds manual export content', () => {
    const doc = { brand: { ...DEFAULT_COMPANY_BRAND, name: 'Empresa Sintética' }, posts: [newCompanyPost()] };
    expect(companyContentDocumentSchema.parse(doc).brand.name).toBe('Empresa Sintética');
    expect(companyContentDocumentSchema.safeParse({ ...doc, posts: [{ ...doc.posts[0], title: '' }] }).success).toBe(false);
    expect(companyContentDocumentSchema.safeParse({ ...doc, brand: { ...doc.brand, navy: 'url(secret)' } }).success).toBe(false);
  });
});
