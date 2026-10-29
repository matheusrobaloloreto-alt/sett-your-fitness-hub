import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderBnContentSlide } from './bnContentRenderer';

const drawImage = vi.fn(); const loaded: string[] = [];
const ctx = { font: '', fillStyle: '', textBaseline: '', fillText: vi.fn(), fillRect: vi.fn(), drawImage, measureText: (text: string) => ({ width: text.length * 10 }) };
beforeEach(() => {
  vi.clearAllMocks(); loaded.length = 0;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['synthetic canvas'])));
  vi.stubGlobal('Image', class {
    naturalWidth = 1000; naturalHeight = 100; onload = () => {}; onerror = () => {};
    set src(url: string) { loaded.push(url); queueMicrotask(() => url === 'blob:broken' ? this.onerror() : this.onload()); }
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it.each(['l1_educativo', 'l2_feedback', 'l3_aviso', 'l4_evento_teaser'])('consumes attached media on every role for %s without silently skipping it', async aesthetic => {
  for (const role of ['capa', 'conteudo', 'cta'] as const) {
    await renderBnContentSlide({ format: 'carrossel', aesthetic, slides: [{ role, title: 'Texto' }] }, 0, { backgroundUrl: 'blob:company', logoUrl: null, companyMedia: true });
  }
  expect(loaded).toEqual(['blob:company', 'blob:company', 'blob:company']); expect(drawImage).toHaveBeenCalledTimes(3);
});
it('rejects canvas image load failure before encoding any PNG', async () => {
  await expect(renderBnContentSlide({ format: 'story', aesthetic: 'l1_educativo', slides: [{ role: 'cta', title: 'Texto' }] }, 0, { backgroundUrl: 'blob:broken', logoUrl: null, companyMedia: true })).rejects.toThrow(/carregar/);
  expect(HTMLCanvasElement.prototype.toBlob).not.toHaveBeenCalled();
});
it('keeps Master background rules and default logo unchanged when company options are absent', async () => {
  await renderBnContentSlide({ format: 'carrossel', aesthetic: 'l1_educativo', slides: [{ role: 'conteudo', title: 'Texto' }] }, 0, { backgroundUrl: 'blob:master' });
  expect(loaded).toEqual(['/bn-content/logo.png']);
});
it('contains wide company logos without distortion', async () => {
  await renderBnContentSlide({ format: 'carrossel', aesthetic: 'l1_educativo', slides: [{ role: 'capa', title: 'Texto' }] }, 0, { logoUrl: 'blob:logo', companyMedia: true });
  expect(drawImage).toHaveBeenCalledWith(expect.anything(), 82, 62, 100, 10);
});
