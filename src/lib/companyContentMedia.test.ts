import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ upload: vi.fn(), sign: vi.fn(), fetch: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { storage: { from: () => ({ upload: mocks.upload, createSignedUrl: mocks.sign }) } } }));
import { assertCompanyMedia, companyMediaSchema, loadCompanyMedia, MAX_MEDIA_BYTES, mediaHeaderDimensions, uploadCompanyMedia, validateMediaDimensions, validateMediaHeader } from './companyContentMedia';
import { companyContentDocumentSchema, DEFAULT_COMPANY_BRAND, newCompanyPost, validateCompanyDocumentMedia } from './companyContent';
const company = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const assetId = '33333333-3333-4333-8333-333333333333';
function png(width = 64, height = 64) {
  const bytes = new Uint8Array(24); bytes.set([137,80,78,71,13,10,26,10]); bytes.set([73,72,68,82],12);
  const view = new DataView(bytes.buffer); view.setUint32(16,width); view.setUint32(20,height); return bytes;
}
const asset = { path: `${company}/slides/${assetId}.png`, mime: 'image/png' as const, bytes: 24, width: 64, height: 64 };
const file = () => new NodeBlob([png()], { type: 'image/png' }) as unknown as File;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.upload.mockResolvedValue({ error: null }); mocks.sign.mockResolvedValue({ data: { signedUrl: 'https://synthetic.invalid/signed' }, error: null });
  mocks.fetch.mockResolvedValue({ ok: true, headers: new Headers(), blob: async () => file() });
  vi.stubGlobal('fetch', mocks.fetch); vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 64, height: 64, close: vi.fn() })));
  URL.createObjectURL = vi.fn(() => 'blob:synthetic'); URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());
describe('company Studio media boundary', () => {
  it('rejects invalid MIME, SVG disguised as PNG, empty and oversized uploads', () => {
    expect(() => validateMediaHeader(png(), 'image/svg+xml', 24)).toThrow(/PNG/);
    expect(() => validateMediaHeader(new TextEncoder().encode('<svg/>'), 'image/png', 24)).toThrow(/corresponde/);
    expect(() => validateMediaHeader(png(), 'image/png', 0)).toThrow(/5 MB/);
    expect(() => validateMediaHeader(png(), 'image/png', MAX_MEDIA_BYTES + 1)).toThrow(/5 MB/);
    expect(() => validateMediaHeader(new Uint8Array([255,216]), 'image/jpeg', 2)).toThrow();
  });
  it('checks compressed dimensions before decoding and rejects malformed JPEG headers', async () => {
    expect(mediaHeaderDimensions(png(), 'image/png')).toEqual({ width: 64, height: 64 });
    expect(() => validateMediaDimensions(4096, 4096)).toThrow(/megapixels/);
    expect(() => validateMediaDimensions(0, 100)).toThrow();
    expect(() => mediaHeaderDimensions(new Uint8Array([255,216,255,192,0,8]), 'image/jpeg')).toThrow();
    await expect(uploadCompanyMedia(company, 'slides', new NodeBlob([png(20000, 20000)], { type: 'image/png' }) as unknown as File, () => true)).rejects.toThrow(/pixels/);
    expect(createImageBitmap).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('rejects remote/data/traversal paths, wrong tenant and wrong kind', () => {
    for (const path of ['https://example.test/image.png', 'data:image/png;base64,AA', `${company}/slides/../${assetId}.png`]) expect(companyMediaSchema.safeParse({ ...asset, path }).success).toBe(false);
    expect(() => assertCompanyMedia(asset, other, 'slides')).toThrow(/escopo/);
    expect(() => assertCompanyMedia(asset, company, 'logos')).toThrow(/escopo/);
    expect(companyMediaSchema.safeParse({ ...asset, mime: 'image/jpeg' }).success).toBe(false);
    const post = newCompanyPost(); post.slides[0].image = asset;
    expect(() => validateCompanyDocumentMedia({ brand: DEFAULT_COMPANY_BRAND, posts: [post] }, other)).toThrow(/escopo/);
  });
  it('preserves old documents and optional logo/image references without a version reset', () => {
    expect(companyContentDocumentSchema.parse({ brand: DEFAULT_COMPANY_BRAND, posts: [newCompanyPost()] }).brand).toEqual(DEFAULT_COMPANY_BRAND);
    expect(companyContentDocumentSchema.safeParse({ brand: { ...DEFAULT_COMPANY_BRAND, logo: { ...asset, path: asset.path.replace('/slides/', '/logos/') } }, posts: [] }).success).toBe(true);
  });
  it('uploads validated bytes at a generated tenant path without upsert', async () => {
    const result = await uploadCompanyMedia(company, 'slides', file(), () => true);
    expect(result.path).toMatch(new RegExp(`^${company}/slides/.*\\.png$`));
    expect(mocks.upload).toHaveBeenCalledWith(result.path, expect.anything(), expect.objectContaining({ upsert: false, contentType: 'image/png' }));
    expect(JSON.stringify(result)).not.toMatch(/data:|https:/);
  });
  it('discards scope switches before upload and after upload without returning an asset', async () => {
    await expect(uploadCompanyMedia(company, 'slides', file(), () => false)).rejects.toThrow(/alterada/);
    expect(mocks.upload).not.toHaveBeenCalled();
    let current = true; mocks.upload.mockImplementation(async () => { current = false; return { error: null }; });
    await expect(uploadCompanyMedia(company, 'slides', file(), () => current)).rejects.toThrow(/alterada/);
  });
  it('renews signed grants on reload and checks actual response bytes and dimensions', async () => {
    await loadCompanyMedia(asset, company, 'slides', () => true); await loadCompanyMedia(asset, company, 'slides', () => true);
    expect(mocks.sign).toHaveBeenCalledTimes(2); expect(mocks.sign).toHaveBeenCalledWith(asset.path, 60);
    mocks.fetch.mockResolvedValue({ ok: false, headers: new Headers() });
    await expect(loadCompanyMedia(asset, company, 'slides', () => true)).rejects.toThrow(/expirou/);
    mocks.fetch.mockResolvedValue({ ok: true, headers: new Headers(), blob: async () => new NodeBlob(['<svg/>'], { type: 'image/png' }) });
    await expect(loadCompanyMedia(asset, company, 'slides', () => true)).rejects.toThrow(/corresponde/);
  });
  it('does not fetch a signed URL after scope changes while signing', async () => {
    let current = true; mocks.sign.mockImplementation(async () => { current = false; return { data: { signedUrl: 'https://synthetic.invalid/signed' }, error: null }; });
    await expect(loadCompanyMedia(asset, company, 'slides', () => current)).rejects.toThrow(/alterada/);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('fails closed on a missing object, metadata mismatch or scope switch during load', async () => {
    mocks.sign.mockResolvedValueOnce({ error: {}, data: null });
    await expect(loadCompanyMedia(asset, company, 'slides', () => true)).rejects.toThrow(/disponível/);
    await expect(loadCompanyMedia({ ...asset, width: 100 }, company, 'slides', () => true)).rejects.toThrow(/diverge/);
    let current = true; mocks.fetch.mockImplementation(async () => { current = false; return { ok: true, headers: new Headers(), blob: async () => file() }; });
    await expect(loadCompanyMedia(asset, company, 'slides', () => current)).rejects.toThrow(/alterada/);
  });
});
