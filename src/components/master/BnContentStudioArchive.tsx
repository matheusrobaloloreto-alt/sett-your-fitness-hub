import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, RefreshCw, Search, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { parseBnContentManifest, type BnContentPost } from "@/lib/bnContentArchive";
import { downloadBnContentBlob } from "@/lib/bnContentRenderer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function BnContentStudioArchive() {
  const [posts, setPosts] = useState<BnContentPost[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const load = useCallback(async () => {
    const run = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const bucket = supabase.storage.from("bn-content-archive");
      const manifest = await bucket.download("manifest.json");
      if (manifest.error || !manifest.data) throw new Error("archive");
      const nextPosts = parseBnContentManifest(await manifest.data.text());
      const paths = [...new Set(nextPosts.flatMap(post => post.slides))];
      const signed = paths.length ? await bucket.createSignedUrls(paths, 15 * 60) : { data: [], error: null };
      if (signed.error) throw new Error("archive");
      const nextUrls = Object.fromEntries((signed.data || []).filter(item => !item.error && item.path && item.signedUrl?.startsWith("https://")).map(item => [item.path, item.signedUrl]));
      if (paths.some(path => !nextUrls[path])) throw new Error("archive");
      if (run !== generation.current) return;
      setPosts(nextPosts);
      setUrls(nextUrls);
    } catch {
      if (run !== generation.current) return;
      setPosts([]);
      setUrls({});
      setError("O arquivo privado está indisponível ou incompleto. Tente atualizar o acervo.");
    } finally { if (run === generation.current) setLoading(false); }
  }, []);
  useEffect(() => {
    const lifecycle = generation;
    void load();
    const timer = window.setInterval(() => void load(), 12 * 60 * 1000);
    return () => { lifecycle.current++; window.clearInterval(timer); };
  }, [load]);
  const selected = posts.find(post => post.id === selectedId);
  const filtered = useMemo(() => posts.filter(post => [post.title, post.aesthetic, post.status].some(value => value?.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR")))), [posts, query]);
  const caption = selected?.caption || "";
  return <section className="min-w-0 space-y-4" aria-label="Acervo BN">
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar no acervo" className="pl-9" value={query} onChange={e => setQuery(e.target.value)} /></div>
      <span className="text-xs text-muted-foreground">{posts.length} posts</span>
      <Button size="icon" variant="outline" title="Atualizar acervo" aria-label="Atualizar acervo" disabled={loading} onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} /></Button>
    </div>
    {loading ? <p role="status" className="py-10 text-center text-sm text-muted-foreground">Carregando acervo…</p>
      : error ? <p role="alert" className="text-sm text-destructive">{error}</p>
        : !filtered.length ? <p className="py-10 text-center text-sm text-muted-foreground">Nenhum post encontrado.</p>
          : <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {filtered.map(post => <button type="button" key={post.id} onClick={() => { setSelectedId(post.id); setNotice(""); }} className="min-w-0 overflow-hidden rounded-lg border text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <img src={urls[post.slides[0]]} alt="" loading="lazy" className="aspect-[4/5] w-full object-cover" onError={() => setError("As imagens expiraram. Atualize o acervo.")} />
              <div className="space-y-1 p-3"><p className="break-words text-sm font-medium">{post.title}</p><p className="text-xs text-muted-foreground">{post.slides.length} slides{post.date ? ` · ${post.date}` : ""}</p></div>
            </button>)}
          </div>}
    <Dialog open={Boolean(selected) && !error && !loading} onOpenChange={open => { if (!open) setSelectedId(null); }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw_-_2rem)] max-w-5xl overflow-y-auto rounded-lg">
        <DialogHeader><DialogTitle className="break-words pr-6">{selected?.title}</DialogTitle><DialogDescription>Acervo BN</DialogDescription></DialogHeader>
        {selected && <div className="min-w-0 space-y-4">
          <div className="flex min-w-0 snap-x gap-3 overflow-x-auto pb-2">{selected.slides.map((path, index) => <div key={path} className="w-[min(70vw,360px)] shrink-0 snap-center space-y-2">
            <img src={urls[path]} alt={`Slide ${index + 1} de ${selected.title}`} className="w-full" onError={() => setError("As imagens expiraram. Atualize o acervo.")} />
            <Button className="w-full" variant="outline" size="sm" onClick={async () => {
              try {
                const response = await fetch(urls[path]);
                if (!response.ok) throw new Error("download");
                downloadBnContentBlob(await response.blob(), `${selected.id}-${index + 1}.png`);
              } catch { setNotice("Não foi possível baixar o slide. Atualize o acervo e tente novamente."); }
            }}><Download />Baixar slide {index + 1}</Button>
          </div>)}</div>
          {caption && <div className="space-y-2 border-t pt-3">
            <div className="flex flex-wrap items-center gap-2"><h3 className="mr-auto text-sm font-medium">Legenda</h3>
              <Button size="icon" variant="outline" title="Copiar legenda" aria-label="Copiar legenda" onClick={async () => {
                try { await navigator.clipboard.writeText(caption); setNotice("Legenda copiada."); } catch { setNotice("Não foi possível copiar a legenda."); }
              }}><Copy /></Button>
              <Button size="icon" variant="outline" title="Baixar legenda" aria-label="Baixar legenda" onClick={() => downloadBnContentBlob(new Blob([caption], { type: "text/plain;charset=utf-8" }), `${selected.id}-legenda.txt`)}><Download /></Button>
            </div><p className="whitespace-pre-wrap break-words text-sm">{caption}</p>
          </div>}
          {notice && <p role="status" className="text-sm">{notice}</p>}
        </div>}
      </DialogContent>
    </Dialog>
  </section>;
}
