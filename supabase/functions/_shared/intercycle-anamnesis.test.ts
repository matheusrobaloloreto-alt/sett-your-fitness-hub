import {
  decideCancel,
  decideScheduleNow,
  INTERCYCLE_CONSENT_TEXT_VERSION,
  isIntercyclePainHandoffRequired,
  isPersistedWaiverValidForGate,
  isStuckSending,
  mapIntercycleSubmitRpcFailure,
} from "./intercycle-anamnesis.ts";

Deno.test("schedule-now reopens a cancelled delivery with an explicit audit code", () => {
  const decision = decideScheduleNow("cancelled");
  if (decision.action !== "reopen") throw new Error(`expected reopen, got ${decision.action}`);
  if (decision.auditCode !== "manual_reopen_after_cancelled") throw new Error("missing reopen audit code");
});

Deno.test("schedule-now refuses a delivery already claimed as sending", () => {
  const decision = decideScheduleNow("sending");
  if (decision.action !== "reject" || decision.reason !== "delivery_claimed_or_sending") {
    throw new Error("sending delivery must not be manually rescheduled");
  }
});

Deno.test("manual cancel never cancels a sending or already-sent delivery", () => {
  for (const status of ["sending", "sent", "responded"]) {
    const decision = decideCancel(status);
    if (decision.action !== "reject") throw new Error(`${status} should be rejected`);
  }
});

Deno.test("manual cancel remains idempotent for an already-cancelled delivery", () => {
  const decision = decideCancel("cancelled");
  if (decision.action !== "noop" || decision.reason !== "already_cancelled") throw new Error("cancelled delivery should be noop");
});

Deno.test("a manually generated link can be scheduled or cancelled", () => {
  const schedule = decideScheduleNow("ready");
  if (schedule.action !== "reschedule") throw new Error("ready link should remain schedulable");
  const cancel = decideCancel("ready");
  if (cancel.action !== "cancel") throw new Error("ready link should remain cancellable");
});

Deno.test("stuck sending lease expires only after the configured safety window", () => {
  const now = new Date("2026-09-08T12:30:00.000Z");
  if (isStuckSending("2026-09-08T12:16:00.000Z", now)) throw new Error("14 minutes should still be leased");
  if (!isStuckSending("2026-09-08T12:14:59.000Z", now)) throw new Error("older than 15 minutes should be recoverable");
});

Deno.test("EVA greater than five requires trainer handoff before prescription", () => {
  if (!isIntercyclePainHandoffRequired({ pain_present: true, pain_eva: 6 })) throw new Error("EVA 6 must block");
  if (isIntercyclePainHandoffRequired({ pain_present: true, pain_eva: 5 })) throw new Error("EVA 5 should not trigger this hard block");
  if (isIntercyclePainHandoffRequired({ pain_present: false, pain_eva: 9 })) throw new Error("absent pain should not block");
});

Deno.test("persisted waiver is valid only for the exact tenant, student, enrollment, current cycle, and prior cycle", () => {
  const expected = {
    companyId: "company-a",
    studentId: "student-a",
    enrollmentId: "enrollment-a",
    trainingCycleId: "cycle-current",
    priorCycleId: "cycle-prior",
  };
  const valid = {
    company_id: "company-a",
    student_id: "student-a",
    enrollment_id: "enrollment-a",
    training_cycle_id: "cycle-current",
    prior_cycle_id: "cycle-prior",
    reason: "Aluno sem resposta após contato direto.",
    waived_at: "2026-09-08T12:00:00.000Z",
  };
  if (!isPersistedWaiverValidForGate(valid, expected)) throw new Error("valid exact waiver rejected");
  for (const field of ["company_id", "student_id", "enrollment_id", "training_cycle_id", "prior_cycle_id"] as const) {
    const mismatched = { ...valid, [field]: "other" };
    if (isPersistedWaiverValidForGate(mismatched, expected)) throw new Error(`accepted mismatched ${field}`);
  }
});

Deno.test("consent text version is stable and not empty", () => {
  if (!/^intercycle-sensitive-v\d+$/.test(INTERCYCLE_CONSENT_TEXT_VERSION)) throw new Error("unexpected consent version");
});

Deno.test("atomic submit RPC failures are mapped to sanitized public errors", () => {
  const expired = mapIntercycleSubmitRpcFailure("intercycle_submit_link_expired");
  if (expired.status !== 410 || expired.message !== "Este link não está mais disponível.") throw new Error("expiry should be sanitized");

  const replay = mapIntercycleSubmitRpcFailure("duplicate key value violates unique constraint; intercycle_submit_response_duplicate");
  if (replay.status !== 409 || replay.message !== "Esta atualização já foi registrada.") throw new Error("replay should be sanitized");

  const internal = mapIntercycleSubmitRpcFailure("relation students leaked implementation detail");
  if (internal.status !== 400 || internal.message.includes("relation")) throw new Error("raw provider/db detail leaked");
});
