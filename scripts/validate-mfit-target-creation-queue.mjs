#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const artifactPath = path.join(repo, 'docs/project/mfit-target-creation-queue.v1.json');
const sourcePath = path.resolve(repo, '../mfit-data/docs/project/mfit-low-no-candidate-qa-ledger.v1.json');
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const sourceItems = source.items.filter((item) => item.decision === 'NEEDS_TARGET_CREATION');
const sourceByName = new Map(sourceItems.map((item) => [item.source_name, item]));
const expected = sourceItems.map((item) => item.source_name).sort();
const actual = artifact.items.map((item) => item.source_name).sort();
const decisionPriority = {
  CREATE_VARIANT_AFTER_VIDEO: 'P2',
  CREATE_STANDALONE_TARGET: 'P2',
  DECOMPOSE_COMPOSITE_METHOD: 'P0',
  CANONICAL_DEDUP_REQUIRED: 'P1',
  BLOCK_INSUFFICIENT_EVIDENCE: 'P0'
};
const decisionRole = {
  CREATE_VARIANT_AFTER_VIDEO: 'variant_after_video',
  CREATE_STANDALONE_TARGET: 'standalone_target',
  DECOMPOSE_COMPOSITE_METHOD: 'composite_method',
  CANONICAL_DEDUP_REQUIRED: 'canonical_dedup',
  BLOCK_INSUFFICIENT_EVIDENCE: 'blocked_evidence'
};
const expectedCounts = {
  CREATE_VARIANT_AFTER_VIDEO: 25,
  CREATE_STANDALONE_TARGET: 5,
  DECOMPOSE_COMPOSITE_METHOD: 2,
  CANONICAL_DEDUP_REQUIRED: 3,
  BLOCK_INSUFFICIENT_EVIDENCE: 7
};
const required = [
  'source_name', 'source_queue', 'source_rationale', 'decision', 'occurrence_count',
  'priority_basis', 'priority_tier', 'human_review_only', 'ready_for_upsert',
  'movement_pattern', 'equipment', 'support_position', 'laterality', 'risk_flags',
  'video_requirement', 'evidence_requirement', 'metadata_required', 'candidate_role'
];
const fail = (message) => { throw new Error(message); };
const forbiddenKeyPattern = /(^|_)(coefficient|target_exercise_ids?|target_ids?|sql|query|upsert_payload|apply)(_|$)/i;
const forbiddenStringPattern = /(^|[^a-z0-9])(coefficient|sql|upsert|apply)($|[^a-z0-9])/i;
const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const allowedKeys = new Set(['ready_for_upsert']);

const assertNonEmptyString = (item, field) => {
  if (typeof item[field] !== 'string' || item[field].trim() === '') fail(`${item.source_name}: ${field} must be non-empty string`);
};

const assertNonEmptySafeArray = (item, field) => {
  if (!Array.isArray(item[field]) || item[field].length === 0) fail(`${item.source_name}: ${field} must be non-empty array`);
  for (const value of item[field]) {
    if (typeof value !== 'string' || value.trim() === '') fail(`${item.source_name}: ${field} must only contain non-empty strings`);
  }
};

const scanSafe = (value, trail = 'artifact') => {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanSafe(entry, `${trail}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (!allowedKeys.has(key) && forbiddenKeyPattern.test(key)) fail(`${trail}.${key}: forbidden key`);
      scanSafe(entry, `${trail}.${key}`);
    }
    return;
  }
  if (typeof value === 'string') {
    if (uuidPattern.test(value)) fail(`${trail}: forbidden target id-like string`);
    if (forbiddenStringPattern.test(value)) fail(`${trail}: forbidden write-intent string`);
  }
};

if (artifact.items.length !== 42) fail(`expected 42 items, got ${artifact.items.length}`);
if (new Set(actual).size !== 42) fail('source_name must be unique');
if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('artifact names differ from NEEDS_TARGET_CREATION ledger');
if (artifact.source !== 'mfit-low-no-candidate-qa-ledger.v1.json') fail('artifact source must reference the reviewed ledger');
if (artifact.contains_pii !== false) fail('artifact must declare contains_pii=false');
if (!artifact.summary || typeof artifact.summary !== 'object') fail('summary is required');
if (artifact.summary.total !== 42) fail(`summary.total: expected 42, got ${artifact.summary.total}`);
if (artifact.summary.ready_for_upsert !== 0) fail('summary must preserve zero ready_for_upsert');
const allowedSummaryKeys = new Set(['total', 'ready_for_upsert', ...Object.keys(expectedCounts)]);
for (const key of Object.keys(artifact.summary)) {
  if (!allowedSummaryKeys.has(key)) fail(`summary.${key}: unexpected key`);
}
scanSafe(artifact);

const counts = {};
let readyCount = 0;
for (const item of artifact.items) {
  for (const field of required) if (!(field in item)) fail(`${item.source_name}: missing ${field}`);
  const sourceItem = sourceByName.get(item.source_name);
  if (!sourceItem) fail(`${item.source_name}: missing source ledger row`);
  if (item.source_queue !== sourceItem.queue) fail(`${item.source_name}: source_queue differs from ledger`);
  if (item.source_rationale !== sourceItem.rationale) fail(`${item.source_name}: source_rationale differs from ledger`);
  if (!(item.decision in decisionPriority)) fail(`${item.source_name}: invalid decision ${item.decision}`);
  counts[item.decision] = (counts[item.decision] || 0) + 1;
  if (item.occurrence_count !== null) fail(`${item.source_name}: occurrence_count must remain null`);
  if (item.priority_basis !== 'blocked_missing_current_snapshots') fail(`${item.source_name}: invalid priority_basis`);
  if (item.priority_tier !== decisionPriority[item.decision]) fail(`${item.source_name}: ${item.decision} must be ${decisionPriority[item.decision]}`);
  if (item.candidate_role !== decisionRole[item.decision]) fail(`${item.source_name}: ${item.decision} requires candidate_role=${decisionRole[item.decision]}`);
  if (item.human_review_only !== true || item.ready_for_upsert !== false) fail(`${item.source_name}: unsafe readiness flags`);
  if (item.ready_for_upsert === true) readyCount += 1;
  assertNonEmptyString(item, 'video_requirement');
  assertNonEmptyString(item, 'evidence_requirement');
  assertNonEmptyString(item, 'movement_pattern');
  assertNonEmptyString(item, 'equipment');
  assertNonEmptyString(item, 'support_position');
  assertNonEmptyString(item, 'laterality');
  assertNonEmptySafeArray(item, 'risk_flags');
  assertNonEmptySafeArray(item, 'metadata_required');
}
for (const [decision, count] of Object.entries(expectedCounts)) {
  if (counts[decision] !== count) fail(`${decision}: expected ${count}, got ${counts[decision] || 0}`);
  if (artifact.summary[decision] !== count) fail(`summary.${decision}: expected ${count}, got ${artifact.summary[decision] || 0}`);
}
for (const decision of Object.keys(counts)) {
  if (!(decision in expectedCounts)) fail(`${decision}: unexpected decision`);
}
if (readyCount !== 0) fail(`expected zero ready_for_upsert items, got ${readyCount}`);

console.log(JSON.stringify({ ok: true, total: artifact.items.length, counts, ready_for_upsert: 0 }, null, 2));
