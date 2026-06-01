import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface PostWorkoutFeedbackProps {
  open: boolean;
  onClose: () => void;
  studentId: string;
  companyId: string;
  workoutSessionId: string;
}

const ENERGY_OPTIONS = [
  { value: 1, emoji: "😴", label: "Exausto" },
  { value: 2, emoji: "😕", label: "Cansado" },
  { value: 3, emoji: "😐", label: "Normal" },
  { value: 4, emoji: "🙂", label: "Disposto" },
  { value: 5, emoji: "🔥", label: "Em alta" },
];

interface MuscleGroup { id: string; name: string }

export function PostWorkoutFeedback({ open, onClose, studentId, companyId, workoutSessionId }: PostWorkoutFeedbackProps) {
  const { toast } = useToast();
  const [difficulty, setDifficulty] = useState<number>(5);
  const [energy, setEnergy] = useState<number>(3);
  const [painAreas, setPainAreas] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [groups, setGroups] = useState<MuscleGroup[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase.from("muscle_groups").select("id, name").order("name").then(({ data }) => {
      if (data) setGroups(data);
    });
  }, [open]);

  const togglePain = (id: string) => {
    setPainAreas((prev) => {
      const current = prev[id] || 0;
      const next = current >= 3 ? 0 : current + 1;
      const copy = { ...prev };
      if (next === 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });
  };

  const submit = async (skip = false) => {
    setSaving(true);
    if (skip) {
      onClose();
      setSaving(false);
      return;
    }

    const pain_areas = Object.entries(painAreas).map(([muscle_group_id, intensity]) => ({
      muscle_group_id, intensity,
    }));

    const { error } = await supabase.from("workout_feedback").insert({
      student_id: studentId,
      company_id: companyId,
      workout_session_id: workoutSessionId,
      difficulty,
      energy,
      pain_areas,
      notes: notes.trim() || null,
    });

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao enviar feedback", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Feedback enviado!", description: "Seu treinador vai ver isso." });
    onClose();
  };

  const intensityColor = (i: number) =>
    i === 1 ? "bg-yellow-500/20 border-yellow-500/50 text-yellow-700 dark:text-yellow-300"
    : i === 2 ? "bg-orange-500/20 border-orange-500/50 text-orange-700 dark:text-orange-300"
    : "bg-red-500/20 border-red-500/50 text-red-700 dark:text-red-300";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-primary text-lg" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            COMO FOI ESSE TREINO?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Dificuldade */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-sans font-medium text-foreground">Dificuldade percebida</label>
              <Badge variant="outline" className="font-mono">{difficulty}/10</Badge>
            </div>
            <Slider min={1} max={10} step={1} value={[difficulty]} onValueChange={(v) => setDifficulty(v[0])} />
            <div className="flex justify-between text-[10px] text-muted-foreground font-sans">
              <span>Tranquilo</span><span>Extremo</span>
            </div>
          </div>

          {/* Energia */}
          <div className="space-y-2">
            <label className="text-sm font-sans font-medium text-foreground">Como você chegou para treinar?</label>
            <div className="flex gap-1.5 justify-between">
              {ENERGY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setEnergy(opt.value)}
                  className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-md border transition-all ${
                    energy === opt.value
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card opacity-60 hover:opacity-100"
                  }`}
                >
                  <span className="text-xl">{opt.emoji}</span>
                  <span className="text-[10px] font-sans text-muted-foreground">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Dor/desconforto */}
          <div className="space-y-2">
            <label className="text-sm font-sans font-medium text-foreground">Dor ou desconforto?</label>
            <p className="text-[11px] text-muted-foreground font-sans">Toque para marcar (1× leve, 2× moderado, 3× forte)</p>
            <div className="flex flex-wrap gap-1.5">
              {groups.map((g) => {
                const intensity = painAreas[g.id] || 0;
                return (
                  <button
                    key={g.id}
                    onClick={() => togglePain(g.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-sans border transition-all ${
                      intensity > 0
                        ? intensityColor(intensity)
                        : "border-border text-muted-foreground hover:border-muted-foreground/60"
                    }`}
                  >
                    {g.name}
                    {intensity > 0 && <span className="ml-1 font-mono">{"•".repeat(intensity)}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label className="text-sm font-sans font-medium text-foreground">Quer escrever algo? <span className="text-muted-foreground font-normal">(opcional)</span></label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 500))}
              placeholder="Conte como se sentiu, o que funcionou, o que mudaria..."
              rows={3}
            />
            <p className="text-[10px] text-muted-foreground font-sans text-right">{notes.length}/500</p>
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 sm:flex-row">
          <Button variant="ghost" onClick={() => submit(true)} disabled={saving} className="flex-1">
            Pular
          </Button>
          <Button onClick={() => submit(false)} disabled={saving} className="flex-1">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
