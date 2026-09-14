import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/database";

// client_updated_at belongs to the local draft, not the production table.
export const WORKOUT_LOG_COLUMNS = "id, workout_id, exercise_index, set_number, weight, reps_done, session_date, set_type, rpe, completed, revision, updated_at, created_at";

export async function loadStudentTrainingHistory(client: SupabaseClient<Database>, studentId: string) {
  const logs = [];
  const sessions = [];
  const pageSize = 500;
  // Read across revisions/cycles: replacing a prescription must not erase its calendar history.
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from("workout_logs")
      .select(WORKOUT_LOG_COLUMNS).eq("student_id", studentId)
      .order("id").range(offset, offset + pageSize - 1);
    if (error) throw error;
    logs.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from("workout_sessions")
      .select("id, workout_id, session_date, duration_seconds, total_volume, total_sets_completed, total_sets_prescribed, completed_at, status")
      .eq("student_id", studentId).order("id").range(offset, offset + pageSize - 1);
    if (error) throw error;
    sessions.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return { logs, sessions };
}
