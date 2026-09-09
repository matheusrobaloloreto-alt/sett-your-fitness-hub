import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260909153732_repair_single_enrollment_cycle_overlap.sql", import.meta.url),
  "utf8",
);
const rollback = readFileSync(
  new URL("./rollback-single-enrollment-cycle-overlap.sql", import.meta.url),
  "utf8",
);

test("repairs the exact overlap with restricted before-images and no destructive delete", () => {
  assert.match(migration, /training_cycle_overlap_repair_audit/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.training_cycle_overlap_repair_audit from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update on table public\.training_cycle_overlap_repair_audit to service_role/);
  assert.doesNotMatch(migration, /to_jsonb\(v_enrollment\)/);
  assert.match(migration, /substr\(md5\(enrollment\.id::text\), 1, 12\) = '6d6035153239'/);
  assert.match(migration, /d324fefa6aa2/);
  assert.match(migration, /6d88dce60520/);
  assert.match(migration, /b8b3ded1dc5c/);
  assert.match(migration, /05b82f5dce25/);
  assert.match(migration, /before_cycles/);
  assert.match(migration, /before_workouts/);
  assert.match(migration, /status = 'superseded'/);
  assert.match(migration, /superseded_by_cycle_id = v_c6_id/);
  assert.match(migration, /start_date = date '2026-06-04'/);
  assert.match(migration, /end_date = date '2026-07-12'/);
  assert.match(migration, /start_date = date '2026-09-10'/);
  assert.match(migration, /end_date = date '2027-02-24'/);
  assert.match(migration, /superseded_reason = 'renewal_cycle_overflow_from_stale_cycle_tail'/);
  assert.match(migration, /overlap_repair_chronology_postcheck_failed/);
  assert.match(migration, /overlap_repair_postcheck_failed/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(training_cycles|workouts|workout_exercises|workout_logs|workout_sessions)/i);
});

test("rollback is compare-and-swap guarded and restores the captured rows", () => {
  assert.match(rollback, /training_cycle_overlap_repair_audit/);
  assert.match(rollback, /overlap_repair_rollback_compare_and_swap_failed/);
  assert.match(rollback, /jsonb_populate_record/);
  assert.match(rollback, /state = 'rolled_back'/);
  assert.doesNotMatch(rollback, /delete\s+from\s+public\.(training_cycles|workouts|workout_exercises|workout_logs|workout_sessions)/i);
});
