import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Play, ChevronDown, ChevronUp, History, TrendingUp, TrendingDown, Minus, CheckCircle2, Plus, Check, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { RestTimer } from "./RestTimer";
import { SET_TYPE_CONFIG, SET_TYPES, getSetLabel, type SetType } from "@/lib/setTypes";
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
  activeRest: { exerciseIdx: number; setNum: number; seconds: number } | null;
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
  const hasVideo = !!(ex.video_path || ex.video_url);
  const getLogKey = (s: number) => `${workoutId}-${idx}-${s}`;

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
          <div className={`flex items-center justify-center h-8 w-8 rounded-full text-sm font-bold font-sans flex-shrink-0 ${
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
          <div className="flex-1 min-w-0">
            <p className="font-sans font-medium text-foreground text-sm truncate">{ex.exercise_name}</p>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground font-sans">{numSets}×{ex.reps} · {ex.rest}</p>
              {completedSets > 0 && (
                <span className="text-[10px] text-primary font-sans">{completedSets}/{numSets}</span>
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

            <div className="space-y-1">
              {/* Header */}
              <div className="grid grid-cols-[36px_1fr_1fr_1fr_40px_28px] gap-1.5 text-[10px] text-muted-foreground font-sans font-medium uppercase tracking-wide px-0.5">
                <span>Série</span>
                <span>Anterior</span>
                <span>Kg</span>
                <span>Reps</span>
                <span className="text-center">PSE</span>
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
                    <div className={`grid grid-cols-[36px_1fr_1fr_1fr_40px_28px] gap-1.5 items-center rounded-md px-0.5 py-0.5 ${isCompleted ? 'bg-green-500/5' : ''}`}>
                      {/* Set type badge */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className={`h-7 w-9 rounded text-xs font-bold font-sans ${config.bgColor} ${config.color} flex items-center justify-center`}>
                            {getSetDisplayLabel(s)}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="min-w-[180px]">
                          {SET_TYPES.map(t => (
                            <DropdownMenuItem key={t} onClick={() => onUpdateLog(idx, s + 1, "set_type", t)}>
                              <span className={`font-bold mr-2 ${SET_TYPE_CONFIG[t].color}`}>{SET_TYPE_CONFIG[t].label}</span>
                              <span className="text-sm">{SET_TYPE_CONFIG[t].name}</span>
                            </DropdownMenuItem>
                          ))}
                          {numSets > 1 && (
                            <>
                              <DropdownMenuItem className="text-destructive" onClick={() => onRemoveSet(idx, s + 1)}>
                                <X className="h-3.5 w-3.5 mr-2" />
                                Remover Série
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Previous */}
                      <span className="text-[11px] text-muted-foreground font-sans truncate">
                        {prevWeight > 0 ? `${prevWeight}×${prevReps}` : '-'}
                      </span>

                      {/* Weight */}
                      <Input
                        type="number"
                        inputMode="decimal"
                        className="h-7 text-xs bg-card border-border px-1.5"
                        placeholder={prevWeight > 0 ? String(prevWeight) : "0"}
                        value={log?.weight || ""}
                        onChange={(e) => onUpdateLog(idx, s + 1, "weight", parseFloat(e.target.value) || 0)}
                        onClick={(e) => e.stopPropagation()}
                      />

                      {/* Reps */}
                      <Input
                        type="number"
                        inputMode="numeric"
                        className="h-7 text-xs bg-card border-border px-1.5"
                        placeholder={ex.reps}
                        value={log?.reps_done || ""}
                        onChange={(e) => onUpdateLog(idx, s + 1, "reps_done", parseInt(e.target.value) || 0)}
                        onClick={(e) => e.stopPropagation()}
                      />

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
                          if (newCompleted && isSessionActive) {
                            onSetComplete(idx, s + 1, ex.rest);
                          }
                        }}
                      >
                        <Check className="h-3.5 w-3.5" />
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
                        <RestTimer restSeconds={activeRest.seconds} onComplete={onRestComplete} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add set button */}
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-primary font-sans gap-1.5 h-8 border border-dashed border-primary/30"
              onClick={(e) => { e.stopPropagation(); onAddSet(idx); }}
            >
              <Plus className="h-3 w-3" />
              Adicionar Série
            </Button>

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
