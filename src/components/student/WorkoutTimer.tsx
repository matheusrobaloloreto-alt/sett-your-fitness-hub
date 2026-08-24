import { Timer, Square, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WorkoutTimerProps {
  isActive: boolean;
  elapsed: number;
  formatTime: (s: number) => string;
  onStart: () => void;
  onFinish: () => void;
  onAbandon: () => void;
  workoutTitle: string;
  startBlockedReason?: string | null;
  onResolveBlockedStart?: () => void;
}

export function WorkoutTimer({
  isActive,
  elapsed,
  formatTime,
  onStart,
  onFinish,
  onAbandon,
  workoutTitle,
  startBlockedReason,
  onResolveBlockedStart,
}: WorkoutTimerProps) {
  if (!isActive) {
    if (startBlockedReason) {
      return (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 space-y-3">
          <p className="text-sm font-sans leading-relaxed">{startBlockedReason}</p>
          {onResolveBlockedStart && (
            <Button variant="outline" className="w-full border-amber-300 bg-white/80 font-sans text-amber-900 hover:bg-white" onClick={onResolveBlockedStart}>
              Resolver sessão ativa
            </Button>
          )}
        </div>
      );
    }

    return (
      <Button className="w-full h-14 text-lg gap-3 font-sans" onClick={onStart}>
        <Play className="h-5 w-5" />
        Iniciar Treino
      </Button>
    );
  }

  return (
    <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Timer className="h-5 w-5 text-primary animate-pulse" />
          <span className="text-sm text-muted-foreground font-sans">{workoutTitle}</span>
        </div>
        <span className="text-2xl font-mono font-bold text-primary tabular-nums">
          {formatTime(elapsed)}
        </span>
      </div>
      <div className="flex gap-2">
        <Button variant="destructive" size="sm" className="flex-1 font-sans" onClick={onAbandon}>
          <Square className="h-3.5 w-3.5 mr-1" />
          Abandonar
        </Button>
        <Button size="sm" className="flex-1 font-sans" onClick={onFinish}>
          Finalizar Treino
        </Button>
      </div>
    </div>
  );
}
