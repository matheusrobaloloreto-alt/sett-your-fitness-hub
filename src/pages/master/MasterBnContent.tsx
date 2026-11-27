import { useCallback, useContext, useEffect, useMemo,useRef, useState } from "react";
import { BnContentBrandContext } from "@/lib/bnContentBrand";
import { fetchPlatformProductSettings,type PlatformProductSettings } from "@/lib/platformSettingsClient";
import { UNSAFE_NavigationContext } from "react-router-dom";
import { CalendarDays, Images, Loader2, PenLine, Plus, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BnContentStudioArchive } from "@/components/master/BnContentStudioArchive";
import { BnContentStudioCalendar } from "@/components/master/BnContentStudioCalendar";
import { BnContentStudioEditor } from "@/components/master/BnContentStudioEditor";
import {
  BnContentStudioError, bnContentDraftSnapshot, bootstrapBnContentStudio, generateBnContent,
  generateBnContentImage, uploadBnContentImage, inspectBnContentReference, newBnContentSpec, reviseBnContent, saveBnContentPost,
  type BnContentDraft, type BnStudioBootstrap, type BnStudioPost,
} from "@/lib/bnContentStudio";
import { bnSlideDimensions, downloadBnContentBlob, renderBnContentSlide } from "@/lib/bnContentRenderer";
import { createBnContentZip } from "@/lib/bnContentZip";

function useUnsavedDraftGuard(dirty: boolean, busy: boolean) {
  const navigation = useContext(UNSAFE_NavigationContext);
  const guarded = dirty || busy;
  useEffect(() => {
    if (!guarded) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    // BrowserRouter exposes the navigator; guarding it covers links and programmatic navigation.
    const navigator = navigation?.navigator;
    const originals = navigator ? { push: navigator.push, replace: navigator.replace, go: navigator.go } : null;
    const allow = () => window.confirm(busy ? "Há uma operação em andamento. Sair do BN Content?" : "Há alterações não salvas. Sair e descartar a edição?");
    let currentIndex: unknown = window.history.state?.idx;
    let restoring = false;
    let approvedTraversal = false;
    const popstate = (event: PopStateEvent) => {
      if (restoring) { restoring = false; event.stopImmediatePropagation(); return; }
      const nextIndex: unknown = event.state?.idx;
      if (approvedTraversal) { approvedTraversal = false; currentIndex = nextIndex; return; }
      if (typeof currentIndex !== "number" || typeof nextIndex !== "number" || currentIndex === nextIndex) return;
      if (allow()) { currentIndex = nextIndex; return; }
      // Restore a cancelled browser back/forward before BrowserRouter receives the traversal.
      event.stopImmediatePropagation(); restoring = true;
      window.history.go(currentIndex - nextIndex);
    };
    window.addEventListener("popstate", popstate, true);
    if (navigator && originals) {
      navigator.push = (...args) => { if (allow()) originals.push.apply(navigator, args); };
      navigator.replace = (...args) => { if (allow()) originals.replace.apply(navigator, args); };
      navigator.go = (...args) => { if (allow()) { approvedTraversal = true; originals.go.apply(navigator, args); } };
    }
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", popstate, true);
      if (navigator && originals) Object.assign(navigator, originals);
    };
  }, [guarded, busy, navigation]);
}

export default function MasterBnContent() {
  const [identity,setIdentity]=useState<PlatformProductSettings|null>(null);
  const [data, setData] = useState<BnStudioBootstrap | null>(null);
  const [draft, setDraft] = useState<BnContentDraft | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [tab, setTab] = useState("studio");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState("");
  const [editorSession, setEditorSession] = useState(0);
  const generation = useRef(0);
  const operationActive = useRef(false);
  const mounted = useRef(true);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const dirty = Boolean(draft && bnContentDraftSnapshot(draft) !== savedSnapshot);
  useUnsavedDraftGuard(dirty, Boolean(busy));

  const load = useCallback(async () => {
    const run = ++generation.current;
    setLoading(true); setError("");
    try {
      const [next,platform] = await Promise.all([bootstrapBnContentStudio(),fetchPlatformProductSettings()]);
      if (!mounted.current || run !== generation.current) return;
      setIdentity(platform.settings);
      setData(current => ({ ...next, assets: { ...current?.assets, ...next.assets } }));
      if (!draftRef.current) {
        const initial = { brief: "", spec: newBnContentSpec(next.settings) };
        setDraft(initial); setSavedSnapshot(bnContentDraftSnapshot(initial));
      }
    } catch (cause) {
      if (mounted.current && run === generation.current) setError(cause instanceof Error ? cause.message : "Não foi possível abrir o BN Content.");
    } finally { if (mounted.current && run === generation.current) setLoading(false); }
  }, []);
  useEffect(() => {
    const lifecycle = generation;
    mounted.current = true;
    void load();
    return () => { mounted.current = false; lifecycle.current++; };
  }, [load]);

  const fail = (cause: unknown) => {
    if (!mounted.current) return;
    setConflict(cause instanceof BnContentStudioError && cause.code === "conflict");
    setError(cause instanceof Error ? cause.message : "Não foi possível concluir a operação. Sua edição foi preservada.");
  };
  const perform = async (label: string, action: () => Promise<void>) => {
    if (operationActive.current || loading) return;
    operationActive.current = true;
    setBusy(label); setError(""); setNotice("");
    try { await action(); } catch (cause) { fail(cause); }
    finally { operationActive.current = false; if (mounted.current) setBusy(""); }
  };
  const acceptPost = (post: BnStudioPost) => {
    if (!mounted.current) return;
    const next = { post, brief: post.brief, spec: post.spec };
    setDraft(next); setSavedSnapshot(bnContentDraftSnapshot(next)); setConflict(false);
    setData(current => current && { ...current, posts: [post, ...current.posts.filter(item => item.id !== post.id)] });
    setNotice(post.status === "approved" ? "Post aprovado e salvo." : "Rascunho salvo.");
  };
  const save = (status: "draft" | "approved", copy = false) => {
    if (!draft) return;
    void perform("Salvando…", async () => acceptPost(await saveBnContentPost({
      ...(!copy && draft.post ? { id: draft.post.id, expected_version: draft.post.version } : {}),
      brief: draft.brief, spec: draft.spec, status,
    })));
  };
  const confirmDiscard = () => !dirty || window.confirm("Há alterações não salvas. Descartar a edição atual?");
  const open = (post?: BnStudioPost) => {
    if (!data || busy || loading || !confirmDiscard()) return;
    const next = post ? { post, brief: post.brief, spec: post.spec } : { brief: "", spec: newBnContentSpec(data.settings) };
    setDraft(next); setSavedSnapshot(bnContentDraftSnapshot(next)); setTab("studio"); setConflict(false); setError(""); setNotice("");
    setEditorSession(current => current + 1);
  };
  const generateImageForDraft = async (current: BnContentDraft, index: number): Promise<BnContentDraft> => {
    const slide = current.spec.slides[index];
    if (!slide?.image_scene?.trim()) throw new Error("Descreva a cena da imagem antes de gerar.");
    let post = current.post;
    if (!post || bnContentDraftSnapshot(current) !== JSON.stringify({ brief: post.brief, spec: post.spec })) {
      post = await saveBnContentPost({
        ...(post ? { id: post.id, expected_version: post.version } : {}),
        brief: current.brief, spec: current.spec, status: "draft",
      });
      if (!mounted.current) return current;
      acceptPost(post);
    }
    setNotice("");
    const result = await generateBnContentImage({
      post_id: post.id, slide_index: index, scene: slide.image_scene!,
      aspect: bnSlideDimensions(post.spec.format, post.spec.design).height === 1920 ? "9:16" : "4:5",
    });
    if (!mounted.current) return current;
    const spec = { ...post.spec, slides: post.spec.slides.map((item, at) =>
      at === index ? { ...item, background_path: result.path } : item) };
    setData(previous => previous && { ...previous, assets: { ...previous.assets, [result.path]: result.signedUrl } });
    // Preserve the generated asset locally if the association save conflicts.
    setDraft({ post, brief: post.brief, spec });
    const saved = await saveBnContentPost({
      id: post.id, expected_version: post.version, brief: post.brief, spec, status: "draft",
    });
    acceptPost(saved);
    return { post: saved, brief: saved.brief, spec: saved.spec };
  };
  const generate = (options: { objective?: string; format_key?: string; pillar?: string; withImages?: boolean }) => {
    if (!draft) return;
    if (draft.spec.slides.some(slide => slide.title.trim()) && !window.confirm("Substituir o conteúdo atual pela nova geração?")) return;
    void perform("Gerando conteúdo…", async () => {
      const { withImages, ...contentOptions } = options;
      const generated = await generateBnContent({ design: draft.spec.design, brief: draft.brief, format: draft.spec.format, aesthetic: draft.spec.aesthetic, audience: draft.spec.audience, ...contentOptions });
      if (!mounted.current) return;
      const spec = { ...generated, design: draft.spec.design, references: draft.spec.references,
        slides: generated.slides.map((slide, index) => ({ ...slide,
          ...(draft.spec.slides[index]?.background_path ? { background_path: draft.spec.slides[index].background_path } : {}),
          ...(draft.spec.slides[index]?.design ? { design: draft.spec.slides[index].design } : {}),
        })),
      };
      let next: BnContentDraft = { ...draft, spec };
      setDraft(next);
      if (!withImages || !data?.capabilities.images) return;
      const indexes = spec.slides.flatMap((slide, index) => slide.image_scene?.trim() && !slide.background_path && (slide.design?.imageArea ?? spec.design?.imageArea) !== "none" ? [index] : []);
      for (const [at, index] of indexes.entries()) {
        if (!mounted.current) return;
        setBusy(`Gerando imagem ${at + 1} de ${indexes.length}…`);
        next = await generateImageForDraft(next, index);
      }
      if (mounted.current && indexes.length) setNotice("Conteúdo e imagens gerados e salvos.");
    });
  };
  const image = (index: number) => {
    if (!draft) return;
    void perform("Salvando e gerando imagem…", async () => {
      await generateImageForDraft(draft, index);
      if (mounted.current) setNotice("Imagem gerada e salva.");
    });
  };
  const saveForAsset = async () => {
    if (!draft) throw new Error("Abra um rascunho antes de enviar um arquivo.");
    if (draft.post && !dirty) return draft.post;
    const spec = { ...draft.spec, slides: draft.spec.slides.map(slide => ({ ...slide, title: slide.title.trim() || draft.spec.topic.trim() || "Novo conteúdo" })) };
    const post = await saveBnContentPost({ ...(draft.post ? { id: draft.post.id, expected_version: draft.post.version } : {}), brief: draft.brief, spec, status: "draft" });
    acceptPost(post);
    return post;
  };
  const upload = (file: File, target: number | string) => {
    void perform("Enviando imagem…", async () => {
      if (!file.size || file.size > 10 * 1024 * 1024 || !["image/png", "image/jpeg"].includes(file.type)) throw new Error("Envie uma imagem PNG ou JPEG de até 10 MB.");
      const post = await saveForAsset();
      const asset = await uploadBnContentImage(post.id, file);
      if (!mounted.current) return;
      const spec = typeof target === "number"
        ? { ...post.spec, slides: post.spec.slides.map((slide, at) => at === target ? { ...slide, background_path: asset.path } : slide) }
        : { ...post.spec, references: post.spec.references?.map(ref => ref.id === target ? { ...ref, asset_path: asset.path, design: undefined } : ref) };
      setData(previous => previous && { ...previous, assets: { ...previous.assets, [asset.path]: asset.signedUrl } });
      setDraft({ post, brief: post.brief, spec });
      acceptPost(await saveBnContentPost({ id: post.id, expected_version: post.version, brief: post.brief, spec, status: "draft" }));
      setNotice("Imagem enviada e salva.");
    });
  };
  const inspectReference = (id: string) => {
    void perform("Lendo referência…", async () => {
      const post = await saveForAsset();
      const ref = post.spec.references?.find(item => item.id === id);
      if (!ref) throw new Error("Referência não encontrada.");
      const result = await inspectBnContentReference({ post_id: post.id, ...(ref.asset_path ? { path: ref.asset_path } : { url: ref.url }) });
      if (!mounted.current) return;
      const spec = { ...post.spec, references: post.spec.references?.map(item => item.id === id ? { ...item, asset_path: result.path, design: result.design } : item) };
      setData(previous => previous && { ...previous, assets: { ...previous.assets, [result.path]: result.signedUrl } });
      setDraft({ post, brief: post.brief, spec });
      acceptPost(await saveBnContentPost({ id: post.id, expected_version: post.version, brief: post.brief, spec, status: "draft" }));
      setNotice("Referência lida. Selecione e aplique os critérios desejados.");
    });
  };
  const document = (file: File) => {
    void perform("Lendo documento…", async () => {
      if (!draft) return;
      const pdf = /\.pdf$/i.test(file.name);
      if ((!pdf && !/\.(txt|md)$/i.test(file.name)) || file.size > (pdf ? 12 * 1024 * 1024 : 100 * 1024)) throw new Error("Envie PDF de até 12 MB ou TXT/Markdown de até 100 KB.");
      const text = pdf ? await (await import("@/lib/dietPdf")).extractDietPdfText(file) : await file.text();
      const brief = [draft.brief, "Material de apoio", text].filter(Boolean).join("\n\n");
      if (brief.length > 6000) throw new Error("O material e o briefing juntos excedem 6.000 caracteres. Envie um trecho menor.");
      if (mounted.current) { setDraft({ ...draft, brief }); setNotice("Material incluído no briefing para revisão."); }
    });
  };
  const exportContent = () => {
    if (!draft || !data) return;
    void perform("Exportando…", async () => {
      if(!identity)throw new Error("Identidade editorial indisponível.");
      const logoUrl = identity.visual.logo_url || (identity.editorial.brand_name==="BN Performance Training" ? Object.entries(data.assets).find(([path]) => /logo.*\.(png|webp)$/i.test(path))?.[1] || "/bn-content/logo.png" : null);
      // Prepare all slides before starting downloads so failed assets cannot produce a partial export.
      const slides: Blob[] = [];
      for (let index = 0; index < draft.spec.slides.length; index++) {
        const path = draft.spec.slides[index].background_path;
        if (path && !data.assets[path]) throw new BnContentStudioError("A imagem expirou. Atualize o Studio antes de exportar.");
        slides.push(await renderBnContentSlide(draft.spec, index, { backgroundUrl: path ? data.assets[path] : undefined, logoUrl,brand:{...identity.visual,name:identity.editorial.brand_name} }));
      }
      if (!mounted.current) return;
      const filename = draft.post?.id || "bn-conteudo";
      const archive = await createBnContentZip(draft.spec, slides, filename);
      if (!mounted.current) return;
      downloadBnContentBlob(archive, `${filename}.zip`);
      setNotice("Arquivos exportados.");
    });
  };

  const visual=useMemo(()=>identity?{brand:{...identity.visual,name:identity.editorial.brand_name},logoUrl:identity.visual.logo_url || (identity.editorial.brand_name==="BN Performance Training" ? Object.entries(data?.assets || {}).find(([path])=>/logo.*\.(png|webp)$/i.test(path))?.[1] || "/bn-content/logo.png":null)}:null,[identity,data?.assets]);
  return <BnContentBrandContext.Provider value={visual}><main className="sett-master-page flex min-w-0 flex-1 flex-col gap-4 p-4 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">BN Content</h1><p className="text-xs text-muted-foreground">@bnperformancetraining</p></div>
      <div className="flex items-center gap-2"><Button size="icon" variant="outline" title="Atualizar Studio" aria-label="Atualizar Studio" disabled={loading || Boolean(busy)} onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} /></Button><Button size="sm" disabled={!data || loading || Boolean(busy)} onClick={() => open()}><Plus />Novo rascunho</Button></div>
    </header>
    {error && <div role="alert" className="space-y-2 border-l-2 border-destructive pl-3 text-sm text-destructive"><p>{error}</p>
      {conflict && !draft?.spec.slides.some(slide => slide.background_path) && !draft?.spec.references?.some(ref => ref.asset_path) && <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => save("draft", true)}>Salvar cópia</Button>}
      {!data && <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>Tentar novamente</Button>}
    </div>}
    {(busy || notice) && <p role="status" className="flex items-center gap-2 text-sm">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy || notice}</p>}
    <Tabs value={tab} onValueChange={setTab} className="min-w-0">
      <TabsList className="grid h-10 w-full max-w-md grid-cols-3 rounded-md"><TabsTrigger value="studio" className="gap-2"><PenLine className="h-4 w-4" />Studio</TabsTrigger><TabsTrigger value="archive" className="gap-2"><Images className="h-4 w-4" />Acervo</TabsTrigger><TabsTrigger value="calendar" className="gap-2"><CalendarDays className="h-4 w-4" />Calendário</TabsTrigger></TabsList>
      <TabsContent value="studio" className="min-w-0 pt-3">
        {loading && !data ? <p role="status" className="py-12 text-center text-sm text-muted-foreground">Carregando Studio…</p> : data && draft && <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="min-w-0 space-y-3 lg:border-r lg:pr-4" aria-label="Posts compartilhados">
            <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar posts" className="pl-9" value={query} onChange={e => setQuery(e.target.value)} /></div>
            <div className="flex max-h-48 gap-2 overflow-auto lg:max-h-[75dvh] lg:flex-col">
              {data.posts.filter(post => `${post.spec.topic} ${post.spec.slides[0]?.title} ${post.status}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))).map(post => <button type="button" key={post.id} disabled={Boolean(busy) || loading} onClick={() => open(post)} className={`w-44 shrink-0 space-y-1 rounded-md border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 lg:w-full ${draft.post?.id === post.id ? "border-primary bg-accent text-accent-foreground" : "border-transparent hover:bg-muted"}`}>
                <p className="break-words text-sm font-medium">{post.spec.topic || post.spec.slides[0]?.title}</p><p className={`text-xs ${draft.post?.id === post.id ? "text-accent-foreground/80" : "text-muted-foreground"}`}>{post.status === "approved" ? "Aprovado" : "Rascunho"} · v{post.version}</p>
              </button>)}
              {!data.posts.length && <p className="text-xs text-muted-foreground">Nenhum post salvo.</p>}
            </div>
          </aside>
          <BnContentStudioEditor key={`${draft.post?.id || "new"}-${editorSession}`} draft={draft} settings={data.settings} capabilities={data.capabilities} assets={data.assets} busy={Boolean(busy) || loading} dirty={dirty} onChange={next => { setDraft(next); setNotice(""); }} onSave={save} onGenerate={generate} onImage={image} onUpload={upload} onReference={inspectReference} onDocument={document} onExport={exportContent} onRevise={instruction => void perform("Revisando…", async () => {
            const spec = await reviseBnContent(draft.spec, instruction);
            if (mounted.current) setDraft({ ...draft, spec: { ...spec, design: draft.spec.design, references: draft.spec.references, slides: spec.slides.map((slide, index) => ({ ...slide, design: draft.spec.slides[index]?.design, background_path: draft.spec.slides[index]?.background_path })) } });
          })} />
        </div>}
      </TabsContent>
      <TabsContent value="archive" className="min-w-0 pt-3"><BnContentStudioArchive /></TabsContent>
      <TabsContent value="calendar" className="min-w-0 pt-3">{data ? <BnContentStudioCalendar calendars={data.calendars} available={data.capabilities.text} onCreated={calendar => setData(current => current && { ...current, calendars: [calendar, ...current.calendars.filter(item => item.id !== calendar.id)] })} /> : <p className="text-sm text-muted-foreground">Calendário indisponível.</p>}</TabsContent>
    </Tabs>
  </main></BnContentBrandContext.Provider>;
}
