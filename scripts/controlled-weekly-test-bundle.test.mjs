import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260820170000_prepare_controlled_weekly_test_session.sql",
  import.meta.url,
);
const claimSemanticsMigrationUrl = new URL(
  "../supabase/migrations/20260820174000_align_controlled_test_claim_semantics.sql",
  import.meta.url,
);
const CONTROLLED_TEST_TRUTHY = new Set(["true", "t", "1", "yes", "y", "on"]);

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

function controlledTestFlag(context) {
  const rawValue = context && Object.hasOwn(context, "controlled_test")
    ? context.controlled_test
    : undefined;
  return CONTROLLED_TEST_TRUTHY.has(String(rawValue ?? "false").trim().toLowerCase());
}

function scheduledBatchEligible(context) {
  return !controlledTestFlag(context);
}

function exactControlledEligible(context) {
  return controlledTestFlag(context);
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

test("scheduled batch and exact claim share fail-closed controlled-test semantics", async () => {
  const batchSql = await sqlAt(claimSemanticsMigrationUrl);
  const exactSql = batchSql;
  const batchBody = extractFunctionBody(batchSql, "claim_automation_sessions");
  const exactBody = extractFunctionBody(exactSql, "claim_automation_session");
  const batchPredicate = extractFlowSessionsPredicate(batchBody);
  const exactPredicate = extractFlowSessionsPredicate(exactBody);
  const truthySql = "lower(btrim(coalesce(coalesce(session.context, '{}'::jsonb)->>'controlled_test', 'false')))";

  assert.match(batchSql, /security\s+definer/i);
  assert.match(batchSql, /set\s+search_path\s+to\s+'public'/i);
  assert.match(batchSql, /revoke all on function public\.claim_automation_sessions\(integer\) from public,\s*anon,\s*authenticated/i);
  assert.match(batchSql, /grant execute on function public\.claim_automation_sessions\(integer\) to service_role/i);
  assert.match(batchSql, /revoke all on function public\.claim_automation_session\(uuid\) from public,\s*anon,\s*authenticated/i);
  assert.match(batchSql, /grant execute on function public\.claim_automation_session\(uuid\) to service_role/i);

  assert.ok(batchPredicate.includes(`${truthySql} not in ('true', 't', '1', 'yes', 'y', 'on')`));
  assert.ok(exactPredicate.includes(`${truthySql} in ('true', 't', '1', 'yes', 'y', 'on')`));
  assert.doesNotMatch(batchPredicate, /::boolean/);
  assert.doesNotMatch(exactPredicate, /::boolean/);
  assert.match(exactPredicate, /trigger_type'\s*=\s*'weekly_contact'/);
});

test("controlled-test flag table is disjoint for batch and exact claims", () => {
  const cases = [
    ["absent", {}, false],
    ["null", { controlled_test: null }, false],
    ["false", { controlled_test: false }, false],
    ["true", { controlled_test: true }, true],
    ["'true'", { controlled_test: "true" }, true],
    ["'TRUE'", { controlled_test: "TRUE" }, true],
    ["'t'", { controlled_test: "t" }, true],
    ["'1'", { controlled_test: "1" }, true],
    ["'yes'", { controlled_test: "yes" }, true],
    ["'y'", { controlled_test: "y" }, true],
    ["'on'", { controlled_test: "on" }, true],
    ["invalid text", { controlled_test: "maybe" }, false],
  ];

  for (const [label, context, expectedControlled] of cases) {
    assert.equal(controlledTestFlag(context), expectedControlled, label);
    assert.equal(exactControlledEligible(context), expectedControlled, `${label} exact`);
    assert.equal(scheduledBatchEligible(context), !expectedControlled, `${label} batch`);
    assert.notEqual(scheduledBatchEligible(context), exactControlledEligible(context), `${label} disjoint`);
  }
});
