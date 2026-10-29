import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';

export const COMPANY_MEDIA_BUCKET = 'company-content-images';
export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const pathPattern = new RegExp(`^(${uuid})/(slides|logos)/${uuid}\\.(png|jpg)$`);
export const companyMediaSchema = z.object({
  path: z.string().regex(pathPattern), mime: z.enum(['image/png', 'image/jpeg']),
  bytes: z.number().int().min(1).max(MAX_MEDIA_BYTES),
  width: z.number().int().min(32).max(4096), height: z.number().int().min(32).max(4096),
}).strict().refine(v => v.width * v.height <= 16_000_000 && v.path.endsWith(v.mime === 'image/png' ? '.png' : '.jpg'), 'Imagem inválida.');
export type CompanyMedia = z.infer<typeof companyMediaSchema>;
export type MediaKind = 'slides' | 'logos';

export function assertCompanyMedia(asset: CompanyMedia, companyId: string, kind: MediaKind) {
  companyMediaSchema.parse(asset);
  if (asset.path.split('/')[0] !== companyId || asset.path.split('/')[1] !== kind) throw new Error('Imagem fora do escopo da empresa.');
}

export function validateMediaHeader(bytes: Uint8Array, mime: string, size: number) {
  if (!['image/png', 'image/jpeg'].includes(mime)) throw new Error('Use somente PNG ou JPEG.');
  if (!Number.isInteger(size) || size < 1 || size > MAX_MEDIA_BYTES) throw new Error('A imagem deve ter até 5 MB.');
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!(mime === 'image/png' ? png : jpeg)) throw new Error('O conteúdo não corresponde ao tipo da imagem.');
}

export function validateMediaDimensions(width: number, height: number) {
  if (![width, height].every(v => Number.isInteger(v) && v >= 32 && v <= 4096) || width * height > 16_000_000) {
    throw new Error('Use imagens de 32 a 4096 pixels por lado e até 16 megapixels.');
  }
}

async function inspectImage(blob: Blob) {
  validateMediaHeader(new Uint8Array(await blob.slice(0, 16).arrayBuffer()), blob.type, blob.size);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Bound decoded allocation before asking the browser to decode a compressed image.
  const headerDimensions = mediaHeaderDimensions(bytes, blob.type);
  validateMediaDimensions(headerDimensions.width, headerDimensions.height);
  // Decode the actual bytes; neither filename nor document dimensions are trusted.
  const bitmap = await createImageBitmap(blob);
  try {
    validateMediaDimensions(bitmap.width, bitmap.height);
    if (bitmap.width !== headerDimensions.width || bitmap.height !== headerDimensions.height) throw new Error('Dimensões da imagem divergentes.');
    return { width: bitmap.width, height: bitmap.height };
  }
  finally { bitmap.close(); }
}

export function mediaHeaderDimensions(bytes: Uint8Array, mime: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === 'image/png' && bytes.length >= 24 && String.fromCharCode(...bytes.slice(12, 16)) === 'IHDR') {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mime === 'image/jpeg') {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (offset < bytes.length && bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
        return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
      }
      offset += length;
    }
  }
  throw new Error('Cabeçalho de imagem inválido ou formato não suportado.');
}

export async function uploadCompanyMedia(companyId: string, kind: MediaKind, file: File, isCurrent: () => boolean) {
  z.string().uuid().parse(companyId);
  const dimensions = await inspectImage(file);
  if (!isCurrent()) throw new Error('Empresa alterada durante o envio.');
  const path = `${companyId}/${kind}/${crypto.randomUUID()}.${file.type === 'image/png' ? 'png' : 'jpg'}`;
  const { error } = await supabase.storage.from(COMPANY_MEDIA_BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '60' });
  if (error) throw new Error('Não foi possível enviar a imagem. Confira o acesso e tente novamente.');
  if (!isCurrent()) throw new Error('Empresa alterada durante o envio.');
  return companyMediaSchema.parse({ path, mime: file.type, bytes: file.size, ...dimensions });
}

export async function loadCompanyMedia(asset: CompanyMedia, companyId: string, kind: MediaKind, isCurrent: () => boolean) {
  assertCompanyMedia(asset, companyId, kind);
  if (!isCurrent()) throw new Error('Empresa alterada.');
  // No cached signed URLs: every preview/reload/export gets a fresh short-lived grant.
  const { data, error } = await supabase.storage.from(COMPANY_MEDIA_BUCKET).createSignedUrl(asset.path, 60);
  if (error || !data?.signedUrl) throw new Error('A imagem não está disponível. Recarregue a prévia.');
  if (!isCurrent()) throw new Error('Empresa alterada.');
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(data.signedUrl, { signal: controller.signal, credentials: 'omit' });
    if (!response.ok) throw new Error('A imagem expirou ou não está disponível. Recarregue a prévia.');
    const length = Number(response.headers.get('content-length'));
    if (length > MAX_MEDIA_BYTES) throw new Error('Imagem acima do limite.');
    const blob = await response.blob();
    const dimensions = await inspectImage(blob);
    if (blob.type !== asset.mime || blob.size !== asset.bytes || dimensions.width !== asset.width || dimensions.height !== asset.height) throw new Error('A imagem diverge do arquivo anexado.');
    if (!isCurrent()) throw new Error('Empresa alterada.');
    return URL.createObjectURL(blob);
  } finally { window.clearTimeout(timeout); }
}
