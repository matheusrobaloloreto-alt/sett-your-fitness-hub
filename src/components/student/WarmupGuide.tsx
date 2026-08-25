import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Flame, Timer, Check, Play, Search, VideoOff } from "lucide-react";
import { exerciseThumb } from "@/lib/exerciseCover";

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

function categoriesFor(muscleGroups: string[]): string[] {
  const cats = new Set<string>();
  (muscleGroups || []).forEach((raw) => {
    const n = (raw || "").toLowerCase();
    if (/peito|peit/.test(n)) cats.add("peito");
    if (/costa|dorsal|lat/.test(n)) cats.add("costa");
    if (/ombro|delt/.test(n)) cats.add("ombro");
    if (/quadr|coxa|perna|panturr/.test(n)) cats.add("perna");
    if (/posterior|isquio/.test(n)) cats.add("posterior");
    if (/gl[uú]te/.test(n)) cats.add("glúteo");
    if (/b[ií]ceps/.test(n)) cats.add("bíceps");
    if (/tr[ií]ceps/.test(n)) cats.add("tríceps");
    if (/abd[oô]|core|lombar/.test(n)) cats.add("core");
  });
  return cats.size ? [...cats] : ["geral"];
}

export function WarmupGuide({ muscleGroups, exercises = [], open, onOpenChange, onVideoPlay }: {
  muscleGroups: string[];
  exercises?: WarmupExercise[];
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
  const endRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) { setRunning(false); setDone(new Set()); setRemaining(300); endRef.current = null; }
  }, [open]);

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
    // Radix dialogs must not be nested: close the warmup and let its focus
    // scope/overlay unmount before the video viewer opens on the next frame.
    onOpenChange(false);
    window.requestAnimationFrame(() => onVideoPlay?.(exercise));
  };
  const mm = String(Math.floor(remaining / 60)).padStart(1, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <Flame className="h-5 w-5" /> Prepare-se para o treino
          </DialogTitle>
          <DialogDescription>
            ~5 minutos de mobilidade e ativação para o foco de hoje. Entra aquecido, treina melhor e com menos risco.
          </DialogDescription>
        </DialogHeader>

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
            return (
              <button
                key={i}
                type="button"
                onClick={() => setDone((prev) => {
                  const next = new Set(prev);
                  if (next.has(i)) next.delete(i);
                  else next.add(i);
                  return next;
                })}
                className={`flex w-full items-center gap-2 rounded-md border p-2 text-left text-sm transition-colors ${
                  isDone ? "border-green-500/40 bg-green-500/10 text-muted-foreground line-through" : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${isDone ? "border-green-500 bg-green-500 text-white" : "border-border"}`}>
                  {isDone && <Check className="h-3 w-3" />}
                </span>
                {label}
              </button>
            );
          })}
        </div>

        {exercises.length > 0 && (
          <section aria-labelledby="warmup-exercises-title" className="space-y-2 border-t border-border pt-3">
            <div>
              <h3 id="warmup-exercises-title" className="font-sans text-sm font-semibold text-foreground">
                Exercícios do treino
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Toque em uma prévia para revisar a execução. O vídeo só carrega quando você escolher.
              </p>
            </div>
            <div className="grid max-h-[34vh] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {exercises.map((exercise, index) => {
                const thumbnail = exerciseThumb(exercise);
                const hasLinkedVideo = Boolean(exercise.video_path || exercise.video_url || exercise.youtube_video_id);
                const actionLabel = hasLinkedVideo
                  ? `Assistir demonstração de ${exercise.exercise_name}`
                  : `Buscar demonstração de ${exercise.exercise_name}`;
                return (
                  <button
                    key={`${exercise.exercise_id || exercise.exercise_name}-${index}`}
                    type="button"
                    className="group flex min-h-16 w-full items-stretch overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label={actionLabel}
                    title={actionLabel}
                    onClick={() => openExerciseVideo(exercise)}
                  >
                    <span className="relative flex h-auto w-24 shrink-0 items-center justify-center overflow-hidden bg-secondary">
                      {thumbnail ? (
                        <img
                          src={thumbnail}
                          alt={`Prévia de ${exercise.exercise_name}`}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      ) : hasLinkedVideo ? (
                        <Play className="h-5 w-5 text-primary" aria-hidden="true" />
                      ) : (
                        <VideoOff className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                      )}
                      {thumbnail && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <Play className="h-5 w-5 text-white drop-shadow" aria-hidden="true" />
                        </span>
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col justify-center px-3 py-2">
                      <span className="break-words text-xs font-medium leading-snug text-foreground">
                        {exercise.exercise_name}
                      </span>
                      <span className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                        {hasLinkedVideo ? (
                          <><Play className="h-3 w-3" aria-hidden="true" /> Assistir demonstração</>
                        ) : (
                          <><Search className="h-3 w-3" aria-hidden="true" /> Vídeo ainda não vinculado</>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <Button onClick={() => onOpenChange(false)} className="w-full">
          {done.size >= items.length ? "Pronto, bora treinar! 💪" : "Pular aquecimento"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
