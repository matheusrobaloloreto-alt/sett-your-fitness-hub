import { supabase } from "@/integrations/supabase/client";
import { businessDateYmd } from "./businessDate";
import { projectEnrollmentHistoryByPlan } from "./companyDashboardSnapshot";
import { readForIds, readPages } from "./pagedRead";
import { scheduleDay } from "./prescriptionCoverage";
import { OPEN_ENROLLMENT_STATUSES, type StudentContractSummary } from "./studentRoster";

export async function readCurrentStudentContracts(companyId: string, studentIds: string[]) {
  const today = scheduleDay(businessDateYmd());
  const enrollments = await readForIds(studentIds, (ids, from, to) => supabase.from("enrollments")
    .select("id, student_id, company_id, plan_id, status, start_date, end_date, training_start_date, created_at")
    .eq("company_id", companyId).in("student_id", ids).in("status", OPEN_ENROLLMENT_STATUSES)
    .order("id").range(from, to));
  const requested = new Set(studentIds);
  const byStudent = new Map<string, typeof enrollments>();
  for (const enrollment of enrollments) {
    if (enrollment.company_id !== companyId || !requested.has(enrollment.student_id)) {
      throw new Error("Matrícula fora do escopo da consulta.");
    }
    const rows = byStudent.get(enrollment.student_id) ?? [];
    rows.push(enrollment);
    byStudent.set(enrollment.student_id, rows);
  }

  const planIds = [...new Set(enrollments.flatMap(row => {
    const planId = row.plan_id?.trim();
    return planId ? [planId] : [];
  }))];
  type PlanMetadata = { id: string; company_id: string | null; name: string; duration_days: number | null; duration_weeks: number | null };
  // Explicit contract dates remain usable even if the catalog read fails.
  const plans = await readForIds<PlanMetadata>(planIds, (ids, from, to) => supabase.from("plans")
    .select("id, name, company_id, duration_days, duration_weeks")
    .eq("company_id", companyId).in("id", ids).order("id").range(from, to)).catch((): PlanMetadata[] => []);
  const plansById = new Map(plans.filter(plan => plan.company_id === companyId).map(plan => [plan.id, plan] as const));

  const contracts = new Map<string, StudentContractSummary>();
  for (const [studentId, rows] of byStudent) {
    let unverified = false;
    const covered = rows.flatMap(row => {
      const priority = OPEN_ENROLLMENT_STATUSES.indexOf(row.status);
      if (priority < 0) return [];
      const start = scheduleDay(row.start_date ?? row.training_start_date);
      const planId = row.plan_id?.trim() || null;
      const plan = planId ? plansById.get(planId) : undefined;
      const duration = plan?.duration_days ?? (plan?.duration_weeks ?? 0) * 7;
      const hasEnd = row.end_date != null;
      const end = hasEnd ? scheduleDay(row.end_date)
        : Number.isSafeInteger(duration) && duration > 0 ? start + (duration - 1) * 86_400_000 : NaN;
      if (start > today || end < today) return [];
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        unverified = true;
        return [];
      }
      return [{ priority, hasEnd, start, row, planId, planName: plan?.name || null }];
    });
    // Prioritize a proven active contract, then explicit dates within the same status.
    const current = covered.sort((a, b) => a.priority - b.priority
      || Number(b.hasEnd) - Number(a.hasEnd)
      || b.start - a.start
      || (b.row.created_at ?? "").localeCompare(a.row.created_at ?? "")
      || b.row.id.localeCompare(a.row.id))[0];
    if (current) contracts.set(studentId, { planId: current.planId, planName: current.planName });
    else if (unverified) contracts.set(studentId, { planId: null, planName: null, termUnverified: true });
  }
  return contracts;
}

// Match the snapshot's historical population, including unlinked plans and
// excluding rows whose student or linked plan belongs to another company.
export async function readEnrollmentHistoryByPlan(companyId: string, studentIds?: string[]) {
  const page = (from: number, to: number, ids?: string[]) => {
    let query = supabase.from("enrollments")
      .select("plan_id, students!inner(company_id), plans(name, company_id)")
      .eq("company_id", companyId).eq("students.company_id", companyId);
    if (ids) query = query.in("student_id", ids);
    return query.order("id").range(from, to);
  };
  const rows = studentIds
    ? await readForIds(studentIds, (ids, from, to) => page(from, to, ids))
    : await readPages(page);
  return projectEnrollmentHistoryByPlan(rows.filter(row =>
    row.students?.company_id === companyId && (!row.plan_id || row.plans?.company_id === companyId)));
}
