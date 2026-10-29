import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useMaster } from '@/contexts/MasterContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { companyContentDocumentSchema, DEFAULT_COMPANY_BRAND, fetchCompanyContent, newCompanyPost, saveCompanyContent, type CompanyContentDocument, type CompanyPost } from '@/lib/companyContent';
import { downloadBnContentBlob } from '@/lib/bnContentRenderer';
import { createBnContentZip } from '@/lib/bnContentZip';
import { uploadCompanyMedia } from '@/lib/companyContentMedia';
import { renderCompanyContentSlide } from '@/lib/companyContentMediaRenderer';
import { CompanyContentPreview } from '@/components/content/CompanyContentPreview';

export default function CompanyContentStudio() {
  const { companyId, role, user } = useAuth(); const { viewingCompany } = useMaster();
  const target = role === 'master' ? viewingCompany?.id : companyId;
  const scope = `${user?.id}:${role}:${target}`; const scopeRef = useRef(scope); const scopeEpoch = useRef({ key: '', value: 0 });
  const [loadedScope, setLoadedScope] = useState(''); const [version, setVersion] = useState(0);
  const [document, setDocument] = useState<CompanyContentDocument>({ brand: DEFAULT_COMPANY_BRAND, posts: [] });
  const [selected, setSelected] = useState(''); const [slideIndex, setSlideIndex] = useState(0);
  const [busy, setBusy] = useState(false); const pending = useRef(false); const [message, setMessage] = useState('');
  // Quarantined candidate: Studio belongs to /master/bn-content, not company entitlements.
  // Preserve the editor and saved document format pending explicit canonical integration.
  const allowed = false;
  const accessKey = allowed ? scope : '';
  if (scopeEpoch.current.key !== accessKey) scopeEpoch.current = { key: accessKey, value: scopeEpoch.current.value + 1 };
  scopeRef.current = allowed ? `${scope}:${scopeEpoch.current.value}` : '';
  useEffect(() => () => { scopeRef.current = ''; }, []);
  useEffect(() => { let active = true; setLoadedScope(''); setDocument({ brand: DEFAULT_COMPANY_BRAND, posts: [] }); setSelected(''); setSlideIndex(0); setMessage('');
    if (allowed && target) void fetchCompanyContent(target).then(state => { if (active) { setVersion(state.version); setDocument(state.document); setSelected(state.document.posts[0]?.id ?? ''); setLoadedScope(scope); } }).catch(() => { if (active) setMessage('Não foi possível carregar o Studio desta empresa.'); });
    return () => { active = false; };
  }, [scope, allowed, target]);
  const ready = allowed && loadedScope === scope; const post = document.posts.find(p => p.id === selected); const slide = post?.slides[slideIndex];
  const updatePost = (patch: Partial<CompanyPost>) => { if (post) setDocument({ ...document, posts: document.posts.map(p => p.id === post.id ? { ...p, ...patch } : p) }); };
  const save = async () => { if (!ready || !target || pending.current) return; const current = scopeRef.current; pending.current = true; setBusy(true); setMessage('');
    try { const saved = await saveCompanyContent(target, document, version); if (scopeRef.current === current) { setVersion(saved.version); setDocument(saved.document); setMessage('Conteúdo salvo e confirmado pelo servidor.'); } }
    catch (e) { if (scopeRef.current === current) setMessage(e instanceof Error ? e.message : 'Falha ao salvar.'); }
    finally { pending.current = false; setBusy(false); }
  };
  const upload = async (file: File | undefined, kind: 'logos' | 'slides') => {
    if (!file || !ready || !target || pending.current || (kind === 'slides' && !post)) return;
    const current = scopeRef.current; const postId = post?.id; const index = slideIndex;
    pending.current = true; setBusy(true); setMessage('');
    try {
      const asset = await uploadCompanyMedia(target, kind, file, () => scopeRef.current === current);
      if (scopeRef.current !== current) return;
      setDocument(previous => kind === 'logos' ? { ...previous, brand: { ...previous.brand, logo: asset } } : {
        ...previous, posts: previous.posts.map(p => p.id === postId ? { ...p, slides: p.slides.map((s, i) => i === index ? { ...s, image: asset } : s) } : p),
      });
      setMessage('Imagem anexada. Salve o Studio para registrar a referência.');
    } catch (e) { if (scopeRef.current === current) setMessage(e instanceof Error ? e.message : 'Falha no envio.'); }
    finally { pending.current = false; setBusy(false); }
  };
  const exportPost = async (zip: boolean) => { if (!post || !ready || pending.current) return; const current = scopeRef.current; pending.current = true; setBusy(true); setMessage('');
    try { companyContentDocumentSchema.parse(document); const renderSlide = (i: number) => renderCompanyContentSlide(target!, post, document.brand, i, () => scopeRef.current === current);
      const images: Blob[] = [];
      if (zip) for (let i = 0; i < post.slides.length; i++) images.push(await renderSlide(i));
      const blob = zip ? await createBnContentZip({ ...post, topic: post.title, audience: document.brand.audience }, images, `post-${post.id}`) : await renderSlide(slideIndex);
      if (scopeRef.current === current) downloadBnContentBlob(blob, `post-${post.id}${zip ? '.zip' : `-slide-${slideIndex + 1}.png`}`);
    } catch (e) { if (scopeRef.current === current) setMessage(e instanceof Error ? e.message : 'Falha ao exportar.'); } finally { pending.current = false; setBusy(false); }
  };
  if (!allowed) return <p className="p-6" role="status">Studio disponível somente no menu master BN.</p>;
  return <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto"><h1 className="text-2xl font-semibold">Studio editorial da empresa</h1><p className="text-sm text-muted-foreground">Crie manualmente, revise e exporte. Aprovação editorial não publica nas redes. Versão salva: {version}.</p>{message && <p role="status">{message}</p>}
    <fieldset disabled={!ready || busy} className="space-y-4"><legend className="font-semibold">Identidade editorial</legend><div className="grid md:grid-cols-2 gap-4">{(['name', 'handle', 'audience', 'voice', 'pillars'] as const).map(key => <label key={key}>{({ name: 'Nome da marca', handle: 'Perfil social', audience: 'Público', voice: 'Tom de voz', pillars: 'Pilares editoriais' })[key]}<Input aria-label={key} value={document.brand[key]} onChange={e => setDocument({ ...document, brand: { ...document.brand, [key]: e.target.value } })} /></label>)}</div>
    <div className="flex flex-wrap gap-4">{(['navy', 'paper', 'ink', 'sand'] as const).map(key => <label key={key}>{({ navy: 'Principal', paper: 'Fundo claro', ink: 'Texto', sand: 'Destaque' })[key]}<Input aria-label={`Cor ${key}`} type="color" value={document.brand[key]} onChange={e => setDocument({ ...document, brand: { ...document.brand, [key]: e.target.value } })} /></label>)}</div>
    <label className="block">Logo da marca (PNG/JPEG, até 5 MB)<Input aria-label="Enviar logo" type="file" accept="image/png,image/jpeg" onChange={e => { void upload(e.target.files?.[0], 'logos'); e.target.value = ''; }} /></label>
    {document.brand.logo && <Button type="button" variant="outline" onClick={() => { const { logo: _logo, ...brand } = document.brand; setDocument({ ...document, brand }); }}>Remover logo</Button>}
    <div className="flex flex-wrap gap-3"><Button type="button" onClick={() => { const next = newCompanyPost(); setDocument({ ...document, posts: [...document.posts, next] }); setSelected(next.id); setSlideIndex(0); }} disabled={document.posts.length >= 100}>Nova publicação</Button><Button type="button" onClick={() => void save()}>Salvar Studio</Button></div>
    <div className="grid md:grid-cols-[240px_1fr] gap-5"><aside className="space-y-2"><h2 className="font-semibold">Arquivo e calendário</h2>{document.posts.map(p => <Button type="button" variant={p.id === selected ? 'secondary' : 'ghost'} className="h-auto whitespace-normal text-left w-full" key={p.id} onClick={() => { setSelected(p.id); setSlideIndex(0); }}>{p.title} · {p.status}{p.scheduled_for && ` · ${p.scheduled_for}`}</Button>)}</aside>
    {post && <section className="space-y-4"><label>Título interno<Input aria-label="Título interno" value={post.title} onChange={e => updatePost({ title: e.target.value })} /></label><div className="flex flex-wrap gap-3">
      <label>Data editorial<Input aria-label="Data editorial" type="date" value={post.scheduled_for} onChange={e => updatePost({ scheduled_for: e.target.value })} /></label>
      <label>Estado<select aria-label="Estado editorial" value={post.status} onChange={e => updatePost({ status: e.target.value as CompanyPost['status'] })}><option value="draft">Rascunho</option><option value="approved">Aprovado para exportar</option><option value="archived">Arquivado</option></select></label>
      <label>Formato<select aria-label="Formato" value={post.format} onChange={e => updatePost({ format: e.target.value as CompanyPost['format'] })}><option value="carrossel">Carrossel 1080×1350</option><option value="story">Story 1080×1920</option></select></label>
      <label>Layout<select aria-label="Layout editorial" value={post.aesthetic} onChange={e => updatePost({ aesthetic: e.target.value as CompanyPost['aesthetic'] })}><option value="l1_educativo">L1 Educativo</option><option value="l2_feedback">L2 Feedback real</option><option value="l3_aviso">L3 Aviso</option><option value="l4_evento_teaser">L4 Evento</option></select></label></div>
      <p className="text-sm">Feedback e eventos exigem fatos reais. A ferramenta não gera depoimentos, resultados ou imagens.</p>
      <div className="flex flex-wrap gap-2">{post.slides.map((_, i) => <Button type="button" size="sm" variant={i === slideIndex ? 'secondary' : 'outline'} key={i} onClick={() => setSlideIndex(i)}>Slide {i + 1}</Button>)}<Button type="button" disabled={post.slides.length >= 20} onClick={() => { updatePost({ slides: [...post.slides, { role: 'conteudo', title: 'Nova ideia', subtitle: '', body: '' }] }); setSlideIndex(post.slides.length); }}>Adicionar slide</Button><Button type="button" variant="outline" disabled={post.slides.length <= 1} onClick={() => { updatePost({ slides: post.slides.filter((_, i) => i !== slideIndex) }); setSlideIndex(0); }}>Remover slide</Button></div>
      {slide && <><label className="block">Imagem do slide (PNG/JPEG, até 5 MB)<Input aria-label="Enviar imagem do slide" type="file" accept="image/png,image/jpeg" onChange={e => { void upload(e.target.files?.[0], 'slides'); e.target.value = ''; }} /></label>
      {slide.image && <Button type="button" variant="outline" onClick={() => updatePost({ slides: post.slides.map((s, i) => { if (i !== slideIndex) return s; const { image: _image, ...text } = s; return text; }) })}>Remover imagem do slide</Button>}
      <label>Função do slide<select aria-label="Função do slide" value={slide.role} onChange={e => updatePost({ slides: post.slides.map((s, i) => i === slideIndex ? { ...s, role: e.target.value as 'capa' | 'conteudo' | 'cta' } : s) })}><option value="capa">Capa</option><option value="conteudo">Conteúdo</option><option value="cta">CTA</option></select></label>{(['title', 'subtitle', 'body'] as const).map(key => <label className="block" key={key}>{({ title: 'Título do slide', subtitle: 'Subtítulo', body: 'Texto do slide' })[key]}<Textarea aria-label={key} value={slide[key]} onChange={e => updatePost({ slides: post.slides.map((s, i) => i === slideIndex ? { ...s, [key]: e.target.value } : s) })} /></label>)}</>}
      <label className="block">Legenda<Textarea aria-label="Legenda" rows={4} value={post.caption} onChange={e => updatePost({ caption: e.target.value })} /></label><label className="block">Hashtags<Input aria-label="Hashtags" value={post.hashtags.join(' ')} onChange={e => updatePost({ hashtags: e.target.value.split(/\s+/).filter(Boolean) })} /></label>
      <div className="flex gap-3"><Button type="button" variant="outline" onClick={() => void exportPost(false)}>Exportar PNG</Button><Button type="button" variant="outline" onClick={() => void exportPost(true)}>Exportar ZIP com legenda</Button></div>
    </section>}</div></fieldset>{ready && post && <CompanyContentPreview companyId={target!} key={scope} post={post} brand={document.brand} index={slideIndex} />}
  </div>;
}
