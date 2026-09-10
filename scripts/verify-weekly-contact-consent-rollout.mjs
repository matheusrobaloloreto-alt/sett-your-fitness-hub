import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const edge = read("supabase/functions/process-automation-sessions/index.ts");
const migration = read("supabase/migrations/20260910103000_weekly_contact_consent_ledger.sql");
const toggle = read("src/components/admin/WeeklyContactToggle.tsx");
const recipientResetEffectStart = toggle.indexOf("useEffect(() => {", toggle.indexOf("}, [studentId]);"));
const recipientResetEffectEnd = toggle.indexOf("}, [normalizedRecipient]);", recipientResetEffectStart);
const recipientResetEffect = recipientResetEffectStart >= 0 && recipientResetEffectEnd > recipientResetEffectStart
  ? toggle.slice(recipientResetEffectStart, recipientResetEffectEnd)
  : "";

const requireInvariant = (condition, message) => {
  if (!condition) throw new Error(`weekly-contact rollout gate failed: ${message}`);
};

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
  migration.includes("public.weekly_contact_consent_is_current(s.id,s.company_id,c.remote_jid)") &&
    migration.includes("'recipient_candidate',c.recipient_candidate") &&
    edge.includes("_recipient_candidate: verifiedRemoteJid"),
  "cron must pin and authorize the queued recipient candidate",
);
requireInvariant(
  edge.includes("async function verifyWeeklyRecipientImmediatelyBeforeSend(") &&
    edge.includes("await resolveCurrentSessionRecipient(") &&
    (edge.match(/const currentVerifiedRemoteJid = await verifyWeeklyRecipientImmediatelyBeforeSend\(/g) || []).length >= 2 &&
    edge.includes("assertQueuedWeeklyRecipient(context,verifiedRemoteJid)") &&
    edge.includes("remoteJid: currentVerifiedRemoteJid"),
  "dispatcher must re-read, re-resolve, compare and authorize the current recipient immediately before every send",
);
requireInvariant(toggle.includes('_event_type: next ? "granted" : "revoked"'), "frontend must use the consent RPC for both events");

console.log("Weekly-contact consent rollout gate: PASS");
console.log("Required order: 1) Edge dispatcher 2) database migration 3) frontend");
