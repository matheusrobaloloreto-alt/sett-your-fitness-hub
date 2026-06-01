import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, Star, Activity, CheckCheck, AlertCircle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";

interface WorkoutFeedback {
  id: string;
  created_at: string;
  difficulty: number | null;
  energy: number | null;
  pain_areas: { muscle_group_id: string; intensity: number }[];
  notes: string | null;
  read_at: string | null;
  workout_session_id: string | null;
}

interface CycleFeedback {
  id: string;
  created_at: string;
  rating: number | null;
  what_worked: string | null;
  what_to_improve: string | null;
  renewal_intent: string | null;
  read_at: string | null;
}

const ENERGY_EMOJI = ["", "😴", "😕", "😐", "🙂", "🔥"];
const INTENT_LABEL: Record<string, string> = { yes: "Quer renovar", talk: "Quer conversar", no: "Não continua" };
const INTENT_COLOR: Record<string, string> = { yes: "bg-success/15 text-success border-success/30", talk: "bg-warning/15 text-warning border-warning/30", no: "bg-destructive/15 text-destructive border-destructive/30" };

interface Props {
  studentId: string;
}

export function StudentFeedbackTab({ studentId }: Props) {
  const [workoutFb, setWorkoutFb] = useState<WorkoutFeedback[]>([]);
  const [cycleFb, setCycleFb] = useState<CycleFeedback[]>([]);
  const [groups, setGroups] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [studentId]);

  const load = async () => {
    setLoading(true);
    const [wf, cf, mg] = await Promise.all([
      supabase.from("workout_feedback").select("*").eq("student_id", studentId).order("created_at", { ascending: false }),
      supabase.from("cycle_feedback").select("*").eq("student_id", studentId).order("created_at", { ascending: false }),
      supabase.from("muscle_groups").select("id, name"),
    ]);
    setWorkoutFb((wf.data as any) || []);
    setCycleFb((cf.data as any) || []);
    setGroups(Object.fromEntries((mg.data || []).map((g: any) => [g.id, g.name])));
    setLoading(false);

    // Marca como lidos
    const unreadW = (wf.data || []).filter((f: any) => !f.read_at).map((f: any) => f.id);
    const unreadC = (cf.data || []).filter((f: any) => !f.read_at).map((f: any) => f.id);
    if (unreadW.length) supabase.from("workout_feedback").update({ read_at: new Date().toISOString() }).in("id", unreadW).then();
    if (unreadC.length) supabase.from("cycle_feedback").update({ read_at: new Date().toISOString() }).in("id", unreadC).then();
  };

  if (loading) return <div className="text-sm text-muted-foreground font-sans p-4">Carregando...</div>;

  return (
    <div className="space-y-4">
      {/* Cycle feedback */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-primary text-lg flex items-center gap-2">
            <Star className="h-4 w-4" /> FEEDBACK DE CICLO ({cycleFb.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {cycleFb.length === 0 && (
            <p className="text-sm text-muted-foreground font-sans">Nenhum feedback de ciclo recebido.</p>
          )}
          {cycleFb.map((f) => (
            <div key={f.id} className="border border-border rounded-lg p-3 space-y-2 text-sm font-sans">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={`h-3.5 w-3.5 ${n <= (f.rating || 0) ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground/30"}`} />
                    ))}
                  </div>
                  {f.renewal_intent && (
                    <Badge variant="outline" className={`text-[10px] ${INTENT_COLOR[f.renewal_intent] || ""}`}>
                      {INTENT_LABEL[f.renewal_intent] || f.renewal_intent}
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{format(parseISO(f.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
              </div>
              {f.what_worked && (
                <div>
                  <span className="text-xs font-medium text-success">✓ Funcionou: </span>
                  <span className="text-foreground">{f.what_worked}</span>
                </div>
              )}
              {f.what_to_improve && (
                <div>
                  <span className="text-xs font-medium text-warning">! Melhorar: </span>
                  <span className="text-foreground">{f.what_to_improve}</span>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Workout feedback */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-primary text-lg flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> FEEDBACK PÓS-TREINO ({workoutFb.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {workoutFb.length === 0 && (
            <p className="text-sm text-muted-foreground font-sans">Nenhum feedback de treino recebido.</p>
          )}
          {workoutFb.map((f) => (
            <div key={f.id} className="border border-border rounded-lg p-3 space-y-2 text-sm font-sans">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  {f.difficulty != null && (
                    <Badge variant="outline" className="text-[10px] font-mono">
                      <Activity className="h-3 w-3 mr-1" /> {f.difficulty}/10
                    </Badge>
                  )}
                  {f.energy != null && (
                    <Badge variant="outline" className="text-[10px]">
                      {ENERGY_EMOJI[f.energy]} energia {f.energy}/5
                    </Badge>
                  )}
                  {f.pain_areas?.length > 0 && (
                    <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">
                      <AlertCircle className="h-3 w-3 mr-1" />{f.pain_areas.length} área{f.pain_areas.length > 1 ? "s" : ""} de dor
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{format(parseISO(f.created_at), "dd/MM HH:mm", { locale: ptBR })}</span>
              </div>
              {f.pain_areas?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {f.pain_areas.map((p, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-mono">
                      {groups[p.muscle_group_id] || "?"} {"•".repeat(p.intensity)}
                    </span>
                  ))}
                </div>
              )}
              {f.notes && <p className="text-foreground whitespace-pre-wrap">{f.notes}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
