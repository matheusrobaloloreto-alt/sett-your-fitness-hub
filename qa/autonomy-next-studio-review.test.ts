/** Independent QA: real document/media/canvas/ZIP code, synthetic network + DOM only.
 * Run with a temporary Vitest config extending vitest.config.ts and including this path.
 * No Supabase account, browser runtime, DB, Docker, paid provider or product mutation.
 */
import { Blob as NodeBlob } from 'node:buffer';
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';

const boundary = vi.hoisted(() => ({
  rpc: vi.fn(), sign: vi.fn(), upload: vi.fn(), fetch: vi.fn(), download: vi.fn(),
  auth: { companyId: '11111111-1111-4111-8111-111111111111', role: 'admin', user: { id: 'synthetic-operator' } },
  features: { hasAppearance: true, loading: false },
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: boundary.rpc,
  storage: { from: () => ({ createSignedUrl: boundary.sign, upload: boundary.upload }) },
} }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => boundary.auth }));
vi.mock('@/hooks/useCompanyFeatures', () => ({ useCompanyFeatures: () => boundary.features }));
vi.mock('@/contexts/MasterContext', () => ({ useMaster: () => ({ viewingCompany: null }) }));
vi.mock('@/lib/bnContentRenderer', async original => ({
  ...await original<typeof import('../src/lib/bnContentRenderer')>(), downloadBnContentBlob: boundary.download,
}));

import Studio from '../src/pages/admin/CompanyContentStudio';
import { fetchCompanyContent, saveCompanyContent, DEFAULT_COMPANY_BRAND, newCompanyPost, type CompanyContentDocument } from '../src/lib/companyContent';
import { loadCompanyMedia, uploadCompanyMedia, type CompanyMedia } from '../src/lib/companyContentMedia';
import { renderCompanyContentSlide } from '../src/lib/companyContentMediaRenderer';
import { renderBnContentSlide } from '../src/lib/bnContentRenderer';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const fileId = '33333333-3333-4333-8333-333333333333';
const image: CompanyMedia = { path: `${A}/slides/${fileId}.png`, mime: 'image/png', bytes: 24, width: 64, height: 64 };
const logo: CompanyMedia = { ...image, path: image.path.replace('/slides/', '/logos/') };
const liveUrls = new Map<string, Blob>();
let urlNumber = 0;
let documentState: CompanyContentDocument;
let drawn: string[] = [];
const encoded: string[][] = [];
function png() {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]); bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer); view.setUint32(16, 64); view.setUint32(20, 64);
  return new NodeBlob([bytes], { type: 'image/png' }) as unknown as Blob;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function snapshot(companyId = A, document = documentState, version = 7) { return { company_id: companyId, document: structuredClone(document), version }; }

beforeEach(() => {
  vi.clearAllMocks(); liveUrls.clear(); encoded.length = 0; urlNumber = 0; drawn = [];
  boundary.auth.companyId = A; boundary.auth.role = 'admin'; boundary.features.hasAppearance = true; boundary.features.loading = false;
  const post = newCompanyPost(); post.title = 'Original interno'; post.caption = 'Legenda original\nSem reescrita.'; post.hashtags = ['#original'];
  post.slides[0] = { ...post.slides[0], title: 'Texto original **preservado**', image };
  post.slides[1] = { ...post.slides[1], image };
  documentState = { brand: { ...DEFAULT_COMPANY_BRAND, name: 'Empresa A', logo }, posts: [post] };
  boundary.rpc.mockImplementation(async (name, args) => name === 'get_company_content'
    ? { data: snapshot(args._company_id), error: null }
    : { data: snapshot(args._company_id, args._document, args._expected_version + 1), error: null });
  boundary.sign.mockImplementation(async path => ({ data: { signedUrl: `https://synthetic.invalid/${path}?grant=${Math.random()}` }, error: null }));
  boundary.upload.mockResolvedValue({ error: null });
  boundary.fetch.mockResolvedValue({ ok: true, headers: new Headers(), blob: async () => png() });
  vi.stubGlobal('fetch', boundary.fetch);
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 64, height: 64, close: vi.fn() })));
  vi.stubGlobal('Image', class {
    naturalWidth = 64; naturalHeight = 64; crossOrigin = ''; value = '';
    onload = () => {}; onerror = () => {};
    get src() { return this.value; }
    set src(value: string) { this.value = value; queueMicrotask(() => this.onload()); }
  });
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL(blob: Blob) {
      const url = `blob:independent-${++urlNumber}`; liveUrls.set(url, blob); return url;
    }
    static revokeObjectURL(url: string) { liveUrls.delete(url); }
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    drawn = [];
    return { font: '', textBaseline: '', fillStyle: '', fillRect: vi.fn(), fillText: vi.fn(),
      measureText: (value: string) => ({ width: value.length * 8 }),
      drawImage: (value: { src: string }) => { drawn.push(value.src); },
    } as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => {
    encoded.push([...drawn]); callback(new NodeBlob([JSON.stringify(drawn)], { type: 'image/png' }) as unknown as Blob);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('independent Studio images integration', () => {
  it('preserves original document and OCC version across the real client boundary', async () => {
    const before = structuredClone(documentState);
    const loaded = await fetchCompanyContent(A);
    const saved = await saveCompanyContent(A, loaded.document, loaded.version);
    expect(saved.document).toEqual(before); expect(saved.version).toBe(8);
    expect(boundary.rpc).toHaveBeenLastCalledWith('save_company_content', { _company_id: A, _document: before, _expected_version: 7 });
    expect(documentState).toEqual(before);
  });

  it.each(['slide tenant', 'logo kind', 'remote URL'])('rejects forged %s in server readback before signing or rendering', async attack => {
    const forged = structuredClone(documentState);
    if (attack === 'slide tenant') forged.posts[0].slides[0].image!.path = image.path.replace(A, B);
    if (attack === 'logo kind') forged.brand.logo = image;
    if (attack === 'remote URL') forged.posts[0].slides[0].image!.path = 'https://attacker.invalid/private.png';
    boundary.rpc.mockResolvedValue({ data: snapshot(A, forged), error: null });
    await expect(fetchCompanyContent(A)).rejects.toThrow();
    expect(boundary.sign).not.toHaveBeenCalled(); expect(boundary.fetch).not.toHaveBeenCalled();
  });

  it('renders the same required attachments through preview, PNG, and real ZIP including unchanged JSON/caption', async () => {
    const original = structuredClone(documentState);
    render(createElement(Studio)); await screen.findByAltText('Prévia do slide 1');
    fireEvent.click(screen.getByRole('button', { name: 'Exportar PNG' }));
    await waitFor(() => expect(boundary.download).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Exportar ZIP com legenda' }));
    await waitFor(() => expect(boundary.download).toHaveBeenCalledTimes(2));
    const zip = boundary.download.mock.calls[1][0] as Blob;
    // jsdom 20's Blob lacks arrayBuffer; browser FileReader reads the real ZIP bytes.
    const zipBytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader(); reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(reader.result as ArrayBuffer); reader.readAsArrayBuffer(zip);
    });
    const files = unzipSync(new Uint8Array(zipBytes));
    const basename = `post-${original.posts[0].id}`;
    const exported = JSON.parse(strFromU8(files[`${basename}.json`]));
    expect(exported.slides).toEqual(original.posts[0].slides);
    expect(strFromU8(files[`${basename}-legenda.txt`])).toBe(`${original.posts[0].caption}\n\n#original`);
    expect(Object.keys(files).filter(key => key.endsWith('.png'))).toHaveLength(2);
    expect(encoded).toHaveLength(4); // preview + PNG + two ZIP slides, all real render paths
    expect(encoded.every(draws => draws.length === 2)).toBe(true); // image AND logo
    expect(boundary.sign.mock.calls.map(call => call[0])).toEqual([image.path.replace('/slides/', '/logos/'), image.path,
      logo.path, image.path, logo.path, image.path, logo.path, image.path]);
    // Raw attachment URLs all disposed; only the displayed composite preview remains live.
    expect(liveUrls.size).toBe(1); expect(documentState).toEqual(original);
  });

  it('blocks the whole ZIP when only its final slide has an unavailable asset', async () => {
    const missing = { ...image, path: image.path.replace(fileId, '44444444-4444-4444-8444-444444444444') };
    documentState.posts[0].slides[1].image = missing;
    boundary.sign.mockImplementation(async path => path === missing.path ? { error: { message: 'missing' }, data: null }
      : { error: null, data: { signedUrl: `https://synthetic.invalid/${path}` } });
    render(createElement(Studio)); await screen.findByAltText('Prévia do slide 1');
    fireEvent.click(screen.getByRole('button', { name: 'Exportar ZIP com legenda' }));
    await screen.findByText('A imagem não está disponível. Recarregue a prévia.');
    expect(encoded).toHaveLength(2); // first ZIP slide really succeeded before the failure
    expect(boundary.download).not.toHaveBeenCalled(); expect(liveUrls.size).toBe(1);
  });

  it('keeps edited copy and media intact when the actual save client reports PT409', async () => {
    render(createElement(Studio)); await screen.findByAltText('Prévia do slide 1');
    boundary.rpc.mockResolvedValue({ data: null, error: { code: 'PT409', message: 'stale' } });
    fireEvent.change(screen.getByLabelText('title'), { target: { value: 'Edição preservada após conflito' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Studio' }));
    await screen.findByText('A versão mudou. Sua edição foi preservada; recarregue antes de salvar.');
    expect(screen.getByLabelText('title')).toHaveValue('Edição preservada após conflito');
    expect(screen.getByRole('button', { name: 'Remover imagem do slide' })).toBeInTheDocument();
    expect(boundary.rpc.mock.calls.at(-1)![1]._expected_version).toBe(7);
  });

  it('renews after an expired preview and releases partial media without allowing export', async () => {
    boundary.fetch.mockImplementation(async url => String(url).includes('/slides/') ? { ok: false, headers: new Headers() }
      : { ok: true, headers: new Headers(), blob: async () => png() });
    render(createElement(Studio)); await screen.findByText('A imagem expirou ou não está disponível. Recarregue a prévia.');
    expect(liveUrls.size).toBe(0); expect(encoded).toHaveLength(0);
    boundary.fetch.mockResolvedValue({ ok: true, headers: new Headers(), blob: async () => png() });
    fireEvent.click(screen.getByRole('button', { name: 'Recarregar prévia' }));
    await screen.findByAltText('Prévia do slide 1');
    expect(boundary.sign).toHaveBeenCalledTimes(4);
    expect(boundary.sign.mock.calls.every(call => call[1] === 60)).toBe(true);
  });

  it('denies mismatched downloaded bytes before canvas even when signing succeeds', async () => {
    await expect(renderCompanyContentSlide(A, documentState.posts[0], { ...documentState.brand, logo: { ...logo, bytes: 25 } }, 0)).rejects.toThrow(/diverge/);
    expect(encoded).toHaveLength(0); expect(liveUrls.size).toBe(0);
  });

  it('invalidates a real pending signed grant across A→B→A without fetching it', async () => {
    const grant = deferred<{ data: { signedUrl: string }; error: null }>();
    let generation = 1;
    boundary.sign.mockReturnValue(grant.promise);
    const pending = loadCompanyMedia(image, A, 'slides', () => generation === 1);
    generation = 3; // separate visits back to A must not make the old grant current
    grant.resolve({ data: { signedUrl: 'https://synthetic.invalid/obsolete' }, error: null });
    await expect(pending).rejects.toThrow(/alterada/);
    expect(boundary.fetch).not.toHaveBeenCalled(); expect(liveUrls.size).toBe(0);
  });

  it('does not show an old preview when entitlement is revoked during a real signed request', async () => {
    const grant = deferred<{ data: { signedUrl: string }; error: null }>(); boundary.sign.mockReturnValue(grant.promise);
    const view = render(createElement(Studio)); await screen.findByDisplayValue('Empresa A');
    await waitFor(() => expect(boundary.sign).toHaveBeenCalledTimes(1));
    boundary.features.hasAppearance = false; view.rerender(createElement(Studio));
    await act(async () => { grant.resolve({ data: { signedUrl: 'https://synthetic.invalid/revoked' }, error: null }); });
    expect(boundary.fetch).not.toHaveBeenCalled(); expect(encoded).toHaveLength(0);
    expect(screen.queryByAltText('Prévia do slide 1')).not.toBeInTheDocument();
    expect(boundary.download).not.toHaveBeenCalled();
  });

  it('does not attach a real completed upload to another company or change original copy', async () => {
    const upload = deferred<{ error: null }>(); boundary.upload.mockReturnValue(upload.promise);
    const before = structuredClone(documentState);
    let current = true;
    const pending = uploadCompanyMedia(A, 'slides', png() as File, () => current);
    await waitFor(() => expect(boundary.upload).toHaveBeenCalledTimes(1)); current = false;
    upload.resolve({ error: null }); await expect(pending).rejects.toThrow(/alterada/);
    expect(boundary.upload.mock.calls[0][0]).toMatch(new RegExp(`^${A}/slides/`));
    expect(documentState).toEqual(before);
  });

  it('keeps legacy text-only company posts and Master defaults on their separate renderer paths', async () => {
    const post = newCompanyPost();
    await renderCompanyContentSlide(A, post, DEFAULT_COMPANY_BRAND, 0);
    expect(encoded[0]).toEqual([]); expect(boundary.sign).not.toHaveBeenCalled();
    await renderBnContentSlide({ ...post, slides: [{ ...post.slides[0], role: 'cta' }] }, 0, { backgroundUrl: 'https://synthetic.invalid/master-ignored' });
    expect(encoded[1]).toEqual(['/bn-content/logo.png']);
    expect(liveUrls.size).toBe(0);
  });
});
