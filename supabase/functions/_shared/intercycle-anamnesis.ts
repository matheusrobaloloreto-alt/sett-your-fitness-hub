export const INTERCYCLE_CONSENT_TEXT_VERSION = "intercycle-sensitive-v1";

export const INTERCYCLE_DELIVERY_STATUSES = [
  "ready",
  "scheduled",
  "sending",
  "sent",
  "responded",
  "failed",
  "cancelled",
] as const;

export type IntercycleDeliveryStatus = typeof INTERCYCLE_DELIVERY_STATUSES[number];

export type ScheduleNowDecision =
  | { action: "insert" }
  | { action: "noop"; reason: "already_sent_or_responded" }
  | { action: "reschedule"; auditCode: "manual_schedule_now" }
  | { action: "reopen"; auditCode: "manual_reopen_after_cancelled" }
  | { action: "reject"; reason: "delivery_claimed_or_sending" | "unknown_status" };

export type CancelDecision =
  | { action: "cancel"; auditCode: "manual_cancel" }
  | { action: "noop"; reason: "already_cancelled" }
  | { action: "reject"; reason: "delivery_claimed_or_sending" | "already_sent_or_responded" | "unknown_status" };

export type IntercycleAnswerSummary = {
  pain_present?: unknown;
  pain_eva?: unknown;
};

export type PersistedWaiverSummary = {
  company_id?: unknown;
  student_id?: unknown;
  enrollment_id?: unknown;
  training_cycle_id?: unknown;
  prior_cycle_id?: unknown;
  reason?: unknown;
  waived_at?: unknown;
};

export type IntercycleSubmitFailure = {
  status: 400 | 409 | 410;
  message: string;
};

export function parseIntercycleDeliveryStatus(value: unknown): IntercycleDeliveryStatus | null {
  return INTERCYCLE_DELIVERY_STATUSES.includes(value as IntercycleDeliveryStatus)
    ? value as IntercycleDeliveryStatus
    : null;
}

export function decideScheduleNow(status: unknown): ScheduleNowDecision {
  const parsed = parseIntercycleDeliveryStatus(status);
  if (!parsed) return { action: "reject", reason: "unknown_status" };
  if (parsed === "sent" || parsed === "responded") return { action: "noop", reason: "already_sent_or_responded" };
  if (parsed === "sending") return { action: "reject", reason: "delivery_claimed_or_sending" };
  if (parsed === "cancelled") return { action: "reopen", auditCode: "manual_reopen_after_cancelled" };
  return { action: "reschedule", auditCode: "manual_schedule_now" };
}

export function decideCancel(status: unknown): CancelDecision {
  const parsed = parseIntercycleDeliveryStatus(status);
  if (!parsed) return { action: "reject", reason: "unknown_status" };
  if (parsed === "ready" || parsed === "scheduled" || parsed === "failed") return { action: "cancel", auditCode: "manual_cancel" };
  if (parsed === "cancelled") return { action: "noop", reason: "already_cancelled" };
  if (parsed === "sending") return { action: "reject", reason: "delivery_claimed_or_sending" };
  return { action: "reject", reason: "already_sent_or_responded" };
}

export function isStuckSending(updatedAt: unknown, now = new Date(), leaseMinutes = 15): boolean {
  if (typeof updatedAt !== "string" || !updatedAt) return false;
  const updated = new Date(updatedAt).getTime();
  if (!Number.isFinite(updated)) return false;
  return now.getTime() - updated > leaseMinutes * 60_000;
}

export function isIntercyclePainHandoffRequired(answer: IntercycleAnswerSummary | null | undefined): boolean {
  if (!answer?.pain_present) return false;
  const eva = Number(answer.pain_eva);
  return Number.isFinite(eva) && eva > 5;
}

export function isPersistedWaiverValidForGate(
  waiver: PersistedWaiverSummary | null | undefined,
  expected: {
    companyId: string;
    studentId: string;
    enrollmentId: string;
    trainingCycleId: string;
    priorCycleId: string;
  },
): waiver is PersistedWaiverSummary & { reason: string } {
  return Boolean(
    waiver &&
      waiver.company_id === expected.companyId &&
      waiver.student_id === expected.studentId &&
      waiver.enrollment_id === expected.enrollmentId &&
      waiver.training_cycle_id === expected.trainingCycleId &&
      waiver.prior_cycle_id === expected.priorCycleId &&
      typeof waiver.reason === "string" &&
      waiver.reason.trim().length >= 3,
  );
}

export function mapIntercycleSubmitRpcFailure(message: unknown): IntercycleSubmitFailure {
  const code = String(message ?? "");
  if (
    code.includes("intercycle_submit_link_invalid") ||
    code.includes("intercycle_submit_link_expired") ||
    code.includes("intercycle_submit_window_closed") ||
    code.includes("intercycle_submit_delivery_unavailable") ||
    code.includes("intercycle_submit_scope_invalid")
  ) {
    return { status: 410, message: "Este link não está mais disponível." };
  }
  if (
    code.includes("intercycle_submit_link_replayed") ||
    code.includes("intercycle_submit_response_duplicate")
  ) {
    return { status: 409, message: "Esta atualização já foi registrada." };
  }
  if (
    code.includes("intercycle_submit_consent_required") ||
    code.includes("intercycle_submit_payload_invalid") ||
    code.includes("intercycle_submit_pain_required")
  ) {
    return { status: 400, message: "Revise os campos obrigatórios desta atualização." };
  }
  return { status: 400, message: "Não foi possível registrar esta atualização." };
}
