import assert from "node:assert/strict";
import test from "node:test";

import {
  EXPECTED_PROJECT_REF,
  auditScopeHash,
  buildApplySql,
  buildRollbackSql,
  deriveInsertPayload,
  parseArgs,
  parseLinkedEnvelope,
  planBatches,
  validateAudit,
  validateCuratedAudit,
} from "./repair-bn-orphan-exercise-library.mjs";

const ids = Array.from({ length: 27 }, (_, index) =>
  `${String(index + 1).padStart(8, "0")}-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
);

function item(index, slots = 1, overrides = {}) {
  return {
    exercise_id: ids[index],
    classification: "restauravel",
    reason: "single_exact_identity_across_deterministic_sources",
    canonical_name: index === 0 ? "Pallof press com banda" : `Exercicio ${index + 1}`,
    active_impact: { slots, cycles: 1, students: 1, enrollments: 1, workouts: 1 },
    active_metadata: {
      observed_names: [index === 0 ? "Pallof press com banda" : `Exercicio ${index + 1}`],
      observed_muscle_groups: [index === 0 ? "Core" : "quadriceps"],
      tenant_visibility: "bn-performance-training/current-visible-workouts",
    },
    exact_evidence: [{
      source_type: index % 2 === 0 ? "recording_roster" : "db_snapshot",
      exact_name: index === 0 ? "Pallof press com banda" : `Exercicio ${index + 1}`,
      exact_name_normalized: index === 0 ? "pallof press com banda" : `exercicio ${index + 1}`,
      trust: index % 2 === 0 ? 90 : 80,
    }],
    ...overrides,
  };
}

function audit(items) {
  return {
    schema_version: 1,
    mode: "read-only",
    contains_pii: false,
    project_ref: EXPECTED_PROJECT_REF,
    company: { slug: "bn-performance-training", company_ref: "32afc48c82b7" },
    source_hashes: { production_payload_sha256: "a".repeat(64), local_evidence_sha256: "b".repeat(64) },
    aggregate: {
      slots: items.reduce((sum, value) => sum + value.active_impact.slots, 0),
      distinct_missing_exercise_ids: items.length,
      classification_counts: { restauravel: items.length, candidato_ambiguo: 0, sem_fonte: 0 },
    },
    items,
  };
}

function curatedItem(index, name = "Flexora na Bola", overrides = {}) {
  return item(index, 1, {
    classification: "candidato_ambiguo",
    reason: "conflicting_exact_names_for_same_missing_id",
    canonical_name: undefined,
    exact_evidence: [{
      source_type: "recording_roster",
      source_file: "docs/project/gravacao/codigo-para-exercicio.json",
      code: "503",
      name,
      exact_name: name,
      exact_name_normalized: "flexora na bola",
      trust: 90,
    }, {
      source_type: "db_snapshot",
      exact_name: "Flexora na Bola Suíça",
      exact_name_normalized: "flexora na bola suica",
      trust: 80,
    }],
    ...overrides,
  });
}

function curation(approvals) {
  return {
    schema_version: 1,
    project_ref: EXPECTED_PROJECT_REF,
    company_slug: "bn-performance-training",
    contains_pii: false,
    source: "astra_technical_curation_2026-09-14",
    approvals,
  };
}

function approval(index = 0, name = "Flexora na Bola", overrides = {}) {
  return {
    exercise_id: ids[index],
    canonical_name: name,
    justification: "Approved by technical curation against the SETT recording roster.",
    ...overrides,
  };
}

test("CLI defaults to dry-run and apply requires project, audit hash and one batch", () => {
  const dry = parseArgs([]);
  assert.equal(dry.apply, false);
  assert.equal(dry.audit, "docs/project/AUDITORIA-2026-09-14-EXERCISE-ID-ORFAOS.json");
  assert.throws(() => parseArgs(["--apply"]), /confirm-project/);
  assert.throws(() => parseArgs(["--apply", "--confirm-project", EXPECTED_PROJECT_REF]), /confirm-audit-sha256/);
  assert.throws(() => parseArgs([
    "--apply", "--confirm-project", EXPECTED_PROJECT_REF,
    "--confirm-audit-sha256", "a".repeat(64),
  ]), /batch/);
  const apply = parseArgs([
    "--apply", "--confirm-project", EXPECTED_PROJECT_REF,
    "--confirm-audit-sha256", "a".repeat(64), "--batch", "2",
  ]);
  assert.equal(apply.batch, 2);
  assert.throws(() => parseArgs([
    "--apply", "--confirm-project", "wrong",
    "--confirm-audit-sha256", "a".repeat(64), "--batch", "1",
  ]), /canonical/);
  const curated = parseArgs([
    "--curation-manifest", "docs/project/AUDITORIA-2026-09-14-EXERCISE-ID-ORFAOS-CURADORIA.json",
  ]);
  assert.equal(curated.curationManifest, "docs/project/AUDITORIA-2026-09-14-EXERCISE-ID-ORFAOS-CURADORIA.json");
  assert.throws(() => parseArgs(["--rollback-manifest", "x.json"]), /--apply/);
  assert.throws(() => parseArgs(["--unknown"]), /unknown_argument/);
});

test("audit validation refuses wrong project, PII, wrong counts and non-restorable scope", () => {
  assert.doesNotThrow(() => validateAudit(audit([item(0)]), { expectedRestorableCount: 1 }));
  assert.throws(() => validateAudit({ ...audit([item(0)]), project_ref: "wrong" }, { expectedRestorableCount: 1 }), /project_ref/);
  assert.throws(() => validateAudit({ ...audit([item(0)]), contains_pii: true }, { expectedRestorableCount: 1 }), /contains_pii/);
  assert.throws(() => validateAudit({ ...audit([item(0)]), aggregate: { ...audit([item(0)]).aggregate, classification_counts: { restauravel: 2 } } }, { expectedRestorableCount: 1 }), /count/);
  assert.throws(() => validateAudit(audit([item(0, 1, { classification: "candidato_ambiguo" })]), { expectedRestorableCount: 1 }), /restauravel/);
});

test("technical curation accepts only approved ambiguous IDs backed by the same recording roster name", () => {
  const result = validateCuratedAudit(
    audit([curatedItem(0)]),
    curation([approval(0)]),
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].classification, "restauravel");
  assert.equal(result[0].canonical_name, "Flexora na Bola");
  assert.equal(result[0].curation.recording_roster_code, "503");
});

test("technical curation is fail-closed for tampered name or ID", () => {
  assert.throws(() => validateCuratedAudit(
    audit([curatedItem(0)]),
    curation([approval(0, "Flexora na Bola Suíça")]),
  ), /recording_roster_missing/);
  assert.throws(() => validateCuratedAudit(
    audit([curatedItem(0)]),
    curation([approval(1)]),
  ), /missing_audit_item/);
});

test("technical curation refuses non-ambiguous audit items and missing roster evidence", () => {
  assert.throws(() => validateCuratedAudit(
    audit([item(0)]),
    curation([approval(0)]),
  ), /not_ambiguous/);
  assert.throws(() => validateCuratedAudit(
    audit([curatedItem(0, "Flexora na Bola", { exact_evidence: [{ source_type: "db_snapshot", exact_name: "Flexora na Bola" }] })]),
    curation([approval(0)]),
  ), /recording_roster_missing/);
});

test("technical curation refuses duplicate approvals and lists over 25", () => {
  assert.throws(() => validateCuratedAudit(
    audit([curatedItem(0)]),
    curation([approval(0), approval(0)]),
  ), /duplicate/);
  const oversized = Array.from({ length: 26 }, (_, index) => approval(0, "Flexora na Bola", {
    exercise_id: `${String(index + 100).padStart(8, "0")}-1111-4111-8111-${String(index + 100).padStart(12, "0")}`,
  }));
  assert.throws(() => validateCuratedAudit(audit([curatedItem(0)]), curation(oversized)), /limit/);
});

test("stable scope hash changes on identity, impact or evidence drift", () => {
  const original = audit([item(0), item(1)]);
  const same = JSON.parse(JSON.stringify(original));
  same.generated_at = "later";
  same.source_hashes.production_payload_sha256 = "c".repeat(64);
  assert.equal(auditScopeHash(original), auditScopeHash(same));
  same.items[0].active_impact.slots = 2;
  assert.notEqual(auditScopeHash(original), auditScopeHash(same));
});

test("batch planner enforces both 25 IDs and 150 active slots", () => {
  const byIds = planBatches(Array.from({ length: 27 }, (_, index) => item(index, 1)));
  assert.deepEqual(byIds.map((batch) => batch.items.length), [25, 2]);
  const bySlots = planBatches([item(0, 100), item(1, 50), item(2, 1)]);
  assert.deepEqual(bySlots.map((batch) => batch.slot_count), [150, 1]);
  assert.throws(() => planBatches([item(0, 151)]), /150 slots/);
});

test("insert payload keeps original ID and derives canonical tenant, category and muscle metadata", () => {
  const global = deriveInsertPayload(item(0), "company-uuid");
  assert.equal(global.id, ids[0]);
  assert.equal(global.company_id, null);
  assert.equal(global.is_global, true);
  assert.equal(global.category, "core");
  assert.deepEqual(global.categories, ["core"]);
  assert.deepEqual(global.muscle_targets, []);
  assert.equal(global.difficulty, "intermediate");
  assert.equal(global.body_regions.length, 0);

  const tenant = deriveInsertPayload(item(1), "company-uuid");
  assert.equal(tenant.company_id, "company-uuid");
  assert.equal(tenant.is_global, false);
  assert.equal(tenant.muscle_group, "Quadríceps");
  assert.deepEqual(tenant.muscle_targets, [{ muscle_slug: "quadriceps", muscle_label: "Quadríceps", role: "primary", is_primary: true, volume_percentage: 100 }]);
  assert.ok(["funcionais", "base"].includes(tenant.category));
});

test("payload refuses conflicting anatomical muscles and unsupported evidence", () => {
  assert.throws(() => deriveInsertPayload(item(0, 1, {
    active_metadata: { observed_names: ["X"], observed_muscle_groups: ["quadriceps", "peitoral"] },
  }), "company-uuid"), /conflicting_canonical_muscles/);
  assert.throws(() => deriveInsertPayload(item(0, 1, { exact_evidence: [] }), "company-uuid"), /deterministic_evidence/);
});

test("apply SQL is transactional, CAS guarded, insert-only and bounded", () => {
  const batch = planBatches([item(0), item(1)])[0];
  const payloads = batch.items.map((value) => deriveInsertPayload(value, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"));
  const sql = buildApplySql({
    batch,
    payloads,
    auditSha256: "a".repeat(64),
    scopeSha256: "b".repeat(64),
    companyRef: "32afc48c82b7",
  });
  assert.match(sql, /begin;/i);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /lock table public\.exercise_library in share row exclusive mode/);
  assert.match(sql, /repair_existing_row_diverged/);
  assert.match(sql, /on conflict \(id\) do nothing/i);
  assert.match(sql, /repair_insert_count_mismatch/);
  assert.match(sql, /repair_target_insert_count_mismatch/);
  assert.match(sql, /commit;/i);
  assert.doesNotMatch(sql, /update\s+public\.workouts|delete\s+from\s+public\.workouts/i);
});

test("rollback SQL deletes only manifest inserts and refuses changed or post-repair-used rows", () => {
  const sql = buildRollbackSql({
    project_ref: EXPECTED_PROJECT_REF,
    mode: "applied",
    applied_at: "2026-09-14T20:00:00.000Z",
    inserted_rows: [{
      exercise_id: ids[0],
      after_row_sha256: "c".repeat(64),
      affected_workout_ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    }],
  });
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /rollback_row_changed/);
  assert.match(sql, /rollback_post_repair_usage/);
  assert.match(sql, /workout_logs/);
  assert.match(sql, /workout_sessions/);
  assert.match(sql, /delete from public\.exercise_library/i);
  assert.doesNotMatch(sql, /delete from public\.(workouts|training_cycles)/i);
});

test("linked query parser accepts only the CLI envelope", () => {
  assert.deepEqual(parseLinkedEnvelope(JSON.stringify({ rows: [{ repair_preflight: { ok: true } }] }), "repair_preflight"), { ok: true });
  assert.throws(() => parseLinkedEnvelope("not-json", "repair_preflight"), /no_parseable_json/);
  assert.throws(() => parseLinkedEnvelope(JSON.stringify({ rows: [] }), "repair_preflight"), /unexpected_shape/);
});
