import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260910103000_weekly_contact_consent_ledger.sql"),
  "utf8",
);
const rollback = readFileSync(
  resolve(process.cwd(), "scripts/rollback-weekly-contact-consent-ledger.sql"),
  "utf8",
);
const toggle = readFileSync(
  resolve(process.cwd(), "src/components/admin/WeeklyContactToggle.tsx"),
  "utf8",
);
const dispatcher = readFileSync(
  resolve(process.cwd(), "supabase/functions/process-automation-sessions/index.ts"),
  "utf8",
);
const rehearsal = readFileSync(
  resolve(process.cwd(), "scripts/rehearse-weekly-contact-consent-ledger.sql"),
  "utf8",
);
const rolloutGate = readFileSync(
  resolve(process.cwd(), "scripts/verify-weekly-contact-consent-rollout.mjs"),
  "utf8",
);
const studentDetail = readFileSync(resolve(process.cwd(), "src/pages/admin/StudentDetail.tsx"), "utf8");
const studentHub = readFileSync(resolve(process.cwd(), "src/pages/admin/StudentHub.tsx"), "utf8");

describe("weekly contact consent ledger", () => {
  it("defines the fixed-purpose append-only evidence contract", () => {
    for (const field of [
      "student_id",
      "company_id",
      "channel",
      "purpose",
      "event_type",
      "recipient_key",
      "recipient_generation",
      "policy_version",
      "source",
      "actor_user_id",
      "occurred_at",
      "created_at",
      "sequence",
    ]) expect(migration).toContain(field);
    expect(migration).toContain("channel='whatsapp'");
    expect(migration).toContain("purpose='weekly_training_support'");
    expect(migration).toContain("event_type in ('granted','revoked')");
    expect(migration).toContain("weekly_contact_consent_events_append_only");
    expect(migration).toMatch(/before insert or update or delete on public\.weekly_contact_consent_events/i);
  });

  it("allows tenant-scoped reads but writes only through the authenticated RPC", () => {
    expect(migration).toContain("public.can_manage_staff_student(company_id,student_id)");
    expect(migration).toMatch(/revoke all on table public\.weekly_contact_consent_events from public,anon,authenticated/i);
    expect(migration).toMatch(/grant select on table public\.weekly_contact_consent_events to authenticated/i);
    expect(migration).toContain("weekly_contact_enabled_requires_consent_rpc");
    expect(migration).toContain("v_actor uuid := auth.uid()");
    expect(migration).toContain("for update");
    expect(migration).toContain("private.weekly_contact_boolean_write_authorizations");
    expect(migration).toContain("permit.transaction_id=txid_current()");
    expect(migration).toContain("permit.backend_pid=pg_backend_pid()");
    expect(migration).toContain("delete from private.weekly_contact_boolean_write_authorizations");
    expect(migration).not.toContain("app.weekly_contact_consent_rpc");
    expect(migration).not.toContain("current_user is distinct from pg_get_userbyid(");
  });

  it("fails closed every legacy weekly queue before installing the new contract", () => {
    const cleanup = migration.indexOf("weekly_contact_consent_reconfirmation_required");
    const install = migration.indexOf("create table if not exists public.weekly_contact_consent_events");
    expect(cleanup).toBeGreaterThan(-1);
    expect(cleanup).toBeLessThan(install);
    expect(migration).toContain("status in ('active','waiting_response','processing')");
    expect(migration).toContain("context=coalesce(context,'{}'::jsonb)||jsonb_build_object(");
    expect(migration).toContain("lock table public.students in share row exclusive mode");
    expect(migration).toContain("lock table public.flow_sessions in share row exclusive mode");
    expect(migration).toMatch(/^begin;/im);
    expect(migration).toMatch(/commit;\s*$/i);
  });

  it("does not backfill consent and quarantines legacy booleans before disabling them", () => {
    const ledgerInsert = migration.indexOf("insert into public.weekly_contact_consent_events");
    const rpcDefinition = migration.indexOf("create or replace function public.record_weekly_contact_consent");
    expect(ledgerInsert).toBeGreaterThan(rpcDefinition);
    const quarantine = migration.indexOf("insert into public.weekly_contact_legacy_opt_in_quarantine");
    const disable = migration.indexOf("update public.students\nset weekly_contact_enabled=false");
    expect(quarantine).toBeGreaterThan(-1);
    expect(disable).toBeGreaterThan(quarantine);
  });

  it("requires the latest current-policy grant in both cron and dispatcher", () => {
    expect(migration).toContain("sequence bigint generated always as identity unique not null");
    expect(migration).toContain("order by event.sequence desc");
    expect(migration).toContain("event.event_type='granted'");
    expect(migration).toContain("event.policy_version=public.weekly_contact_policy_version()");
    expect(migration).toContain("weekly_contact_recipient_generation bigint not null default 0");
    expect(migration).toContain("weekly_contact_recipient_key text");
    expect(migration).toContain("track_weekly_contact_recipient_generation");
    expect(migration).toContain("event.recipient_generation=_recipient_generation");
    expect(migration).toContain("student.weekly_contact_recipient_generation=_recipient_generation");
    expect(migration).toMatch(/weekly_contact_consent_is_current\(\s*s\.id,s\.company_id,c\.remote_jid,s\.weekly_contact_recipient_generation\s*\)/);
    expect(migration).toContain("'recipient_candidate',c.recipient_candidate");
    expect(migration).toContain("'recipient_generation',c.recipient_generation");
    expect(migration).toContain("c.remote_jid like '%@s.whatsapp.net'");
    expect(migration).toContain("public.weekly_contact_recipient_key(c.remote_jid) is not null");
    expect(migration).toContain(")=public.weekly_contact_recipient_key(c.remote_jid)");
    expect(dispatcher).toContain('context?.trigger_type !== "weekly_contact"');
    expect(dispatcher).toContain('admin.rpc("weekly_contact_consent_is_current"');
    expect(dispatcher).toContain("_recipient_candidate: verifiedRemoteJid");
    expect(dispatcher).toContain("_recipient_generation: queuedRecipientGeneration");
    expect(dispatcher).toContain("async function verifyWeeklyRecipientImmediatelyBeforeSend(");
    expect(dispatcher).toContain("await resolveCurrentSessionRecipient(");
    expect(dispatcher.match(/const currentVerifiedRemoteJid = await verifyWeeklyRecipientImmediatelyBeforeSend\(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(dispatcher).toContain("assertQueuedWeeklyRecipient(context,verifiedRemoteJid)");
    for (const code of [
      "weekly_contact_consent_missing",
      "weekly_contact_queued_recipient_changed",
      "weekly_contact_recipient_missing",
      "weekly_contact_recipient_ambiguous",
      "weekly_contact_recipient_mismatch",
    ]) expect(dispatcher).toContain(code);
    expect(dispatcher).toContain("PERMANENT_WEEKLY_CONTACT_ERROR_CODES");
    expect(dispatcher).toContain("next_dispatch_at: null");
    expect(dispatcher).toContain("resolveVerifiedWhatsAppRecipient({");
    expect(dispatcher.match(/await assertCurrentWeeklyContactConsent\(/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("records grant and revoke via RPC instead of directly mutating the student", () => {
    expect(toggle).toContain('supabase.rpc("record_weekly_contact_consent"');
    expect(toggle).toContain('supabase.rpc("weekly_contact_consent_status"');
    expect(toggle).toContain("const originRecipient = normalizedRecipient");
    expect(toggle).toContain("_recipient_key: originRecipient");
    expect(toggle).toContain("activeRecipientRef.current !== originRecipient");
    expect(toggle).toContain('_source: "staff_confirmed_student"');
    expect(toggle).toContain("payload?.eligible === true");
    expect(toggle).toContain("Confirmo que o aluno autorizou");
    expect(toggle).toContain("disabled={!isCurrentStudent || !hasCurrentRecipientAttestation || saving}");
    expect(toggle).toContain("const normalizedRecipient = useMemo(");
    expect(toggle).toContain("grantDialogRecipient !== originRecipient");
    expect(toggle).toContain("attestedRecipient !== originRecipient");
    expect(toggle).toContain("activeStudentIdRef.current !== originStudentId");
    expect(toggle).toContain("activeRecipientRef.current !== originRecipient");
    expect(toggle).toContain("setPolicyVersion(null)");
    expect(toggle).toContain("setGrantDialogOpen(false)");
    expect(toggle).toContain("setGrantDialogRecipient(null)");
    expect(toggle).toContain("setAttestedRecipient(null)");
    expect(rolloutGate).toContain('recipientResetEffect.includes("setEnabled(false)")');
    expect(rolloutGate).toContain('recipientResetEffect.includes("setSaving(false)")');
    expect(rolloutGate).toContain('toggle.includes("const originRecipient = normalizedRecipient")');
    expect(rolloutGate).toContain('toggle.includes("_recipient_key: originRecipient")');
    expect(toggle).not.toContain("weekly-training-support-v1-2026-09-10");
    expect(toggle).not.toMatch(/\.from\("students"\)\.update\(\{ weekly_contact_enabled:/);
    expect(studentDetail).not.toContain("weekly_contact_enabled");
    expect(studentHub).not.toContain("weekly_contact_enabled");
  });

  it("automates and locks the fail-closed rollout order", () => {
    expect(rolloutGate).toContain("Required order: 1) Edge dispatcher 2) database migration 3) frontend");
    expect(rolloutGate).toContain("queueCleanup >= 0 && queueCleanup < ledgerInstall");
    expect(rolloutGate).toContain("lockIndex >= 0 && lockIndex < queueCleanup");
    expect(rolloutGate).toContain("disabled={!isCurrentStudent || !hasCurrentRecipientAttestation || saving}");
    expect(rolloutGate).toContain("activeRecipientRef.current !== originRecipient");
    expect(rolloutGate).toContain('"}, [studentId, normalizedRecipient]);"');
    expect(rolloutGate).toContain("recipient_generation");
    expect(rolloutGate).toContain("PERMANENT_WEEKLY_CONTACT_ERROR_CODES");
    expect(rolloutGate).toContain("weekly_contact_queued_recipient_changed");
  });

  it("rolls back by preserving evidence and disabling eligibility", () => {
    expect(rollback).toContain("set weekly_contact_enabled=false");
    expect(rollback).toContain("weekly_contact_consent_emergency_rollback");
    expect(rollback).toMatch(/as \$\$ select false \$\$/i);
    expect(rollback).toContain("weekly_contact_consent_is_current(uuid,uuid,text,bigint)");
    expect(rollback).not.toMatch(/drop table/i);
    expect(rollback).not.toMatch(/set weekly_contact_enabled=true/i);
  });

  it("rehearses recipient scope, races, direct-write rejection, revoke, and immutable evidence", () => {
    expect(rehearsal).toContain("Synthetic Consent Probe");
    expect(rehearsal).toContain("grant_eligible");
    expect(rehearsal).toContain("revoke_ineligible");
    expect(rehearsal).toContain("sequence_monotonic");
    expect(rehearsal).toContain("direct_boolean_rejected");
    expect(rehearsal).toContain("generic_definer_rejected");
    expect(rehearsal).toContain("ledger_mutation_rejected");
    expect(rehearsal).toContain("stale_policy_rejected");
    expect(rehearsal).toContain("grant_a_then_b_false");
    expect(rehearsal).toContain("grant_b_true");
    expect(rehearsal).toContain("return_to_a_false");
    expect(rehearsal).toContain("regrant_a_true");
    expect(rehearsal).toContain("recipient_generation_monotonic");
    expect(rehearsal).toContain("profile_rpc_race_rejected");
    expect(rehearsal).toContain("phone_divergence_rejected");
    expect(rehearsal).toContain("alternate_jid_rejected");
    expect(rehearsal).toContain("set local role authenticated");
    expect(rehearsal).not.toMatch(/\bcommit\s*;/i);
    expect(rehearsal).toMatch(/^begin;/im);
    expect(rehearsal).toMatch(/rollback;\s*$/i);
  });
});
