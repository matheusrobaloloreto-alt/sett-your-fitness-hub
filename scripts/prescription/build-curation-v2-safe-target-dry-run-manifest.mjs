#!/usr/bin/env node
// Builds an offline/noop dry-run manifest from the curation-v2 11-safe target artifact.
// No database, network, approved manifest, SQL, or staging/prod side effects.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULTS = {
  input: "docs/prescription/curation-v2/library-curation-v2-safe-target-return-11.json",
  highSignal: "docs/prescription/curation-v2/library-curation-v2-target-signature-high-signal-review.csv",
  snapshot: "docs/prescription/curation-v2/library-curation-v2-catalog-snapshot.json",
  out: "docs/prescription/curation-v2/library-curation-v2-safe-target-return-11-dry-run-manifest.json",
  report: "docs/prescription/curation-v2/library-curation-v2-safe-target-return-11-dry-run-report.md",
  reviewCsv: "docs/prescription/curation-v2/library-curation-v2-safe-target-return-11-dry-run-review.csv",
};

const REVIEW_HEADERS = [
  "exercise_id",
  "exercise_name",
  "muscle_group",
  "max_priority",
  "risk_regions",
  "movement_patterns",
  "source_packages",
  "suggested_contraindications",
  "suggested_pain_limitation_tags",
  "suggested_regressions",
  "suggested_equivalent_substitutes",
  "suggested_progressions",
  "suggested_equipment",
  "conflict_notes",
  "reviewer_status",
  "reviewer_name",
  "reviewed_at",
  "reviewer_notes",
  "approval_decision_reason",
  "ready_for_upsert",
];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === "--input") args.input = argv[++i];
    else if (key === "--high-signal") args.highSignal = argv[++i];
    else if (key === "--snapshot") args.snapshot = argv[++i];
    else if (key === "--out") args.out = argv[++i];
    else if (key === "--report") args.report = argv[++i];
    else if (key === "--review-csv") args.reviewCsv = argv[++i];
    else if (key === "--help" || key === "-h") args.help = true;
  }
  return args;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let q = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

function toObjects(rows) {
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const out = {};
    header.forEach((h, i) => {
      out[h] = (r[i] ?? "").trim();
    });
    return out;
  });
}

function hashString(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashFile(file) {
  return hashString(fs.readFileSync(file));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = JSON.stringify(value, null, 2) + "\n";
  fs.writeFileSync(file, text);
  return hashString(text);
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function markdownCell(value) {
  return String(value ?? "").replace(/\n/g, " ").replace(/\|/g, "\\|");
}

function writeCsv(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lines = [REVIEW_HEADERS.map(csvCell).join(",")];
  for (const row of rows) lines.push(REVIEW_HEADERS.map((header) => csvCell(row[header])).join(","));
  fs.writeFileSync(file, lines.join("\n") + "\n");
}

function formatTargetSignature(targets) {
  return targets
    .map((target) => `${target.muscle_group_name}:${target.role}:${target.volume_percentage}`)
    .join(" | ");
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function build({ input, highSignal, snapshot }) {
  const artifact = readJson(input);
  const highSignalRows = toObjects(parseCsv(fs.readFileSync(highSignal, "utf8")));
  const snapshotJson = readJson(snapshot);

  if (artifact.ready_for_upsert !== false) fail("input artifact must keep top-level ready_for_upsert=false");
  if (!Array.isArray(artifact.safe_targets) || artifact.safe_targets.length !== 11) fail("input artifact must contain exactly 11 safe_targets");
  if (!Array.isArray(artifact.excluded_from_batch) || artifact.excluded_from_batch.length !== 11) fail("input artifact must contain exactly 11 excluded_from_batch rows");

  const highSignalById = new Map(highSignalRows.map((row) => [row.exercise_id, row]));
  const snapshotById = new Map(snapshotJson.exercises.map((exercise) => [exercise.exercise_id, exercise]));
  const seen = new Set();
  const dryRunRows = [];

  for (const row of artifact.safe_targets) {
    if (seen.has(row.exercise_id)) fail(`duplicate safe target: ${row.exercise_id}`);
    seen.add(row.exercise_id);
    if (row.ready_for_upsert !== false) fail(`safe target ready_for_upsert must be false: ${row.exercise_id}`);
    if (!highSignalById.has(row.exercise_id)) fail(`safe target missing from high-signal review: ${row.exercise_id}`);
    if (!snapshotById.has(row.exercise_id)) fail(`safe target missing from snapshot: ${row.exercise_id}`);
    if (!Array.isArray(row.proposed_targets) || row.proposed_targets.length !== 1) fail(`safe target must have exactly one proposed target: ${row.exercise_id}`);

    const before = highSignalById.get(row.exercise_id);
    const afterSignature = formatTargetSignature(row.proposed_targets);
    dryRunRows.push({
      exercise_id: row.exercise_id,
      exercise_name: row.exercise_name,
      source_muscle_group: before.source_muscle_group,
      before_target_signature: before.target_signature,
      after_target_signature: afterSignature,
      after_targets: row.proposed_targets,
      diff_status: "dry_run_noop_not_applied",
      reviewer_status: "needs_review",
      ready_for_upsert: false,
      canonical_precedents: row.canonical_precedents,
      rationale: row.rationale,
      source_snapshot_targets: snapshotById.get(row.exercise_id).targets ?? [],
    });
  }

  const groupCounts = {};
  for (const row of dryRunRows) {
    const group = row.after_targets[0].muscle_group_name;
    groupCounts[group] = (groupCounts[group] ?? 0) + 1;
  }

  const sourceHashes = {
    input_artifact: hashFile(input),
    high_signal_review: hashFile(highSignal),
    catalog_snapshot: hashFile(snapshot),
  };
  for (const [key, file] of Object.entries(artifact.sources ?? {})) {
    if (fs.existsSync(file)) sourceHashes[key] = hashFile(file);
  }

  const manifest = {
    schema_version: "library-curation-v2-safe-target-dry-run-manifest.v1",
    mode: "dry_run_noop",
    generated_at: new Date().toISOString(),
    source_artifact: input,
    status: "NO_APPROVED_ROWS_NO_SQL_NO_DB",
    ready_for_upsert: false,
    counts: {
      dry_run_rows: dryRunRows.length,
      approved_rows: 0,
      ready_for_upsert_true: 0,
      excluded_rows_retained_outside_manifest: artifact.excluded_from_batch.length,
      by_group: groupCounts,
    },
    provenance: {
      source_hashes: sourceHashes,
      offline_execution: {
        db_access: false,
        network_access: false,
        approved_manifest_generated: false,
        upsert_sql_generated: false,
        staging_or_production_touched: false,
      },
    },
    before_after_diff_by_id: dryRunRows,
  };
  manifest.provenance.manifest_hash_without_self = hashString(JSON.stringify(manifest));

  const reviewCsvRows = dryRunRows.map((row) => ({
    exercise_id: row.exercise_id,
    exercise_name: row.exercise_name,
    muscle_group: row.source_muscle_group,
    max_priority: "dry_run",
    risk_regions: "",
    movement_patterns: "",
    source_packages: "curation-v2-safe-target-return-11",
    suggested_contraindications: "",
    suggested_pain_limitation_tags: "",
    suggested_regressions: "",
    suggested_equivalent_substitutes: "",
    suggested_progressions: "",
    suggested_equipment: "",
    conflict_notes: `before=${row.before_target_signature}; after=${row.after_target_signature}`,
    reviewer_status: "needs_review",
    reviewer_name: "",
    reviewed_at: "",
    reviewer_notes: row.rationale,
    approval_decision_reason: "dry_run_noop_not_approved",
    ready_for_upsert: "false",
  }));

  return { manifest, reviewCsvRows };
}

function buildReport({ args, manifest, manifestHash }) {
  const lines = [];
  lines.push("# Curation v2 Safe Target Return 11 - Dry-run manifest report");
  lines.push("");
  lines.push("> Offline/noop report. No database, network, approved manifest, upsert SQL, staging, or production action was executed.");
  lines.push("");
  lines.push("## Status");
  lines.push("");
  lines.push("| field | value |");
  lines.push("|---|---|");
  lines.push(`| mode | ${manifest.mode} |`);
  lines.push(`| status | ${manifest.status} |`);
  lines.push(`| dry_run_rows | ${manifest.counts.dry_run_rows} |`);
  lines.push(`| approved_rows | ${manifest.counts.approved_rows} |`);
  lines.push(`| ready_for_upsert_true | ${manifest.counts.ready_for_upsert_true} |`);
  lines.push(`| db_access | ${manifest.provenance.offline_execution.db_access} |`);
  lines.push(`| network_access | ${manifest.provenance.offline_execution.network_access} |`);
  lines.push(`| approved_manifest_generated | ${manifest.provenance.offline_execution.approved_manifest_generated} |`);
  lines.push(`| upsert_sql_generated | ${manifest.provenance.offline_execution.upsert_sql_generated} |`);
  lines.push("");
  lines.push("## Outputs");
  lines.push("");
  lines.push(`- Manifest JSON: \`${args.out}\``);
  lines.push(`- Dry-run review CSV for return guard: \`${args.reviewCsv}\``);
  lines.push(`- Report: \`${args.report}\``);
  lines.push("");
  lines.push("## Counts By Group");
  lines.push("");
  lines.push("| group | count |");
  lines.push("|---|---:|");
  for (const [group, count] of Object.entries(manifest.counts.by_group).sort()) lines.push(`| ${group} | ${count} |`);
  lines.push("");
  lines.push("## Before/After Diff By ID");
  lines.push("");
  lines.push("| exercise_id | exercise_name | before | after | ready_for_upsert |");
  lines.push("|---|---|---|---|---:|");
  for (const row of manifest.before_after_diff_by_id) {
    lines.push(`| \`${row.exercise_id}\` | ${markdownCell(row.exercise_name)} | ${markdownCell(row.before_target_signature)} | ${markdownCell(row.after_target_signature)} | ${row.ready_for_upsert} |`);
  }
  lines.push("");
  lines.push("## Hashes");
  lines.push("");
  lines.push("| artifact | sha256 |");
  lines.push("|---|---|");
  lines.push(`| manifest_json | ${manifestHash} |`);
  lines.push("| report_md | omitted_self_referential_hash |");
  for (const [key, value] of Object.entries(manifest.provenance.source_hashes).sort()) lines.push(`| ${key} | ${value} |`);
  lines.push("");
  lines.push("## Guardrails");
  lines.push("");
  lines.push("- The generated review CSV intentionally keeps `reviewer_status=needs_review` and `ready_for_upsert=false`.");
  lines.push("- It is for existing return guard validation only; it is not an approved manifest.");
  lines.push("- No upsert SQL was generated.");
  lines.push("");
  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/prescription/build-curation-v2-safe-target-dry-run-manifest.mjs [--input file] [--high-signal file] [--snapshot file] [--out file] [--report file] [--review-csv file]");
    return;
  }

  const { manifest, reviewCsvRows } = build(args);
  const manifestHash = writeJson(args.out, manifest);
  writeCsv(args.reviewCsv, reviewCsvRows);
  fs.mkdirSync(path.dirname(args.report), { recursive: true });
  fs.writeFileSync(args.report, buildReport({ args, manifest, manifestHash }));

  console.log("DRY_RUN_MANIFEST_READY");
  console.log(`manifest: ${args.out}`);
  console.log(`report: ${args.report}`);
  console.log(`review_csv: ${args.reviewCsv}`);
  console.log(`dry_run_rows: ${manifest.counts.dry_run_rows}`);
  console.log(`ready_for_upsert_true: ${manifest.counts.ready_for_upsert_true}`);
  console.log("db_access: false");
  console.log("network_access: false");
}

main();
