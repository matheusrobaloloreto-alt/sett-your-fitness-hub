import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertMessageMediaScope, previewCompanyMessageMedia, uploadCompanyMessageMedia, validateMessageMediaFile } from './companyMessageMedia';
import { STANDARD_UPLOAD_MAX_BYTES } from './whatsappMediaUpload';

const mocks = vi.hoisted(() => ({ upload: vi.fn(), signed: vi.fn(), session: vi.fn(), resumable: vi.fn(), from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: mocks.session }, storage: { from: mocks.from },
} }));
vi.mock('./whatsappMediaUpload', async () => ({ ...await vi.importActual('./whatsappMediaUpload'), resumableWhatsAppUpload: mocks.resumable }));
const company = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const asset = { bucket: 'whatsapp-media', path: `${company}/message-settings/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png`, mimeType: 'image/png', fileName: 'imagem.png' };

describe('company sequence private media boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.from.mockReturnValue({ upload: mocks.upload, createSignedUrl: mocks.signed });
    mocks.session.mockResolvedValue({ data: { session: { access_token: 'synthetic-token' } } });
    mocks.upload.mockResolvedValue({ error: null }); mocks.signed.mockResolvedValue({ data: { signedUrl: 'https://example.invalid/temporary' }, error: null });
    mocks.resumable.mockResolvedValue(undefined);
  });
  it.each([
    ['image', 'image/jpeg'], ['image', 'image/png'], ['image', 'image/webp'], ['video', 'video/mp4'],
    ['audio', 'audio/mpeg'], ['audio', 'audio/mp4'], ['audio', 'audio/ogg'], ['audio', 'audio/webm'],
  ] as const)('uploads %s %s through the existing helper with immutable path and metadata only', async (type, mime) => {
    const file = new File(['synthetic bytes'], 'arquivo', { type: mime });
    const result = await uploadCompanyMessageMedia(company, 'weekly_contact', type, file, () => true);
    expect(result).toEqual({ bucket: 'whatsapp-media', path: expect.stringMatching(new RegExp(`^${company}/message-settings/[a-f0-9-]{36}\\.[a-z0-9]+$`)), mimeType: mime, fileName: 'arquivo' });
    expect(mocks.upload).toHaveBeenCalledWith(result.path, file, { contentType: mime, upsert: false });
    expect(mocks.resumable).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('url');
  });
  it('routes large allowed files through the resumable helper', async () => {
    const file = new File([new Uint8Array(STANDARD_UPLOAD_MAX_BYTES + 1)], 'audio.mp3', { type: 'audio/mpeg' });
    await uploadCompanyMessageMedia(company, 'first_contact', 'audio', file, () => true);
    expect(mocks.resumable).toHaveBeenCalledWith(expect.objectContaining({ file, accessToken: 'synthetic-token' }));
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('rejects oversize, empty, incompatible or unsafe filenames before touching storage', async () => {
    expect(() => validateMessageMediaFile(new File([], 'vazio.png', { type: 'image/png' }), 'image')).toThrow('16 MB');
    expect(() => validateMessageMediaFile(new File(['x'], 'imagem.svg', { type: 'image/svg+xml' }), 'image')).toThrow('Formato');
    expect(() => validateMessageMediaFile(new File(['x'], '../foto.png', { type: 'image/png' }), 'image')).toThrow('nome');
    expect(() => validateMessageMediaFile({ name: 'foto.png', type: 'image/png', size: 16 * 1024 * 1024 + 1 } as File, 'image')).toThrow('16 MB');
    await expect(uploadCompanyMessageMedia(company, 'weekly_contact', 'video', new File(['x'], 'x.png', { type: 'image/png' }), () => true)).rejects.toThrow('Formato');
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('does not start with an expired session or a stale tenant and refuses a late upload result', async () => {
    const file = new File(['x'], 'x.png', { type: 'image/png' });
    await expect(uploadCompanyMessageMedia(company, 'weekly_contact', 'image', file, () => false)).rejects.toThrow('alterada');
    mocks.session.mockResolvedValueOnce({ data: { session: null } });
    await expect(uploadCompanyMessageMedia(company, 'weekly_contact', 'image', file, () => true)).rejects.toThrow('Sessão');
    expect(mocks.from).not.toHaveBeenCalled();
    let current = true; mocks.upload.mockImplementationOnce(async () => { current = false; return { error: null }; });
    await expect(uploadCompanyMessageMedia(company, 'weekly_contact', 'image', file, () => current)).rejects.toThrow('alterada');
  });
  it('fails explicitly on storage errors and signs only same-company immutable paths', async () => {
    mocks.upload.mockResolvedValueOnce({ error: { message: 'forbidden' } });
    await expect(uploadCompanyMessageMedia(company, 'weekly_contact', 'image', new File(['x'], 'x.png', { type: 'image/png' }), () => true)).rejects.toThrow('Não foi possível anexar');
    for (const invalid of [{ ...asset, bucket: 'public' }, { ...asset, path: 'https://example.invalid/file' }, { ...asset, path: asset.path.replace(company, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') }, { ...asset, path: `${company}/message-settings/../photo.png` }]) {
      expect(() => assertMessageMediaScope(invalid, company)).toThrow('escopo');
    }
    expect(mocks.signed).not.toHaveBeenCalled();
    expect(await previewCompanyMessageMedia(asset, company, 'weekly_contact')).toBe('https://example.invalid/temporary');
    expect(mocks.signed).toHaveBeenCalledWith(asset.path, 300);
    mocks.signed.mockResolvedValueOnce({ error: { message: 'missing' }, data: null });
    await expect(previewCompanyMessageMedia(asset, company, 'weekly_contact')).rejects.toThrow('Prévia indisponível');
  });
});
