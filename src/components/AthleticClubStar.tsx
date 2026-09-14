import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMaster } from "@/contexts/MasterContext";
import { supabase } from "@/integrations/supabase/client";
import { athleticClubStudentIds, type ClubEnrollment, type ClubPlan } from "@/lib/athleticClub";
import { cn } from "@/lib/utils";

const emptyIds = new Set<string>();
const ClubContext = createContext({ companyId: null as string | null, studentIds: emptyIds });

async function loadMemberships(companyId: string) {
  const plans: ClubPlan[] = [];
  const enrollments: ClubEnrollment[] = [];
  // Pagination prevents large companies from silently losing badges after row 1000.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("plans").select("id, company_id, name")
      .eq("company_id", companyId).order("id").range(offset, offset + 499);
    if (error) throw error;
    plans.push(...(data || []));
    if (!data || data.length < 500) break;
  }
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("enrollments")
      .select("id, company_id, student_id, plan_id, status, created_at")
      .eq("company_id", companyId).in("status", ["active", "awaiting_training", "awaiting_renewal"])
      .order("id").range(offset, offset + 499);
    if (error) throw error;
    enrollments.push(...(data || []));
    if (!data || data.length < 500) break;
  }
  return athleticClubStudentIds(companyId, plans, enrollments);
}

export function AthleticClubProvider({ children, companyId: explicitCompanyId }: { children: ReactNode; companyId?: string | null }) {
  const { user, companyId: authCompanyId, role } = useAuth();
  const { viewingCompany, isViewingCompany } = useMaster();
  const companyId = explicitCompanyId !== undefined ? explicitCompanyId
    : role === "master" ? (isViewingCompany ? viewingCompany?.id ?? null : null) : authCompanyId;
  const userId = user?.id;
  const queryClient = useQueryClient();
  const { data, isError } = useQuery({
    queryKey: ["athletic-club-memberships", userId, companyId],
    queryFn: () => loadMemberships(companyId!),
    enabled: Boolean(userId && companyId),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
  useEffect(() => {
    if (!userId || !companyId) return;
    const refresh = () => { void queryClient.invalidateQueries({ queryKey: ["athletic-club-memberships", userId, companyId] }); };
    const channel = supabase.channel(`athletic-club:${userId}:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "enrollments", filter: `company_id=eq.${companyId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "plans", filter: `company_id=eq.${companyId}` }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId, companyId, queryClient]);
  return <ClubContext.Provider value={{ companyId, studentIds: userId && !isError ? data ?? emptyIds : emptyIds }}>{children}</ClubContext.Provider>;
}

export function AthleticClubStar({ studentId, companyId, className }: { studentId?: string | null; companyId?: string | null; className?: string }) {
  const club = useContext(ClubContext);
  if (!studentId || (companyId && companyId !== club.companyId) || !club.studentIds.has(studentId)) return null;
  return (
    <span role="img" aria-label="Athletic Club" title="Athletic Club" className={cn("ml-1 inline-flex shrink-0 align-middle text-yellow-600 dark:text-yellow-400", className)}>
      <Star aria-hidden="true" className="h-4 w-4 fill-current" />
    </span>
  );
}
