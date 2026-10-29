import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ load: vi.fn(), render: vi.fn() }));
vi.mock('./companyContentMedia', async original => ({ ...await original<typeof import('./companyContentMedia')>(), loadCompanyMedia: mocks.load }));
vi.mock('./bnContentRenderer', () => ({ renderBnContentSlide: mocks.render }));
import { renderCompanyContentSlide } from './companyContentMediaRenderer';
import { DEFAULT_COMPANY_BRAND, newCompanyPost } from './companyContent';
const company = '11111111-1111-4111-8111-111111111111';
const image = { path: `${company}/slides/33333333-3333-4333-8333-333333333333.png`, mime: 'image/png' as const, bytes: 100, width: 64, height: 64 };
beforeEach(() => { vi.clearAllMocks(); mocks.load.mockImplementation(async asset => `blob:${asset.path}`); mocks.render.mockResolvedValue(new Blob(['png'])); URL.revokeObjectURL = vi.fn(); });
afterEach(() => vi.restoreAllMocks());
it('consumes both logo and selected slide asset in the shared preview/PNG/ZIP renderer', async () => {
  const post = newCompanyPost(); post.slides[0].image = image;
  const brand = { ...DEFAULT_COMPANY_BRAND, logo: { ...image, path: image.path.replace('/slides/', '/logos/') } };
  await renderCompanyContentSlide(company, post, brand, 0);
  expect(mocks.load).toHaveBeenCalledWith(image, company, 'slides', expect.any(Function));
  expect(mocks.render).toHaveBeenCalledWith(post, 0, { brand, backgroundUrl: `blob:${image.path}`, logoUrl: `blob:${brand.logo.path}`, companyMedia: true });
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
});
it('never calls canvas export with silently missing media; releases an already loaded logo', async () => {
  const post = newCompanyPost(); post.slides[0].image = image;
  mocks.load.mockResolvedValueOnce('blob:logo').mockRejectedValueOnce(new Error('assetloaderror'));
  await expect(renderCompanyContentSlide(company, post, { ...DEFAULT_COMPANY_BRAND, logo: image }, 0)).rejects.toThrow('assetloaderror');
  expect(mocks.render).not.toHaveBeenCalled(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:logo');
});
it('propagates canvas image-load errors and revokes loaded assets', async () => {
  const post = newCompanyPost(); post.slides[0].image = image; mocks.render.mockRejectedValue(new Error('assetloaderror'));
  await expect(renderCompanyContentSlide(company, post, DEFAULT_COMPANY_BRAND, 0)).rejects.toThrow('assetloaderror');
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
});
it('keeps text-only posts working and rejects a scope switch before returning an export', async () => {
  const post = newCompanyPost(); await renderCompanyContentSlide(company, post, DEFAULT_COMPANY_BRAND, 0);
  expect(mocks.load).not.toHaveBeenCalled();
  let current = true; mocks.render.mockImplementation(async () => { current = false; return new Blob(); });
  await expect(renderCompanyContentSlide(company, post, DEFAULT_COMPANY_BRAND, 0, () => current)).rejects.toThrow(/alterada/);
});
