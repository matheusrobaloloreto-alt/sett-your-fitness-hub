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

describe("weekly contact consent ledger", () => {
  it("defines the fixed-purpose append-only evidence contract", () => {
    for (const field of [
      "student_id",
      "company_id",
      "channel",
      "purpose",
      "event_type",
      "policy_version",
      "source",
      "actor_user_id",
      "occurred_at",
      "created_at",
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
    expect(migration).toContain("current_user is distinct from pg_get_userbyid(");
    expect(migration).not.toContain("app.weekly_contact_consent_rpc");
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
    expect(migration).toContain("order by event.occurred_at desc,event.created_at desc,event.id desc");
    expect(migration).toContain("event.event_type='granted'");
    expect(migration).toContain("event.policy_version=public.weekly_contact_policy_version()");
    expect(migration).toContain("public.weekly_contact_consent_is_current(s.id,s.company_id)");
    expect(migration).toContain("c.remote_jid like '%@s.whatsapp.net'");
    expect(migration).toContain("public.sett_phone_key(split_part(c.remote_jid,'@',1)) in (");
    expect(dispatcher).toContain('context?.trigger_type !== "weekly_contact"');
    expect(dispatcher).toContain('admin.rpc("weekly_contact_consent_is_current"');
    expect(dispatcher).toContain('throw new Error("weekly_contact_consent_missing")');
    expect(dispatcher).toContain("resolveVerifiedWhatsAppRecipient({");
    expect(dispatcher.match(/await assertCurrentWeeklyContactConsent\(/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("records grant and revoke via RPC instead of directly mutating the student", () => {
    expect(toggle).toContain('supabase.rpc("record_weekly_contact_consent"');
    expect(toggle).toContain('supabase.rpc("weekly_contact_consent_status"');
    expect(toggle).toContain('_source: "staff_confirmed_student"');
    expect(toggle).toContain("payload?.eligible === true");
    expect(toggle).not.toContain("weekly-training-support-v1-2026-09-10");
    expect(toggle).not.toMatch(/\.from\("students"\)\.update\(\{ weekly_contact_enabled:/);
  });

  it("rolls back by preserving evidence and disabling eligibility", () => {
    expect(rollback).toContain("set weekly_contact_enabled=false");
    expect(rollback).toContain("weekly_contact_consent_emergency_rollback");
    expect(rollback).toMatch(/as \$\$ select false \$\$/i);
    expect(rollback).not.toMatch(/drop table/i);
    expect(rollback).not.toMatch(/set weekly_contact_enabled=true/i);
  });

  it("rehearses grant, direct-write rejection, revoke, and immutable evidence with synthetic data", () => {
    expect(rehearsal).toContain("Synthetic Consent Probe");
    expect(rehearsal).toContain("grant_eligible");
    expect(rehearsal).toContain("revoke_ineligible");
    expect(rehearsal).toContain("direct_boolean_rejected");
    expect(rehearsal).toContain("ledger_mutation_rejected");
    expect(rehearsal).toContain("stale_policy_rejected");
    expect(rehearsal).toContain("set local role authenticated");
    expect(rehearsal).not.toMatch(/\bcommit\s*;/i);
    expect(rehearsal).toMatch(/^begin;/im);
    expect(rehearsal).toMatch(/rollback;\s*$/i);
  });
});
