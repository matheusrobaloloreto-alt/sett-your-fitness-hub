import { useEffect, useRef, useState } from 'react';
import { classifyExerciseMediaUrl } from '@/lib/exerciseMediaSource';

const sourceStatus = (value: string, otherwise: string) => {
 const kind = classifyExerciseMediaUrl(value).kind;
 return kind === 'external' || kind === 'unavailable' ? kind : otherwise;
};

export function ExercisePreviewPlayer({ value = '', resolve }: { value?: string; resolve?: () => Promise<string> }) {
 const [attempt, retry] = useState(0);
 const [state, setState] = useState({ value, status: resolve ? 'loading' : sourceStatus(value, 'loading') });
 const generation = useRef(0);
 useEffect(() => {
   const current = ++generation.current;
   setState({ value: resolve ? '' : value, status: resolve ? 'loading' : sourceStatus(value, 'loading') });
   const timer = setTimeout(() => {
     if (generation.current === current) setState(s => s.status === 'loading' ? { ...s, status: 'delayed' } : s);
   }, 10000);
   if (resolve) void resolve().then(result => {
     if (generation.current === current) setState(s => ({ value: result, status: result ? sourceStatus(result, s.status) : 'unavailable' }));
   }).catch(() => {
     if (generation.current === current) setState({ value: '', status: 'error' });
   });
   return () => { generation.current++; clearTimeout(timer); };
 }, [value, resolve, attempt]);
 const source = classifyExerciseMediaUrl(state.value);
 const current = generation.current;
 const update = (status: string) => {
   if (generation.current === current) setState(s => ({ ...s, status }));
 };
 return <div className="space-y-3">
   {source.kind === 'direct' && <video key={state.value+attempt} src={source.src} controls
     onLoadedData={() => update('ready')} onError={() => update('error')} className="aspect-video w-full" />}
   {(source.kind === 'youtube' || source.kind === 'vimeo') && <iframe key={state.value+attempt}
     title="Demonstração do exercício" src={source.src} allowFullScreen
     // A cross-origin document load does not confirm playback or provider success.
     onLoad={() => update('document-loaded')} onError={() => update('error')}
     onErrorCapture={() => update('error')} className="aspect-video w-full" />}
   {state.status === 'loading' && (resolve || source.kind !== 'unavailable') && <p role="status">Carregando demonstração…</p>}
   {state.status === 'delayed' && <p role="status">A demonstração está demorando para carregar.</p>}
   {state.status === 'error' && <p role="alert">Não foi possível carregar a demonstração.</p>}
   {(state.status === 'unavailable' || (!resolve && source.kind === 'unavailable')) && <p>Demonstração indisponível.</p>}
   {source.kind === 'external' && <p>Esta demonstração deve ser aberta no link externo.</p>}
   <button type="button" onClick={() => retry(n => n+1)}>Tentar novamente</button>
   {source.kind !== 'unavailable' && <a href={state.value} target="_blank" rel="noopener noreferrer">Abrir demonstração externamente</a>}
 </div>;
}
