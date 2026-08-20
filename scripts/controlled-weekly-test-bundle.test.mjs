import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260820170000_prepare_controlled_weekly_test_session.sql",
  import.meta.url,
);
const batchClaimMigrationUrl = new URL(
  "../supabase/migrations/20260820173000_exclude_controlled_sessions_from_batch_claim.sql",
  import.meta.url,
);
const exactClaimMigrationUrl = new URL(
  "../supabase/migrations/20260820160000_claim_single_controlled_automation_session.sql",
  import.meta.url,
);

async function migrationSql() {
  return readFile(migrationUrl, "utf8");
}

async function sqlAt(url) {
  return readFile(url, "utf8");
}

function normalizedSql(sql) {
  return sql
    .replace(/--.*$/gm, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractFunctionBody(sql, functionName) {
  const match = sql.match(new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\b[\\s\\S]*?as\\s+\\$function\\$([\\s\\S]*?)\\$function\\$`,
    "i",
  ));
  assert.ok(match, `function ${functionName} must be present`);
  return normalizedSql(match[1]);
}

function extractFlowSessionsPredicate(functionBody) {
  const marker = "from public.flow_sessions as session where ";
  const start = functionBody.indexOf(marker);
  assert.notEqual(start, -1, "claim must select from flow_sessions with a where clause");
  const predicateStart = start + marker.length;
  const predicateEnd = functionBody.slice(predicateStart).search(/\s(order by session\.created_at asc|for update skip locked)\s/);
  assert.ok(predicateEnd > 0, "claim predicate must end before locking/ordering");
  return functionBody.slice(predicateStart, predicateStart + predicateEnd);
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

test("scheduled batch claim excludes controlled tests while exact claim keeps them eligible", async () => {
  const batchSql = await sqlAt(batchClaimMigrationUrl);
  const exactSql = await sqlAt(exactClaimMigrationUrl);
  const batchBody = extractFunctionBody(batchSql, "claim_automation_sessions");
  const exactBody = extractFunctionBody(exactSql, "claim_automation_session");
  const batchPredicate = extractFlowSessionsPredicate(batchBody);
  const exactPredicate = extractFlowSessionsPredicate(exactBody);

  assert.match(batchSql, /security\s+definer/i);
  assert.match(batchSql, /set\s+search_path\s+to\s+'public'/i);
  assert.match(batchSql, /revoke all on function public\.claim_automation_sessions\(integer\) from public,\s*anon,\s*authenticated/i);
  assert.match(batchSql, /grant execute on function public\.claim_automation_sessions\(integer\) to service_role/i);

  assert.match(
    batchPredicate,
    /coalesce\(session\.context,\s*'\{\}'::jsonb\)->>'controlled_test' is distinct from 'true'/,
  );
  assert.doesNotMatch(
    batchPredicate,
    /coalesce\(\(coalesce\(session\.context,\s*'\{\}'::jsonb\)->>'controlled_test'\)::boolean,\s*false\) = true/,
  );
  assert.match(
    exactPredicate,
    /coalesce\(\(coalesce\(session\.context,\s*'\{\}'::jsonb\)->>'controlled_test'\)::boolean,\s*false\) = true/,
  );
  assert.doesNotMatch(exactPredicate, /is distinct from 'true'/);
});
