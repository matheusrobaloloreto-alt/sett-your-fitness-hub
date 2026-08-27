import assert from "node:assert/strict";
import test from "node:test";

const reconciliationModule = await import("./mfit-active-workouts-reconcile.mjs").catch(() => ({}));

test("patches only the exact marker-scoped MFIT exercise load and protocol", () => {
  assert.equal(typeof reconciliationModule.planWorkoutPatch, "function");

  const workout = {
    id: "workout-1",
    company_id: "company-1",
    notes: "mfit-import:v1:marker-1\nnota preservada",
    exercises: [
      {
        exercise_name: "Pallof Press",
        load: "7.5",
        mfit_protocol: [{ reps: "10 cada lado", rest: "60s", load: "7.5", tempo: "", notes: "" }],
        video_url: "https://example.test/pallof.mp4",
      },
      { exercise_name: "Outro exercício", load: "4" },
    ],
  };
  const change = {
    workout_id: "workout-1",
    company_id: "company-1",
    marker_hash: "marker-1",
    exercise_order: 0,
    exercise_name: "Pallof Press",
    from_load: "7.5",
    to_load: "12.5",
    from_protocol: [{ reps: "10 cada lado", rest: "60s", load: "7.5", tempo: "", notes: "" }],
    to_protocol: [{ reps: "10 cada lado", rest: "60s", load: "12.5", tempo: "", notes: "" }],
  };

  const result = reconciliationModule.planWorkoutPatch(workout, [change]);

  assert.equal(result.status, "planned");
  assert.equal(result.changes_planned, 1);
  assert.equal(result.patched_exercises[0].load, "12.5");
  assert.deepEqual(result.patched_exercises[0].mfit_protocol, change.to_protocol);
  assert.equal(result.patched_exercises[0].video_url, "https://example.test/pallof.mp4");
  assert.deepEqual(result.patched_exercises[1], workout.exercises[1]);
  assert.deepEqual(workout.exercises[0].mfit_protocol, change.from_protocol);
});

test("treats an exact target state as an idempotent no-op", () => {
  const targetProtocol = [{ reps: "12", rest: "55s", load: "7", tempo: "", notes: "" }];
  const workout = {
    id: "workout-2",
    company_id: "company-1",
    notes: "mfit-import:v1:marker-2",
    exercises: [{ exercise_name: "Supino Reto com Halteres", load: "7", mfit_protocol: targetProtocol }],
  };
  const change = {
    workout_id: "workout-2",
    company_id: "company-1",
    marker_hash: "marker-2",
    exercise_order: 0,
    exercise_name: "Supino Reto com Halteres",
    from_load: "6",
    to_load: "7",
    from_protocol: [{ reps: "12", rest: "55s", load: "6", tempo: "", notes: "" }],
    to_protocol: targetProtocol,
  };

  const result = reconciliationModule.planWorkoutPatch(workout, [change]);

  assert.equal(result.status, "already_applied");
  assert.equal(result.changes_planned, 0);
  assert.deepEqual(result.patched_exercises, workout.exercises);
});

test("rejects duplicate manifest changes for the same exercise slot", () => {
  const workout = {
    id: "workout-3",
    company_id: "company-1",
    notes: "mfit-import:v1:marker-3",
    exercises: [{ exercise_name: "Pallof Press", load: "7.5", mfit_protocol: [{ load: "7.5" }] }],
  };
  const change = {
    workout_id: "workout-3",
    company_id: "company-1",
    marker_hash: "marker-3",
    exercise_order: 0,
    exercise_name: "Pallof Press",
    from_load: "7.5",
    to_load: "12.5",
    from_protocol: [{ load: "7.5" }],
    to_protocol: [{ load: "12.5" }],
  };

  assert.throws(
    () => reconciliationModule.planWorkoutPatch(workout, [change, { ...change, to_load: "15" }]),
    /duplicate_change/,
  );
});

test("runs dry-run without writes and apply with compare-and-swap plus two post-reads", async () => {
  assert.equal(typeof reconciliationModule.reconcileManifest, "function");

  const companyId = "11111111-1111-4111-8111-111111111111";
  const workout = {
    id: "22222222-2222-4222-8222-222222222222",
    company_id: companyId,
    notes: "mfit-import:v1:marker-4",
    exercises: [{ exercise_name: "Pallof Press", load: "7.5", mfit_protocol: [{ load: "7.5" }] }],
  };
  const manifest = {
    schema_version: 1,
    project_ref: "project-ref",
    company_id: companyId,
    company_name: "BN Performance Training",
    changes: [{
      workout_id: workout.id,
      company_id: companyId,
      marker_hash: "marker-4",
      exercise_order: 0,
      exercise_name: "Pallof Press",
      from_load: "7.5",
      to_load: "12.5",
      from_protocol: [{ load: "7.5" }],
      to_protocol: [{ load: "12.5" }],
    }],
  };
  let storedWorkout = structuredClone(workout);
  let writes = 0;
  let reads = 0;
  const db = {
    async getCompanyBoundary() { return { id: companyId, name: "BN Performance Training" }; },
    async getWorkouts(ids) {
      reads += 1;
      return ids.includes(storedWorkout.id) ? [structuredClone(storedWorkout)] : [];
    },
    async compareAndSwapWorkoutExercises({ expectedExercises, patchedExercises }) {
      assert.deepEqual(storedWorkout.exercises, expectedExercises);
      writes += 1;
      storedWorkout = { ...storedWorkout, exercises: structuredClone(patchedExercises) };
      return true;
    },
  };

  const dryRun = await reconciliationModule.reconcileManifest({
    manifest,
    db,
    expectedProjectRef: "project-ref",
    apply: false,
  });
  assert.equal(dryRun.status, "planned");
  assert.equal(dryRun.changes_planned, 1);
  assert.equal(writes, 0);

  reads = 0;
  const applied = await reconciliationModule.reconcileManifest({
    manifest,
    db,
    expectedProjectRef: "project-ref",
    confirmProject: "project-ref",
    apply: true,
  });
  assert.equal(applied.status, "applied");
  assert.equal(applied.changes_applied, 1);
  assert.equal(writes, 1);
  assert.equal(reads, 3);
  assert.equal(storedWorkout.exercises[0].load, "12.5");
});
