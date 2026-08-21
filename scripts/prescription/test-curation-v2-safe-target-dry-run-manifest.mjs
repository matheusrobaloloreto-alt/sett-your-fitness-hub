#!/usr/bin/env node
// Offline tests for the curation-v2 11-safe dry-run manifest generator.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const BUILDER = "scripts/prescription/build-curation-v2-safe-target-dry-run-manifest.mjs";
const RETURN_GUARD = "scripts/prescription/check-curation-review-return.mjs";
const EXPECTED_COUNTS = {
  "Bíceps": 1,
  "Deltoide Posterior": 4,
  "Glúteo": 4,
  "Posterior de Coxa": 2,
};

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", ...options });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    fail(`${command} ${args.join(" ")} exited ${result.status}`);
  }
  return result;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertNoNetworkOrDbCalls() {
  const source = fs.readFileSync(BUILDER, "utf8");
  const banned = [
    "fetch(",
    "XMLHttpRequest",
    "WebSocket",
    "http.request",
    "https.request",
    "createClient(",
    "postgres://",
    "mysql://",
    "supabase.from(",
  ];
  for (const token of banned) assert(!source.includes(token), `builder contains banned network/db token: ${token}`);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "safe-target-dry-run-"));
const manifestPath = path.join(tmpDir, "manifest.json");
const reportPath = path.join(tmpDir, "report.md");
const reviewCsvPath = path.join(tmpDir, "review.csv");
const guardReportPath = path.join(tmpDir, "return-guard.md");

try {
  assertNoNetworkOrDbCalls();
  run(process.execPath, [
    BUILDER,
    "--out",
    manifestPath,
    "--report",
    reportPath,
    "--review-csv",
    reviewCsvPath,
  ]);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert(manifest.mode === "dry_run_noop", "manifest mode must be dry_run_noop");
  assert(manifest.status === "NO_APPROVED_ROWS_NO_SQL_NO_DB", "manifest status must remain no-approved/no-sql/no-db");
  assert(manifest.ready_for_upsert === false, "top-level ready_for_upsert must be false");
  assert(manifest.counts.dry_run_rows === 11, "dry_run_rows must be 11");
  assert(manifest.counts.approved_rows === 0, "approved_rows must be 0");
  assert(manifest.counts.ready_for_upsert_true === 0, "ready_for_upsert_true must be 0");
  assert(manifest.provenance.offline_execution.db_access === false, "db_access must be false");
  assert(manifest.provenance.offline_execution.network_access === false, "network_access must be false");
  assert(manifest.provenance.offline_execution.approved_manifest_generated === false, "approved manifest generation must be false");
  assert(manifest.provenance.offline_execution.upsert_sql_generated === false, "upsert SQL generation must be false");
  assert(manifest.before_after_diff_by_id.length === 11, "before/after diff must have 11 rows");
  for (const [group, count] of Object.entries(EXPECTED_COUNTS)) {
    assert(manifest.counts.by_group[group] === count, `group count mismatch for ${group}`);
  }
  for (const row of manifest.before_after_diff_by_id) {
    assert(row.ready_for_upsert === false, `row ready_for_upsert must be false: ${row.exercise_id}`);
    assert(row.diff_status === "dry_run_noop_not_applied", `row diff_status must be dry_run_noop_not_applied: ${row.exercise_id}`);
    assert(row.before_target_signature && row.after_target_signature, `row must contain before and after target signatures: ${row.exercise_id}`);
  }
  const reportText = fs.readFileSync(reportPath, "utf8");
  assert(reportText.includes("No database, network, approved manifest, upsert SQL"), "report must state offline/noop guardrails");
  assert(fs.readFileSync(reviewCsvPath, "utf8").includes('"ready_for_upsert"'), "review CSV must contain ready_for_upsert header");

  run(process.execPath, [
    RETURN_GUARD,
    "--sent",
    reviewCsvPath,
    "--returned",
    reviewCsvPath,
    "--expect-priority",
    "any",
    "--report",
    guardReportPath,
  ]);
  assert(fs.existsSync(guardReportPath), "return guard report must be generated in temp test");
  assert(!fs.existsSync(path.join(tmpDir, "approved.csv")), "test must not generate approved manifest");
  assert(!fs.existsSync(path.join(tmpDir, "upsert.sql")), "test must not generate upsert SQL");

  console.log("PASS safe target dry-run manifest generator");
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
