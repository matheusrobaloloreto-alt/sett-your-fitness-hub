import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getMessageEventVariables, validateMessageTemplate } from '@/lib/companyProductSettings';
import { renderCompanyMessage } from '../../../supabase/functions/_shared/communication-policy';
import { MAX_MESSAGE_BLOCKS, type MessageBlock, type MessageBlockType, type WhatsAppEvent } from '@/lib/companyMessageSequences';
import { MESSAGE_MEDIA_MAX_BYTES, MESSAGE_MEDIA_MIME_TYPES, previewCompanyMessageMedia, uploadCompanyMessageMedia } from '@/lib/companyMessageMedia';

function MediaPreview({ block, companyId, event }: { block: MessageBlock; companyId: string; event: WhatsAppEvent }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setUrl(''); setError('');
    if (block.media) void previewCompanyMessageMedia(block.media, companyId, event).then(value => {
      if (active) setUrl(value);
    }).catch(() => { if (active) setError('Prévia indisponível.'); });
    return () => { active = false; };
  }, [block.media, companyId, event, retry]);
  if (!block.media) return <p className="text-sm text-muted-foreground">Anexe um arquivo para esta mensagem.</p>;
  return <div className="space-y-2">
    <p className="break-all text-sm">{block.media.fileName}</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {url && (block.type === 'image' ? <img src={url} alt={block.media.fileName} className="max-h-64 rounded-md object-contain" onError={() => { setUrl(''); setError('Prévia indisponível.'); }} />
      : block.type === 'video' ? <video aria-label={`Prévia de ${block.media.fileName}`} src={url} controls preload="metadata" className="max-h-64 max-w-full" onError={() => { setUrl(''); setError('Prévia indisponível.'); }} />
      : <audio aria-label={`Prévia de ${block.media.fileName}`} src={url} controls preload="metadata" className="max-w-full" onError={() => { setUrl(''); setError('Prévia indisponível.'); }} />)}
    <Button type="button" size="sm" variant="ghost" onClick={() => setRetry(n => n + 1)}>Recarregar prévia</Button>
  </div>;
}

interface Props {
  companyId: string; event: WhatsAppEvent; blocks: MessageBlock[]; previewValues: Record<string, string>;
  onChange: (blocks: MessageBlock[]) => void; onBusyChange: (busy: boolean) => void;
}
export function WhatsAppSequenceEditor({ companyId, event, blocks, previewValues, onChange, onBusyChange }: Props) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const active = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; onBusyChange(false); }; }, [onBusyChange]);
  function update(id: string, patch: Partial<MessageBlock>) {
    setError(''); onChange(blocks.map(block => {
      if (block.id !== id) return block;
      const next = { ...block, ...patch };
      if (!next.media) delete next.media;
      return next;
    }));
  }
  async function attach(block: MessageBlock, file?: File) {
    if (!file || block.type === 'text' || inFlight.current) return;
    inFlight.current = true; setUploading(block.id); setError(''); onBusyChange(true);
    try {
      const media = await uploadCompanyMessageMedia(companyId, event, block.type, file, () => active.current);
      if (active.current) update(block.id, { media });
    } catch (reason) {
      if (active.current) setError(reason instanceof Error ? reason.message : 'Não foi possível anexar o arquivo.');
    } finally {
      inFlight.current = false;
      if (active.current) { setUploading(null); onBusyChange(false); }
    }
  }
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Canal: WhatsApp · {blocks.length}/{MAX_MESSAGE_BLOCKS} mensagens na ordem abaixo.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <fieldset disabled={Boolean(uploading)} className="min-w-0 space-y-4">
      {blocks.map((block, index) => {
        const textId = index === 0 ? 'event-message' : `event-message-${block.id}`;
        let preview = '';
        try { if (block.type === 'text' || block.text.trim()) validateMessageTemplate(block.text, event); preview = renderCompanyMessage(block.text, previewValues); }
        catch { preview = 'Revise as variáveis da mensagem.'; }
        return <section key={block.id} aria-label={`Mensagem ${index + 1}`} className="space-y-4 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between gap-3"><h2 className="font-medium">Mensagem {index + 1}</h2>
            <Button type="button" variant="ghost" size="sm" aria-label={`Remover mensagem ${index + 1}`} disabled={blocks.length <= 1} onClick={() => { setError(''); onChange(blocks.filter(item => item.id !== block.id)); }}><Trash2 className="mr-1 h-4 w-4" />Remover</Button></div>
          <div className="grid gap-5 lg:grid-cols-2"><div className="space-y-4">
            <div className="space-y-2"><Label htmlFor={`message-type-${block.id}`}>Tipo da mensagem {index + 1}</Label>
              <select id={`message-type-${block.id}`} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={block.type} onChange={e => update(block.id, { type: e.target.value as MessageBlockType, media: undefined })}>
                <option value="text">Texto</option><option value="image">Imagem</option><option value="video">Vídeo</option><option value="audio">Áudio</option>
              </select></div>
            {block.type !== 'text' && <div className="space-y-2"><Label htmlFor={`attachment-${block.id}`}>Anexar arquivo à mensagem {index + 1}</Label>
              <input id={`attachment-${block.id}`} type="file" className="block w-full min-w-0 text-sm" accept={MESSAGE_MEDIA_MIME_TYPES[block.type].join(',')} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void attach(block, file); }} />
              <p className="text-xs text-muted-foreground">Até {MESSAGE_MEDIA_MAX_BYTES[block.type] / 1024 / 1024} MB. {uploading === block.id ? 'Anexando arquivo…' : block.media?.fileName}</p>
              {block.media && <Button type="button" size="sm" variant="ghost" onClick={() => update(block.id, { media: undefined })}>Remover anexo</Button>}
            </div>}
            <div className="space-y-2"><Label htmlFor={textId}>{block.type === 'text' ? (index === 0 ? 'Mensagem' : `Texto da mensagem ${index + 1}`) : `Legenda opcional da mensagem ${index + 1}`}</Label>
              <Textarea id={textId} className="min-h-32" maxLength={6000} value={block.text} onChange={e => update(block.id, { text: e.target.value })} /></div>
            <div aria-label={`Variáveis da mensagem ${index + 1}`} className="flex flex-wrap gap-1.5">{getMessageEventVariables(event).map(key => <Button key={key} type="button" variant="outline" size="sm" onClick={() => update(block.id, { text: `${block.text}{{${key}}}` })}>{`{{${key}}}`}</Button>)}</div>
          </div><div className="space-y-3 rounded-md bg-muted/30 p-4"><h3 className="text-sm font-medium">Prévia · mensagem {index + 1}</h3>
            {block.type !== 'text' && <MediaPreview block={block} companyId={companyId} event={event} />}
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed" data-testid={index === 0 ? 'message-preview' : `message-preview-${block.id}`}>{preview || '—'}</p>
          </div></div>
        </section>;
      })}
      <Button type="button" variant="outline" disabled={blocks.length >= MAX_MESSAGE_BLOCKS} onClick={() => { setError(''); onChange([...blocks, { id: crypto.randomUUID(), type: 'text', text: '' }]); }}><Plus className="mr-2 h-4 w-4" />Adicionar mensagem</Button>
    </fieldset>
  </div>;
}
