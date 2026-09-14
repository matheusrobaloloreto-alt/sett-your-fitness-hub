import { selectPrescriptionEnrollment } from "@/lib/prescriptionSchedule";

export interface ClubPlan { id: string; company_id: string; name: string }
export interface ClubEnrollment {
  id: string;
  company_id: string;
  student_id: string;
  plan_id: string;
  status: string;
  created_at: string;
}

export function isAthleticClubPlan(name: string | null | undefined): boolean {
  const normalized = (name || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  return /^athletic club(?:$|[\s\-\u2013\u2014:])/.test(normalized);
}

export function athleticClubStudentIds(companyId: string, plans: ClubPlan[], enrollments: ClubEnrollment[]): Set<string> {
  const clubPlans = new Set(plans.filter((plan) => plan.company_id === companyId && isAthleticClubPlan(plan.name)).map((plan) => plan.id));
  const byStudent = new Map<string, ClubEnrollment[]>();
  for (const enrollment of enrollments) {
    if (enrollment.company_id !== companyId) continue;
    const group = byStudent.get(enrollment.student_id) || [];
    group.push(enrollment);
    byStudent.set(enrollment.student_id, group);
  }
  const result = new Set<string>();
  for (const [studentId, rows] of byStudent) {
    const current = selectPrescriptionEnrollment(rows);
    if (current && clubPlans.has(current.plan_id)) result.add(studentId);
  }
  return result;
}
