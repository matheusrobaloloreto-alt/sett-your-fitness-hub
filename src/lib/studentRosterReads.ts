import { supabase } from "@/integrations/supabase/client";
import { businessDateYmd } from "./businessDate";
import { projectEnrollmentHistoryByPlan } from "./companyDashboardSnapshot";
import { readForIds, readPages } from "./pagedRead";
import { selectPrescriptionEnrollment } from "./prescriptionSchedule";
import { OPEN_ENROLLMENT_STATUSES, type StudentContractSummary } from "./studentRoster";

export async function readCurrentStudentContracts(companyId: string, studentIds: string[]) {
  const today = businessDateYmd();
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

  const contracts = new Map<string, StudentContractSummary>();
  for (const [studentId, rows] of byStudent) {
    const current = selectPrescriptionEnrollment(rows, {
      today, expectedCompanyId: companyId, expectedStudentId: studentId,
    });
    if (current) contracts.set(studentId, {
      planId: current.plan_id?.trim() || null,
      planName: null,
    });
  }
  const planIds = [...new Set([...contracts.values()].flatMap(contract => contract.planId ? [contract.planId] : []))];
  // An inaccessible plan name must not erase an enrollment that was read successfully.
  const plans = await readForIds<{ id: string; name: string }>(planIds, (ids, from, to) => supabase.from("plans").select("id, name")
    .eq("company_id", companyId).in("id", ids).order("id").range(from, to)).catch(() => []);
  const names = new Map(plans.map(plan => [plan.id, plan.name] as const));
  for (const contract of contracts.values()) {
    if (contract.planId) contract.planName = names.get(contract.planId) || null;
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
