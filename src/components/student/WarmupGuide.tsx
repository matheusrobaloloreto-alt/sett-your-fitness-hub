import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Flame, Timer, Check, Play, VideoOff } from "lucide-react";
import { exerciseThumb } from "@/lib/exerciseCover";
import { WARMUP_VIDEO_MATCHES } from "@/lib/warmupVideoMatches";
import { warmupInstruction } from "@/lib/warmupInstructions";
import { useExerciseVideo } from "@/hooks/useExerciseVideo";
import { ExerciseVideoPlayer } from "./ExerciseVideoPlayer";

export type WarmupExercise = {
  exercise_id: string;
  exercise_name: string;
  muscle_group: string;
  video_url?: string | null;
  video_path?: string | null;
  youtube_video_id?: string | null;
  thumbnail_url?: string | null;
};

// A12 — guia de aquecimento ao abrir o treino: preparo de ~5 min com mobilidade/ativação
// por grupo muscular do dia. Nada de IA, só boas práticas; o aluno entra preparado.
const WARMUP: Record<string, string[]> = {
  peito: ["Rotação de ombros — 30s", "Flexão lenta de braços — 2×8", "Alongar peitoral na parede — 20s/lado"],
  costa: ["Gato-camelo — 30s", "Puxada leve com elástico — 2×12", "Soltura de escápula — 20s"],
  ombro: ["Círculos de braço — 30s cada sentido", "Band pull-apart — 2×15", "Elevação lateral leve — 1×12"],
  perna: ["Agachamento livre — 2×10", "Afundo dinâmico — 8/lado", "Mobilidade de tornozelo — 30s/lado"],
  posterior: ["Bom-dia sem carga — 2×10", "Balanço de perna — 10/lado", "Alongamento dinâmico de posterior — 20s"],
  glúteo: ["Ponte de glúteo — 2×12", "Caminhada com elástico (lateral) — 30s", "Abdução em pé — 10/lado"],
  bíceps: ["Rosca leve com elástico — 1×15", "Soltura de punho e cotovelo — 20s"],
  tríceps: ["Extensão leve com elástico — 1×15", "Mobilidade de cotovelo — 20s"],
  core: ["Prancha — 2×20s", "Dead bug — 2×8/lado"],
  geral: ["5 min de esteira/bike em ritmo leve", "Mobilidade de quadril e ombro — 30s cada", "Ativar o músculo-alvo com carga leve — 1×15"],
};

type WarmupVideoItem = {
  label: string;
  exercise: WarmupExercise | null;
};

function normalizeExerciseName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function warmupMovementName(label: string): string {
  return normalizeExerciseName(label.split("—")[0] || label);
}

function resolveWarmupVideoItems(labels: string[], exercises: WarmupExercise[]): WarmupVideoItem[] {
  const candidatesByName = new Map<string, WarmupExercise[]>();
  exercises.forEach((exercise) => {
    const key = normalizeExerciseName(exercise.exercise_name);
    candidatesByName.set(key, [...(candidatesByName.get(key) || []), exercise]);
  });
  const preferredNamesByWarmup = new Map(
    Object.entries(WARMUP_VIDEO_MATCHES).map(([key, names]) => [normalizeExerciseName(key), names]),
  );

  return labels.map((label) => {
    const preferredNames = preferredNamesByWarmup.get(warmupMovementName(label)) || [];
    const matches = preferredNames.map((name) => candidatesByName.get(normalizeExerciseName(name)) || [])
      .find((candidates) => candidates.length === 1) || [];
    return {
      label,
      exercise: matches.length === 1 ? matches[0] : null,
    };
  });
}

function categoriesFor(muscleGroups: string[]): string[] {
  const cats = new Set<string>();
  (muscleGroups || []).forEach((raw) => {
    const n = (raw || "").toLowerCase();
    if (/peito|peit/.test(n)) cats.add("peito");
    if (/costa|dorsal/.test(n)) cats.add("costa");
    if (/ombro|delt/.test(n)) cats.add("ombro");
    if (/quadr|coxa|perna|panturr/.test(n)) cats.add("perna");
    if (/posterior de coxa|isquio|^posterior$/.test(n)) cats.add("posterior");
    if (/gl[uú]te/.test(n)) cats.add("glúteo");
    if (/b[ií]ceps/.test(n)) cats.add("bíceps");
    if (/tr[ií]ceps/.test(n)) cats.add("tríceps");
    if (/abd[oô]|core|lombar/.test(n)) cats.add("core");
  });
  return cats.size ? [...cats] : ["geral"];
}

export function WarmupGuide({ muscleGroups, libraryExercises = [], open, onOpenChange, onVideoPlay }: {
  muscleGroups: string[];
  libraryExercises?: WarmupExercise[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onVideoPlay?: (exercise: WarmupExercise) => void;
}) {
  const cats = useMemo(() => categoriesFor(muscleGroups), [muscleGroups]);
  const items = useMemo(() => {
    const list: string[] = [];
    // Sempre começa pela ativação geral, depois específico do dia.
    WARMUP.geral.slice(0, 1).forEach((i) => list.push(i));
    cats.forEach((c) => (WARMUP[c] || []).forEach((i) => list.push(i)));
    return [...new Set(list)];
  }, [cats]);

  const [done, setDone] = useState<Set<number>>(new Set());
  const [remaining, setRemaining] = useState(300);
  const [running, setRunning] = useState(false);
  const { video, openVideo, closeVideo } = useExerciseVideo();
  const endRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) { setRunning(false); closeVideo(); }
  }, [open, closeVideo]);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      if (endRef.current == null) return;
      setRemaining(Math.max(0, Math.ceil((endRef.current - Date.now()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [running]);

  const startTimer = () => { endRef.current = Date.now() + remaining * 1000; setRunning(true); };
  const openExerciseVideo = (exercise: WarmupExercise) => {
    void openVideo(exercise);
    onVideoPlay?.(exercise);
  };
  const videoItems = useMemo(() => resolveWarmupVideoItems(items, libraryExercises), [items, libraryExercises]);
  const mm = String(Math.floor(remaining / 60)).padStart(1, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (!next && video) closeVideo();
      else onOpenChange(next);
    }}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <Flame className="h-5 w-5" /> {video ? video.title : "Prepare-se para o treino"}
          </DialogTitle>
          <DialogDescription>
            {video ? "Demonstração do aquecimento" : "Siga as orientações do professor. Faça os movimentos sem dor; pare e procure a equipe se tiver dúvida ou desconforto."}
          </DialogDescription>
        </DialogHeader>

        {video ? <div className="space-y-3">
          <Button variant="outline" onClick={closeVideo}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao aquecimento</Button>
          <ExerciseVideoPlayer video={video} />
        </div> : <>
        <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 p-3">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-primary" />
            <span className="font-mono-data text-lg font-semibold text-foreground">{mm}:{ss}</span>
          </div>
          <Button size="sm" variant={running ? "secondary" : "default"} onClick={() => (running ? setRunning(false) : startTimer())}>
            {running ? "Pausar" : remaining < 300 ? "Continuar" : "Iniciar 5 min"}
          </Button>
        </div>

        <div className="space-y-1.5 max-h-[32vh] overflow-y-auto">
          {items.map((label, i) => {
            const isDone = done.has(i);
            const linkedVideo = videoItems[i]?.exercise;
            const thumbnail = linkedVideo ? exerciseThumb(linkedVideo) : null;
            const hasLinkedVideo = Boolean(linkedVideo && (linkedVideo.video_path || linkedVideo.video_url || linkedVideo.youtube_video_id));
            return (
              <div
                key={i}
                role="button"
                tabIndex={0}
                aria-pressed={isDone}
                aria-label={label}
                onClick={() => setDone((prev) => {
                  const next = new Set(prev);
                  if (next.has(i)) next.delete(i);
                  else next.add(i);
                  return next;
                })}
                onKeyDown={(event) => {
                  if (event.target instanceof HTMLElement && event.target.closest("button")) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setDone((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    });
                  }
                }}
                className={`flex w-full items-center gap-2 rounded-md border p-2 text-left text-sm transition-colors ${
                  isDone ? "border-green-500/40 bg-green-500/10 text-muted-foreground" : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${isDone ? "border-green-500 bg-green-500 text-white" : "border-border"}`}>
                  {isDone && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block font-medium ${isDone ? "line-through" : ""}`}>{label}</span>
                  <span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground">{warmupInstruction(label)}</span>
                </span>
                {linkedVideo ? (
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="relative h-12 w-16 overflow-hidden rounded-md border border-border bg-secondary">
                      {thumbnail ? <img src={thumbnail} alt={`Prévia de ${linkedVideo.exercise_name}`} loading="lazy" className="h-full w-full object-cover" /> : <Play className="absolute inset-0 m-auto h-4 w-4 text-primary" />}
                      {thumbnail && <span className="absolute inset-0 flex items-center justify-center bg-black/20"><Play className="h-4 w-4 text-white" /></span>}
                    </span>
                    <span className="sr-only">{hasLinkedVideo ? "Assistir demonstração" : "Buscar demonstração"}</span>
                    <button
                      type="button"
                      aria-label={hasLinkedVideo ? `Assistir demonstração de ${linkedVideo.exercise_name}` : `Buscar demonstração de ${linkedVideo.exercise_name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 text-primary hover:bg-primary/10"
                      onClick={(event) => { event.stopPropagation(); openExerciseVideo(linkedVideo); }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          openExerciseVideo(linkedVideo);
                        }
                      }}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ) : (
                  <span className="mr-1 inline-flex shrink-0 items-center text-muted-foreground/60">
                    <VideoOff className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">Vídeo indisponível para este item</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <Button onClick={() => onOpenChange(false)} className="w-full">
          {done.size >= items.length ? "Pronto, bora treinar! 💪" : "Pular aquecimento"}
        </Button>
        </>}
      </DialogContent>
    </Dialog>
  );
}
