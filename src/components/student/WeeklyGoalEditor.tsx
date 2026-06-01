import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  studentId: string;
  currentGoal: number;
  onSaved: (newGoal: number) => void;
  trigger?: React.ReactNode;
}

const OPTIONS = [2, 3, 4, 5, 6, 7];

export function WeeklyGoalEditor({ studentId, currentGoal, onSaved, trigger }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentGoal);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("students").update({ weekly_workout_goal: value }).eq("id", studentId);
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    onSaved(value);
    setOpen(false);
    toast({ title: "Meta atualizada!" });
  };

  return (
    <>
      <button onClick={() => { setValue(currentGoal); setOpen(true); }} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary font-sans transition-colors">
        {trigger || (<><Target className="h-3 w-3" /> editar meta</>)}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-primary" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>META SEMANAL</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 py-2">
            {OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => setValue(n)}
                className={`py-3 rounded-md border text-sm font-sans font-medium transition-all ${
                  value === n ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                }`}
              >
                {n} treino{n > 1 ? "s" : ""}
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
