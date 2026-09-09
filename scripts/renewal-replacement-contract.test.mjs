import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260909165533_replace_paid_renewal_enrollment.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("./rollback-renewal-replacement.sql", import.meta.url),
  "utf8",
);

test("paid renewals replace the enrollment period instead of extending it", () => {
  assert.match(migration, /create or replace function public\.apply_paid_payment_lifecycle/);
  assert.match(migration, /replace_paid_student_enrollment_internal/);
  assert.match(migration, /v_enrollment_id := v_replacement\.enrollment_id/);
  assert.doesNotMatch(migration, /v_extension_start/);
  assert.doesNotMatch(migration, /set end_date = v_new_end/);
  assert.match(migration, /_start_date \+ v_plan_days - 1/);
  assert.match(migration, /lifecycle_applied_at is not null/);
  assert.match(migration, /return query select v_payment\.lifecycle_enrollment_id, v_payment\.lifecycle_first_activation, true/);
});

test("initial paid activation keeps the old no-auto-cycle behavior", () => {
  const initialInsert = migration.slice(
    migration.indexOf("if v_enrollment.id is null then"),
    migration.indexOf("elsif lower(coalesce(v_enrollment.payment_status", migration.indexOf("if v_enrollment.id is null then")),
  );
  assert.match(initialInsert, /insert into public\.enrollments/);
  assert.match(initialInsert, /cycle_duration_days, payment_status, payment_date, status, company_id/);
  assert.doesNotMatch(initialInsert, /training_start_date/);
});

test("carry-over eligibility is exactly a started old cycle with real active workouts", () => {
  assert.match(migration, /create or replace function public\.is_enrollment_carried_over_cycle_eligible/);
  assert.match(migration, /cycle\.enrollment_id is distinct from _enrollment_id/);
  assert.match(migration, /cycle\.start_date <= public\.current_business_date\(\)/);
  assert.match(migration, /cycle\.prescription_cleared_at is null/);
  assert.match(migration, /workout\.superseded_at is null/);
  assert.match(migration, /jsonb_array_length\(coalesce\(workout\.exercises, '\[\]'::jsonb\)\) > 0/);
  assert.doesNotMatch(migration, /delivery_status.*published/);
  assert.doesNotMatch(migration, /prescribed_offline_at is not null/);
  assert.doesNotMatch(migration, /prescription_bundles/);
  assert.doesNotMatch(migration, /ai_strength_plans/);
  assert.match(migration, /revoke all on function public\.is_enrollment_carried_over_cycle_eligible\(uuid, uuid, uuid, uuid\)\s+from public, anon, authenticated/);
});

test("carry-over selection prefers the previous enrollment real cycle before inherited fallback", () => {
  const selector = migration.slice(
    migration.indexOf("create or replace function public.select_enrollment_carryover_cycle"),
    migration.indexOf("create or replace function public.enforce_enrollment_replacement_and_carryover"),
  );
  const currentCycleSelect = selector.indexOf("from public.training_cycles cycle");
  const clearedBarrier = selector.indexOf("v_latest_started_cycle.start_date >= v_prepared_start");
  const explicitClearBarrier = selector.indexOf("v_previous.carried_over_cycle_cleared_at is not null");
  const inheritedFallback = selector.indexOf("v_previous.carried_over_cycle_id is not null");
  assert.ok(currentCycleSelect >= 0 && inheritedFallback > currentCycleSelect);
  assert.ok(clearedBarrier > currentCycleSelect && clearedBarrier < inheritedFallback);
  assert.ok(explicitClearBarrier > currentCycleSelect && explicitClearBarrier < inheritedFallback);
  assert.match(selector, /and cycle\.prescription_cleared_at is not null/);
  assert.match(selector, /if v_latest_started_cycle\.id is not null\s+and \(v_prepared_start is null or v_latest_started_cycle\.start_date >= v_prepared_start\) then\s+return null/);
  assert.doesNotMatch(selector, /if v_latest_started_cycle\.id is not null then\s+return null/);
});

test("direct staff inserts cannot bypass replacement or mismatch carry-over", () => {
  const trigger = migration.slice(
    migration.indexOf("create or replace function public.enforce_enrollment_replacement_and_carryover"),
    migration.indexOf("create or replace function public.replace_paid_student_enrollment_internal"),
  );
  assert.match(trigger, /before insert or update of student_id, company_id, status, payment_status, carried_over_cycle_id, carried_over_cycle_cleared_at/);
  assert.match(trigger, /for update/);
  assert.match(trigger, /set status = 'completed'/);
  assert.match(trigger, /new\.carried_over_cycle_id is null and new\.carried_over_cycle_cleared_at is null/);
  assert.match(trigger, /Carry-over cycle must be an eligible old real-workout cycle/);
});

test("staff RPC is small, authenticated, and has no payment/billing side effects", () => {
  const rpc = migration.slice(
    migration.indexOf("create or replace function public.replace_student_enrollment"),
    migration.indexOf("create or replace function public.apply_paid_payment_lifecycle"),
  );
  assert.match(rpc, /_clear_carried_over_cycle boolean default false/);
  assert.match(rpc, /not public\.can_manage_staff_student\(_company_id, _student_id\)/);
  assert.match(rpc, /for update/);
  assert.doesNotMatch(rpc, /public\.payments/);
  assert.doesNotMatch(rpc, /asaas/i);
  assert.match(migration, /grant execute on function public\.replace_student_enrollment\(uuid, uuid, uuid, uuid, date, boolean\)\s+to authenticated, service_role/);
});

test("rollback restores the prior lifecycle definition without dropping continuity schema", () => {
  assert.match(rollback, /drop trigger if exists zz_enforce_enrollment_replacement_and_carryover/);
  assert.match(rollback, /allow_after_renewal_replacements/);
  assert.match(rollback, /renewal_replacement_rollback_blocked_existing_references/);
  assert.match(rollback, /Keep frontend readers that tolerate carried_over_cycle_id/);
  assert.doesNotMatch(rollback, /drop function if exists public\.replace_student_enrollment/);
  assert.doesNotMatch(rollback, /drop function if exists public\.replace_paid_student_enrollment_internal/);
  assert.doesNotMatch(rollback, /drop constraint if exists enrollments_carried_over_cycle_id_fkey/);
  assert.doesNotMatch(rollback, /drop column if exists carried_over_cycle_id/);
  assert.doesNotMatch(rollback, /drop column if exists carried_over_cycle_cleared_at/);
  assert.match(rollback, /20260909154800_fix_paid_renewal_cycle_window\.sql/);
});
