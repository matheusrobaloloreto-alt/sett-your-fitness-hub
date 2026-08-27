import { supabase } from "@/integrations/supabase/client";

export async function getUnreadAnnouncementCount(studentId: string, companyId: string): Promise<number> {
  const { data: announcements, error: announcementsError } = await supabase
    .from("announcements")
    .select("id")
    .eq("company_id", companyId);
  if (announcementsError || !announcements?.length) return 0;

  const { data: reads, error: readsError } = await supabase
    .from("announcement_reads")
    .select("announcement_id")
    .eq("student_id", studentId);
  if (readsError) return 0;

  const readIds = new Set((reads || []).map((row) => row.announcement_id));
  return announcements.reduce((total, announcement) => total + (readIds.has(announcement.id) ? 0 : 1), 0);
}
