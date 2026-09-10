import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const edge = read("supabase/functions/process-automation-sessions/index.ts");
const migration = read("supabase/migrations/20260910103000_weekly_contact_consent_ledger.sql");
const toggle = read("src/components/admin/WeeklyContactToggle.tsx");
const rehearsal = read("scripts/rehearse-weekly-contact-consent-ledger.sql");
const recipientResetEffectAnchor = "}, [studentId, normalizedRecipient]);";
const recipientResetEffectEnd = toggle.indexOf(recipientResetEffectAnchor);
const recipientResetEffectStart = recipientResetEffectEnd >= 0
  ? toggle.lastIndexOf("useEffect(() => {", recipientResetEffectEnd)
  : -1;

const requireInvariant = (condition, message) => {
  if (!condition) throw new Error(`weekly-contact rollout gate failed: ${message}`);
};

requireInvariant(
  recipientResetEffectStart >= 0 && recipientResetEffectEnd > recipientResetEffectStart,
  "frontend status/reset effect must be anchored exactly to [studentId, normalizedRecipient]",
);
const recipientResetEffect = toggle.slice(recipientResetEffectStart, recipientResetEffectEnd);

const queueCleanup = migration.indexOf("weekly_contact_consent_reconfirmation_required");
const ledgerInstall = migration.indexOf("create table if not exists public.weekly_contact_consent_events");
const lockIndex = migration.indexOf("lock table public.flow_sessions in share row exclusive mode");
requireInvariant(queueCleanup >= 0 && queueCleanup < ledgerInstall, "legacy queue cleanup must precede ledger installation");
const preInstall = migration.slice(0, ledgerInstall);
requireInvariant(
  lockIndex >= 0 && lockIndex < queueCleanup,
  "migration must block concurrent legacy queue inserts before cleanup",
);
requireInvariant(
  ["active", "waiting_response", "processing"].every((status) => preInstall.includes(`'${status}'`)),
  "legacy queue cleanup must fail closed every dispatchable weekly status",
);
requireInvariant(
  (edge.match(/await assertCurrentWeeklyContactConsent\(/g) || []).length >= 2,
  "Edge must check consent after claim and within the per-send recipient verifier",
);
requireInvariant(toggle.includes("Confirmo que o aluno autorizou"), "frontend grant requires explicit staff attestation");
requireInvariant(
  toggle.includes("disabled={!isCurrentStudent || !hasCurrentRecipientAttestation || saving}"),
  "grant action must stay disabled without an attestation for the current normalized recipient",
);
requireInvariant(
  toggle.includes("const normalizedRecipient = useMemo(") &&
    recipientResetEffect.includes("setEnabled(false)") &&
    recipientResetEffect.includes("setSaving(false)") &&
    recipientResetEffect.includes("setGrantDialogOpen(false)") &&
    recipientResetEffect.includes("setGrantDialogRecipient(null)") &&
    recipientResetEffect.includes("setAttestedRecipient(null)"),
  "frontend must keep recipient identity and reset optimistic/dialog/attestation state on every normalized-recipient change",
);
requireInvariant(
  toggle.includes("grantDialogRecipient !== originRecipient") &&
    toggle.includes("attestedRecipient !== originRecipient") &&
    toggle.includes("Destinatário desta confirmação:"),
  "grant confirmation must present and match the current normalized recipient to the attested recipient",
);
requireInvariant(
  toggle.includes("activeStudentIdRef.current !== originStudentId") &&
    toggle.includes("activeRecipientRef.current !== originRecipient") &&
    toggle.includes("open={isCurrentStudent && isGrantRecipientCurrent && grantDialogOpen}"),
  "frontend must ignore stale consent completions and scope the dialog by student and recipient identity",
);
requireInvariant(
  toggle.includes("const originRecipient = normalizedRecipient") &&
    toggle.includes('weekly_contact_consent_status", {') &&
    toggle.includes("_recipient_key: originRecipient") &&
    toggle.includes("activeRecipientRef.current !== originRecipient"),
  "status fetch must capture the recipient, query recipient-aware status, and ignore stale recipient completions",
);
requireInvariant(
  /weekly_contact_consent_is_current\(\s*s\.id,s\.company_id,c\.remote_jid,s\.weekly_contact_recipient_generation\s*\)/.test(migration) &&
    migration.includes("'recipient_candidate',c.recipient_candidate") &&
    migration.includes("'recipient_generation',c.recipient_generation") &&
    migration.includes("event.recipient_generation=_recipient_generation") &&
    migration.includes("student.weekly_contact_recipient_generation=_recipient_generation") &&
    edge.includes("_recipient_candidate: verifiedRemoteJid") &&
    edge.includes("_recipient_generation: queuedRecipientGeneration"),
  "cron and dispatcher must pin and authorize recipient key plus monotonic generation",
);
requireInvariant(
  edge.includes("async function verifyWeeklyRecipientImmediatelyBeforeSend(") &&
    edge.includes("await resolveCurrentSessionRecipient(") &&
    (edge.match(/const currentVerifiedRemoteJid = await verifyWeeklyRecipientImmediatelyBeforeSend\(/g) || []).length >= 2 &&
    edge.includes("assertQueuedWeeklyRecipient(context,verifiedRemoteJid)") &&
    edge.includes("remoteJid: currentVerifiedRemoteJid"),
  "dispatcher must re-read, re-resolve, compare and authorize the current recipient immediately before every send",
);
const transitionMarkers = [
  "into v_grant_eligible",
  "set phone=v_recipient_b,whatsapp=v_recipient_b",
  "into v_grant_b_generation",
  "set phone=v_recipient_a,whatsapp=v_recipient_a",
  "into v_return_to_a_false",
  "into v_regrant_a_generation",
  "into v_regrant_a_true",
];
const transitionPositions = transitionMarkers.map((marker) => rehearsal.indexOf(marker));
requireInvariant(
  transitionPositions.every((position) => position >= 0) &&
    transitionPositions.every((position, index) => index === 0 || position > transitionPositions[index - 1]) &&
    rehearsal.includes("v_recipient_generation_monotonic") &&
    rehearsal.includes("v_grant_a_generation < v_grant_b_generation") &&
    rehearsal.includes("v_grant_b_generation < v_return_a_generation"),
  "rehearsal must prove grant A -> B false -> grant B true -> return A false -> new grant A true with monotonic generations",
);
const permanentCodes = [
  "weekly_contact_consent_missing",
  "weekly_contact_queued_recipient_changed",
  "weekly_contact_recipient_missing",
  "weekly_contact_recipient_ambiguous",
  "weekly_contact_recipient_mismatch",
];
const permanentHandlerStart = edge.indexOf("PERMANENT_WEEKLY_CONTACT_ERROR_CODES.has(errorCode)");
const permanentHandlerEnd = edge.indexOf("continue;", permanentHandlerStart);
const permanentHandler = permanentHandlerStart >= 0 && permanentHandlerEnd > permanentHandlerStart
  ? edge.slice(permanentHandlerStart, permanentHandlerEnd)
  : "";
requireInvariant(
  edge.includes("PERMANENT_WEEKLY_CONTACT_ERROR_CODES") &&
    permanentCodes.every((code) => edge.includes(`"${code}"`)) &&
    !permanentCodes.includes("weekly_contact_consent_check_failed") &&
    edge.includes('if (consent.error) {\n    throw new Error("weekly_contact_consent_check_failed");') &&
    edge.includes('if (consent.data !== true) {\n    throw new Error("weekly_contact_consent_missing");') &&
    permanentHandler.includes('status: "failed"') &&
    permanentHandler.includes("next_dispatch_at: null") &&
    permanentHandler.includes("delete context.dispatch_retries"),
  "handler must terminalize every permanent recipient-scoped error while keeping consent RPC failures retryable",
);
requireInvariant(toggle.includes('_event_type: next ? "granted" : "revoked"'), "frontend must use the consent RPC for both events");

console.log("Weekly-contact consent rollout gate: PASS");
console.log("Required order: 1) Edge dispatcher 2) database migration 3) frontend");
