import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Dumbbell, CalendarDays } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface WorkoutData {
  id: string;
  title: string;
}

interface StudentHistoryProps {
  allLogs: any[];
  workouts: WorkoutData[];
  sessions: any[];
}

interface SessionGroup {
  date: string;
  workoutTitle: string;
  workoutId: string;
  totalVolume: number;
  totalSets: number;
  durationSeconds: number | null;
}

export function StudentHistory({ allLogs, workouts, sessions }: StudentHistoryProps) {
  const workoutMap = useMemo(() => {
    const map: Record<string, string> = {};
    workouts.forEach(w => { map[w.id] = w.title; });
    return map;
  }, [workouts]);

  const groupedSessions = useMemo(() => {
    // Group logs by date + workout_id
    const groups: Record<string, { date: string; workoutId: string; logs: any[] }> = {};

    allLogs.forEach((log: any) => {
      if (!log.session_date) return;
      const key = `${log.session_date}-${log.workout_id}`;
      if (!groups[key]) {
        groups[key] = { date: log.session_date, workoutId: log.workout_id, logs: [] };
      }
      groups[key].logs.push(log);
    });

    const result: SessionGroup[] = Object.values(groups).map(g => {
      const totalVolume = g.logs.reduce((sum: number, l: any) =>
        sum + (Number(l.weight) || 0) * (Number(l.reps_done) || 0), 0
      );
      const totalSets = g.logs.length;

      // Find matching workout_session for duration
      const ws = sessions.find((s: any) => s.workout_id === g.workoutId && s.session_date === g.date);

      return {
        date: g.date,
        workoutTitle: workoutMap[g.workoutId] || "Treino",
        workoutId: g.workoutId,
        totalVolume,
        totalSets,
        durationSeconds: ws?.duration_seconds || null,
      };
    });

    return result.sort((a, b) => b.date.localeCompare(a.date));
  }, [allLogs, workoutMap, sessions]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    return `${m}min`;
  };

  if (groupedSessions.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-foreground font-sans">Histórico</h2>
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
      <h2 className="text-lg font-bold text-foreground font-sans">Histórico</h2>

      {Object.entries(byMonth).map(([monthKey, sessions]) => (
        <div key={monthKey} className="space-y-2">
          <p className="text-xs text-muted-foreground font-sans uppercase tracking-wider font-semibold">
            {format(parseISO(monthKey + "-01"), "MMMM yyyy", { locale: ptBR })}
          </p>
          {sessions.map((s, i) => (
            <Card key={`${s.date}-${s.workoutId}-${i}`} className="bg-card border-border">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Dumbbell className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground font-sans">{s.workoutTitle}</p>
                    <p className="text-xs text-muted-foreground font-sans">
                      {format(parseISO(s.date), "dd/MM/yyyy (EEEE)", { locale: ptBR })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {s.durationSeconds && (
                    <Badge variant="secondary" className="text-[10px] gap-1 font-sans">
                      <Clock className="h-3 w-3" />
                      {formatDuration(s.durationSeconds)}
                    </Badge>
                  )}
                  {s.totalVolume > 0 && (
                    <Badge variant="outline" className="text-[10px] font-sans border-primary/30 text-primary">
                      {(s.totalVolume / 1000).toFixed(1)}t
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}
