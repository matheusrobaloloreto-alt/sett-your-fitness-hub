import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const senderPath = new URL("../src/lib/sendWorkoutTemplate.ts", import.meta.url);
const migrationPath = new URL(
  "../supabase/migrations/20260903140740_fix_delayed_template_cycle_delivery.sql",
  import.meta.url,
);
const emptyCycleRepairPath = new URL(
  "../supabase/migrations/20260903162207_quarantine_extra_empty_training_cycles.sql",
  import.meta.url,
);
const delayedCycleAuditFinalizePath = new URL(
  "../supabase/migrations/20260903170000_finalize_delayed_cycle_repair_audit.sql",
  import.meta.url,
);
const emptyCycleRollbackPath = new URL(
  "./rollback-extra-empty-training-cycles.sql",
  import.meta.url,
);
const exerciseRefRollbackPath = new URL(
  "./rollback-unique-missing-exercise-refs.sql",
  import.meta.url,
);
const exerciseRefRepairPath = new URL(
  "../supabase/migrations/20260903162633_repair_unique_missing_exercise_refs.sql",
  import.meta.url,
);

test("library delivery reuses the current plan cycle instead of creating an overlapping cycle", async () => {
  const source = await readFile(senderPath, "utf8");

  assert.match(source, /rpc\("apply_workout_template_to_current_cycle"/);
  assert.match(source, /p_template_id: template\.id/);
  assert.match(source, /p_student_id: studentId/);
  assert.match(source, /p_company_id: companyId/);
  assert.doesNotMatch(source, /p_workouts:/);
  assert.doesNotMatch(source, /from\("training_cycles"\)/);
  assert.doesNotMatch(source, /from\("workouts"\).*insert/s);
});

test("first-cycle reschedule preserves the purchased training duration and the repair is reversible", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /create or replace function public\.reschedule_training_cycles_from/);
  assert.match(sql, /create or replace function public\.apply_workout_template_to_current_cycle/);
  assert.match(sql, /for update/);
  assert.match(sql, /template_cycle_overlap_ambiguous/);
  assert.match(sql, /template_cycle_already_has_workouts/);
  assert.match(sql, /template_cycle_duration_mismatch/);
  assert.match(sql, /can_manage_staff_student\(p_company_id, p_student_id\)/);
  assert.match(sql, /select template\.workouts into v_template_workouts/);
  assert.doesNotMatch(sql, /authorized_cycle_rebase/);
  assert.match(sql, /end_date = enrollment\.end_date \+ v_shift_days/);
  assert.match(sql, /training_cycle_delivery_repair_audit/);
  assert.match(sql, /before_enrollment/);
  assert.match(sql, /before_cycles/);
  assert.match(sql, /before_workouts/);
  assert.match(sql, /before_dependencies/);
  assert.match(sql, /after_dependencies/);
  assert.match(sql, /snapshot_training_cycle_dependencies/);
  assert.match(sql, /dependency_backfill_blocked/);
  assert.match(sql, /lock table public\.workout_sessions, public\.workout_logs, public\.prescription_bundles/);
  assert.match(sql, /status = 'superseded'/);
  assert.match(sql, /superseded_by_cycle_id = v_target_cycle_id/);
  assert.match(sql, /set cycle_id = v_target_cycle_id/);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.(training_cycles|workouts)/i);
});

test("extra-cycle repair only quarantines empty cycles and keeps data loss guards", async () => {
  const sql = await readFile(emptyCycleRepairPath, "utf8");

  assert.match(sql, /training_cycle_empty_extra_repair_audit/);
  assert.match(sql, /visible_position > visible\.expected_cycles/);
  assert.match(sql, /not exists \(select 1 from public\.workouts workout where workout\.cycle_id = visible\.cycle_id\)/);
  assert.match(sql, /not exists \(select 1 from public\.workout/);
  assert.match(sql, /status = 'superseded'/);
  assert.match(sql, /extra_empty_cycle_quarantined_after_plan_duration_audit/);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.(training_cycles|workouts|workout_sessions|workout_logs)/i);
  assert.doesNotMatch(sql, /set\s+cycle_id\s*=/i);
});

test("applied delayed-cycle repair gains dependency snapshots without rewriting plan data", async () => {
  const sql = await readFile(delayedCycleAuditFinalizePath, "utf8");

  assert.match(sql, /add column if not exists before_dependencies jsonb/);
  assert.match(sql, /snapshot_training_cycle_dependencies/);
  assert.match(sql, /dependency_backfill_blocked/);
  assert.match(sql, /v_workout_usage <> 0/);
  assert.match(sql, /v_post_apply_dependencies <> 0/);
  assert.doesNotMatch(sql, /update public\.(enrollments|training_cycles|workouts)\b/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\./i);
});

test("repair rollbacks use compare-and-swap checks and preserve unrelated workout slots", async () => {
  const [emptyCycleRollback, exerciseRefRollback] = await Promise.all([
    readFile(emptyCycleRollbackPath, "utf8"),
    readFile(exerciseRefRollbackPath, "utf8"),
  ]);

  assert.match(emptyCycleRollback, /rollback_blocked_changed_cycle/);
  assert.match(emptyCycleRollback, /rollback_post_restore_mismatch/);
  assert.match(emptyCycleRollback, /v_applied_count <> 110 or v_rolled_back_count <> 0/);
  assert.match(emptyCycleRollback, /v_applied_count <> 0 or v_rolled_back_count <> 110/);
  assert.match(emptyCycleRollback, /lock table public\.workouts, public\.workout_sessions/);
  assert.match(emptyCycleRollback, /get diagnostics v_updated = row_count/);
  assert.match(exerciseRefRollback, /exercise_ref_rollback_blocked_changed_slot/);
  assert.match(exerciseRefRollback, /exercise_ref_rollback_manifest_mismatch/);
  assert.match(exerciseRefRollback, /exercise_ref_rollback_blocked_post_apply_usage/);
  assert.match(exerciseRefRollback, /v_applied_count <> 0 or v_rolled_back_count <> 2/);
  assert.match(exerciseRefRollback, /array\[v_record\.exercise_index::text\]/);
  assert.match(exerciseRefRollback, /rollback_post_restore_mismatch/);
  assert.match(exerciseRefRollback, /rollback_compare_and_swap_failed/);
});

test("missing exercise reference repair only touches unique exact name matches", async () => {
  const sql = await readFile(exerciseRefRepairPath, "utf8");

  assert.match(sql, /workout_exercise_ref_repair_audit/);
  assert.match(sql, /having count\(\*\) = 1/);
  assert.match(sql, /exercise_name/);
  assert.match(sql, /not exists \(\s*select 1 from public\.exercise_library existing/s);
  assert.match(sql, /jsonb_set\(slot\.exercise, '\{exercise_id\}'/);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.(workouts|exercise_library|workout_exercises)/i);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.workouts/i);
});
