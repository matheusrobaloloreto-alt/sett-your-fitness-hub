import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("SETT-CYCLE-UPDATE-01 contracts", () => {
  const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260908090000_intercycle_anamnesis.sql"), "utf8");
  const dispatcher = readFileSync(resolve(process.cwd(), "supabase/functions/process-automation-sessions/index.ts"), "utf8");
  const motor = readFileSync(resolve(process.cwd(), "supabase/functions/ai-prescribe-workout/index.ts"), "utf8");
  const intercycleEdge = readFileSync(resolve(process.cwd(), "supabase/functions/intercycle-anamnesis/index.ts"), "utf8");
  const registrationManager = readFileSync(resolve(process.cwd(), "src/pages/admin/RegistrationManager.tsx"), "utf8");
  const intercycleMigrations = readdirSync(resolve(process.cwd(), "supabase/migrations"))
    .filter((file) => file.includes("intercycle"))
    .map((file) => readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8"))
    .join("\n");
  it("keeps a unique delivery ledger and RLS-scoped versioned answers", () => {
    expect(migration).toContain("unique (company_id, training_cycle_id)");
    expect(migration).toContain("grant select on public.intercycle_anamnesis_deliveries");
    expect(migration).not.toContain("grant select, insert, update on public.intercycle_anamnesis_deliveries");
    expect(migration).not.toContain(" for all to authenticated");
    expect(migration).toContain("public.can_manage_staff_student(company_id, student_id)");
    expect(migration).not.toContain("using (public.is_company_staff(auth.uid(), company_id))");
    expect(migration).toContain("intercycle answers company staff read");
    expect(migration).toContain("intercycle answers student read own");
    expect(migration).toContain("assert_intercycle_delivery_scope");
    expect(migration).toContain("assert_intercycle_answer_scope");
    expect(intercycleMigrations).toContain("revoke all on function public.assert_intercycle_delivery_scope()");
    expect(intercycleMigrations).toContain("public.assert_intercycle_delivery_transition()");
    expect(intercycleMigrations).toContain("public.assert_intercycle_invite_scope()");
    expect(intercycleMigrations).toContain("public.assert_intercycle_answer_scope()");
    expect(intercycleMigrations).toContain("public.assert_intercycle_waiver_scope()");
    expect(intercycleMigrations).toContain("public.reconcile_intercycle_delivery_for_cycle_change()");
    expect(intercycleMigrations).toContain("from public, anon, authenticated");
  });
  it("only dispatches from the cron-owned sender with verified recipient resolution", () => {
    expect(dispatcher).toContain("processIntercycleAnamnesisDeliveries");
    expect(dispatcher).toContain("resolveVerifiedWhatsAppRecipient");
    expect(dispatcher).toContain("claim_intercycle_anamnesis_deliveries");
  });
  it("blocks a new cycle until response or an auditable waiver, and protects EVA > 5", () => {
    expect(motor).toContain("Anamnese interciclos respondida ou dispensa explícita");
    expect(motor).toContain("Dor acima de EVA 5");
    expect(migration).toContain("record_intercycle_anamnesis_waiver");
    expect(motor).toContain("record_intercycle_anamnesis_waiver");
    expect(motor).not.toContain(".from(\"intercycle_anamnesis_waivers\").upsert");
  });
  it("uses business-date cycle semantics and excludes invalid/superseded cycles", () => {
    expect(migration).toContain("v_today date := public.current_business_date()");
    expect(migration).toContain("awaiting_renewal");
    expect(migration).toContain("c.superseded_at is null");
    expect(migration).toContain("coalesce(c.status, '') not in ('cancelled','superseded')");
    expect(motor).toContain("current_business_date");
    expect(motor).toContain("Prescrição exige training_cycle_id ou um único ciclo vigente validado no tenant.");
  });
  it("recovers stuck sending deliveries and still audits provider-off attempts", () => {
    expect(migration).toContain("status = 'sending' and updated_at < now() - interval '15 minutes'");
    expect(migration).toContain("sending_lease_expired");
    expect(dispatcher).toContain("intercycle_provider_not_configured");
    expect(dispatcher).toContain("provider: evolutionUrl && evolutionKey ? { url: evolutionUrl, key: evolutionKey } : undefined");
    expect(dispatcher).toContain("reason: \"provider_not_configured\", intercycle");
  });
  it("handles cancellation, reschedule, token replay, expiry, and explicit sensitive-data consent", () => {
    const edge = readFileSync(resolve(process.cwd(), "supabase/functions/intercycle-anamnesis/index.ts"), "utf8");
    expect(migration).toContain("reconcile_intercycle_delivery_for_cycle_change");
    expect(migration).toContain("cycle_rescheduled");
    expect(migration).toContain("cycle_cancelled_or_rescoped");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("create or replace function public.submit_intercycle_anamnesis");
    expect(migration).toContain("grant execute on function public.submit_intercycle_anamnesis");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("from public, anon, authenticated");
    expect(edge).toContain("rpc(\"submit_intercycle_anamnesis\"");
    expect(edge).not.toContain(".from(\"intercycle_anamneses\").insert");
    expect(dispatcher).toContain("onConflict: \"delivery_id\"");
    expect(motor).toContain("typeof data.claims.exp === \"number\"");
    expect(edge).toContain("sensitive_consent");
  });
  it("invalidates stale manual links when a cycle moves and rechecks the live cycle window", () => {
    expect(intercycleMigrations).toContain("cycle_rescheduled_manual_link_invalidated");
    expect(intercycleMigrations).toMatch(/status in \('ready','scheduled','failed'\)/);
    expect(intercycleMigrations).toMatch(/update public\.intercycle_anamnesis_invites[\s\S]*expires_at = least\(expires_at, now\(\)\)/);
    expect(intercycleMigrations).toContain("intercycle_submit_window_closed");
    expect(intercycleMigrations).toMatch(/v_today < v_cycle\.start_date \+ 28/);
    expect(intercycleMigrations).toMatch(/v_today > coalesce\(v_cycle\.end_date, v_cycle\.start_date \+ 41\)/);
  });
  it("makes public submit atomic under replay/concurrency/rollback races", () => {
    const submitFn = intercycleMigrations.slice(intercycleMigrations.lastIndexOf("create or replace function public.submit_intercycle_anamnesis"));
    expect(submitFn).toMatch(/from public\.intercycle_anamnesis_invites[\s\S]*where token_sha256 = _token_sha256[\s\S]*for update;/);
    expect(submitFn).toMatch(/from public\.training_cycles[\s\S]*for update;/);
    expect(submitFn).toMatch(/from public\.intercycle_anamnesis_deliveries[\s\S]*for update;/);
    expect(submitFn).toContain("intercycle_submit_link_replayed");
    expect(submitFn).toContain("intercycle_submit_response_duplicate");
    expect(submitFn).toContain("intercycle_submit_delivery_unavailable");
    expect(submitFn.indexOf("for update;")).toBeLessThan(submitFn.indexOf("insert into public.intercycle_anamneses"));
    expect(submitFn.indexOf("insert into public.intercycle_anamneses")).toBeLessThan(submitFn.indexOf("set consumed_at = now()"));
    expect(submitFn.indexOf("set consumed_at = now()")).toBeLessThan(submitFn.indexOf("set status = 'responded'"));
  });

  it("lets staff generate and copy an auditable cycle-scoped invite", () => {
    expect(registrationManager).toContain("intercycleStudentId");
    expect(registrationManager).toContain('action: "create-link"');
    expect(registrationManager).toContain("Gerar e copiar link");
    expect(registrationManager).toContain("navigator.clipboard.writeText(link)");
    expect(intercycleEdge).toContain('action === "create-link"');
    expect(intercycleEdge).toContain('status: "ready"');
    expect(intercycleEdge).toContain('from("intercycle_anamnesis_invites").upsert');
    expect(intercycleMigrations).toContain("'ready'");
    expect(intercycleMigrations).toContain("old.status = 'ready'");
  });
});
