import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const migrationDir = new URL("../supabase/migrations/", import.meta.url);
const script = (name) => new URL(`./${name}`, import.meta.url);

const dependencyTables = [
  "training_cycles",
  "workouts",
  "workout_exercises",
  "workout_logs",
  "workout_sessions",
  "cycle_feedback",
  "ai_plan_versions",
  "ai_strength_plans",
  "running_plans",
  "nutrition_plans",
  "prescription_bundles",
  "prescription_bundle_items",
  "intercycle_anamneses",
  "intercycle_anamnesis_deliveries",
  "intercycle_anamnesis_invites",
  "intercycle_anamnesis_waivers",
  "workout_archive_events",
  "cycle_prescription_clear_events",
  "payments",
  "payment_recovery_events",
];

const remoteMigrations = [
  {
    current: "20260909230806_reconcile_bn_legacy_enrollment_terms.sql",
    stale: "20260909225312_reconcile_bn_legacy_enrollment_terms.sql",
    bytes: 10643,
    md5: "099daa7d201359318c69a7a5f9832aab",
  },
  {
    current: "20260909231218_reconcile_bn_remaining_legacy_terms.sql",
    stale: "20260909230931_reconcile_bn_remaining_legacy_terms.sql",
    bytes: 8380,
    md5: "7195c01519a936d45cf77e5d43b614b6",
  },
];

test("local migration versions and bytes match the remote migration ledger", async () => {
  for (const migration of remoteMigrations) {
    const body = await readFile(new URL(migration.current, migrationDir));
    assert.equal(body.byteLength, migration.bytes);
    assert.equal(createHash("md5").update(body).digest("hex"), migration.md5);
    await assert.rejects(access(new URL(migration.stale, migrationDir)));
  }
});

test("rollback keeps the exact after-image gate and excludes trigger-managed timestamps after restore", async () => {
  for (const filename of [
    "rollback-bn-legacy-enrollment-terms.sql",
    "rollback-bn-remaining-legacy-terms.sql",
  ]) {
    const sql = await readFile(script(filename), "utf8");
    assert.match(sql, /after_sha256=encode\(extensions\.digest/i);
    assert.doesNotMatch(sql, /updated_at\s*=\s*\([^\n]+before_(?:enrollment|student)/i);
    assert.match(sql, /jsonb_strip_nulls\(to_jsonb\([^)]*\)-'updated_at'\)/i);
    assert.match(sql, /transaction_timestamp\(\)/i);
    assert.match(sql, /rollback_post_repair_dependency_activity/i);
    assert.match(sql, /rollback_cardinality_mismatch expected=(?:12|6) actual=%/i);
    assert.ok(
      sql.search(/rollback_cardinality_mismatch/i) < sql.search(/before_sha256=encode\(extensions\.digest/i),
      `${filename} must reject applied-row cardinality drift before validating hashes`,
    );
    assert.ok(
      sql.search(/before_sha256=encode\(extensions\.digest/i) < sql.search(/update public\./i),
      `${filename} must validate before_sha256 before the first persistent update`,
    );
    for (const table of dependencyTables) {
      assert.match(sql, new RegExp(`lock table public\\.${table} in share row exclusive mode`, "i"));
      assert.match(sql, new RegExp(`public\\.${table}\\b`, "i"));
    }
    assert.match(sql, /carried_over_cycle_id/i);
    assert.match(sql, /coalesce\(payment\.lifecycle_enrollment_id,payment\.enrollment_id\)/i);
    assert.match(sql, /payment\.lifecycle_applied_at/i);
    assert.match(sql, /greatest\(event\.occurred_at,event\.created_at\)/i);
    assert.match(sql, /greatest\([^;]+(?:log|l)\.created_at,(?:log|l)\.updated_at,/is);
  }
});

test("first rollback only touches student status when the applied repair changed it", async () => {
  const sql = await readFile(script("rollback-bn-legacy-enrollment-terms.sql"), "utf8");
  assert.match(sql, /set status=audit\.before_student->>'status'/i);
  assert.match(sql, /audit\.after_student->>'status' is distinct from audit\.before_student->>'status'/i);
  assert.doesNotMatch(sql, /set status=[\s\S]+sales_stage=/i);
});

test("readiness audit is read-only, aggregate-only, and validates both real triggers", async () => {
  const sql = await readFile(script("audit-bn-legacy-term-rollback-readiness.sql"), "utf8");
  const executableSql = sql
    .replace(/--.*$/gm, "")
    .replace(/'(?:''|[^'])*'/g, "''");
  assert.match(sql, /begin transaction read only/i);
  assert.match(sql, /rollback;/i);
  assert.doesNotMatch(executableSql, /\b(insert|update|delete|alter|drop|truncate|create|grant|revoke)\b/i);
  assert.match(sql, /enabled_expected_triggers=2/);
  assert.match(sql, /function_forces_transaction_timestamp/);
  assert.match(sql, /valid_before_images/);
  assert.match(sql, /exact_after_image_matches/);
  assert.match(sql, /rows_with_post_repair_dependency_activity/);
  assert.match(sql, /greatest\([^;]+log\.created_at,log\.updated_at,/is);
  for (const table of dependencyTables) {
    assert.match(sql, new RegExp(`public\\.${table}\\b`, "i"));
  }
  assert.match(sql, /carried_over_cycle_id/i);
  assert.match(sql, /coalesce\(payment\.lifecycle_enrollment_id,payment\.enrollment_id\)/i);
  assert.match(sql, /payment\.lifecycle_applied_at/i);
  assert.match(sql, /greatest\(event\.occurred_at,event\.created_at\)/i);
  assert.doesNotMatch(sql, /student\.(?:name|email|phone)|enrollment\.(?:name|email|phone)/i);
});

test("applied-row cardinality negative rehearsal rejects an extra row in both batches", async () => {
  const sql = await readFile(
    script("rehearse-legacy-term-rollback-cardinality.sql"),
    "utf8",
  );
  assert.match(sql, /bn_legacy_terms_20260909[^;]+generate_series\(1,12\)/is);
  assert.match(sql, /bn_remaining_legacy_terms_20260909[^;]+generate_series\(1,6\)/is);
  assert.match(sql, /first_batch_extra_rejected/i);
  assert.match(sql, /second_batch_extra_rejected/i);
  assert.match(sql, /rollback;\s*$/i);
  assert.doesNotMatch(sql, /public\./i);
});

test("corrupted before-image rehearsal is pg_temp-only, rejects the mismatch, and rolls back", async () => {
  const sql = await readFile(
    script("rehearse-before-sha256-corruption-rollback-readiness.sql"),
    "utf8",
  );
  assert.match(sql, /create temporary table pg_temp\.before_image_rollback_probe/i);
  assert.match(sql, /before_sha256=encode\(extensions\.digest/i);
  assert.match(sql, /raise check_violation using message='before_image_hash_mismatch'/i);
  assert.match(sql, /corrupt_snapshot_rejected/i);
  assert.match(sql, /rollback;\s*$/i);
  assert.doesNotMatch(sql, /\b(?:insert into|update|delete from)\s+public\./i);
  assert.doesNotMatch(sql, /^\s*commit\s*;/im);
});

test("trigger rehearsal is isolated to a temporary table and always rolls back", async () => {
  const sql = await readFile(script("rehearse-updated-at-trigger-rollback.sql"), "utf8");
  assert.match(sql, /create temporary table pg_temp\.updated_at_rollback_probe/i);
  assert.match(sql, /execute function public\.update_updated_at_column\(\)/i);
  assert.match(sql, /updated_at is not distinct from transaction_timestamp\(\)/i);
  assert.match(sql, /rollback;\s*$/i);
  assert.doesNotMatch(sql, /public\.(?:students|enrollments)\b/i);
  assert.doesNotMatch(sql, /^\s*commit\s*;/im);
});
