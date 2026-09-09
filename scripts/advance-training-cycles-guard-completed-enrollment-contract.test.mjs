import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260909165547_guard_completed_enrollment_cycles.sql",
  import.meta.url,
);
const canaryPath = new URL("./advance-training-cycles-guard-completed-enrollment-canary.sql", import.meta.url);
const pushSendPath = new URL("../supabase/functions/push-send/index.ts", import.meta.url);
const automationPath = new URL("../supabase/functions/process-automation-sessions/index.ts", import.meta.url);

test("advance_training_cycles keeps live ordering while skipping completed renewal-history enrollments", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create or replace function public\.advance_training_cycles\(\)/i);
  assert.match(sql, /v_today date := public\.current_business_date\(\)/);
  assert.match(sql, /pg_advisory_xact_lock\(hashtext\('public\.advance_training_cycles'\)\)/);
  assert.match(sql, /case when tc\.bundle_id is not null then 0 else 1 end/);
  assert.match(sql, /from public\.enrollments e[\s\S]+e\.id = tc\.enrollment_id[\s\S]+e\.status = 'completed'/);
  assert.match(sql, /where status in \('active', 'pending'\)[\s\S]+end_date is not null[\s\S]+end_date < v_today[\s\S]+not exists/);
  assert.match(sql, /where status in \('active', 'pending'\)[\s\S]+start_date is not null[\s\S]+start_date > v_today[\s\S]+not exists/);
  assert.match(sql, /ranked_current_cycles[\s\S]+tc\.enrollment_id is not null[\s\S]+not exists/);
  assert.doesNotMatch(sql, /prescription_bundles/i);
});

test("behavioral canary proves historical completed enrollment cycles are untouched", async () => {
  const sql = await readFile(canaryPath, "utf8");
  assert.match(sql, /begin;/);
  assert.match(sql, /rollback;/);
  assert.match(sql, /v_completed_enrollment_id/);
  assert.match(sql, /'completed'/);
  assert.match(sql, /perform public\.advance_training_cycles\(\)/);
  assert.match(sql, /advance_guard_mutated_completed_current_cycle/);
  assert.match(sql, /advance_guard_mutated_completed_future_cycle/);
  assert.match(sql, /advance_guard_active_overdue_not_completed/);
  assert.match(sql, /advance_guard_active_current_not_activated/);
  assert.match(sql, /advance_guard_active_future_not_pending/);
});

test("cron notification paths ignore completed enrollment cycles caused by renewal replacement", async () => {
  const pushSend = await readFile(pushSendPath, "utf8");
  assert.match(pushSend, /activeCycleRows/);
  assert.match(pushSend, /openEnrollments/);
  assert.match(pushSend, /\.neq\("status", "completed"\)/);
  assert.match(pushSend, /openEnrollmentIds\.has\(cycle\.enrollment_id\)/);

  const automation = await readFile(automationPath, "utf8");
  assert.match(automation, /enrollmentResult/);
  assert.match(automation, /intercycle_enrollment_lookup_failed/);
  assert.match(automation, /intercycle_enrollment_completed_or_missing/);
  assert.match(automation, /String\(enrollment\.status \|\| ""\) === "completed"/);
  assert.match(automation, /code === "intercycle_cycle_cancelled_or_rescoped" \|\| code === "intercycle_enrollment_completed_or_missing"/);
});
