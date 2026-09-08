import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { type BnContentPost, parseBnContentManifest } from "@/lib/bnContentArchive";
import { Download, ExternalLink, Images, RefreshCw, Search, Server } from "lucide-react";
import { toast } from "sonner";

const ARCHIVE_BUCKET = "bn-content-archive";
const LOCAL_STUDIO_URL = "http://127.0.0.1:8787/";
const SIGNED_URL_TTL_SECONDS = 15 * 60;

export default function MasterBnContent() {
  const [posts, setPosts] = useState<BnContentPost[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [selectedPost, setSelectedPost] = useState<BnContentPost | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadArchive = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: manifestBlob, error: manifestError } = await supabase.storage
        .from(ARCHIVE_BUCKET)
        .download("manifest.json");
      if (manifestError || !manifestBlob) throw manifestError || new Error("Manifesto não encontrado.");

      const manifest = parseBnContentManifest(await manifestBlob.text());
      const slidePaths = [...new Set(manifest.flatMap((post) => post.slides))];
      const { data: signed, error: signedError } = await supabase.storage
        .from(ARCHIVE_BUCKET)
        .createSignedUrls(slidePaths, SIGNED_URL_TTL_SECONDS);
      if (signedError) throw signedError;

      const nextUrls = Object.fromEntries(
        (signed || [])
          .filter((item) => item.signedUrl)
          .map((item) => [item.path, item.signedUrl]),
      );
      const missingSlides = slidePaths.filter((path) => !nextUrls[path]);
      if (missingSlides.length > 0) {
        throw new Error(`Arquivo incompleto: ${missingSlides.length} slide(s) sem acesso temporário.`);
      }
      setPosts(manifest);
      setSignedUrls(nextUrls);
    } catch (cause) {
      console.error("Failed to load the private BN Content archive:", cause);
      setError("O arquivo privado está indisponível ou incompleto. Atualize a página e tente novamente.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadArchive();
  }, [loadArchive]);

  const filteredPosts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalizedQuery) return posts;
    return posts.filter((post) => [post.title, post.aesthetic, post.status]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase("pt-BR").includes(normalizedQuery)));
  }, [posts, query]);

  const openLocalStudio = () => {
    window.open(LOCAL_STUDIO_URL, "_blank", "noopener,noreferrer");
  };

  const copyCaption = async () => {
    if (!selectedPost?.caption) return;
    try {
      await navigator.clipboard.writeText(selectedPost.caption);
      toast.success("Legenda copiada.");
    } catch {
      toast.error("Não foi possível copiar a legenda.");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold text-foreground">BN Content</h1>
            <Badge variant="secondary">integrado ao Master</Badge>
            <Badge variant="outline">custo adicional zero</Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground font-sans">
            Arquivo privado de posts, slides e legendas da BN. Somente o perfil Master pode gerar os links temporários das imagens.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void loadArchive()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar arquivo
          </Button>
          <Button onClick={openLocalStudio} title="Abre neste computador e requer o Studio local em execução">
            <ExternalLink className="mr-2 h-4 w-4" />
            Abrir Studio neste computador
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="border-primary/20 bg-primary/[0.03]">
          <CardContent className="flex gap-3 p-4">
            <Images className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">Arquivo privado no SETT</p>
              <p className="text-xs text-muted-foreground font-sans">
                O acervo deixa de depender da galeria pública para aparecer no painel Master.
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex gap-3 p-4">
            <Server className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">Limite desta versão</p>
              <p className="text-xs text-muted-foreground font-sans">
                Para criar conteúdo, o Studio precisa estar rodando neste computador. A hospedagem dedicada fica para quando houver edição remota ou mais de um editor.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por título, estilo ou status…" className="pl-9" aria-label="Buscar no BN Content" />
      </div>

      {loading ? (
        <div className="flex min-h-72 items-center justify-center rounded-xl border border-border bg-card" role="status" aria-live="polite">
          <div className="flex items-center gap-3 text-sm text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin" />Carregando o arquivo privado da BN…</div>
        </div>
      ) : error ? (
        <Card className="border-destructive/40">
          <CardContent className="space-y-3 p-6 text-center">
            <p className="font-medium text-destructive">Não foi possível abrir o arquivo BN Content.</p>
            <p className="text-sm text-muted-foreground font-sans">{error}</p>
            <Button variant="outline" onClick={() => void loadArchive()}>Tentar novamente</Button>
          </CardContent>
        </Card>
      ) : filteredPosts.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground font-sans">Nenhum conteúdo encontrado para esta busca.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredPosts.map((post) => {
            const cover = signedUrls[post.slides[0]];
            return (
              <button type="button" key={post.id} onClick={() => setSelectedPost(post)} className="group overflow-hidden rounded-xl border border-border bg-card text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="aspect-[4/5] overflow-hidden bg-muted">
                  {cover ? <img src={cover} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" loading="lazy" /> : <div className="flex h-full items-center justify-center text-muted-foreground"><Images className="h-8 w-8" /></div>}
                </div>
                <div className="space-y-2 p-4">
                  <p className="line-clamp-2 font-semibold text-foreground">{post.title}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground font-sans">
                    <span>{post.date || "sem data"}</span><span>·</span><span>{post.slides.length} slide{post.slides.length === 1 ? "" : "s"}</span>
                    {post.status && <Badge variant="outline" className="text-[10px]">{post.status}</Badge>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(selectedPost)} onOpenChange={(open) => !open && setSelectedPost(null)}>
        <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
          <DialogHeader><DialogTitle>{selectedPost?.title}</DialogTitle></DialogHeader>
          {selectedPost && (
            <div className="space-y-4">
              <div className="flex snap-x gap-3 overflow-x-auto pb-2">
                {selectedPost.slides.map((path, index) => {
                  const url = signedUrls[path];
                  if (!url) return null;
                  return (
                    <div key={path} className="w-[min(78vw,420px)] shrink-0 snap-center space-y-2">
                      <img src={url} alt={`Slide ${index + 1} de ${selectedPost.title}`} className="w-full rounded-lg border border-border" />
                      <Button asChild variant="outline" size="sm" className="w-full"><a href={url} download target="_blank" rel="noreferrer"><Download className="mr-2 h-4 w-4" /> Baixar slide {index + 1}</a></Button>
                    </div>
                  );
                })}
              </div>
              {selectedPost.caption && (
                <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
                  <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">Legenda</p><Button variant="outline" size="sm" onClick={() => void copyCaption()}>Copiar legenda</Button></div>
                  <p className="whitespace-pre-wrap text-sm text-foreground font-sans">{selectedPost.caption}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
