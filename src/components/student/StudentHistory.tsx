import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Dumbbell, CalendarDays, MessageSquareReply } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { isCompletedTrainingLog } from "@/lib/studentWeek";

interface WorkoutData {
  id: string;
  title: string;
}

interface StudentHistoryProps {
  allLogs: any[];
  workouts: WorkoutData[];
  sessions: any[];
  feedbacks?: WorkoutFeedback[];
}

interface WorkoutFeedback {
  id: string;
  workout_session_id: string | null;
  notes: string | null;
  trainer_reply: string | null;
  trainer_replied_at: string | null;
  trainer_reply_author_name: string | null;
}

interface SessionGroup {
  date: string;
  workoutTitle: string;
  workoutId: string;
  workoutSessionId: string | null;
  totalVolume: number | null;
  totalSets: number | null;
  pendingSets: number;
  durationSeconds: number | null;
  unassignedLogs?: boolean;
}

function feedbackBody(notes: string | null) {
  if (!notes) return "";
  return notes
    .split("\n")
    .filter((line) => !line.startsWith("Percepção:"))
    .join("\n")
    .trim();
}

export function StudentHistory({ allLogs, workouts, sessions, feedbacks = [] }: StudentHistoryProps) {
  const workoutMap = useMemo(() => {
    const map: Record<string, string> = {};
    workouts.forEach(w => { map[w.id] = w.title; });
    return map;
  }, [workouts]);

  const groupedSessions = useMemo(() => {
    const groups: Record<string, { date: string; workoutId: string; volume: number; completed: number; pending: number }> = {};

    allLogs.forEach((log: any) => {
      if (!log.session_date || log.deleted) return;
      const key = `${log.session_date}-${log.workout_id}`;
      const group = groups[key] ??= { date: log.session_date, workoutId: log.workout_id, volume: 0, completed: 0, pending: 0 };
      if (isCompletedTrainingLog(log)) {
        group.completed++;
        group.volume += (Number(log.weight) || 0) * (Number(log.reps_done) || 0);
      } else {
        group.pending++;
      }
    });

    const historySessions = sessions.filter(session => session.status !== "reconciled");
    const result: SessionGroup[] = [];
    Object.values(groups).forEach(g => {
      const matching = historySessions.filter((s: any) => s.workout_id === g.workoutId && s.session_date === g.date);
      const unassignedLogs = matching.length > 1 && matching.every(session => session.total_volume == null && session.total_sets_completed == null);
      const showTotals = matching.length === 0 || unassignedLogs;
      if (showTotals || (matching.length > 1 && g.pending > 0)) result.push({
        date: g.date,
        workoutTitle: workoutMap[g.workoutId] || "Treino",
        workoutId: g.workoutId,
        workoutSessionId: null,
        totalVolume: showTotals ? g.volume : null,
        totalSets: showTotals ? g.completed : null,
        pendingSets: g.pending,
        durationSeconds: null,
        unassignedLogs: matching.length > 1,
      });
    });
    // Concrete sessions remain visible without set logs and keep their own replies.
    historySessions.forEach((session: any) => {
      if (!session.session_date || !session.workout_id) return;
      const group = groups[`${session.session_date}-${session.workout_id}`];
      if (!group && session.status !== 'completed' && !session.completed_at) return;
      const onlySession = historySessions.filter((s: any) => s.workout_id === session.workout_id && s.session_date === session.session_date).length === 1;
      const matchedGroup = onlySession ? group : null;
      result.push({
        date: session.session_date,
        workoutTitle: workoutMap[session.workout_id] || 'Treino',
        workoutId: session.workout_id,
        workoutSessionId: session.id,
        totalVolume: session.total_volume ?? matchedGroup?.volume ?? null,
        totalSets: session.total_sets_completed ?? matchedGroup?.completed ?? null,
        pendingSets: matchedGroup?.pending ?? 0,
        durationSeconds: session.duration_seconds || null,
      });
    });

    return result.sort((a, b) => b.date.localeCompare(a.date));
  }, [allLogs, workoutMap, sessions]);

  const feedbackBySession = useMemo(() => {
    const map: Record<string, WorkoutFeedback> = {};
    feedbacks.forEach((feedback) => {
      if (feedback.workout_session_id && !map[feedback.workout_session_id]) {
        map[feedback.workout_session_id] = feedback;
      }
    });
    return map;
  }, [feedbacks]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    return `${m}min`;
  };

  if (groupedSessions.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-display text-foreground">Histórico</h2>
        <Card className="bg-card border-border border-dashed">
          <CardContent className="p-8 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground font-sans">Nenhuma sessão registrada ainda.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Group by month
  const byMonth: Record<string, SessionGroup[]> = {};
  groupedSessions.forEach(s => {
    const monthKey = s.date.substring(0, 7); // YYYY-MM
    if (!byMonth[monthKey]) byMonth[monthKey] = [];
    byMonth[monthKey].push(s);
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-display text-foreground">Histórico</h2>

      {Object.entries(byMonth).map(([monthKey, sessions]) => (
        <div key={monthKey} className="space-y-2">
          <p className="text-xs text-muted-foreground font-sans uppercase tracking-wider font-semibold">
            {format(parseISO(monthKey + "-01"), "MMMM yyyy", { locale: ptBR })}
          </p>
          {sessions.map((s, i) => {
            const feedback = s.workoutSessionId ? feedbackBySession[s.workoutSessionId] : null;
            const replyAuthor = feedback?.trainer_reply_author_name || "treinador";
            return (
            <Card key={s.workoutSessionId || `${s.date}-${s.workoutId}-${i}`} className="bg-card border-border">
              <CardContent className="space-y-3 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Dumbbell className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground font-sans">{s.workoutTitle}</p>
                      {s.unassignedLogs && <p className="text-xs text-muted-foreground">Registros de séries sem sessão identificada</p>}
                      {s.pendingSets > 0 && <p className="text-xs text-muted-foreground">
                        {s.pendingSets === 1 ? "1 série pendente" : `${s.pendingSets} séries pendentes`}
                      </p>}
                      <p className="text-xs text-muted-foreground font-mono-data">
                        {format(parseISO(s.date), "dd/MM/yyyy (EEEE)", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.durationSeconds && (
                      <Badge variant="secondary" className="text-[10px] gap-1 font-mono-data">
                        <Clock className="h-3 w-3" />
                        {formatDuration(s.durationSeconds)}
                      </Badge>
                    )}
                    {s.totalVolume !== null && s.totalVolume > 0 && (
                      <Badge variant="outline" className="text-[10px] font-mono-data border-primary/30 text-primary">
                        {(s.totalVolume / 1000).toFixed(1)}t
                      </Badge>
                    )}
                  </div>
                </div>
                {feedback && (
                  <div className="rounded-lg border border-border bg-secondary/35 p-3 text-sm font-sans">
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                      <MessageSquareReply className="h-3.5 w-3.5" />
                      <span>{feedback.trainer_reply ? `Resposta de ${replyAuthor}` : "Feedback enviado"}</span>
                      {feedback.trainer_replied_at && (
                        <span className="font-normal">
                          {format(parseISO(feedback.trainer_replied_at), "dd/MM/yyyy", { locale: ptBR })}
                        </span>
                      )}
                    </div>
                    {feedbackBody(feedback.notes) && (
                      <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{feedbackBody(feedback.notes)}</p>
                    )}
                    <p className="mt-2 whitespace-pre-wrap text-foreground">
                      {feedback.trainer_reply || "Feedback enviado. Aguarde o retorno do treinador."}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          );})}
        </div>
      ))}
    </div>
  );
}
