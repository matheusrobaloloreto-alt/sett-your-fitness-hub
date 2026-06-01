import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  studentId: string;
  companyId: string;
  enrollmentId: string | null;
}

const INTENTS = [
  { value: "yes", label: "Sim, quero renovar" },
  { value: "talk", label: "Quero conversar antes" },
  { value: "no", label: "Não vou continuar" },
];

export function CycleFeedbackForm({ open, onClose, studentId, companyId, enrollmentId }: Props) {
  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [whatWorked, setWhatWorked] = useState("");
  const [whatToImprove, setWhatToImprove] = useState("");
  const [intent, setIntent] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (rating === 0) {
      toast({ title: "Dê uma nota geral", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("cycle_feedback").insert({
      student_id: studentId,
      company_id: companyId,
      enrollment_id: enrollmentId,
      rating,
      what_worked: whatWorked.trim() || null,
      what_to_improve: whatToImprove.trim() || null,
      renewal_intent: intent || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Obrigado!", description: "Seu feedback foi enviado para o treinador." });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-primary text-lg" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            COMO FOI ESSE CICLO?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <label className="text-sm font-sans font-medium text-foreground">Avaliação geral</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)} className="p-1">
                  <Star className={`h-7 w-7 transition-all ${n <= rating ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground/40"}`} />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-sans font-medium text-foreground">O que funcionou bem?</label>
            <Textarea value={whatWorked} onChange={(e) => setWhatWorked(e.target.value.slice(0, 500))} rows={3} placeholder="Ex: progressão de carga, frequência, escolha de exercícios..." />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-sans font-medium text-foreground">O que poderia melhorar?</label>
            <Textarea value={whatToImprove} onChange={(e) => setWhatToImprove(e.target.value.slice(0, 500))} rows={3} placeholder="Ex: volume, descanso, variedade..." />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-sans font-medium text-foreground">Pretende renovar?</label>
            <div className="space-y-1.5">
              {INTENTS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setIntent(opt.value)}
                  className={`w-full text-left px-3 py-2 rounded-md border text-sm font-sans transition-all ${
                    intent === opt.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground/60"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
