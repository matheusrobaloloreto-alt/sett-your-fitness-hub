import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260820170000_prepare_controlled_weekly_test_session.sql",
  import.meta.url,
);

async function migrationSql() {
  return readFile(migrationUrl, "utf8");
}

test("controlled weekly seed is service-role-only, idempotent and exact-recipient scoped", async () => {
  const sql = await migrationSql();

  assert.match(sql, /auth\.role\(\)\s*<>\s*'service_role'/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\(v_chat\.id::text,\s*0\)\)/i);
  assert.match(sql, /controlled_test_run_id/i);
  assert.match(sql, /trigger_type'\s*,\s*'weekly_contact'/i);
  assert.match(sql, /controlled_test'\s*,\s*true/i);
  assert.match(sql, /@s\\\.whatsapp\\\.net/i);
  assert.match(sql, /sett_phone_key/i);
  assert.match(sql, /status\s*=\s*'connected'/i);
  assert.match(sql, /status\s+in\s*\('active',\s*'awaiting_training',\s*'awaiting_renewal'\)/i);
  assert.match(sql, /existing\.status\s+in\s*\('active',\s*'waiting_response',\s*'processing'\)/i);
  assert.match(sql, /revoke all on function public\.prepare_controlled_weekly_test_session/i);
  assert.match(sql, /grant execute on function public\.prepare_controlled_weekly_test_session[^;]*service_role/i);

  const runLock = sql.indexOf("pg_advisory_xact_lock(hashtextextended(_controlled_test_run_id::text, 0))");
  const recipientLock = sql.indexOf("pg_advisory_xact_lock(hashtextextended(v_chat.id::text, 0))");
  const openSessionCheck = sql.indexOf("existing.status in ('active', 'waiting_response', 'processing')");
  const sessionInsert = sql.indexOf("insert into public.flow_sessions");
  assert.ok(runLock < recipientLock, "run ID must be locked before the recipient");
  assert.ok(recipientLock < openSessionCheck, "recipient must be locked before checking for an open session");
  assert.ok(openSessionCheck < sessionInsert, "open-session check must precede the insert");
});

test("controlled weekly rollback cancels without deleting evidence", async () => {
  const sql = await migrationSql();
  const rollbackStart = sql.indexOf("cancel_controlled_weekly_test_session");
  assert.notEqual(rollbackStart, -1);
  const rollback = sql.slice(rollbackStart);

  assert.match(rollback, /controlled_test/i);
  assert.match(rollback, /status\s*=\s*'cancelled'/i);
  assert.doesNotMatch(rollback, /delete\s+from\s+public\.flow_sessions/i);
  assert.match(sql, /grant execute on function public\.cancel_controlled_weekly_test_session[^;]*service_role/i);
});
