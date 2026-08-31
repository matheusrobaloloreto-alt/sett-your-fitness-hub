import assert from "node:assert/strict";
import test from "node:test";
import {
  createLinkedReadonlyAdapter,
  loadLinkedProductionSnapshot,
  parseArgs,
  parseLinkedEnvelope,
} from "./mfit-active-workouts-linked-dry-run.mjs";

function fixture() {
  return {
    company: { id: "11111111-1111-4111-8111-111111111111", slug: "bn-performance-training" },
    students: [{ id: "student-a", company_id: "company-a", status: "active" }],
    enrollments: [{ id: "enrollment-a", student_id: "student-a" }],
    cycles: [{ id: "cycle-a", enrollment_id: "enrollment-a" }],
    workouts: [{ id: "workout-a", cycle_id: "cycle-a" }],
    exercises: [
      { id: "global-a", company_id: null, is_global: true },
      { id: "tenant-a", company_id: "company-a", is_global: false },
      { id: "other-a", company_id: "company-b", is_global: false },
    ],
    workout_exercises: [{ id: "row-a", workout_id: "workout-a" }],
    normalized_support: { available: true, has_id: true },
  };
}

test("linked adapter filters reads and rejects every write path", async () => {
  const adapter = createLinkedReadonlyAdapter(fixture());
  assert.deepEqual(await adapter.getStudentsByIds(["student-a"]), fixture().students);
  assert.deepEqual(await adapter.getEnrollments(["student-a"]), fixture().enrollments);
  assert.deepEqual(await adapter.getCycles(["enrollment-a"]), fixture().cycles);
  assert.deepEqual(await adapter.getWorkouts(["cycle-a"]), fixture().workouts);
  assert.deepEqual(
    (await adapter.getExercises(["company-a"])).map((row) => row.id),
    ["global-a", "tenant-a"],
  );
  assert.deepEqual(await adapter.getWorkoutExercises(["workout-a"]), fixture().workout_exercises);
  await assert.rejects(adapter.insertCycles([]), /forbids database writes/);
  await assert.rejects(adapter.insertWorkouts([]), /forbids database writes/);
  await assert.rejects(adapter.insertExercises([]), /forbids database writes/);
  await assert.rejects(adapter.insertWorkoutExercises([]), /forbids database writes/);
});

test("linked adapter honors normalized tables without a row id column", async () => {
  const snapshot = fixture();
  snapshot.normalized_support.has_id = false;
  snapshot.workout_exercises[0].id = null;
  const adapter = createLinkedReadonlyAdapter(snapshot);
  assert.deepEqual(adapter.normalizedSupport, { available: true, has_id: false });
  assert.deepEqual(await adapter.getWorkoutExercises(["workout-a"]), snapshot.workout_exercises);
});

test("linked envelope parser accepts only the expected aggregate shape", () => {
  const snapshot = fixture();
  assert.deepEqual(parseLinkedEnvelope(JSON.stringify({ rows: [{ snapshot }] })), snapshot);
  assert.throws(() => parseLinkedEnvelope("not-json"), /no raw rows were printed/);
  assert.throws(() => parseLinkedEnvelope(JSON.stringify({ rows: [] })), /unexpected shape/);
});

test("linked loader suppresses database output on failure", () => {
  const spawnSyncImpl = () => ({
    status: 1,
    stdout: "raw-personal-data",
    stderr: "raw-database-error",
  });
  assert.throws(
    () => loadLinkedProductionSnapshot({ spawnSyncImpl }),
    (error) => error.message === "Linked production snapshot failed; no raw rows were printed",
  );
});

test("linked CLI remains dry-run only while forwarding audited planning modes", () => {
  assert.throws(() => parseArgs(["--apply"]), /--apply is forbidden/);
  const options = parseArgs([
    "--mfit-clients", "clients.json",
    "--mfit-workouts", "workouts.json",
    "--allow-verified-empty-source-sessions",
    "--create-new-cycle-on-ambiguous-empty",
    "--merge-overlap-into-active-cycle",
    "--create-pending-cycle-on-overlap",
    "--include-plan-ref", "abcdef123456",
    "--include-plan-ref=abcdef123456",
  ]);
  assert.equal(options.allowVerifiedEmptySourceSessions, true);
  assert.equal(options.createNewCycleOnAmbiguousEmpty, true);
  assert.equal(options.mergeOverlapIntoActiveCycle, true);
  assert.equal(options.createPendingCycleOnOverlap, true);
  assert.deepEqual(options.includePlanRefs, ["abcdef123456"]);
  assert.throws(
    () => parseArgs(Array.from({ length: 6 }, (_, index) => ["--include-plan-ref", `${index}`.padStart(12, "0")]).flat()),
    /At most 5/,
  );
});
