import { useMemo, useState } from "react";
import { Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SaveWorkoutToLibraryDialog } from "@/components/admin/SaveWorkoutToLibraryDialog";
import { historicalExerciseMetrics, historicalText, historicalWeeks, readPlanVersionWorkouts } from "@/lib/planVersionSnapshot";
import { WORKOUT_METHODS, type MethodId } from "@/lib/workoutMethods";
import { SET_TYPE_CONFIG, type SetType } from "@/lib/setTypes";

export interface HistoricalPlanVersion {
  id: string;
  created_at: string;
  plan: unknown;
  edited?: boolean;
  edit_summary?: string | null;
}

export function PlanVersionViewer({ version, companyId, studentName, createdBy, onClose }: {
  version: HistoricalPlanVersion;
  companyId: string;
  studentName: string;
  createdBy: string | null;
  onClose: () => void;
}) {
  const snapshot = useMemo(() => readPlanVersionWorkouts(version.plan), [version.plan]);
  const weeks = useMemo(() => historicalWeeks(snapshot.workouts), [snapshot.workouts]);
  const [week, setWeek] = useState<number | null>(weeks[0] || null);
  const [saveScope, setSaveScope] = useState<{ workoutIndex?: number } | null>(null);
  const date = new Date(version.created_at);
  const when = Number.isNaN(date.getTime()) ? "Data indisponível" : date.toLocaleString("pt-BR");

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="flex max-h-[90dvh] max-w-4xl min-w-0 flex-col overflow-hidden p-4 sm:p-6">
          <DialogHeader className="shrink-0 text-left">
            <DialogTitle>Versão do plano</DialogTitle>
            <DialogDescription>{when} · Somente leitura</DialogDescription>
          </DialogHeader>
          <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-3">
            {weeks.length > 0 && (
              <Select value={String(week)} onValueChange={(value) => setWeek(Number(value))}>
                <SelectTrigger aria-label="Semana da versão" className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>{weeks.map((value) => <SelectItem key={value} value={String(value)}>Semana {value}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <Button variant="outline" className="ml-auto max-w-full whitespace-normal" disabled={Boolean(snapshot.error) || !snapshot.workouts.length} onClick={() => setSaveScope({})}>
              <Library className="mr-2 h-4 w-4 shrink-0" />Salvar plano na biblioteca
            </Button>
          </div>
          <div className="min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto overscroll-contain">
            {snapshot.error && <p role="alert" className="text-sm text-destructive">{snapshot.error}</p>}
            {!snapshot.error && !snapshot.workouts.length && <p className="text-sm text-muted-foreground">Esta versão não possui treinos.</p>}
            {snapshot.workouts.map((workout, workoutIndex) => {
              const title = historicalText(workout.title) || historicalText(workout.name) || `Treino ${workoutIndex + 1}`;
              return (
                <section key={workoutIndex} aria-label={title} className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                    <h3 className="min-w-0 break-words text-base font-semibold">{title}</h3>
                    <Button variant="outline" size="sm" className="max-w-full whitespace-normal" aria-label={`Salvar somente ${title} na biblioteca`} disabled={!workout.exercises.length} onClick={() => setSaveScope({ workoutIndex })}>
                      <Library className="mr-2 h-4 w-4 shrink-0" />Salvar este treino
                    </Button>
                  </div>
                  {(historicalText(workout.description) || historicalText((workout as Record<string, unknown>).notes)) && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{historicalText(workout.description) || historicalText((workout as Record<string, unknown>).notes)}</p>}
                  <ol className="divide-y divide-border">
                    {workout.exercises.map((exercise, exerciseIndex) => {
                      const metrics = historicalExerciseMetrics(exercise, week);
                      const method = WORKOUT_METHODS[metrics.method as MethodId]?.label || metrics.method || "Séries retas";
                      return (
                        <li key={exerciseIndex} className="min-w-0 space-y-2 py-3">
                          <div className="flex min-w-0 items-start gap-2">
                            <span className="w-6 shrink-0 text-sm text-muted-foreground">{exerciseIndex + 1}.</span>
                            <div className="min-w-0 flex-1 space-y-2">
                              <p className="break-words font-medium">{historicalText(exercise.exercise_name) || historicalText(exercise.library_exercise_name) || `Exercício ${exerciseIndex + 1}`}</p>
                              {metrics.missingWeek ? <p className="text-sm text-muted-foreground">Sem métricas registradas para esta semana.</p> : (
                                <>
                                  <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                                    {[["Séries", metrics.sets], ["Repetições", metrics.reps], ["Descanso", metrics.rest], ["Cadência", metrics.tempo], ["RIR", metrics.rir], ["Sistema", method]].map(([label, value]) => (
                                      <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words">{value || "Não informado"}</dd></div>
                                    ))}
                                  </dl>
                                  {metrics.methodSeconds && <p className="text-sm">Tempo do método: {metrics.methodSeconds}s</p>}
                                  {metrics.group && <p className="break-words text-xs text-muted-foreground">Grupo: {metrics.group}</p>}
                                  {metrics.setTypes.length > 0 && <div className="flex flex-wrap gap-1" aria-label="Tipos de séries">{metrics.setTypes.map((type, index) => (
                                    <Badge key={index} variant="outline" className="max-w-full whitespace-normal">{index + 1}: {SET_TYPE_CONFIG[type as SetType]?.name || type}</Badge>
                                  ))}</div>}
                                  {metrics.notes && <p className="whitespace-pre-wrap break-words text-sm">{metrics.notes}</p>}
                                  {metrics.baseNotes && <p className="whitespace-pre-wrap break-words text-sm">{metrics.baseNotes}</p>}
                                  {metrics.cues && <p className="whitespace-pre-wrap break-words text-sm">{metrics.cues}</p>}
                                </>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
      <SaveWorkoutToLibraryDialog
        open={saveScope !== null}
        onOpenChange={(open) => { if (!open) setSaveScope(null); }}
        workouts={snapshot.workouts}
        companyId={companyId}
        defaultName={`Treino — ${studentName} — ${when}`}
        createdBy={createdBy}
        initialWorkoutIndex={saveScope?.workoutIndex}
      />
    </>
  );
}
