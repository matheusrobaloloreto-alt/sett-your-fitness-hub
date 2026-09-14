import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ExerciseMuscleTarget } from "@/lib/volumeStats";

/** Student-scoped RPC keeps all anatomical charts on the same target contract. */
export function useExerciseVolumeTargets(studentId: string | undefined, exerciseIds: string[]) {
  const key = [...new Set(exerciseIds)].sort().join(",");
  const [result, setResult] = useState<{ key: string; targets: ExerciseMuscleTarget[] }>({ key: "", targets: [] });
  const scopeKey = `${studentId || ""}:${key}`;
  useEffect(() => {
    let active = true;
    if (!studentId || !key) return () => { active = false; };
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("get_effective_exercise_targets", {
          p_student_id: studentId, p_exercise_ids: key.split(","),
        });
        if (error) throw error;
        if (active) setResult({ key: scopeKey, targets: (data || []).map((target) => ({
          exerciseId: target.exercise_id,
          muscleGroup: target.muscle_group_name,
          role: target.role,
          isPrimary: target.is_primary,
          volumePercentage: target.volume_percentage,
        })) });
      } catch {
        // No stale targets from another student; unmapped charts use only a
        // canonical legacy primary group while the RPC is unavailable.
        if (active) setResult({ key: scopeKey, targets: [] });
      }
    })();
    return () => { active = false; };
  }, [studentId, key, scopeKey]);
  return result.key === scopeKey ? result.targets : [];
}
