import assert from "node:assert/strict";
import test from "node:test";
import {
  IMPORT_VERSION,
  deterministicUuid,
  normalizeMfitPlans,
  sha256,
} from "./mfit-active-workouts-migration.mjs";
import { planRef } from "./mfit-active-workouts-conflict-audit.mjs";
import { buildConflictRepairManifest } from "./mfit-active-workouts-conflict-repair-manifest.mjs";
import {
  buildApplySql,
  buildDryRunSql,
  parseAuditResult,
  validateRepairManifest,
} from "./mfit-active-workouts-conflict-repair.mjs";

const IDS = {
  company: "10000000-0000-4000-8000-000000000001",
  student: "20000000-0000-4000-8000-000000000001",
  enrollment: "30000000-0000-4000-8000-000000000001",
  cycle: "40000000-0000-4000-8000-000000000001",
  exercise: "50000000-0000-4000-8000-000000000001",
  normalized: "60000000-0000-4000-8000-000000000001",
};

function fixture() {
  const mfitClientsPayload = {
    clients: [{ id: "mfit-client-1", name: "Private Student", phone: "11999990001" }],
  };
  const mfitWorkoutsPayload = {
    clients: [{
      id: "mfit-client-1",
      fichas: [{
        id: "plan-1",
        name: "Plano atualizado",
        status: "active",
        start_date: "2026-08-10",
        end_date: "2026-09-20",
        source_capture_complete: true,
        workouts: [{
          id: "session-1",
          name: "Treino atualizado",
          day_of_week: 1,
          notes: "Nova orientação",
          exercises: [{
            id: "source-exercise-1",
            name: "Supino Exato",
            group: "Peitoral",
            sets: 3,
            reps: "10-12",
            rest_seconds: 60,
            notes: "Controle técnico",
          }],
        }],
      }],
    }],
  };
  const normalizedPlan = normalizeMfitPlans(mfitWorkoutsPayload)[0];
  const ref = planRef(normalizedPlan);
  const workoutId = deterministicUuid(IMPORT_VERSION, "workout", IDS.cycle, normalizedPlan.sessions[0].source_id, 0);
  const timestamp = "2026-08-20T12:00:00.000Z";
  const oldMarker = `mfit-import:v1:${"a".repeat(64)}`;
  return {
    ref,
    workoutId,
    args: {
      mfitClientsPayload,
      mfitWorkoutsPayload,
      settStudentsPayload: { students: [{
        id: IDS.student,
        company_id: IDS.company,
        status: "active",
        full_name: "Different Name",
        phone: "+55 11 99999-0001",
      }] },
      context: {
        enrollments: [{ id: IDS.enrollment, student_id: IDS.student, company_id: IDS.company, status: "active", created_at: timestamp }],
        cycles: [{ id: IDS.cycle, enrollment_id: IDS.enrollment, start_date: "2026-08-01", end_date: "2026-09-30", status: "active" }],
        workouts: [{
          id: workoutId,
          cycle_id: IDS.cycle,
          company_id: IDS.company,
          name: "Treino antigo",
          title: "Treino antigo",
          description: null,
          day_of_week: 1,
          sort_order: 3,
          exercises: [{
            exercise_id: IDS.exercise,
            exercise_name: "Supino Exato",
            muscle_group: "Peitoral",
            sets: "3",
            reps: "10-12",
            rest: "60s",
            notes: "Orientação antiga",
            video_url: null,
            video_path: null,
            thumbnail_url: null,
          }],
          notes: oldMarker,
          created_at: timestamp,
          updated_at: timestamp,
          created_by: null,
        }],
        workout_exercises: [{
          id: IDS.normalized,
          workout_id: workoutId,
          exercise_id: IDS.exercise,
          exercise_name: "Supino Exato",
          exercise_order: 0,
          sets: 3,
          reps: "10-12",
          rest_seconds: 60,
          notes: "Orientação antiga",
          created_at: timestamp,
        }],
        usage: [{ workout_id: workoutId, logs: 0, sessions: 0 }],
      },
      catalogContext: {
        company_id: IDS.company,
        catalog: [{ id: IDS.exercise, company_id: IDS.company, is_global: false, name: "Supino Exato" }],
      },
      aliasesPayload: { schema_version: 1, contains_pii: false, aliases: [] },
      includePlanRefs: [ref],
      today: "2026-08-31",
    },
  };
}

test("builds a private CAS manifest only for pristine unused MFIT workouts", () => {
  const { args, ref, workoutId } = fixture();
  const manifest = buildConflictRepairManifest(args);
  assert.equal(manifest.plan_refs[0], ref);
  assert.equal(manifest.summary.workouts, 1);
  assert.equal(manifest.summary.logs, 0);
  assert.equal(manifest.summary.sessions, 0);
  assert.equal(manifest.workouts[0].before_full.id, workoutId);
  assert.equal(manifest.workouts[0].student_id, IDS.student);
  assert.equal(manifest.workouts[0].enrollment_id, IDS.enrollment);
  assert.equal(manifest.workouts[0].after_target.name, "Treino atualizado");
  assert.equal(manifest.workouts[0].normalized_after[0].notes, "Controle técnico");
  assert.equal(validateRepairManifest(manifest).workouts, 1);
});

test("manifest builder fails closed on usage and post-import edits", () => {
  const used = fixture();
  used.args.context.usage[0].logs = 1;
  assert.throws(() => buildConflictRepairManifest(used.args), /workout_has_usage/);

  const edited = fixture();
  edited.args.context.workouts[0].updated_at = "2026-08-21T12:00:00.000Z";
  assert.throws(() => buildConflictRepairManifest(edited.args), /workout_changed_after_import/);
});

test("repair SQL is bounded, backed by exact before images and usage locks", () => {
  const manifest = buildConflictRepairManifest(fixture().args);
  const dryRunSql = buildDryRunSql(manifest);
  assert.doesNotMatch(dryRunSql, /\b(update|delete|truncate|alter|drop)\b/i);
  assert.match(dryRunSql, /workout_logs/);
  assert.match(dryRunSql, /workout_sessions/);
  assert.match(dryRunSql, /before_full/);
  assert.match(dryRunSql, /normalized_before/);

  const applySql = buildApplySql(manifest);
  assert.match(applySql, /pg_advisory_xact_lock/);
  assert.match(applySql, /lock table public\.students, public\.enrollments, public\.training_cycles, public\.workouts/);
  assert.match(applySql, /mfit_conflict_live_eligibility_changed/);
  assert.match(applySql, /mfit_conflict_before_image_changed/);
  assert.match(applySql, /mfit_conflict_new_usage_detected/);
  assert.match(applySql, /mfit_conflict_post_image_mismatch/);
  assert.match(applySql, /update public\.workouts/);
  assert.match(applySql, /update public\.workout_exercises/);
  assert.match(applySql, /exercise\.workout_id = \(desired\.row->>'workout_id'\)::uuid/);
  assert.doesNotMatch(applySql, /delete from public/);
});

test("live aggregate parser accepts only a complete before or complete target state", () => {
  const expected = { workouts: 4 };
  assert.equal(parseAuditResult({
    expected_workouts: 4, workouts_found: 4, exact_before: 4, exact_after: 0,
    logs: 0, sessions: 0, company_boundary: 1, eligible_scope: 4,
  }, expected).status, "planned");
  assert.equal(parseAuditResult({
    expected_workouts: 4, workouts_found: 4, exact_before: 0, exact_after: 4,
    logs: 0, sessions: 0, company_boundary: 1, eligible_scope: 4,
  }, expected).status, "already_applied");
  assert.throws(() => parseAuditResult({
    expected_workouts: 4, workouts_found: 4, exact_before: 2, exact_after: 2,
    logs: 0, sessions: 0, company_boundary: 1, eligible_scope: 4,
  }, expected), /live_before_image_changed/);
  assert.throws(() => parseAuditResult({
    expected_workouts: 4, workouts_found: 4, exact_before: 4, exact_after: 0,
    logs: 1, sessions: 0, company_boundary: 1, eligible_scope: 4,
  }, expected), /live_repair_gate_failed/);
});

test("marker hashes in the manifest are tied to the exact marker lines", () => {
  const manifest = buildConflictRepairManifest(fixture().args);
  const item = manifest.workouts[0];
  assert.equal(item.previous_marker_sha256, sha256(item.before_full.notes.split("\n")[0]));
  assert.equal(item.next_marker_sha256, sha256(item.after_target.notes.split("\n")[0]));
  const tampered = structuredClone(manifest);
  tampered.workouts[0].after_target.notes = `mfit-import:v1:${"b".repeat(64)}`;
  assert.throws(() => validateRepairManifest(tampered), /marker_snapshot_mismatch/);
});
