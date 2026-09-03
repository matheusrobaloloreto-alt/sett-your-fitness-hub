import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const portalPath = new URL("../src/pages/student/StudentPortal.tsx", import.meta.url);
const studentDetailPath = new URL("../src/pages/admin/StudentDetail.tsx", import.meta.url);
const migrationPath = new URL(
  "../supabase/migrations/20260903083402_quarantine_redundant_empty_training_cycles.sql",
  import.meta.url,
);
const rollbackPath = new URL("./rollback-redundant-empty-training-cycles.sql", import.meta.url);
const manifestSha256 = "29dd196c80f1de7cb2e0def252d0a92cc919f6c336bd20191c32412be9b293f2";

test("student portal scopes cycles to the selected current enrollment", async () => {
  const source = await readFile(portalPath, "utf8");
  assert.match(source, /\.in\("status", \["active", "awaiting_training", "awaiting_renewal"\]\)/);
  const cycleQuery = source.match(/\.from\("training_cycles"\)[\s\S]+?\.order\("cycle_number"\)/)?.[0] ?? "";
  assert.match(cycleQuery, /\.eq\("enrollment_id", enrollment\.id\)/);
  assert.doesNotMatch(cycleQuery, /\.eq\("student_id", student\.id\)/);
  assert.match(source, /selectCurrentPlanCycleWindow\([\s\S]+planDurationDays,[\s\S]+cycleDurationDays/);
});

test("migration quarantines only the fixed, structurally empty manifest", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /v_expected_count constant integer := 18/);
  assert.match(sql, /v_expected_enrollment_count constant integer := 6/);
  assert.match(sql, /v_expected_active_count constant integer := 0/);
  assert.match(sql, /v_count = 0 and v_enrollment_count = 0 and v_active_count = 0/);
  assert.match(sql, new RegExp(manifestSha256));
  assert.match(sql, /training_cycle_empty_supersession_audit/);
  assert.match(sql, /before_snapshot/);
  assert.match(sql, /before_sha256/);
  assert.match(sql, /covering_cycle_ids/);
  assert.match(sql, /covering_snapshots/);
  assert.match(sql, /for update/);
  assert.match(sql, /lock table public\.training_cycles/);
  assert.match(sql, /status = 'superseded'/);
  assert.match(sql, /superseded_by_cycle_id = null/);
  assert.match(sql, /empty_redundant_schedule_fully_covered/);
  assert.match(sql, /prescribed_offline_at/);
  assert.match(sql, /delivery_status/);
  assert.match(sql, /cycle\.workouts/);
  assert.match(sql, /cycle_feedback/);
  assert.match(sql, /ai_plan_versions/);
  assert.match(sql, /workout_sessions/);
  assert.match(sql, /workout_logs/);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.(training_cycles|workouts)/i);
  assert.doesNotMatch(sql, /update\s+public\.workouts/i);
});

test("runtime sync serializes enrollment and fails closed on partial overlaps", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create or replace function public\.sync_prescription_cycles/);
  assert.match(sql, /from public\.enrollments enrollment[\s\S]+for update/);
  assert.match(sql, /training_cycle_partial_overlap/);
  assert.match(sql, /existing_cycle\.status <> 'superseded'/);
  assert.match(sql, /existing_cycle\.superseded_by_cycle_id is null/);
  assert.match(sql, /intended_slot_fully_covered/);
  assert.match(sql, /create or replace function public\.generate_training_cycles/);
  assert.match(sql, /perform cycle\.id[\s\S]+order by cycle\.id[\s\S]+for update;[\s\S]+if tg_op = 'UPDATE' and exists/);
  assert.match(sql, /empty_schedule_replaced_by_date_change/);
  assert.match(sql, /cycle\.cycle_number = v_cycle_number[\s\S]+for update/);
  assert.match(sql, /create or replace function public\.recalculate_training_cycles/);
  assert.match(sql, /end_date = p_new_start_date \+ v_plan_days - 1/);
  assert.match(sql, /least\([\s\S]+v_start \+ v_plan_days - 1/);
  assert.doesNotMatch(sql, /perform public\.advance_training_cycles\(\)/);
  assert.doesNotMatch(sql, /select max\(cycle\.end_date\)/);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.training_cycles/i);
});

test("trainer keeps raw cycles available for complete materialized history", async () => {
  const source = await readFile(studentDetailPath, "utf8");
  assert.match(source, /const \[rawCycles, setRawCycles\]/);
  assert.match(source, /setRawCycles\(cyclesWithSignals\)/);
  assert.match(source, /selectCyclesForProgramHistory\([\s\S]+rawCycles\.filter/);
  assert.match(source, /const allEnrollmentCycles = [\s\S]+rawCycles\.filter/);
});

test("rollback is compare-and-swap and refuses any new usage", async () => {
  const sql = await readFile(rollbackPath, "utf8");
  assert.match(sql, new RegExp(manifestSha256));
  assert.match(sql, /post_sha256/);
  assert.match(sql, /rollback_blocked_post_apply_change/);
  assert.match(sql, /rollback_blocked_post_apply_usage/);
  assert.match(sql, /v_expected constant integer := 18/);
  assert.match(sql, /get diagnostics v_restored = row_count/);
  assert.match(sql, /rollback_restore_count_mismatch/);
  assert.match(sql, /rollback_restore_snapshot_mismatch/);
  assert.match(sql, /get diagnostics v_audit_updated = row_count/);
  assert.match(sql, /rollback_postcheck_applied_rows_remain/);
  assert.match(sql, /workout_sessions/);
  assert.match(sql, /workout_logs/);
  assert.match(sql, /state = 'rolled_back'/);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.(training_cycles|workouts)/i);
});
