import { Button } from "@/components/ui/button";
import { ExternalLink, Loader2, Play } from "lucide-react";
import { buildYouTubeEmbedUrl, vimeoEmbedUrl, youtubeIdFromVideoValue, type ExerciseVideoModalState } from "@/lib/exerciseVideoPlayer";

export function ExerciseVideoPlayer({ video }: { video: ExerciseVideoModalState }) {
  const youtubeId = video.type === "url" ? youtubeIdFromVideoValue(video.value) : null;
  const vimeoUrl = video.type === "url" && !youtubeId ? vimeoEmbedUrl(video.value) : null;

  return (
    <div className="space-y-3">
      <div className="aspect-video w-full">
        {video.type === "loading" ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-md bg-muted/40">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Buscando demonstração no YouTube...</p>
          </div>
        ) : video.type === "unavailable" ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-6 text-center">
            <Play className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Vídeo ainda não disponível no catálogo</p>
            <p className="text-xs text-muted-foreground">Você pode buscar uma demonstração externa e confirmar a técnica com a equipe.</p>
          </div>
        ) : youtubeId ? (
          <iframe
            src={buildYouTubeEmbedUrl(youtubeId)}
            title="Demonstração do exercício"
            className="h-full w-full rounded-md"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : vimeoUrl ? (
          <iframe
            src={vimeoUrl}
            title="Demonstração do exercício"
            className="h-full w-full rounded-md"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <video
            src={video.value}
            controls
            muted
            autoPlay
            loop
            playsInline
            className="h-full w-full rounded-md"
          />
        )}
      </div>
      {video.type === "unavailable" && (
        <Button variant="outline" size="sm" className="w-full" asChild>
          <a href={video.value} target="_blank" rel="noreferrer">
            Buscar demonstração no YouTube
            <ExternalLink className="ml-2 h-4 w-4" />
          </a>
        </Button>
      )}
    </div>
  );
}
