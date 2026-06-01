import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, CheckCircle2, Circle, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const DAYS = [
  { label: "Seg", dayOfWeek: 1 },
  { label: "Ter", dayOfWeek: 2 },
  { label: "Qua", dayOfWeek: 3 },
  { label: "Qui", dayOfWeek: 4 },
  { label: "Sex", dayOfWeek: 5 },
  { label: "Sáb", dayOfWeek: 6 },
  { label: "Dom", dayOfWeek: 0 },
];

interface Props {
  studentId: string;
}

export function TrainerWeeklyBar({ studentId }: Props) {
  const [scheduledDays, setScheduledDays] = useState<Map<number, string>>(new Map());
  const [completedDays, setCompletedDays] = useState<Set<number>>(new Set());
  const [workoutNames, setWorkoutNames] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [studentId]);

  const loadData = async () => {
    // Get active enrollment -> cycles -> workouts with day_of_week
    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("id")
      .eq("student_id", studentId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!enrollment) { setLoading(false); return; }

    const { data: cycles } = await supabase
      .from("training_cycles")
      .select("id")
      .eq("enrollment_id", enrollment.id);

    if (!cycles?.length) { setLoading(false); return; }

    const { data: workouts } = await supabase
      .from("workouts")
      .select("id, title, day_of_week")
      .in("cycle_id", cycles.map(c => c.id));

    const scheduled = new Map<number, string>();
    const names = new Map<number, string>();
    (workouts || []).forEach(w => {
      if (w.day_of_week !== null) {
        scheduled.set(w.day_of_week, w.id);
        names.set(w.day_of_week, w.title || "Treino");
      }
    });
    setScheduledDays(scheduled);
    setWorkoutNames(names);

    if (scheduled.size === 0) { setLoading(false); return; }

    // Get logs for current week
    const now = new Date();
    const jsDow = now.getDay();
    const mondayOffset = jsDow === 0 ? -6 : 1 - jsDow;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + mondayOffset);
    const weekStartStr = weekStart.toISOString().split("T")[0];
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().split("T")[0];

    const workoutIds = Array.from(scheduled.values());
    const { data: logs } = await supabase
      .from("workout_logs")
      .select("workout_id, session_date")
      .eq("student_id", studentId)
      .in("workout_id", workoutIds)
      .gte("session_date", weekStartStr)
      .lte("session_date", weekEndStr);

    const completed = new Set<number>();
    const workoutDowMap = new Map<string, number>();
    scheduled.forEach((wId, dow) => workoutDowMap.set(wId, dow));

    (logs || []).forEach((l: any) => {
      const dow = workoutDowMap.get(l.workout_id);
      if (dow !== undefined) completed.add(dow);
    });

    setCompletedDays(completed);
    setLoading(false);
  };

  if (loading || scheduledDays.size === 0) return null;

  const currentDow = new Date().getDay();
  const completedCount = completedDays.size;
  const totalScheduled = scheduledDays.size;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-primary text-lg flex items-center gap-2">
          <CalendarDays className="h-5 w-5" />
          FREQUÊNCIA SEMANAL
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-1.5 justify-between">
          {DAYS.map(day => {
            const hasWorkout = scheduledDays.has(day.dayOfWeek);
            const isToday = day.dayOfWeek === currentDow;
            const isCompleted = completedDays.has(day.dayOfWeek);
            const name = workoutNames.get(day.dayOfWeek);

            return (
              <div
                key={day.label}
                className={cn(
                  "flex flex-col items-center gap-1.5 py-2.5 px-2 sm:px-3 rounded-lg flex-1 min-w-0 border transition-all",
                  isToday && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                  hasWorkout ? "border-border" : "border-transparent opacity-40"
                )}
                title={name || undefined}
              >
                <span className={cn(
                  "text-[11px] font-medium font-sans",
                  isToday ? "text-primary" : "text-muted-foreground"
                )}>
                  {day.label}
                </span>
                {hasWorkout ? (
                  isCompleted ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <Dumbbell className={cn("h-5 w-5", isToday ? "text-primary" : "text-muted-foreground")} />
                  )
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/20" />
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-sm font-sans">
          <span className="text-muted-foreground">Treinos esta semana</span>
          <Badge variant={completedCount >= totalScheduled ? "default" : "secondary"} className="text-xs">
            {completedCount}/{totalScheduled}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
