import { renderBnContentSlide } from './bnContentRenderer';
import type { CompanyContentDocument, CompanyPost } from './companyContent';
import { loadCompanyMedia } from './companyContentMedia';

/** Shared by preview, PNG and ZIP. Required media errors always reject export. */
export async function renderCompanyContentSlide(companyId: string, post: CompanyPost, brand: CompanyContentDocument['brand'], index: number, isCurrent: () => boolean = () => true) {
  const urls: string[] = [];
  const slide = post.slides[index];
  if (!slide) throw new Error('Slide não encontrado.');
  try {
    let logoUrl: string | null = null;
    let backgroundUrl: string | undefined;
    if (brand.logo) { logoUrl = await loadCompanyMedia(brand.logo, companyId, 'logos', isCurrent); urls.push(logoUrl); }
    if (slide.image) { backgroundUrl = await loadCompanyMedia(slide.image, companyId, 'slides', isCurrent); urls.push(backgroundUrl); }
    if (!isCurrent()) throw new Error('Empresa alterada.');
    const blob = await renderBnContentSlide(post, index, { brand, logoUrl, backgroundUrl, companyMedia: true });
    if (!isCurrent()) throw new Error('Empresa alterada.');
    return blob;
  } finally { urls.forEach(url => URL.revokeObjectURL(url)); }
}
