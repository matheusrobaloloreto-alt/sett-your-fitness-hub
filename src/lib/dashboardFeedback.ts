import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type DashboardFeedbackOrigin = {
  feedback_id: string;

  has_original: boolean;
  needs_adjustment: boolean;
  reviewed_at: string | null;
  reaction_attempted_at: string | null;
};

// The new table is deliberately scoped to this contract until the generated
// Supabase client types are refreshed by the integration owner.
export async function readDashboardFeedbackOrigins(companyId: string, feedbackIds: string[]) {
  const client = supabase as unknown as SupabaseClient;
  const { data, error } = await client.from("workout_feedback_whatsapp_origins")
    .select("feedback_id, has_original, needs_adjustment, reviewed_at, reaction_attempted_at")
    .eq("company_id", companyId).in("feedback_id", feedbackIds);
  if (error) throw error;
  return (data ?? []) as DashboardFeedbackOrigin[];
}

export async function dashboardFeedbackAction(
  action: "workout-feedback-origin" | "acknowledge-workout-feedback",
  companyId: string,
  dashboardFeedbackId: string,
) {
  const { data, error } = await supabase.functions.invoke("whatsapp-manager", {
    body: { action, companyId, dashboardFeedbackId },
  });
  if (error) {
    const payload = await error.context?.json?.().catch(() => null);
    throw new Error(payload?.error || "Não foi possível confirmar a ação do feedback.");
  }
  return data;
}
