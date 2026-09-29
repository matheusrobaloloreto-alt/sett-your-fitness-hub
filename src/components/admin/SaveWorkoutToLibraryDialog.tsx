import { useEffect, useId, useRef, useState } from "react";
import { Library, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { WorkoutTemplateDraftWorkout } from "@/lib/workoutTemplateDraft";
import { fetchLibraryExercises, prepareWorkoutLibraryExport } from "@/lib/workoutLibraryExport";
import { hasBlockingSaveIssue } from "@/lib/workoutSaveValidation";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface SaveWorkoutToLibraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workouts: WorkoutTemplateDraftWorkout[];
  companyId: string | null;
  defaultName: string;
  createdBy: string | null;
  initialWorkoutIndex?: number;
}

export function SaveWorkoutToLibraryDialog({ open, onOpenChange, workouts, companyId, defaultName, createdBy, initialWorkoutIndex }: SaveWorkoutToLibraryDialogProps) {
  const { toast } = useToast();
  const id = useId();
  const [name, setName] = useState(defaultName);
  const [mode, setMode] = useState("plan");
  const [workoutIndex, setWorkoutIndex] = useState(initialWorkoutIndex ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const context = JSON.stringify([open, companyId, createdBy, defaultName, initialWorkoutIndex, workouts]);
  const current = useRef({ key: context, version: 0 });
  if (current.current.key !== context) current.current = { key: context, version: current.current.version + 1 };
  useEffect(() => {
    const scope = current;
    mounted.current = true;
    return () => { mounted.current = false; scope.current.version++; };
  }, []);
  useEffect(() => {
    setName(defaultName);
    setMode(initialWorkoutIndex === undefined ? "plan" : "workout");
    setWorkoutIndex(initialWorkoutIndex ?? 0);
    setError(null);
  }, [context, defaultName, initialWorkoutIndex]);

  const save = async () => {
    if (busy.current) return;
    if (!companyId || !createdBy || !name.trim()) {
      setError("Informe um nome e mantenha uma empresa e usuário selecionados.");
      return;
    }
    const version = current.current.version;
    const isCurrent = () => mounted.current && current.current.version === version && current.current.key === context;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const snapshot: WorkoutTemplateDraftWorkout[] = JSON.parse(JSON.stringify(workouts));
      const selectedIndex = mode === "workout" ? workoutIndex : undefined;
      const savedName = name.trim();
      const exercises = await fetchLibraryExercises(supabase, companyId);
      if (!isCurrent()) return;
      const prepared = prepareWorkoutLibraryExport({ workouts: snapshot, workoutIndex: selectedIndex, libraryExercises: exercises, companyId });
      if (hasBlockingSaveIssue(prepared.issues)) {
        setError(prepared.issues.filter((issue) => issue.severity === "blocker").map((issue) => issue.message).join(" "));
        return;
      }
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (!isCurrent()) return;
      if (sessionError || session?.user.id !== createdBy) throw new Error("A sessão mudou. Reabra o salvamento na biblioteca.");
      const templateId = crypto.randomUUID();
      const templateWorkouts: Json = JSON.parse(JSON.stringify(prepared.workouts));
      const { data, error: insertError } = await supabase.from("workout_templates").insert({
        id: templateId, company_id: companyId, created_by: createdBy,
        name: savedName, workouts: templateWorkouts, is_public: false, is_official: false,
      }).select("id, company_id").maybeSingle();
      if (!isCurrent()) return;
      if (insertError || data?.id !== templateId || data?.company_id !== companyId) {
        throw new Error("Salvamento não confirmado. Confira a biblioteca antes de tentar novamente.");
      }
      toast({ title: "Salvo na biblioteca de treinos!" });
      onOpenChange(false);
    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error ? cause.message : "Não foi possível salvar na biblioteca.");
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy.current) onOpenChange(next); }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Salvar na biblioteca</DialogTitle>
          <DialogDescription className="sr-only">Nome e treinos do novo plano da biblioteca.</DialogDescription>
        </DialogHeader>
        <form className="min-w-0 space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <div className="space-y-2">
            <Label htmlFor={`${id}-name`}>Nome na biblioteca</Label>
            <Input id={`${id}-name`} value={name} onChange={(event) => setName(event.target.value)} disabled={saving} maxLength={200} autoComplete="off" />
          </div>
          <RadioGroup value={mode} onValueChange={setMode} disabled={saving} aria-label="Treinos para salvar">
            <div className="flex items-center gap-2"><RadioGroupItem id={`${id}-plan`} value="plan" /><Label htmlFor={`${id}-plan`}>Plano inteiro ({workouts.length} treinos)</Label></div>
            <div className="flex items-center gap-2"><RadioGroupItem id={`${id}-workout`} value="workout" /><Label htmlFor={`${id}-workout`}>Treino específico</Label></div>
          </RadioGroup>
          {mode === "workout" && (
            <div className="space-y-2">
              <Label htmlFor={`${id}-selection`}>Treino</Label>
              <select id={`${id}-selection`} className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm" value={workoutIndex} onChange={(event) => setWorkoutIndex(Number(event.target.value))} disabled={saving}>
                {workouts.map((workout, index) => <option key={index} value={index}>{typeof workout?.title === "string" && workout.title || typeof workout?.name === "string" && workout.name || `Treino ${index + 1}`}</option>)}
              </select>
            </div>
          )}
          {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving || !name.trim() || !companyId || !createdBy || workouts.length === 0} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Library className="h-4 w-4" />}
              {saving ? "Salvando..." : "Salvar na biblioteca"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
