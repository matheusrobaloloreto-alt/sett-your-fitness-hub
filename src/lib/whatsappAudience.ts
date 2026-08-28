import { normalizeSalesStage, type FunnelStageStudent } from "@/lib/salesFunnelView";

export type WhatsAppStatusFilter = "all" | "active" | "leads" | "renewal" | "pending" | "assessment";

export type WhatsAppAudienceStudent = FunnelStageStudent & {
  status?: string | null;
};

type CycleWindow = {
  start_date: string;
  end_date: string;
  status?: string | null;
};

const DAY_MS = 86_400_000;

function dateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function daysUntilDate(endDate: string | null | undefined, now = new Date()): number | null {
  if (!endDate) return null;
  const parsed = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.ceil((parsed.getTime() - dateOnly(now).getTime()) / DAY_MS);
}

export function isRenewalDue(
  student: WhatsAppAudienceStudent,
  enrollmentEndDate?: string | null,
  now = new Date(),
) {
  if (student.status === "awaiting_renewal") return true;
  const remaining = daysUntilDate(enrollmentEndDate, now);
  return remaining !== null && remaining <= 7;
}

export function matchesWhatsAppStatusFilter(
  student: WhatsAppAudienceStudent | null | undefined,
  filter: WhatsAppStatusFilter,
  options: { enrollmentEndDate?: string | null; now?: Date } = {},
) {
  if (filter === "all") return true;
  if (!student) return false;

  const stage = normalizeSalesStage(student);
  const renewal = isRenewalDue(student, options.enrollmentEndDate, options.now);

  if (filter === "renewal") return renewal;
  if (filter === "active") return stage === "active" && student.status === "active" && !renewal;
  if (filter === "leads") return stage === "interested" || stage === "contacted";
  if (filter === "pending") {
    return student.status === "pending"
      || stage === "fiscal_registration_pending"
      || stage === "payment_pending";
  }
  return stage === "active_onboarding";
}

export function selectCurrentCycle<T extends CycleWindow>(cycles: T[], today: string): T | null {
  const ordered = cycles
    .filter((cycle) => cycle.status !== "superseded")
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  return ordered.find((cycle) => cycle.start_date <= today && cycle.end_date >= today)
    || [...ordered].reverse().find((cycle) => cycle.start_date <= today)
    || ordered[0]
    || null;
}
