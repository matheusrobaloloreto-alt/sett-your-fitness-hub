import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MuscleRadar } from "@/components/student/MuscleRadar";
import { summarizeRealizedTraining, type RealizedSession } from "@/lib/realizedTraining";
import { businessDateYmd } from "@/lib/businessDate";

export function StudentVolumePanel({ studentId, companyId, cycleId }: {
  studentId: string;
  companyId: string | null;
  cycleId: string;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["student-cycle-volume", companyId, studentId, cycleId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      if (!companyId) throw new Error("Empresa indisponível");
      const pageSize = 500;
      const sessions: RealizedSession[] = [];
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase.from("workout_sessions")
          .select("id, status, session_date, workout_id, duration_seconds, total_volume, total_sets_completed, duplicate_of_session_id, exercises_summary, workouts!inner(cycle_id, training_cycles!inner(student_id, company_id))")
          .eq("student_id", studentId)
          .or(`company_id.eq.${companyId},company_id.is.null`)
          .eq("workouts.cycle_id", cycleId)
          .eq("workouts.training_cycles.student_id", studentId)
          .eq("workouts.training_cycles.company_id", companyId)
          .eq("status", "completed")
          .order("id")
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        sessions.push(...data);
        if (data.length < pageSize) break;
      }
      const result = summarizeRealizedTraining({ sessions, logs: [], studentId, companyId, end: businessDateYmd() });
      return result.muscles.map(({ group: muscleGroup, sets: volume }) => ({ muscleGroup, volume }));
    },
  });

  if (isLoading) return <Loader2 className="mx-auto h-5 w-5 animate-spin" aria-label="Carregando volume" />;
  if (!companyId || isError) return <p role="alert">Não foi possível carregar o volume realizado do ciclo.</p>;
  if (!data?.length) return <p className="text-sm text-muted-foreground">Sem séries por grupamento registradas nas sessões concluídas deste ciclo.</p>;
  return <>
    <p className="text-xs text-muted-foreground">Séries por músculo principal registradas nas sessões concluídas do ciclo.</p>
    <MuscleRadar muscleVolumes={data} unit="sets" />
  </>;
}
