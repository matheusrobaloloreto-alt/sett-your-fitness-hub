#!/usr/bin/env node
// Offline contract test for the curation-v2 safe target return artifact.
// Does not connect to Supabase, does not generate SQL, and does not mutate production inputs.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const ARTIFACT = "docs/prescription/curation-v2/library-curation-v2-safe-target-return-11.json";
const SNAPSHOT = "docs/prescription/curation-v2/library-curation-v2-catalog-snapshot.json";
const HIGH_SIGNAL = "docs/prescription/curation-v2/library-curation-v2-target-signature-high-signal-review.csv";
const VISUAL_REVIEW = "docs/prescription/curation-v2/library-curation-v2-visual-22-video-review-record.md";
const EFDE85EC_ID = "efde85ec-e714-44b9-928c-8db249f06c04";

const AUTHORIZED_SAFE_IDS = [
  "ae13d351-7019-4b7d-b0e6-cea4b8fea50d",
  "4a8b14bf-d7a8-422d-932a-63a3af07e453",
  "3bd15908-90de-4c6a-8c64-31ad3c75f845",
  "e6058264-060f-4e41-83ee-6810f38ca520",
  "efde85ec-e714-44b9-928c-8db249f06c04",
  "258bfac0-5456-462d-8530-a8204af6b8f8",
  "8fece0e9-3907-4f54-86b4-54a088cb0540",
  "8a461d7f-c174-4488-8dca-b4339ad26c81",
  "6e9fdaca-5bfb-420c-b5bf-5beddcce6c05",
  "b5265c3f-05a3-4fdc-834a-2b6f0c69d12b",
  "bf33e722-9da1-4e32-af62-546bb5176c3a",
];

const EXPECTED_EXCLUDED_IDS = [
  "a9307b76-a4e2-4305-b683-d86e59ae80b6",
  "dcc7c1f8-9e2e-4b4d-a91e-fbc96fd042fe",
  "479eecd9-1642-4c4c-b9eb-b0a14f11af3a",
  "fd207a91-506b-466d-8d6c-d905e97e690a",
  "9c2ad88a-1f2a-4c58-9455-a667d5331d09",
  "7512d746-8861-45b3-9242-800df83c8810",
  "b222ffd2-a90e-47a2-9924-a63381446069",
  "bc77dd8b-8a5b-49da-987b-2653991d1659",
  "ce8529f2-dd0e-4c7c-8110-d2505d84bfe2",
  "e2e6d537-a9ba-4feb-bd2d-f6b7591895c2",
  "6c2e58df-666f-420a-81e2-192929555fdc",
];

const EXPECTED_GROUPS = new Map([
  ["Posterior de Coxa", "77d093d5-0a62-4b1f-b47f-b981e8af19fa"],
  ["Glúteo", "5cbe97cd-5ae8-4fbe-9f30-5b37203a19d5"],
  ["Deltoide Posterior", "64d81d34-cb15-44d0-b460-5cd209c664e3"],
  ["Bíceps", "78d9b019-e1b3-4119-b4fe-fca633945cb6"],
]);

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

function fail(message) {
  throw new Error(message);
}

function assertSetExact(label, actual, expected) {
  const a = [...actual].sort();
  const e = [...expected].sort();
  if (a.length !== e.length || a.some((value, index) => value !== e[index])) {
    fail(`${label} mismatch. expected=${e.join(",")} actual=${a.join(",")}`);
  }
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function validate({ artifactPath = ARTIFACT, snapshotPath = SNAPSHOT, highSignalPath = HIGH_SIGNAL } = {}) {
  const artifact = loadJson(artifactPath);
  const snapshot = loadJson(snapshotPath);
  const highSignalRows = toObjects(parseCsv(fs.readFileSync(highSignalPath, "utf8")));
  const highSignalIds = new Set(highSignalRows.map((row) => row.exercise_id));
  const catalogById = new Map(snapshot.exercises.map((exercise) => [exercise.exercise_id, exercise]));
  const catalogGroups = new Map();
  for (const exercise of snapshot.exercises) {
    for (const target of exercise.targets ?? []) {
      if (!catalogGroups.has(target.muscle_group_name)) {
        catalogGroups.set(target.muscle_group_name, target.muscle_group_id);
      }
    }
  }

  if (artifact.ready_for_upsert !== false) fail("top-level ready_for_upsert must be false");
  if (artifact.sources?.visual_22_video_review_record !== VISUAL_REVIEW) {
    fail(`visual_22_video_review_record source must be listed as ${VISUAL_REVIEW}`);
  }
  if (!fs.existsSync(artifact.sources.visual_22_video_review_record)) fail("visual review source file does not exist");
  if (!Array.isArray(artifact.safe_targets)) fail("safe_targets must be an array");
  if (!Array.isArray(artifact.excluded_from_batch)) fail("excluded_from_batch must be an array");
  if (artifact.safe_targets.length !== 11) fail(`safe_targets must contain exactly 11 rows, got ${artifact.safe_targets.length}`);
  if (artifact.excluded_from_batch.length !== 11) fail(`excluded_from_batch must contain exactly 11 rows, got ${artifact.excluded_from_batch.length}`);

  const safeIds = new Set();
  const excludedIds = new Set();

  for (const row of artifact.safe_targets) {
    if (!row.exercise_id || safeIds.has(row.exercise_id)) fail(`duplicate or missing safe exercise_id: ${row.exercise_id}`);
    safeIds.add(row.exercise_id);
    if (!AUTHORIZED_SAFE_IDS.includes(row.exercise_id)) fail(`safe exercise_id is not authorized: ${row.exercise_id}`);
    if (!highSignalIds.has(row.exercise_id)) fail(`safe exercise_id missing from high-signal review: ${row.exercise_id}`);
    if (!catalogById.has(row.exercise_id)) fail(`safe exercise_id missing from catalog snapshot: ${row.exercise_id}`);
    if (row.ready_for_upsert !== false) fail(`safe row ready_for_upsert must be false: ${row.exercise_id}`);
    if (!Array.isArray(row.proposed_targets) || row.proposed_targets.length !== 1) fail(`safe row must have exactly one proposed target: ${row.exercise_id}`);
    if (!Array.isArray(row.canonical_precedents) || row.canonical_precedents.length < 1) fail(`safe row must include canonical precedents: ${row.exercise_id}`);

    const target = row.proposed_targets[0];
    if (!EXPECTED_GROUPS.has(target.muscle_group_name)) fail(`invalid proposed group: ${target.muscle_group_name}`);
    if (EXPECTED_GROUPS.get(target.muscle_group_name) !== target.muscle_group_id) fail(`invalid muscle_group_id for ${target.muscle_group_name}`);
    if (catalogGroups.get(target.muscle_group_name) !== target.muscle_group_id) fail(`proposed group is not valid in snapshot: ${target.muscle_group_name}`);
    if (target.role !== "primary") fail(`target role must be primary: ${row.exercise_id}`);
    if (target.is_primary !== true) fail(`target is_primary must be true: ${row.exercise_id}`);
    if (!Number.isFinite(target.volume_percentage) || target.volume_percentage < 0 || target.volume_percentage > 100) {
      fail(`target volume_percentage must be finite 0..100: ${row.exercise_id}`);
    }
    if (target.volume_percentage !== 100) fail(`target volume_percentage must be 100: ${row.exercise_id}`);

    for (const precedent of row.canonical_precedents) {
      const catalogExercise = catalogById.get(precedent.exercise_id);
      if (!catalogExercise) fail(`precedent missing from snapshot: ${precedent.exercise_id}`);
      const hasGroup = (catalogExercise.targets ?? []).some((candidate) => candidate.muscle_group_name === target.muscle_group_name);
      if (!hasGroup) fail(`precedent ${precedent.exercise_id} does not target ${target.muscle_group_name}`);
    }

    if (row.exercise_id === EFDE85EC_ID) {
      if (!Array.isArray(row.evidence_sources) || !row.evidence_sources.includes(VISUAL_REVIEW)) {
        fail("efde85ec must list the visual 22 video review record in evidence_sources");
      }
      const rationale = String(row.rationale ?? "").toLowerCase();
      if (!rationale.includes("setup") || !rationale.includes("banco romano/45 graus") || !rationale.includes("ready_for_upsert=false")) {
        fail("efde85ec rationale must mention setup resolved as banco romano/45 graus and ready_for_upsert=false");
      }
    }
  }

  for (const row of artifact.excluded_from_batch) {
    if (!row.exercise_id || excludedIds.has(row.exercise_id)) fail(`duplicate or missing excluded exercise_id: ${row.exercise_id}`);
    excludedIds.add(row.exercise_id);
    if (!EXPECTED_EXCLUDED_IDS.includes(row.exercise_id)) fail(`unexpected excluded exercise_id: ${row.exercise_id}`);
    if (!highSignalIds.has(row.exercise_id)) fail(`excluded exercise_id missing from high-signal review: ${row.exercise_id}`);
    if (safeIds.has(row.exercise_id)) fail(`exercise_id appears in safe and excluded sets: ${row.exercise_id}`);
    if (row.status !== "excluded_from_safe_11") fail(`excluded row has invalid status: ${row.exercise_id}`);
  }

  assertSetExact("safe ids", safeIds, AUTHORIZED_SAFE_IDS);
  assertSetExact("excluded ids", excludedIds, EXPECTED_EXCLUDED_IDS);
  assertSetExact("safe+excluded high-signal subset", new Set([...safeIds, ...excludedIds]), [...AUTHORIZED_SAFE_IDS, ...EXPECTED_EXCLUDED_IDS]);

  return {
    safe_targets: artifact.safe_targets.length,
    excluded_from_batch: artifact.excluded_from_batch.length,
    groups: [...new Set(artifact.safe_targets.map((row) => row.proposed_targets[0].muscle_group_name))].sort(),
  };
}

function runFixture(name, mutate, expectedStatus) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "safe-target-return-"));
  const tempArtifact = path.join(tempDir, "artifact.json");
  const copy = loadJson(ARTIFACT);
  mutate(copy);
  fs.writeFileSync(tempArtifact, JSON.stringify(copy, null, 2) + "\n");
  const result = spawnSync(process.execPath, [new URL(import.meta.url).pathname, "--artifact", tempArtifact], {
    cwd: ROOT,
    encoding: "utf8",
  });
  fs.rmSync(tempDir, { recursive: true, force: true });
  const pass = result.status === expectedStatus;
  return { name, pass, status: result.status, expectedStatus, stderr: result.stderr.trim() };
}

function main() {
  const artifactArgIndex = process.argv.indexOf("--artifact");
  const artifactPath = artifactArgIndex >= 0 ? process.argv[artifactArgIndex + 1] : ARTIFACT;
  const checkOnly = artifactArgIndex >= 0 || process.argv.includes("--check-only");

  try {
    const summary = validate({ artifactPath });
    if (checkOnly) {
      console.log("PASS safe-target-return contract", JSON.stringify(summary));
      return;
    }

    const fixtures = [
      runFixture("duplicate_safe_id_fails", (copy) => {
        copy.safe_targets[1].exercise_id = copy.safe_targets[0].exercise_id;
      }, 1),
      runFixture("ready_true_fails", (copy) => {
        copy.safe_targets[0].ready_for_upsert = true;
      }, 1),
      runFixture("invalid_group_fails", (copy) => {
        copy.safe_targets[0].proposed_targets[0].muscle_group_name = "Peitoral";
      }, 1),
      runFixture("excluded_id_in_safe_set_fails", (copy) => {
        copy.safe_targets[0].exercise_id = EXPECTED_EXCLUDED_IDS[0];
      }, 1),
      runFixture("volume_over_100_fails", (copy) => {
        copy.safe_targets[0].proposed_targets[0].volume_percentage = 101;
      }, 1),
      runFixture("missing_visual_source_fails", (copy) => {
        delete copy.sources.visual_22_video_review_record;
      }, 1),
      runFixture("efde_missing_visual_evidence_fails", (copy) => {
        const efde = copy.safe_targets.find((row) => row.exercise_id === EFDE85EC_ID);
        efde.evidence_sources = [];
      }, 1),
      runFixture("efde_unresolved_setup_rationale_fails", (copy) => {
        const efde = copy.safe_targets.find((row) => row.exercise_id === EFDE85EC_ID);
        efde.rationale = "Glute primary draft.";
      }, 1),
    ];
    const failed = fixtures.filter((fixture) => !fixture.pass);
    console.log("PASS safe-target-return contract", JSON.stringify(summary));
    for (const fixture of fixtures) {
      console.log(`${fixture.pass ? "PASS" : "FAIL"} ${fixture.name} expected=${fixture.expectedStatus} observed=${fixture.status}`);
    }
    if (failed.length > 0) process.exit(1);
  } catch (error) {
    console.error(`FAIL safe-target-return contract: ${error.message}`);
    process.exit(1);
  }
}

main();
