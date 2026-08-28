import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const plannerPath = new URL("./mfit-semantic-supersession-plan.sql", import.meta.url);
const migrationPath = new URL(
  "../supabase/migrations/20260828023000_supersede_semantic_mfit_cycle_overlaps.sql",
  import.meta.url,
);
const rollbackPath = new URL("./mfit-semantic-supersession-rollback.sql", import.meta.url);
const auditPath = new URL("./mfit-semantic-supersession-audit.sql", import.meta.url);
const manifest = "d3f2acfadde8b69cf647456fa958ed36ec7195100b94a029af3371b56c589247";

test("semantic planner is read-only and requires integrated canonical ownership", async () => {
  const sql = await readFile(plannerPath, "utf8");
  assert.doesNotMatch(sql, /\b(insert|update|delete|alter|drop|truncate)\b/i);
  assert.match(sql, /imported_logs = 0/);
  assert.match(sql, /imported_sessions = 0/);
  assert.match(sql, /imported_bundles = 0/);
  assert.match(sql, /canonical_versions > 0/);
  assert.match(sql, /canonical_strength > 0/);
  assert.match(sql, /canonical_running > 0/);
  assert.match(sql, /canonical_bundles > 0/);
  assert.match(sql, /eligible_manifest_sha256/);
});

test("semantic migration preserves workouts and records reversible before-images", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, new RegExp(manifest));
  assert.match(sql, /v_count <> 3/);
  assert.match(sql, /training_cycle_supersession_audit/);
  assert.match(sql, /superseded_snapshot/);
  assert.match(sql, /canonical_snapshot/);
  assert.match(sql, /status = 'superseded'/);
  assert.match(sql, /superseded_by_cycle_id = candidate\.canonical_cycle_id/);
  assert.match(sql, /legacy_mfit_replaced_by_integrated_prescription/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.training_cycle_supersession_audit from public, anon, authenticated/);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.(training_cycles|workouts)/i);
  assert.doesNotMatch(sql, /update\s+public\.workouts/i);
  assert.match(sql, /create or replace function public\.recalculate_training_cycles/);
  assert.match(sql, /status not in \('completed', 'superseded'\)/);
  assert.match(sql, /create or replace function public\.reschedule_training_cycles_from/);
  assert.match(sql, /cycle\.status <> 'superseded'/);
  assert.match(sql, /create or replace function public\.sync_prescription_cycles/);
  assert.match(sql, /and cycle\.superseded_by_cycle_id is null/);
  assert.match(sql, /drop index if exists public\.training_cycles_enrollment_number_uidx/);
  assert.match(sql, /create unique index training_cycles_enrollment_number_uidx/);
  assert.match(sql, /where enrollment_id is not null\s+and status is distinct from 'superseded'\s+and superseded_by_cycle_id is null/);
  assert.match(sql, /existing_cycle\.cycle_number = v_cycle_number\s+and existing_cycle\.status <> 'superseded'/);

  const backupAt = sql.indexOf("insert into public.training_cycle_supersession_audit");
  const supersedeAt = sql.indexOf("update public.training_cycles imported");
  assert.ok(backupAt >= 0 && backupAt < supersedeAt, "before-images must be written before supersession");
});

test("semantic rollback fails closed after any real use", async () => {
  const sql = await readFile(rollbackPath, "utf8");
  assert.match(sql, new RegExp(manifest));
  assert.match(sql, /workout_logs/);
  assert.match(sql, /workout_sessions/);
  assert.match(sql, /cycle_feedback/);
  assert.match(sql, /ai_strength_plans/);
  assert.match(sql, /running_plans/);
  assert.match(sql, /prescription_bundles/);
  assert.match(sql, /mfit_semantic_rollback_blocked_post_apply_usage/);
  assert.match(sql, /status = cycle\.superseded_previous_status/);
  assert.match(sql, /set state = 'rolled_back', rolled_back_at = now\(\)/);
  assert.doesNotMatch(sql, /grant\s+execute/i);
});

test("semantic post-apply audit is aggregate-only and checks the visible index", async () => {
  const sql = await readFile(auditPath, "utf8");
  assert.match(sql, new RegExp(manifest));
  assert.match(sql, /applied_audit_rows/);
  assert.match(sql, /superseded_cycles/);
  assert.match(sql, /preserved_workouts/);
  assert.match(sql, /post_apply_usage/);
  assert.match(sql, /visible_cycle_partial_unique_index/);
  assert.doesNotMatch(sql, /students|full_name|email|phone/i);
  assert.doesNotMatch(sql, /\b(insert|update|delete|alter|drop|truncate)\b/i);
});
