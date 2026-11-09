import type { CadenceRow } from "./contactCadence";
import type { CompletedPrescriptionBundleBadges } from "./prescriptionBundleIntegrity";
import type { StudentStatus } from "./studentStatus";

/** Read-only, explicitly projected payload. No raw student/billing/chat records. */
export interface DashboardContractRow {
  id: string;
  student_id: string;
  end_date: string | null;
  trainer_id: string | null;
  payment_status: string | null;
  students: { full_name: string; status: string | null };
  plans: { name: string } | null;
}
export interface DashboardCycleCountdown {
  student_name: string;
  student_id: string;
  cycle_number: number;
  end_date: string;
  days_left: number;
  trainer_id: string | null;
  next_cycle_id: string | null;
  next_cycle_number: number | null;
  next_start_date: string | null;
  next_ready: boolean;
}
export interface DashboardRenewals {
  expiringContracts: DashboardContractRow[];
  awaitingRenewal: DashboardContractRow[];
  cycleCountdowns: DashboardCycleCountdown[];
  trainerMap: Record<string, string>;
}
export interface CompanyDashboardSnapshot {
  version: 1;
  companyId: string;
  asOfDate: string;
  stats: { totalStudents: number; interestedStudents: number; pendingStudents: number; awaitingRenewalStudents: number; inactiveStudents: number; trainers: number };
  planChart: Array<{ name: string; count: number }>;
  expiringContracts: DashboardContractRow[];
  cycleCountdowns: DashboardCycleCountdown[];
  trainerMap: Record<string, string>;
  renewals: DashboardRenewals;
  alerts: {
    pendingActions: Array<{ id: string; type: string; severity: string; title: string; message: string | null; created_at: string; student_id: string | null }>;
    birthdays: Array<{ full_name: string; student_id: string; day: number; isToday: boolean }>;
    missingWorkouts: Array<{ student_name: string; student_id: string; cycle_number: number; cycle_id: string; start_date: string; end_date: string; trainer_name: string | null }>;
    awaitingTrainer: Array<{ student_name: string; student_id: string }>;
    awaitingTrainingDate: Array<{ student_name: string; student_id: string; enrollment_id: string; trainer_name: string | null }>;
    missingEnrollment: Array<{ student_name: string; student_id: string }>;
    incompleteBilling: Array<{ student_name: string; student_id: string; missing: string[] }>;
    recentStudents: Array<{ student_name: string; student_id: string; status: string | null; created_at: string; sales_stage: string | null; fiscal_completed_at: string | null; payment_link_sent_at: string | null; activated_at: string | null; assessment_due_at: string | null; onboarding_instructions_sent_at: string | null }>;
  };
  monthlyPrescriptions: Array<{ id: string; student_id: string; name: string; created_at: string; completedBadges: CompletedPrescriptionBundleBadges }>;
  pendingFeedback: Array<{ id: string; student_id: string; name: string; nps: number | null; wants_adjustment: boolean | null; adjustment_notes: string | null; created_at: string }>;
  contactCadence: CadenceRow[];
  cohortFeedback: Array<{ bucket: string; alunos: number; media_nps: number | null; pct_ajuste: number | null }>;
  atRiskStudents: Array<{ id: string; name: string; status: StudentStatus; reasons: string[]; pain: string | null; tone: "red" | "amber" }>;
}

/** Reject unavailable/incomplete RPCs rather than silently falling back to RLS-filtered data. */
export function parseCompanyDashboardSnapshot(value: unknown, companyId: string): CompanyDashboardSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Dashboard: resposta inválida.");
  const v = value as Record<string, unknown>;
  const arrays = ["planChart", "expiringContracts", "cycleCountdowns", "monthlyPrescriptions", "pendingFeedback", "contactCadence", "cohortFeedback", "atRiskStudents"];
  const alerts = v.alerts as Record<string, unknown> | undefined;
  const renewals = v.renewals as Record<string, unknown> | undefined;
  const stats = v.stats as Record<string, unknown> | undefined;
  if (v.version !== 1 || v.companyId !== companyId || typeof v.asOfDate !== "string"
      || !stats || !["totalStudents", "interestedStudents", "pendingStudents", "awaitingRenewalStudents", "inactiveStudents", "trainers"].every(k => typeof stats[k] === "number")
      || !v.trainerMap || !arrays.every(k => Array.isArray(v[k]))
      || !alerts || !["pendingActions", "birthdays", "missingWorkouts", "awaitingTrainer", "awaitingTrainingDate", "missingEnrollment", "incompleteBilling", "recentStudents"].every(k => Array.isArray(alerts[k]))
      || !renewals || !["expiringContracts", "awaitingRenewal", "cycleCountdowns"].every(k => Array.isArray(renewals[k])) || !renewals.trainerMap) {
    throw new Error("Dashboard: contrato de leitura indisponível ou incompatível.");
  }
  return value as CompanyDashboardSnapshot;
}
