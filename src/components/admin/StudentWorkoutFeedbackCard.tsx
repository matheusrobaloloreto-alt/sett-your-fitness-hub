import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, MessageSquareReply } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

interface WorkoutFeedback {
  id: string;
  created_at: string;
  workout_title: string | null;
  notes: string | null;
  trainer_reply: string | null;
  trainer_replied_at: string | null;
  trainer_reply_author_name: string | null;
}

function splitFeedbackNotes(notes: string | null) {
  const lines = (notes || "").split("\n").map((line) => line.trim()).filter(Boolean);
  const perception = lines.find((line) => line.startsWith("Percepção:"))?.replace("Percepção:", "").trim() || null;
  const body = lines.filter((line) => !line.startsWith("Percepção:")).join("\n");
  return { perception, body };
}

export function StudentWorkoutFeedbackCard({ studentId }: { studentId: string }) {
  const { toast } = useToast();
  const [feedbacks, setFeedbacks] = useState<WorkoutFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("workout_feedback")
      .select("id, created_at, workout_title, notes, trainer_reply, trainer_replied_at, trainer_reply_author_name")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast({ title: "Erro ao carregar feedbacks de treino", description: error.message, variant: "destructive" });
          setFeedbacks([]);
        } else {
          setFeedbacks((data as WorkoutFeedback[]) || []);
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [studentId, toast]);

  const saveReply = async (feedback: WorkoutFeedback) => {
    const reply = (drafts[feedback.id] || "").trim();
    if (!reply) return;
    setSavingId(feedback.id);
    const { data, error } = await supabase.rpc("reply_to_workout_feedback", {
      _feedback_id: feedback.id,
      _trainer_reply: reply,
    });
    if (error || !data) {
      toast({
        title: "Resposta não salva",
        description: error?.message || "Tente novamente em instantes.",
        variant: "destructive",
      });
    } else {
      setFeedbacks((current) => current.map((item) => item.id === feedback.id ? { ...item, ...(data as WorkoutFeedback) } : item));
      setDrafts((current) => ({ ...current, [feedback.id]: "" }));
      toast({ title: "Resposta registrada", description: "O aluno verá sua resposta no histórico do treino." });
    }
    setSavingId(null);
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-primary text-lg">
          <MessageSquareReply className="h-4 w-4" />
          FEEDBACKS RECENTES DE TREINO
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground font-sans">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando feedbacks...
          </div>
        ) : feedbacks.length === 0 ? (
          <p className="text-sm text-muted-foreground font-sans">Nenhum feedback de treino registrado ainda.</p>
        ) : feedbacks.map((feedback) => {
          const notes = splitFeedbackNotes(feedback.notes);
          const title = feedback.workout_title || "Treino";
          return (
            <div key={feedback.id} className="rounded-lg border border-border bg-secondary/35 p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground font-sans">{title}</p>
                  <p className="text-xs text-muted-foreground font-mono-data">
                    {format(parseISO(feedback.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    {notes.perception ? ` · ${notes.perception}` : ""}
                  </p>
                </div>
              </div>
              {notes.body && <p className="whitespace-pre-wrap text-sm text-foreground font-sans">{notes.body}</p>}
              {feedback.trainer_reply ? (
                <div className="rounded-md border border-primary/20 bg-primary/5 p-2">
                  <p className="text-xs font-semibold text-primary font-sans">
                    Respondido por {feedback.trainer_reply_author_name || "treinador"}
                    {feedback.trainer_replied_at ? ` em ${format(parseISO(feedback.trainer_replied_at), "dd/MM/yyyy", { locale: ptBR })}` : ""}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground font-sans">{feedback.trainer_reply}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Textarea
                    aria-label={`Responder feedback do treino ${title}`}
                    value={drafts[feedback.id] || ""}
                    onChange={(event) => setDrafts((current) => ({ ...current, [feedback.id]: event.target.value }))}
                    placeholder="Escreva uma resposta objetiva para o aluno."
                    className="min-h-[80px]"
                    maxLength={1500}
                  />
                  <Button
                    size="sm"
                    onClick={() => saveReply(feedback)}
                    disabled={savingId === feedback.id || !(drafts[feedback.id] || "").trim()}
                  >
                    {savingId === feedback.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Responder ao aluno
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
