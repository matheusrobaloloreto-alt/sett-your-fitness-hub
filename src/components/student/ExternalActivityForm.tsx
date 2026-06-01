import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export const ACTIVITY_TYPES = [
  { value: "corrida", label: "Corrida", hasDistance: true },
  { value: "caminhada", label: "Caminhada", hasDistance: true },
  { value: "natacao", label: "Natação", hasDistance: true },
  { value: "bike", label: "Bike", hasDistance: true },
  { value: "yoga", label: "Yoga", hasDistance: false },
  { value: "funcional", label: "Funcional", hasDistance: false },
  { value: "luta", label: "Luta / Boxe", hasDistance: false },
  { value: "outro", label: "Outro", hasDistance: false },
] as const;

interface ExistingActivity {
  id: string;
  activity_type: string;
  activity_date: string;
  duration_minutes: number | null;
  distance_km: number | null;
  intensity: number | null;
  notes: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  studentId: string;
  companyId: string;
  existing?: ExistingActivity | null;
  onSaved?: () => void;
}

export function ExternalActivityForm({ open, onClose, studentId, companyId, existing, onSaved }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [activityType, setActivityType] = useState("corrida");
  const [activityDate, setActivityDate] = useState(new Date().toISOString().split("T")[0]);
  const [duration, setDuration] = useState<string>("");
  const [distance, setDistance] = useState<string>("");
  const [intensity, setIntensity] = useState<number>(3);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (existing) {
      setActivityType(existing.activity_type);
      setActivityDate(existing.activity_date);
      setDuration(existing.duration_minutes?.toString() || "");
      setDistance(existing.distance_km?.toString() || "");
      setIntensity(existing.intensity || 3);
      setNotes(existing.notes || "");
    } else {
      setActivityType("corrida");
      setActivityDate(new Date().toISOString().split("T")[0]);
      setDuration("");
      setDistance("");
      setIntensity(3);
      setNotes("");
    }
  }, [existing, open]);

  const typeMeta = ACTIVITY_TYPES.find(t => t.value === activityType) ?? ACTIVITY_TYPES[0];

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      student_id: studentId,
      company_id: companyId,
      activity_type: activityType,
      activity_date: activityDate,
      duration_minutes: duration ? parseInt(duration) : null,
      distance_km: typeMeta.hasDistance && distance ? parseFloat(distance) : null,
      intensity,
      notes: notes.trim() || null,
    };

    const { data: saved, error } = existing
      ? await supabase.from("external_activities").update(payload).eq("id", existing.id).select("id").maybeSingle()
      : await supabase.from("external_activities").insert(payload).select("id").maybeSingle();

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }

    // Gamification: award XP only on new activities; check achievements either way.
    try {
      if (!existing && saved?.id) {
        await supabase.rpc("award_xp", {
          _student_id: studentId,
          _event_type: "external_activity",
          _xp_amount: 30,
          _source_id: saved.id,
          _notes: activityType,
        });
      }
      await supabase.rpc("check_and_unlock_achievements", { _student_id: studentId });
    } catch (e) {
      console.warn("XP/achievements grant failed", e);
    }

    toast({ title: existing ? "Atividade atualizada" : "Atividade registrada" });
    onSaved?.();
    onClose();
  };


  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-primary" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            {existing ? "EDITAR ATIVIDADE" : "REGISTRAR ATIVIDADE"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs font-sans text-muted-foreground">Tipo</Label>
            <div className="grid grid-cols-4 gap-2 mt-1.5">
              {ACTIVITY_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setActivityType(t.value)}
                  className={`px-2 py-2 rounded-md text-xs font-sans border transition-all ${
                    activityType === t.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="activity_date" className="text-xs font-sans text-muted-foreground">Data</Label>
              <Input id="activity_date" type="date" value={activityDate} onChange={e => setActivityDate(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="duration" className="text-xs font-sans text-muted-foreground">Duração (min)</Label>
              <Input id="duration" type="number" min={1} value={duration} onChange={e => setDuration(e.target.value)} placeholder="45" className="mt-1.5" />
            </div>
          </div>

          {typeMeta.hasDistance && (
            <div>
              <Label htmlFor="distance" className="text-xs font-sans text-muted-foreground">Distância (km)</Label>
              <Input id="distance" type="number" step="0.1" min={0} value={distance} onChange={e => setDistance(e.target.value)} placeholder="5.0" className="mt-1.5" />
            </div>
          )}

          <div>
            <Label className="text-xs font-sans text-muted-foreground">Intensidade percebida</Label>
            <div className="flex gap-1.5 mt-1.5">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setIntensity(n)}
                  className={`flex-1 py-2 rounded-md text-sm font-sans border transition-all ${
                    intensity === n
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground font-sans mt-1">1 = leve · 5 = exaustivo</p>
          </div>

          <div>
            <Label htmlFor="notes" className="text-xs font-sans text-muted-foreground">Notas (opcional)</Label>
            <Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Como se sentiu, percurso, etc." className="mt-1.5 resize-none" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {existing ? "Atualizar" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
