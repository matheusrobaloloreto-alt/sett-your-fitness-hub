import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const plannerPath = new URL("./mfit-overlap-repair-plan.sql", import.meta.url);
const migrationPath = new URL(
  "../supabase/migrations/20260828010500_consolidate_lossless_mfit_cycle_overlaps.sql",
  import.meta.url,
);
const rollbackPath = new URL("./mfit-overlap-repair-rollback.sql", import.meta.url);

const cycleDependencyTables = [
  "cycle_feedback",
  "ai_plan_versions",
  "ai_strength_plans",
  "running_plans",
  "nutrition_plans",
  "prescription_bundles",
];

test("read-only planner covers every live cycle reference family", async () => {
  const sql = await readFile(plannerPath, "utf8");
  assert.doesNotMatch(sql, /\b(insert|update|delete|alter|drop|truncate)\b/i);
  for (const table of cycleDependencyTables) {
    assert.match(sql, new RegExp(`public\\.${table}\\b`));
  }
  for (const counter of [
    "imported_strength_plans",
    "imported_running_plans",
    "imported_nutrition_plans",
    "imported_prescription_bundles",
  ]) {
    assert.match(sql, new RegExp(`${counter} = 0`));
  }
  assert.match(sql, /imported_cycles_for_original_cycle = 1/);
  assert.match(sql, /safe_manifest_sha256/);
  assert.match(sql, /extensions\.digest/);
});

test("apply migration is fingerprinted, backed up and fail-closed", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /v_expected_count constant integer := 15/);
  assert.match(sql, /v_expected_workouts constant integer := 56/);
  assert.match(sql, /v_expected_exercise_rows constant integer := 465/);
  assert.match(sql, /943ddc3130e12cece0b1d46fefecd9d5fbd84b0ac7b887b2311f2d3a58ab0070/);
  assert.match(sql, /mfit_lossless_schema_preflight/);
  assert.match(sql, /to_regprocedure\('extensions\.digest\(text,text\)'\)/);
  assert.match(sql, /information_schema\.columns/);
  assert.match(sql, /imported_cycle_snapshot_sha256/);
  assert.match(sql, /original_cycle_snapshot_sha256/);
  assert.match(sql, /imported_workouts_snapshot_sha256/);
  assert.match(sql, /array_to_string\(imported_workout_ids, ','\)/);
  assert.match(sql, /to_jsonb\(workout\) - 'marker_hash'/);
  assert.doesNotMatch(sql, /current_setting\('sett\.mfit_expected_sha256'/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /lock_timeout = '5s'/);
  assert.match(sql, /in share row exclusive mode/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.mfit_cycle_overlap_repairs from public, anon, authenticated/);
  assert.doesNotMatch(sql, /grant\s+(insert|update|delete|all).*authenticated/i);

  for (const table of cycleDependencyTables) {
    assert.match(sql, new RegExp(`public\\.${table}\\b`));
  }

  const backupAt = sql.indexOf("insert into public.mfit_cycle_overlap_repairs");
  const moveAt = sql.indexOf("update public.workouts as workout");
  const deleteAt = sql.indexOf("delete from public.training_cycles as imported");
  assert.ok(backupAt >= 0 && backupAt < moveAt, "backup must precede workout movement");
  assert.ok(moveAt < deleteAt, "workouts must move before imported cycles are deleted");
  assert.match(sql, /mfit_lossless_post_move_count_mismatch/);
  assert.match(sql, /mfit_lossless_post_exercise_count_mismatch/);
});

test("rollback restores only an unchanged applied batch", async () => {
  const sql = await readFile(rollbackPath, "utf8");
  assert.match(sql, /943ddc3130e12cece0b1d46fefecd9d5fbd84b0ac7b887b2311f2d3a58ab0070/);
  assert.match(sql, /state = 'applied'/);
  assert.match(sql, /mfit_lossless_rollback_target_changed/);
  assert.match(sql, /mfit_lossless_rollback_workout_content_changed/);
  assert.match(sql, /mfit_lossless_rollback_new_history_or_reference/);
  assert.match(sql, /mfit_lossless_rollback_exercise_rows_changed/);
  assert.match(sql, /jsonb_populate_record/);
  assert.match(sql, /cycle_id = \(snapshot\.value->>'cycle_id'\)::uuid/);
  assert.match(sql, /set state = 'rolled_back', rolled_back_at = now\(\)/);
  assert.match(sql, /mfit_lossless_rollback_post_workout_count_mismatch/);
  assert.doesNotMatch(sql, /current_setting\('sett\.mfit_expected_sha256'/);
  assert.doesNotMatch(sql, /grant\s+execute/i);
});

test("automatic apply excludes semantic and used overlaps", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /not exists \(select 1 from public\.workouts where cycle_id = paired\.original_cycle_id\)/);
  assert.match(sql, /not exists \(select 1 from public\.workout_logs where workout_id = any\(paired\.imported_workout_ids\)\)/);
  assert.match(sql, /not exists \(select 1 from public\.workout_sessions where workout_id = any\(paired\.imported_workout_ids\)\)/);
  assert.match(sql, /metadata_is_mergeable/);
  assert.match(sql, /original_cycle_is_unreferenced/);
  assert.match(sql, /imported_cycle_has_no_history/);
});
