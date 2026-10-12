import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { BnContentSpec } from "@/lib/bnContentStudio";
import { bnSlideDimensions, renderBnContentSlide } from "@/lib/bnContentRenderer";

export function BnContentStudioPreview({ spec, index, assets }: { spec: BnContentSpec; index: number; assets: Record<string, string> }) {
  const [preview, setPreview] = useState<{ url?: string; error?: string }>({});
  const backgroundPath = spec.slides[index]?.background_path;
  const backgroundUrl = backgroundPath ? assets[backgroundPath] : undefined;
  const logoUrl = Object.entries(assets).find(([path]) => /logo.*\.(png|webp)$/i.test(path))?.[1] || "/bn-content/logo.png";
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    setPreview({});
    if (backgroundPath && !backgroundUrl) {
      setPreview({ error: "A imagem expirou ou está indisponível. Atualize o Studio." });
      return;
    }
    void renderBnContentSlide(spec, index, { backgroundUrl, logoUrl }).then(blob => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setPreview({ url: objectUrl });
    }).catch(cause => {
      if (active) setPreview({ error: cause instanceof Error ? cause.message : "Não foi possível renderizar este slide." });
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [spec, index, backgroundPath, backgroundUrl, logoUrl]);

  return <div className="flex min-w-0 items-center justify-center bg-muted/30 p-3">
    <div className={`relative flex w-full max-w-[360px] items-center justify-center overflow-hidden ${bnSlideDimensions(spec.format).height === 1920 ? "aspect-[9/16]" : "aspect-[4/5]"}`}>
      {preview.url ? <img src={preview.url} alt={`Slide ${index + 1}: ${spec.slides[index]?.title || ""}`} className="h-full w-full object-contain" />
        : preview.error ? <p role="alert" className="p-4 text-center text-sm text-destructive">{preview.error}</p>
          : <Loader2 aria-label="Renderizando slide" className="h-6 w-6 animate-spin text-muted-foreground" />}
    </div>
  </div>;
}
