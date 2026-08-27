import { createHash } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const cleanText = (value) => String(value ?? "").trim();

const stableJson = (value) => JSON.stringify(value ?? null);

export function planWorkoutPatch(workout, changes) {
  const patchedExercises = structuredClone(workout.exercises || []);
  let changesPlanned = 0;
  let changesAlreadyApplied = 0;
  const seenExerciseOrders = new Set();

  for (const change of changes) {
    const exerciseOrder = Number(change.exercise_order);
    if (seenExerciseOrders.has(exerciseOrder)) throw new Error("duplicate_change");
    seenExerciseOrders.add(exerciseOrder);
    if (cleanText(change.workout_id) !== cleanText(workout.id)) {
      throw new Error("workout_id_mismatch");
    }
    if (cleanText(change.company_id) !== cleanText(workout.company_id)) {
      throw new Error("company_id_mismatch");
    }
    if (cleanText(workout.notes).split("\n")[0] !== `mfit-import:v1:${cleanText(change.marker_hash)}`) {
      throw new Error("marker_mismatch");
    }

    const exercise = patchedExercises[exerciseOrder];
    if (!exercise || cleanText(exercise.exercise_name) !== cleanText(change.exercise_name)) {
      throw new Error("exercise_identity_mismatch");
    }
    const isTargetState = cleanText(exercise.load) === cleanText(change.to_load)
      && stableJson(exercise.mfit_protocol) === stableJson(change.to_protocol);
    if (isTargetState) {
      changesAlreadyApplied += 1;
      continue;
    }
    if (cleanText(exercise.load) !== cleanText(change.from_load)
      || stableJson(exercise.mfit_protocol) !== stableJson(change.from_protocol)) {
      throw new Error("stale_exercise_precondition");
    }

    exercise.load = cleanText(change.to_load);
    exercise.mfit_protocol = structuredClone(change.to_protocol);
    changesPlanned += 1;
  }

  return {
    status: changesPlanned ? "planned" : changesAlreadyApplied ? "already_applied" : "unchanged",
    changes_planned: changesPlanned,
    changes_already_applied: changesAlreadyApplied,
    patched_exercises: patchedExercises,
  };
}

function groupChangesByWorkout(changes) {
  const grouped = new Map();
  for (const change of changes) {
    const workoutId = cleanText(change.workout_id);
    if (!workoutId) throw new Error("missing_workout_id");
    const rows = grouped.get(workoutId) || [];
    rows.push(change);
    grouped.set(workoutId, rows);
  }
  return grouped;
}

export async function reconcileManifest({
  manifest,
  db,
  expectedProjectRef,
  confirmProject = "",
  apply = false,
}) {
  if (Number(manifest?.schema_version) !== 1) throw new Error("unsupported_manifest_schema");
  if (cleanText(manifest?.project_ref) !== cleanText(expectedProjectRef)) throw new Error("project_ref_mismatch");
  if (apply && cleanText(confirmProject) !== cleanText(expectedProjectRef)) throw new Error("confirm_project_required");
  if (!Array.isArray(manifest?.changes) || !manifest.changes.length) throw new Error("empty_manifest_changes");

  const boundary = await db.getCompanyBoundary(manifest.company_name);
  if (!boundary
    || cleanText(boundary.id) !== cleanText(manifest.company_id)
    || cleanText(boundary.name) !== cleanText(manifest.company_name)) {
    throw new Error("company_boundary_mismatch");
  }

  const grouped = groupChangesByWorkout(manifest.changes);
  const workoutIds = [...grouped.keys()];
  const workouts = await db.getWorkouts(workoutIds, manifest.company_id);
  if (workouts.length !== workoutIds.length) throw new Error("workout_scope_incomplete");
  const byId = new Map(workouts.map((workout) => [cleanText(workout.id), workout]));
  const plans = workoutIds.map((workoutId) => {
    const workout = byId.get(workoutId);
    if (!workout) throw new Error("workout_scope_incomplete");
    return { workout, changes: grouped.get(workoutId), plan: planWorkoutPatch(workout, grouped.get(workoutId)) };
  });
  const changesPlanned = plans.reduce((sum, item) => sum + item.plan.changes_planned, 0);
  const changesAlreadyApplied = plans.reduce((sum, item) => sum + item.plan.changes_already_applied, 0);

  if (!apply) {
    return {
      status: changesPlanned ? "planned" : "already_applied",
      workouts: workoutIds.length,
      changes_planned: changesPlanned,
      changes_already_applied: changesAlreadyApplied,
    };
  }

  for (const item of plans) {
    if (!item.plan.changes_planned) continue;
    const updated = await db.compareAndSwapWorkoutExercises({
      workoutId: item.workout.id,
      companyId: manifest.company_id,
      expectedNotes: item.workout.notes,
      expectedExercises: item.workout.exercises,
      patchedExercises: item.plan.patched_exercises,
    });
    if (!updated) throw new Error("concurrent_workout_change");
  }

  for (let auditPass = 0; auditPass < 2; auditPass += 1) {
    const audited = await db.getWorkouts(workoutIds, manifest.company_id);
    if (audited.length !== workoutIds.length) throw new Error("post_audit_scope_incomplete");
    const auditedById = new Map(audited.map((workout) => [cleanText(workout.id), workout]));
    for (const workoutId of workoutIds) {
      const plan = planWorkoutPatch(auditedById.get(workoutId), grouped.get(workoutId));
      if (plan.status !== "already_applied") throw new Error("post_audit_target_mismatch");
    }
  }

  return {
    status: changesPlanned ? "applied" : "already_applied",
    workouts: workoutIds.length,
    changes_applied: changesPlanned,
    changes_already_applied: changesAlreadyApplied,
    post_audit_passes: 2,
  };
}

function safeDbError(label, error) {
  return new Error(`${label}:${cleanText(error?.code) || "database_error"}`);
}

export function createSupabaseAdapter(client) {
  return {
    async getCompanyBoundary(companyName) {
      const { data, error } = await client.from("companies").select("id,name").eq("name", companyName);
      if (error) throw safeDbError("company_select", error);
      if ((data || []).length !== 1) throw new Error("company_boundary_ambiguous");
      return data[0];
    },
    async getWorkouts(workoutIds, companyId) {
      const { data, error } = await client.from("workouts")
        .select("id,company_id,notes,exercises")
        .eq("company_id", companyId)
        .in("id", workoutIds)
        .order("id");
      if (error) throw safeDbError("workout_select", error);
      return data || [];
    },
    async compareAndSwapWorkoutExercises({
      workoutId,
      companyId,
      expectedNotes,
      expectedExercises,
      patchedExercises,
    }) {
      const { data, error } = await client.from("workouts")
        .update({ exercises: patchedExercises })
        .eq("id", workoutId)
        .eq("company_id", companyId)
        .eq("notes", expectedNotes)
        .filter("exercises", "eq", JSON.stringify(expectedExercises))
        .select("id");
      if (error) throw safeDbError("workout_compare_and_swap", error);
      return (data || []).length === 1;
    },
  };
}

function parseCliArgs(argv) {
  const options = { manifest: "", report: "", apply: false, confirmProject: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--manifest") options.manifest = argv[++index] || "";
    else if (arg === "--report") options.report = argv[++index] || "";
    else if (arg === "--confirm-project") options.confirmProject = argv[++index] || "";
    else throw new Error(`unknown_argument:${arg}`);
  }
  return options;
}

function projectRefFromUrl(url) {
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i.exec(cleanText(url));
  return match?.[1] || "";
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (!options.manifest || !options.report) throw new Error("manifest_and_report_required");
  const supabaseUrl = process.env.MFIT_SUPABASE_URL
    || process.env.TARGET_SUPABASE_URL
    || process.env.SUPABASE_URL
    || "";
  const serviceRole = process.env.MFIT_SUPABASE_SERVICE_ROLE_KEY
    || process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || "";
  const projectRef = projectRefFromUrl(supabaseUrl);
  if (!projectRef || !serviceRole) throw new Error("supabase_credentials_required");

  const manifestBytes = await readFile(options.manifest);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const client = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = await reconcileManifest({
    manifest,
    db: createSupabaseAdapter(client),
    expectedProjectRef: projectRef,
    confirmProject: options.confirmProject,
    apply: options.apply,
  });
  const report = {
    schema_version: 1,
    created_at: new Date().toISOString(),
    mode: options.apply ? "apply" : "dry-run",
    project_ref: projectRef,
    company_id: manifest.company_id,
    manifest_sha256: createHash("sha256").update(manifestBytes).digest("hex"),
    result,
  };
  await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await chmod(options.report, 0o600);
  console.log(JSON.stringify({ report: options.report, mode: report.mode, ...result }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(cleanText(error?.message) || "reconciliation_failed");
    process.exitCode = 1;
  });
}
