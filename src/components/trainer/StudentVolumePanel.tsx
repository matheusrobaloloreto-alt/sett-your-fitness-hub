// Painel de volume do aluno para o ADMIN (ficha do aluno). Auto-suficiente: busca os próprios
// dados por studentId (workout_logs + os workouts referenciados pelos logs) e reusa VolumeInsights.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { VolumeInsights } from "@/components/student/VolumeInsights";
import type { CycleLike } from "@/lib/volumeStats";

export function StudentVolumePanel({ studentId }: { studentId: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [cycles, setCycles] = useState<CycleLike[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    (async () => {
      setLoading(true);
      const { data: logRows } = await supabase
        .from("workout_logs")
        .select("weight, reps_done, session_date, workout_id, exercise_index")
        .eq("student_id", studentId);
      const rows = logRows ?? [];
      // Carrega só os workouts realmente referenciados pelos logs → mapeia muscle_group.
      const workoutIds = Array.from(new Set(rows.map((l: any) => l.workout_id).filter(Boolean)));
      let workoutsShaped: CycleLike["workouts"] = [];
      if (workoutIds.length > 0) {
        const { data: workoutsData } = await supabase
          .from("workouts")
          .select("id, exercises")
          .in("id", workoutIds);
        workoutsShaped = (workoutsData ?? []).map((w: any) => ({
          id: w.id,
          exercises: ((w.exercises as any[]) ?? []).map((ex) => ({
            exercise_id: ex.exercise_id || ex.exerciseId,
            exercise_name: ex.exercise_name,
            muscle_group: ex.muscle_group,
          })),
        }));
      }
      if (on) {
        setLogs(rows);
        setCycles([{ workouts: workoutsShaped }]);
        setLoading(false);
      }
    })();
    return () => { on = false; };
  }, [studentId]);

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  return <VolumeInsights allLogs={logs} cycles={cycles} />;
}
