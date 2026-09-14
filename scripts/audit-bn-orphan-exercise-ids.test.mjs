import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReport,
  parseArgs,
  parseLinkedEnvelope,
} from "./audit-bn-orphan-exercise-ids.mjs";

const idA = "11111111-1111-4111-8111-111111111111";
const idB = "22222222-2222-4222-8222-222222222222";
const idC = "33333333-3333-4333-8333-333333333333";

function productionFixture() {
  return {
    schema_version: 1,
    project_ref: "zshrcgbyhzxpnlccssyz",
    company: { slug: "bn-performance-training", company_ref: "companyref001" },
    active_slots: [
      {
        exercise_id: idA,
        exercise_name: "Agachamento Livre",
        cycle_ref: "cycle-a",
        student_ref: "student-a",
        enrollment_ref: "enrollment-a",
        workout_ref: "workout-a",
        cycle_status: "active",
        cycle_visibility: "current_active_window",
        mfit_tagged: false,
      },
      {
        exercise_id: idB,
        exercise_name: "Nome vivo nao conta sozinho",
        cycle_ref: "cycle-b",
        student_ref: "student-b",
        enrollment_ref: "enrollment-b",
        workout_ref: "workout-b",
        cycle_status: "active",
        cycle_visibility: "current_active_window",
        mfit_tagged: false,
      },
      {
        exercise_id: idC,
        exercise_name: "Sem fonte",
        cycle_ref: "cycle-c",
        student_ref: "student-c",
        enrollment_ref: "enrollment-c",
        workout_ref: "workout-c",
        cycle_status: "pending",
        cycle_visibility: "future_visible",
        mfit_tagged: true,
      },
    ],
    db_evidence: [
      {
        exercise_id: idB,
        evidence: {
          source_type: "db_snapshot",
          source_table: "workout_revision_repair_audit",
          exercise_name: "Remada Curvada",
        },
      },
      {
        exercise_id: idB,
        evidence: {
          source_type: "db_snapshot",
          source_table: "workout_archive_events",
          exercise_name: "Remada Baixa",
        },
      },
    ],
  };
}

test("classifies restorable, ambiguous and no-source IDs without using active slots as proof", () => {
  const report = buildReport(productionFixture(), [
    {
      exercise_id: idA,
      evidence: {
        source_type: "recording_roster",
        code: "001",
        name: "Agachamento Livre",
      },
    },
  ]);
  assert.equal(report.contains_pii, false);
  assert.equal(report.aggregate.distinct_missing_exercise_ids, 3);
  assert.deepEqual(report.aggregate.classification_counts, {
    restauravel: 1,
    candidato_ambiguo: 1,
    sem_fonte: 1,
  });
  assert.equal(report.items.find((item) => item.exercise_id === idA).classification, "restauravel");
  assert.equal(report.items.find((item) => item.exercise_id === idB).classification, "candidato_ambiguo");
  assert.equal(report.items.find((item) => item.exercise_id === idC).classification, "sem_fonte");
});

test("linked parser accepts only the aggregate audit envelope", () => {
  const fixture = productionFixture();
  assert.deepEqual(parseLinkedEnvelope(JSON.stringify({ rows: [{ audit: fixture }] })), fixture);
  assert.deepEqual(parseLinkedEnvelope(`Initialising login role...\n${JSON.stringify({ rows: [{ audit: fixture }] })}`), fixture);
  assert.throws(() => parseLinkedEnvelope("not-json"), /no_parseable_json/);
  assert.throws(() => parseLinkedEnvelope(JSON.stringify({ rows: [] })), /unexpected_shape/);
});

test("CLI is fail-closed and read-only", () => {
  assert.throws(() => parseArgs(["--apply", "--report", "x.json"]), /read-only/);
  assert.throws(() => parseArgs(["--report"]), /--report/);
  assert.throws(() => parseArgs(["--unknown", "--report", "x.json"]), /unknown_argument/);
  assert.equal(parseArgs(["--report", "x.json"]).report, "x.json");
});
