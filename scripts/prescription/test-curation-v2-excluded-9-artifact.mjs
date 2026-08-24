#!/usr/bin/env node
// Mechanical guard for the curation-v2 excluded-9 technical target artifact.
// Offline only: validates shape, safety flags, qualitative rows, and no SQL/DB intent.
import fs from "node:fs";
import process from "node:process";

const ARTIFACT = "docs/prescription/curation-v2/library-curation-v2-excluded-9-target-proposal.json";
const EXPECTED_CALIBRATED = new Set([
  "a9307b76-a4e2-4305-b683-d86e59ae80b6",
  "dcc7c1f8-9e2e-4b4d-a91e-fbc96fd042fe",
  "9c2ad88a-1f2a-4c58-9455-a667d5331d09",
  "7512d746-8861-45b3-9242-800df83c8810",
]);
const EXPECTED_QUALITATIVE = new Set([
  "b222ffd2-a90e-47a2-9924-a63381446069",
  "bc77dd8b-8a5b-49da-987b-2653991d1659",
  "ce8529f2-dd0e-4c7c-8110-d2505d84bfe2",
  "e2e6d537-a9ba-4feb-bd2d-f6b7591895c2",
  "6c2e58df-666f-420a-81e2-192929555fdc",
]);
const EXPECTED_BLOCKED = new Set([
  "479eecd9-1642-4c4c-b9eb-b0a14f11af3a",
  "fd207a91-506b-466d-8d6c-d905e97e690a",
]);

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function walk(value, visitor, path = "$") {
  visitor(value, path);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visitor, `${path}[${index}]`));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) walk(item, visitor, `${path}.${key}`);
  }
}

function ids(rows) {
  return rows.map((row) => row.exercise_id);
}

function assertSetEquals(actual, expected, label) {
  assert(actual.size === expected.size, `${label} size mismatch: got ${actual.size}, expected ${expected.size}`);
  for (const id of expected) assert(actual.has(id), `${label} missing ${id}`);
}

const text = fs.readFileSync(ARTIFACT, "utf8");
const artifact = JSON.parse(text);

assert(artifact.ready_for_upsert === false, "top-level ready_for_upsert must be false");
assert(artifact.status === "technical_proposal_draft_not_upsertable", "artifact must remain a non-upsertable technical proposal");
assert(artifact.provenance?.offline_execution?.db_access === false, "db_access must be false");
assert(artifact.provenance?.offline_execution?.network_access === false, "network_access must be false");
assert(artifact.provenance?.offline_execution?.approved_manifest_generated === false, "approved manifest generation must be false");
assert(artifact.provenance?.offline_execution?.upsert_sql_generated === false, "upsert SQL generation must be false");
assert(artifact.provenance?.offline_execution?.staging_or_production_touched === false, "staging/prod must be untouched");

const calibrated = artifact.calibrated_single_primary_targets ?? [];
const qualitative = artifact.qualitative_target_proposals ?? [];
const blocked = artifact.blocked_out_of_scope ?? [];

assert(calibrated.length === 4, "must contain 4 calibrated wrist-flexion rows");
assert(qualitative.length === 5, "must contain 5 qualitative upright-row rows");
assert(blocked.length === 2, "must contain 2 blocked rows");

const proposalIds = [...ids(calibrated), ...ids(qualitative)];
const proposalSet = new Set(proposalIds);
assert(proposalSet.size === 9, "must contain 9 unique proposal exercise IDs");
assertSetEquals(new Set(ids(calibrated)), EXPECTED_CALIBRATED, "calibrated IDs");
assertSetEquals(new Set(ids(qualitative)), EXPECTED_QUALITATIVE, "qualitative IDs");
assertSetEquals(new Set(ids(blocked)), EXPECTED_BLOCKED, "blocked IDs");
for (const id of ids(blocked)) assert(!proposalSet.has(id), `blocked ID must not also be proposed: ${id}`);

for (const row of calibrated) {
  assert(row.ready_for_upsert === false, `calibrated row ready_for_upsert must be false: ${row.exercise_id}`);
  assert(row.proposal_type === "calibrated_single_primary_target", `calibrated row type mismatch: ${row.exercise_id}`);
  assert(row.needs_local_calibration === false, `calibrated row must not require local calibration: ${row.exercise_id}`);
  assert(Array.isArray(row.proposed_targets) && row.proposed_targets.length === 1, `calibrated row must have one target: ${row.exercise_id}`);
  const target = row.proposed_targets[0];
  assert(target.muscle_group_name === "Antebraço", `calibrated row target must be Antebraço: ${row.exercise_id}`);
  assert(target.role === "primary", `calibrated row role must be primary: ${row.exercise_id}`);
  assert(target.is_primary === true, `calibrated row is_primary must be true: ${row.exercise_id}`);
  assert(target.volume_percentage === 100, `calibrated row volume_percentage must be 100: ${row.exercise_id}`);
  assert(/local convention/i.test(row.rationale), `calibrated rationale must state local convention: ${row.exercise_id}`);
  assert(/not an EMG/i.test(row.rationale), `calibrated rationale must not imply EMG evidence: ${row.exercise_id}`);
}

for (const row of qualitative) {
  assert(row.ready_for_upsert === false, `qualitative row ready_for_upsert must be false: ${row.exercise_id}`);
  assert(row.proposal_type === "qualitative_target_hypothesis", `qualitative row type mismatch: ${row.exercise_id}`);
  assert(row.non_executable_schema === true, `qualitative row must be marked non_executable_schema=true: ${row.exercise_id}`);
  assert(row.human_review_only === true, `qualitative row must be marked human_review_only=true: ${row.exercise_id}`);
  assert(row.needs_local_calibration === true, `qualitative row must require local calibration: ${row.exercise_id}`);
  assert(typeof row.equipment_setup === "string" && row.equipment_setup.length > 40, `qualitative row must include equipment setup: ${row.exercise_id}`);
  const serialized = JSON.stringify(row);
  assert(!serialized.includes("volume_percentage"), `qualitative row must not include volume_percentage: ${row.exercise_id}`);
  const targets = row.proposed_targets ?? [];
  assert(targets.length === 3, `qualitative row must have three qualitative targets: ${row.exercise_id}`);
  for (const target of targets) {
    assert(!Object.hasOwn(target, "role"), `qualitative target must not include executable role: ${row.exercise_id}`);
    assert(!Object.hasOwn(target, "is_primary"), `qualitative target must not include executable is_primary: ${row.exercise_id}`);
    assert(!Object.hasOwn(target, "volume_percentage"), `qualitative target must not include executable volume_percentage: ${row.exercise_id}`);
    assert(Object.hasOwn(target, "candidate_role"), `qualitative target must use candidate_role: ${row.exercise_id}`);
  }
  assert(targets.some((target) => target.muscle_group_name === "Deltoide Lateral" && target.candidate_role === "primary"), `qualitative row missing Deltoide Lateral primary candidate: ${row.exercise_id}`);
  assert(targets.some((target) => target.muscle_group_name === "Trapézio" && target.candidate_role === "secondary"), `qualitative row missing Trapézio secondary candidate: ${row.exercise_id}`);
  assert(targets.some((target) => target.muscle_group_name === "Bíceps" && target.candidate_role === "secondary" && target.status === "possible"), `qualitative row missing Bíceps secondary possible candidate: ${row.exercise_id}`);
}

for (const row of blocked) {
  assert(row.status === "BLOCK", `blocked row status must be BLOCK: ${row.exercise_id}`);
  assert(row.ready_for_upsert === false, `blocked row ready_for_upsert must be false: ${row.exercise_id}`);
}

walk(artifact, (value, path) => {
  if (path.endsWith(".ready_for_upsert")) assert(value === false, `all ready_for_upsert fields must be false at ${path}`);
  if (typeof value === "string") {
    assert(!/approved manifest generated/i.test(value), `must not claim approved generation at ${path}`);
    assert(!/\.sql\b/i.test(value), `must not reference SQL files at ${path}`);
  }
});
assert(!text.includes("ready_for_upsert\": true"), "artifact must contain zero ready_for_upsert=true fields");

console.log("PASS curation v2 excluded-9 technical artifact");
