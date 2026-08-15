import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Play, ChevronDown, ChevronUp, History, TrendingUp, TrendingDown, Minus, CheckCircle2, Plus, Check, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { prFeedback } from "@/lib/feedback";
import { RestTimer } from "./RestTimer";
import { SET_TYPE_CONFIG, SET_TYPES, getSetLabel, type SetType } from "@/lib/setTypes";
import { exerciseThumb } from "@/lib/exerciseCover";
import { isGroupingMethod } from "@/lib/workoutMethods";
import { MethodBadge } from "@/components/workout/MethodBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface WorkoutExercise {
  exercise_id: string;
  exercise_name: string;
  muscle_group: string;
  video_url: string | null;
  video_path: string | null;
  youtube_video_id?: string | null;
  thumbnail_url?: string | null;
  group_id?: string | null;
  method?: string | null;
  method_seconds?: number | null;
  tempo?: string | null;
  rir?: string | null;
  weekly_instruction?: string | null;
  sets: string;
  reps: string;
  rest: string;
  notes: string;
  set_types?: string[];
}

interface SetLog {
  weight: number;
  reps_done: number;
  set_type?: string;
  rpe?: number;
  completed?: boolean;
}

interface ExerciseCardProps {
  exercise: WorkoutExercise;
  index: number;
  workoutId: string;
  isExpanded: boolean;
  onToggle: () => void;
  onVideoPlay: () => void;
  logs: Record<string, SetLog>;
  previousLogs: Record<string, SetLog>;
  onUpdateLog: (exIdx: number, setNum: number, field: string, value: number | string | boolean) => void;
  exerciseHistory: { date: string; sets: { weight: number; reps_done: number; set_number: number }[] }[];
  isSessionActive: boolean;
  activeRest: { exerciseIdx: number; setNum: number; seconds: number; startedAt?: number } | null;
  onSetComplete: (exIdx: number, setNum: number, restStr: string) => void;
  onRestComplete: () => void;
  totalSets: number;
  onAddSet: (exIdx: number) => void;
  onRemoveSet: (exIdx: number, setNum: number) => void;
}

export function ExerciseCard({
  exercise: ex, index: idx, workoutId, isExpanded, onToggle, onVideoPlay,
  logs, previousLogs, onUpdateLog, exerciseHistory, isSessionActive,
  activeRest, onSetComplete, onRestComplete, totalSets, onAddSet, onRemoveSet,
}: ExerciseCardProps) {
  const numSets = totalSets;
  const prescribedSets = parseInt(ex.sets || "3", 10) || 3;
  // Sempre há demonstração: vídeo gravado próprio OU fallback do YouTube pelo nome do exercício.
  const hasVideo = !!(ex.video_path || ex.video_url || ex.exercise_name);
  const cover = exerciseThumb(ex);
  const getLogKey = (s: number) => `${workoutId}-${idx}-${s}`;

  // Melhor carga histórica deste exercício (antes de hoje) — base para detectar recorde.
  const exerciseBest = Math.max(
    0,
    ...exerciseHistory.flatMap((h) => h.sets.map((st) => st.weight || 0)),
  );

  const completedSets = Array.from({ length: numSets }, (_, s) => {
    const key = getLogKey(s + 1);
    const log = logs[key];
    return log?.completed;
  }).filter(Boolean).length;

  // Count normal sets for labeling
  const getSetDisplayLabel = (setIndex: number) => {
    const key = getLogKey(setIndex + 1);
    const log = logs[key];
    const type: SetType = (log?.set_type as SetType) || (ex.set_types?.[setIndex] as SetType) || 'normal';
    
    if (type !== 'normal') return SET_TYPE_CONFIG[type].label;
    
    // Count normal-type sets up to this index
    let normalCount = 0;
    for (let i = 0; i <= setIndex; i++) {
      const k = getLogKey(i + 1);
      const l = logs[k];
      const t: SetType = (l?.set_type as SetType) || (ex.set_types?.[i] as SetType) || 'normal';
      if (t === 'normal') normalCount++;
    }
    return String(normalCount);
  };

  const getSetType = (setIndex: number): SetType => {
    const key = getLogKey(setIndex + 1);
    const log = logs[key];
    return (log?.set_type as SetType) || (ex.set_types?.[setIndex] as SetType) || 'normal';
  };

  return (
    <Card className="bg-card border-border overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={onToggle}>
          <div className={`flex items-center justify-center h-8 w-8 rounded-full text-sm font-bold font-mono-data flex-shrink-0 ${
            completedSets === numSets && completedSets > 0
              ? "bg-green-500/20 text-green-400"
              : "bg-primary/10 text-primary"
          }`}>
            {completedSets === numSets && completedSets > 0 ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              idx + 1
            )}
          </div>
          {/* Capa do exercício (vídeo) */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onVideoPlay(); }}
            className="relative h-11 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-secondary"
            aria-label="Ver vídeo"
          >
            {cover ? (
              <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center"><Play className="h-4 w-4 text-muted-foreground" /></span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/15">
              <Play className="h-4 w-4 text-white drop-shadow" />
            </span>
          </button>
          <div className="flex-1 min-w-0">
            <p className="break-words font-sans text-sm font-medium leading-snug text-foreground">{ex.exercise_name}</p>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground font-mono-data">{numSets}×{ex.reps} · {ex.rest}</p>
              {ex.method && !isGroupingMethod(ex.method) && (
                <MethodBadge method={ex.method} seconds={ex.method_seconds} tone="amber" />
              )}
              {completedSets > 0 && (
                <span className="text-[10px] text-primary font-mono-data">{completedSets}/{numSets}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {hasVideo && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onVideoPlay(); }}>
                <Play className="h-4 w-4 text-primary" />
              </Button>
            )}
            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>

        {isExpanded && (
          <div className="border-t border-border px-3 py-3 bg-secondary/30 space-y-3">
            {ex.notes && (
              <p className="text-xs text-muted-foreground font-sans whitespace-pre-wrap break-words">
                <span className="font-medium text-foreground">Obs:</span> {ex.notes}
              </p>
            )}

            {(ex.tempo || ex.rir || ex.weekly_instruction) && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                <div className="flex flex-wrap gap-2 font-mono-data text-[11px] font-semibold text-primary">
                  {ex.tempo && <span>Cadência {ex.tempo.split("").join("-")}</span>}
                  {ex.rir && <span>RIR {ex.rir}</span>}
                </div>
                {ex.weekly_instruction && (
                  <p className="mt-1 font-sans text-xs leading-relaxed text-foreground">{ex.weekly_instruction}</p>
                )}
              </div>
            )}

            <div className="space-y-1">
              {/* Header */}
              <div className="grid grid-cols-[36px_1fr_1fr_1fr_40px_28px_24px] gap-1 text-[10px] text-muted-foreground font-sans font-medium uppercase tracking-wide px-0.5">
                <span>Série</span>
                <span>Anterior</span>
                <span>Kg</span>
                <span>Reps</span>
                <span className="text-center">Dific.</span>
                <span></span>
                <span></span>
              </div>

              {Array.from({ length: numSets }, (_, s) => {
                const key = getLogKey(s + 1);
                const log = logs[key];
                const prev = previousLogs[key];
                const weight = log?.weight || 0;
                const prevWeight = prev?.weight || 0;
                const prevReps = prev?.reps_done || 0;
                const isCompleted = log?.completed || false;
                const showRestTimer = activeRest?.exerciseIdx === idx && activeRest?.setNum === s + 1;
                const setType = getSetType(s);
                const config = SET_TYPE_CONFIG[setType];
                const rpe = log?.rpe;

                let progressIcon = null;
                if (isCompleted && prevWeight > 0) {
                  if (weight > prevWeight) progressIcon = <TrendingUp className="h-3 w-3 text-green-400" />;
                  else if (weight < prevWeight) progressIcon = <TrendingDown className="h-3 w-3 text-red-400" />;
                  else progressIcon = <Minus className="h-3 w-3 text-muted-foreground" />;
                }

                return (
                  <div key={s} className="space-y-1">
                    <div className={`grid grid-cols-[36px_1fr_1fr_1fr_40px_28px_24px] gap-1 items-center rounded-md px-0.5 py-0.5 ${isCompleted ? 'bg-green-500/5' : ''}`}>
                      {/* Set type badge */}
                      {/* Tipo de série (definido pelo treinador) — só leitura; toque explica o que é */}
                      <button
                        type="button"
                        className={`h-7 w-9 rounded text-xs font-bold font-sans ${config.bgColor} ${config.color} flex items-center justify-center`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const d: Record<string, string> = {
                            warmup: "Aquecimento: peso leve pra preparar o músculo, sem buscar fadiga.",
                            normal: "Série normal: execução padrão com a carga do dia.",
                            failure: "Até a falha: repita até não conseguir mais nenhuma com boa técnica.",
                            drop: "Drop-set: ao falhar, reduza a carga e continue sem descanso.",
                          };
                          toast(config.name, { description: d[setType] || "" });
                        }}
                      >
                        {getSetDisplayLabel(s)}
                      </button>

                      {/* Anterior — carga × reps + RPE; toque/hover mostra como foi da última vez */}
                      <span
                        className="text-[11px] text-muted-foreground font-sans truncate"
                        title={prevWeight > 0
                          ? `Última vez: ${prevWeight}kg × ${prevReps} reps${prev?.rpe ? ` · RPE ${prev.rpe}` : ""}${prev?.set_type && prev.set_type !== "normal" ? ` · ${prev.set_type}` : ""}${prev?.completed ? " · concluída" : ""}`
                          : "Sem registro anterior"}
                      >
                        {prevWeight > 0 ? (
                          <>
                            {prevWeight}×{prevReps}
                            {prev?.rpe ? <span className="text-muted-foreground/60"> ·{prev.rpe}</span> : null}
                          </>
                        ) : '-'}
                      </span>

                      {/* Weight */}
                      <Input
                        type="number"
                        inputMode="decimal"
                        className="h-7 text-xs bg-card border-border px-1.5"
                        placeholder={prevWeight > 0 ? String(prevWeight) : "0"}
                        value={log?.weight ?? ""}
                        onChange={(e) => onUpdateLog(idx, s + 1, "weight", e.target.value === "" ? null : (parseFloat(e.target.value) || 0))}
                        onClick={(e) => e.stopPropagation()}
                      />

                      {/* Reps — prescritas pelo treinador (não editável; a prescrição é nossa) */}
                      <div className="h-7 flex items-center justify-center text-xs font-sans text-foreground bg-secondary/40 rounded border border-border px-1" title="Repetições prescritas">
                        {ex.reps}
                      </div>

                      {/* RPE/PSE */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="h-7 w-10 rounded text-[11px] font-sans font-medium bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground">
                            {rpe || '-'}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center" className="min-w-[48px]">
                          {[6, 7, 7.5, 8, 8.5, 9, 9.5, 10].map(v => (
                            <DropdownMenuItem key={v} onClick={() => onUpdateLog(idx, s + 1, "rpe", v)} className="justify-center text-sm">
                              {v}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Check */}
                      <button
                        className={`h-7 w-7 rounded-full flex items-center justify-center transition-colors ${
                          isCompleted
                            ? 'bg-green-500 text-white'
                            : 'border border-border text-muted-foreground hover:border-green-500 hover:text-green-500'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const newCompleted = !isCompleted;
                          onUpdateLog(idx, s + 1, "completed", newCompleted);
                          if (newCompleted) onUpdateLog(idx, s + 1, "reps_done", parseInt(String(ex.reps)) || 0);
                          if (newCompleted && isSessionActive) {
                            onSetComplete(idx, s + 1, ex.rest);
                          }
                          // Celebração de recorde: carga bateu o melhor histórico do exercício.
                          if (newCompleted && weight > 0 && exerciseBest > 0 && weight > exerciseBest) {
                            prFeedback();
                            toast.success(`🏆 Novo recorde em ${ex.exercise_name}!`, {
                              description: `${weight} kg — seu melhor anterior era ${exerciseBest} kg`,
                            });
                          }
                        }}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                        aria-label={`Remover série ${s + 1}`}
                        disabled={numSets <= 1 || s + 1 <= prescribedSets}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveSet(idx, s + 1);
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Progress indicator */}
                    {progressIcon && isCompleted && (
                      <div className="flex items-center gap-1 ml-[calc(36px+0.375rem)]">
                        {progressIcon}
                      </div>
                    )}

                    {showRestTimer && (
                      <div className="ml-[calc(36px+0.375rem)]">
                        <RestTimer restSeconds={activeRest.seconds} startedAt={activeRest.startedAt} onComplete={onRestComplete} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>


            {/* Mini-history */}
            {exerciseHistory.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground font-sans gap-1.5 h-7" onClick={(e) => e.stopPropagation()}>
                    <History className="h-3 w-3" />
                    Ver histórico ({exerciseHistory.length} sessões)
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-1.5">
                  {(() => {
                    // A8 — progressão de carga: máx por sessão (cronológico), sparkline sem dependência.
                    const prog = [...exerciseHistory]
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((h) => Math.max(0, ...h.sets.map((s) => s.weight || 0)))
                      .filter((v) => v > 0);
                    if (prog.length < 2) return null;
                    const mn = Math.min(...prog), mx = Math.max(...prog);
                    return (
                      <div className="rounded-md border border-border bg-card/50 p-2 mb-1.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-sans">Progressão de carga</span>
                          <span className="text-[10px] font-mono-data text-primary">{mn}→{mx}kg</span>
                        </div>
                        <Sparkline points={prog} />
                      </div>
                    );
                  })()}
                  {exerciseHistory.map(({ date, sets }) => (
                    <div key={date} className="flex items-start gap-2 text-[11px] font-sans text-muted-foreground">
                      <span className="font-medium text-foreground/70 min-w-[40px]">
                        {format(parseISO(date), "dd/MM")}
                      </span>
                      <span className="flex-1">
                        {sets.map(s => `${s.weight}kg×${s.reps_done}`).join(", ")}
                      </span>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Sparkline puro em SVG (sem recharts) — evolução da carga máxima por sessão.
function Sparkline({ points }: { points: number[] }) {
  const W = 220, H = 36, pad = 3;
  const min = Math.min(...points), max = Math.max(...points);
  const range = max - min || 1;
  const stepX = points.length > 1 ? (W - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((v, i) => {
    const x = pad + i * stepX;
    const y = H - pad - ((v - min) / range) * (H - pad * 2);
    return [x, y] as const;
  });
  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-9" preserveAspectRatio="none" aria-hidden>
      <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {last && <circle cx={last[0]} cy={last[1]} r="2.5" fill="hsl(var(--primary))" />}
    </svg>
  );
}
