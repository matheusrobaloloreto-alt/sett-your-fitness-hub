import { supabase } from '@/integrations/supabase/client';
import { MESSAGE_MEDIA_MIMES, MESSAGE_MEDIA_PATH } from '@/lib/companyProductSettings';
import { resumableWhatsAppUpload, uploadWhatsAppMediaWith } from './whatsappMediaUpload';
import type { MessageBlockType, MessageMedia, WhatsAppEvent } from './companyMessageSequences';

export const COMPANY_MESSAGE_MEDIA_BUCKET = 'whatsapp-media';
export const MESSAGE_MEDIA_MIME_TYPES = MESSAGE_MEDIA_MIMES;
export const MESSAGE_MEDIA_MAX_BYTES = { image: 16 * 1024 * 1024, video: 16 * 1024 * 1024, audio: 16 * 1024 * 1024 };
const extensions: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4',
  'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/mp4': 'm4a',
};
type MediaType = Exclude<MessageBlockType, 'text'>;
export function validateMessageMediaFile(file: File, type: MediaType) {
  if (!(MESSAGE_MEDIA_MIME_TYPES[type] as readonly string[]).includes(file.type)) throw new Error('Formato incompatível com o tipo de mensagem.');
  if (!file.name.length || file.name.length > 180 || [...file.name].some(char => char === '/' || char === '\\' || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new Error('Use um nome de arquivo de até 180 caracteres, sem barras.');
  if (!file.size || file.size > MESSAGE_MEDIA_MAX_BYTES[type]) throw new Error(`O arquivo deve ter até ${MESSAGE_MEDIA_MAX_BYTES[type] / 1024 / 1024} MB.`);
}
export function assertMessageMediaScope(media: MessageMedia, companyId: string) {
  const prefix = `${companyId}/message-settings/`;
  if (media.bucket !== COMPANY_MESSAGE_MEDIA_BUCKET || !media.path.startsWith(prefix)
    || !MESSAGE_MEDIA_PATH.test(media.path)) throw new Error('Anexo fora do escopo da empresa ou evento.');
}
export async function uploadCompanyMessageMedia(companyId: string, event: WhatsAppEvent, type: MediaType, file: File, isCurrent: () => boolean): Promise<MessageMedia> {
  validateMessageMediaFile(file, type);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(companyId)) throw new Error('Empresa inválida.');
  if (!isCurrent()) throw new Error('A empresa ou mensagem foi alterada.');
  const media: MessageMedia = { bucket: COMPANY_MESSAGE_MEDIA_BUCKET, path: `${companyId}/message-settings/${crypto.randomUUID()}.${extensions[file.type]}`, mimeType: file.type, fileName: file.name };
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || !isCurrent()) throw new Error('Sessão expirada ou empresa alterada.');
  await uploadWhatsAppMediaWith({
    file, path: media.path,
    standardUpload: async (body, path) => {
      const { error } = await supabase.storage.from(media.bucket).upload(path, body, { contentType: file.type, upsert: false });
      if (error) throw new Error('Não foi possível anexar. Confira o acesso ao armazenamento e tente novamente.');
    },
    resumableUpload: (body, path, onProgress) => resumableWhatsAppUpload({ file: body, path, onProgress, projectUrl: import.meta.env.VITE_SUPABASE_URL, accessToken: session.access_token }),
  });
  if (!isCurrent()) throw new Error('A empresa ou mensagem foi alterada.');
  return media;
}
export async function previewCompanyMessageMedia(media: MessageMedia, companyId: string, event: WhatsAppEvent): Promise<string> {
  assertMessageMediaScope(media, companyId);
  const { data, error } = await supabase.storage.from(media.bucket).createSignedUrl(media.path, 300);
  if (error || !data?.signedUrl) throw new Error('Prévia indisponível. Tente recarregar a prévia.');
  return data.signedUrl;
}
