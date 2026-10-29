// Parse/compile the COMPLETE real preflight DO in an empty local PostgreSQL engine.
// No candidate DDL, fixtures, fake Vault, installation, network or hosted execution.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const modulePath = process.env.SETT_TEST_PGLITE_MODULE || '/tmp/sett-a25-independent-review/node_modules/@electric-sql/pglite/dist/index.js';
const { PGlite } = await import(modulePath);
const sql = readFileSync('qa/autonomy-hosted-candidate-rollback.sql', 'utf8');
const start = sql.indexOf('DO $candidate_preflight$');
const endMarker = 'END $candidate_preflight$;';
const end = sql.indexOf(endMarker, start) + endMarker.length;
assert.ok(start >= 0 && end >= start + endMarker.length, 'exact preflight boundaries');
const preflight = sql.slice(start, end);
assert.ok(preflight.includes('Exact seven native target trigger contracts drift'));
test('entire candidate preflight DO compiles, then rejects absent operator attestation semantically', async () => {
  const db = new PGlite();
  try {
    let failure;
    try { await db.exec(preflight); } catch (error) { failure = error; }
    assert.ok(failure, 'must refuse empty-database execution');
    // The first expected semantic exception proves parsing progressed beyond the
    // final IF/EXISTS expression. A syntax regression returns 42601 instead.
    assert.equal(failure.code, 'P0001', `preflight compile failed: ${failure.code}: ${failure.message}`);
    assert.equal(failure.message, 'Authorized staging transport attestation missing');
  } finally { await db.close(); }
});
