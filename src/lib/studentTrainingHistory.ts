import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/database";

// client_updated_at belongs to the local draft, not the production table.
export const WORKOUT_LOG_COLUMNS = "id, workout_id, exercise_index, set_number, weight, reps_done, session_date, set_type, rpe, completed, revision, updated_at, created_at";

export async function loadStudentTrainingHistory(client: SupabaseClient<Database>, studentId: string, scope?: { companyId: string; start?: string; end?: string }) {
  const logs = [];
  const sessions = [];
  const pageSize = 500;
  // Read across revisions/cycles: replacing a prescription must not erase its calendar history.
  for (let offset = 0; ; offset += pageSize) {
    let query = client.from("workout_logs")
      .select(`${WORKOUT_LOG_COLUMNS}, student_id`).eq("student_id", studentId);
    if (scope?.start) query = query.gte("session_date", scope.start);
    if (scope?.end) query = query.lte("session_date", scope.end);
    const { data, error } = await query.order("id").range(offset, offset + pageSize - 1);
    if (error) throw error;
    if ((data || []).some(row => row.student_id != null && row.student_id !== studentId)) throw new Error("Log scope unavailable");
    logs.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  for (let offset = 0; ; offset += pageSize) {
    let query = client.from("workout_sessions")
      .select("id, workout_id, session_date, duration_seconds, total_volume, total_sets_completed, total_sets_prescribed, completed_at, status, student_id, company_id, exercises_summary, duplicate_of_session_id")
      .eq("student_id", studentId);
    if (scope) query = query.or(`company_id.eq.${scope.companyId},company_id.is.null`);
    if (scope?.start) query = query.gte("session_date", scope.start);
    if (scope?.end) query = query.lte("session_date", scope.end);
    const { data, error } = await query.order("id").range(offset, offset + pageSize - 1);
    if (error) throw error;
    if ((data || []).some(row => (row.student_id != null && row.student_id !== studentId) ||
      (scope && row.company_id != null && row.company_id !== scope.companyId))) throw new Error("Session scope unavailable");
    sessions.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return { logs, sessions };
}
