import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const edge = read("supabase/functions/process-automation-sessions/index.ts");
const migration = read("supabase/migrations/20260910103000_weekly_contact_consent_ledger.sql");
const toggle = read("src/components/admin/WeeklyContactToggle.tsx");

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
  (edge.match(/await assertCurrentWeeklyContactConsent\(/g) || []).length >= 3,
  "Edge must check consent after claim and immediately before content/menu sends",
);
requireInvariant(toggle.includes("Confirmo que o aluno autorizou"), "frontend grant requires explicit staff attestation");
requireInvariant(
  toggle.includes("disabled={!isCurrentStudent || !hasReliableRecipient || !attested || saving}"),
  "grant action must stay disabled without current-student attestation and a reliable recipient",
);
requireInvariant(
  toggle.includes("next && !hasReliableRecipient") && toggle.includes("if (hasReliableRecipient) return;"),
  "frontend must revalidate the recipient and close an open grant dialog when it becomes unreliable",
);
requireInvariant(
  toggle.includes("activeStudentIdRef.current !== originStudentId") &&
    toggle.includes("open={isCurrentStudent && grantDialogOpen}"),
  "frontend must ignore stale consent completions and close attestation across students",
);
requireInvariant(toggle.includes('_event_type: next ? "granted" : "revoked"'), "frontend must use the consent RPC for both events");

console.log("Weekly-contact consent rollout gate: PASS");
console.log("Required order: 1) Edge dispatcher 2) database migration 3) frontend");
