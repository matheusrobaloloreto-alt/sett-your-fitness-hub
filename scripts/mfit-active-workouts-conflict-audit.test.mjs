import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./mfit-active-workouts-conflict-audit.mjs", import.meta.url), "utf8");

test("conflict audit is read-only, explicit-ref scoped and aggregate-only", () => {
  assert.match(source, /mode: "read-only-conflict-audit"/);
  assert.match(source, /identityContactOnly: true/);
  assert.match(source, /Conflict audit requires 1-20 explicit plan refs/);
  assert.match(source, /contains_pii: false/);
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(|--apply/);
});

test("conflict audit separates structure, prescription, method, media and metadata", () => {
  for (const group of ["structure", "prescription", "method", "media", "metadata"]) {
    assert.match(source, new RegExp(`${group}:`));
  }
  assert.match(source, /current_marker_workouts/);
  assert.match(source, /existing_expected_workouts/);
});

