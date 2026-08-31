#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_SUPABASE_PROJECT_REF,
  IMPORT_VERSION,
  buildExerciseAliasIndex,
  deterministicUuid,
  matchMfitClientsToSett,
  normalizeMfitClients,
  normalizeMfitPlans,
  normalizeSettStudents,
  sha256,
  stableStringify,
} from "./mfit-active-workouts-migration.mjs";
import {
  chooseEnrollment,
  planRef,
  projectedExercise,
  resolveExerciseId,
} from "./mfit-active-workouts-conflict-audit.mjs";

const COMPANY_SLUG = "bn-performance-training";
const REF_RE = /^[0-9a-f]{12}$/;
const MARKER_RE = /^mfit-import:v1:[0-9a-f]{64}$/;

function clean(value) {
  return value === null || value === undefined ? "" : String(value).normalize("NFC").trim();
}

function parseYmd(value) {
  const text = clean(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== text ? null : text;
}

function addDays(ymd, days) {
  const date = new Date(`${ymd}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function businessToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function restSeconds(rest) {
  const match = clean(rest).match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function targetWorkoutProjection(row) {
  return {
    id: row.id,
    cycle_id: row.cycle_id,
    company_id: row.company_id,
    name: row.name,
    title: row.title ?? null,
    description: row.description ?? null,
    day_of_week: row.day_of_week ?? null,
    sort_order: row.sort_order ?? null,
    exercises: Array.isArray(row.exercises) ? row.exercises : [],
    notes: row.notes ?? null,
    created_at: row.created_at,
    created_by: row.created_by ?? null,
  };
}

function fullWorkoutProjection(row) {
  return { ...targetWorkoutProjection(row), updated_at: row.updated_at };
}

function normalizedProjection(row) {
  return {
    id: row.id,
    workout_id: row.workout_id,
    exercise_id: row.exercise_id ?? null,
    exercise_name: row.exercise_name ?? null,
    exercise_order: Number(row.exercise_order) || 0,
    sets: Number(row.sets) || 0,
    reps: row.reps ?? null,
    rest_seconds: Number(row.rest_seconds) || 0,
    notes: row.notes ?? null,
    created_at: row.created_at ?? null,
  };
}

function canonical(value) {
  return stableStringify(value);
}

function unwrapLinked(payload, key) {
  const value = payload?.rows?.[0]?.[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${key}_linked_payload_invalid`);
  }
  return value;
}

export function buildConflictRepairManifest({
  mfitClientsPayload,
  mfitWorkoutsPayload,
  settStudentsPayload,
  context,
  catalogContext,
  aliasesPayload,
  targetMapPayload = null,
  includePlanRefs,
  today,
  allowVerifiedEmptySourceSessions = false,
}) {
  const refs = new Set(includePlanRefs);
  if (refs.size < 1 || refs.size > 5 || [...refs].some((ref) => !REF_RE.test(ref))) {
    throw new Error("repair_requires_1_to_5_sanitized_refs");
  }
  if (!parseYmd(today)) throw new Error("invalid_business_date");
  const companyId = clean(catalogContext?.company_id);
  if (!companyId || !Array.isArray(catalogContext?.catalog)) throw new Error("catalog_context_invalid");

  const students = normalizeSettStudents(settStudentsPayload);
  const clients = targetMapPayload ? [] : normalizeMfitClients(mfitClientsPayload);
  const matches = targetMapPayload
    ? new Map()
    : matchMfitClientsToSett(clients, students, { identityContactOnly: true });
  const clientById = new Map(clients.map((client) => [client.source_id, client]));
  if (targetMapPayload && (targetMapPayload.contains_pii !== true || !Array.isArray(targetMapPayload.targets))) {
    throw new Error("preverified_target_map_invalid");
  }
  const targetByRef = new Map((targetMapPayload?.targets || []).map((target) => [clean(target.ref), target]));
  const plans = normalizeMfitPlans(mfitWorkoutsPayload)
    .map((plan) => ({ plan, ref: planRef(plan) }))
    .filter((row) => refs.has(row.ref));
  if (plans.length !== refs.size) throw new Error("requested_plan_ref_missing_from_source");
  const aliases = buildExerciseAliasIndex(aliasesPayload);
  const manifestWorkouts = [];

  for (const { plan, ref } of plans.sort((left, right) => left.ref.localeCompare(right.ref))) {
    if (plan.source_capture_complete !== true) throw new Error("source_capture_incomplete");
    if (plan.source_empty_session_count > 0 && !allowVerifiedEmptySourceSessions) {
      throw new Error("verified_empty_source_override_required");
    }
    let matchedStudent;
    if (targetMapPayload) {
      const target = targetByRef.get(ref);
      if (!target || clean(target.client_source_id) !== clean(plan.client_id)
        || clean(target.plan_source_id) !== clean(plan.source_id)) {
        throw new Error("preverified_target_map_scope_mismatch");
      }
      matchedStudent = students.find((student) => student.id === clean(target.student_id)
        && student.company_id === companyId && ["active", "awaiting_renewal"].includes(student.status));
      if (!matchedStudent) throw new Error("preverified_target_student_ineligible");
    } else {
      const client = clientById.get(plan.client_id);
      const match = client ? matches.get(client.source_id) : null;
      if (!match?.student || !["phone", "email", "phone_email"].includes(match.method)) {
        throw new Error("identity_contact_match_required");
      }
      matchedStudent = match.student;
    }
    const enrollment = chooseEnrollment(context.enrollments.filter((row) => row.student_id === matchedStudent.id));
    if (!enrollment || clean(enrollment.company_id) !== companyId) throw new Error("active_enrollment_required");
    const covering = context.cycles.filter((row) => row.enrollment_id === enrollment.id
      && clean(row.status).toLowerCase() === "active"
      && row.start_date <= today && today <= row.end_date);
    if (covering.length !== 1) throw new Error("unique_active_covering_cycle_required");
    const cycle = covering[0];
    const durationWeeks = Math.max(1, Number(plan.duration_weeks) || 6);
    const startDate = plan.start_date || today;
    const endDate = plan.end_date && plan.end_date >= startDate
      ? plan.end_date
      : addDays(startDate, durationWeeks * 7 - 1);
    const markerHash = sha256(stableStringify({
      source_id: plan.source_id,
      name: plan.name,
      objective: plan.objective,
      start_date: startDate,
      end_date: endDate,
      sessions: plan.sessions,
    }));
    const nextMarker = `mfit-import:v1:${markerHash}`;

    for (let sessionIndex = 0; sessionIndex < plan.sessions.length; sessionIndex += 1) {
      const session = plan.sessions[sessionIndex];
      const workoutId = deterministicUuid(IMPORT_VERSION, "workout", cycle.id, session.source_id, sessionIndex);
      const existing = context.workouts.find((row) => row.id === workoutId);
      if (!existing || clean(existing.company_id) !== companyId || clean(existing.cycle_id) !== clean(cycle.id)) {
        throw new Error("deterministic_workout_scope_missing");
      }
      const previousMarker = clean(existing.notes).split("\n")[0];
      if (!MARKER_RE.test(previousMarker)) throw new Error("previous_mfit_marker_invalid");
      if (clean(existing.created_at) !== clean(existing.updated_at)) throw new Error("workout_changed_after_import");
      const usage = context.usage.find((row) => row.workout_id === workoutId) || {};
      if ((Number(usage.logs) || 0) !== 0 || (Number(usage.sessions) || 0) !== 0) {
        throw new Error("workout_has_usage");
      }

      const expectedExercises = session.exercises.map((exercise) => projectedExercise(
        exercise,
        resolveExerciseId(catalogContext.catalog, companyId, exercise, aliases),
      ));
      const normalizedBefore = context.workout_exercises
        .filter((row) => row.workout_id === workoutId)
        .map(normalizedProjection)
        .sort((left, right) => left.exercise_order - right.exercise_order || left.id.localeCompare(right.id));
      if (normalizedBefore.length !== expectedExercises.length) throw new Error("normalized_mirror_count_mismatch");
      const normalizedAfter = session.exercises.map((exercise, exerciseIndex) => {
        const before = normalizedBefore[exerciseIndex];
        const expectedExerciseId = expectedExercises[exerciseIndex].exercise_id;
        if (!before || before.exercise_order !== exerciseIndex
          || clean(before.exercise_id) !== clean(expectedExerciseId)
          || clean(before.exercise_name) !== clean(exercise.name)) {
          throw new Error("normalized_mirror_identity_mismatch");
        }
        return {
          ...before,
          exercise_id: expectedExerciseId,
          exercise_name: exercise.name,
          exercise_order: exerciseIndex,
          sets: Number.parseInt(exercise.sets, 10) || 0,
          reps: exercise.reps,
          rest_seconds: restSeconds(exercise.rest),
          notes: exercise.notes || null,
        };
      });
      const beforeFull = fullWorkoutProjection(existing);
      const afterTarget = {
        ...targetWorkoutProjection(existing),
        name: session.name,
        title: session.name,
        description: session.description || session.notes || null,
        day_of_week: session.day_of_week,
        exercises: expectedExercises,
        notes: [nextMarker, session.notes].filter(Boolean).join("\n"),
      };
      const beforeTarget = targetWorkoutProjection(existing);
      if (canonical(beforeTarget) === canonical(afterTarget)
        && canonical(normalizedBefore) === canonical(normalizedAfter)) {
        throw new Error("repair_has_no_material_difference");
      }
      manifestWorkouts.push({
        plan_ref: ref,
        workout_ref: sha256(workoutId).slice(0, 12),
        student_id: matchedStudent.id,
        enrollment_id: enrollment.id,
        previous_marker_sha256: sha256(previousMarker),
        next_marker_sha256: sha256(nextMarker),
        before_full: beforeFull,
        before_target: beforeTarget,
        after_target: afterTarget,
        normalized_before: normalizedBefore,
        normalized_after: normalizedAfter,
      });
    }
  }

  const normalizedRows = manifestWorkouts.reduce((sum, workout) => sum + workout.normalized_before.length, 0);
  const normalizedChanges = manifestWorkouts.reduce((sum, workout) => sum
    + workout.normalized_before.filter((row, index) => canonical(row) !== canonical(workout.normalized_after[index])).length, 0);
  return {
    schema_version: 1,
    contains_private_workout_content: true,
    project_ref: EXPECTED_SUPABASE_PROJECT_REF,
    company_slug: COMPANY_SLUG,
    company_id: companyId,
    business_date: today,
    created_at: new Date().toISOString(),
    source_snapshot_sha256: createHash("sha256").update(stableStringify(mfitWorkoutsPayload)).digest("hex"),
    target_map_sha256: targetMapPayload
      ? createHash("sha256").update(stableStringify(targetMapPayload)).digest("hex")
      : null,
    plan_refs: [...refs].sort(),
    summary: {
      plans: refs.size,
      workouts: manifestWorkouts.length,
      normalized_rows: normalizedRows,
      normalized_rows_changed: normalizedChanges,
      logs: 0,
      sessions: 0,
    },
    workouts: manifestWorkouts.sort((left, right) => left.workout_ref.localeCompare(right.workout_ref)),
  };
}

function parseArgs(argv) {
  const options = { includePlanRefs: [], today: businessToday(), allowVerifiedEmptySourceSessions: false };
  const valueFlags = new Map([
    ["--mfit-clients", "mfitClients"],
    ["--target-map", "targetMap"],
    ["--mfit-workouts", "mfitWorkouts"],
    ["--sett-students", "settStudents"],
    ["--context", "context"],
    ["--catalog", "catalog"],
    ["--exercise-aliases", "exerciseAliases"],
    ["--manifest", "manifest"],
    ["--today", "today"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--allow-verified-empty-source-sessions") {
      options.allowVerifiedEmptySourceSessions = true;
      continue;
    }
    if (arg === "--include-plan-ref" || arg.startsWith("--include-plan-ref=")) {
      const value = arg.includes("=") ? arg.split("=", 2)[1] : argv[++index];
      if (!value || !REF_RE.test(value)) throw new Error("invalid_include_plan_ref");
      options.includePlanRefs.push(value);
      continue;
    }
    const [flag, inline] = arg.split("=", 2);
    const key = valueFlags.get(flag);
    if (!key) throw new Error("unknown_argument");
    const value = inline ?? argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`missing_value:${flag}`);
    options[key] = value;
  }
  options.includePlanRefs = [...new Set(options.includePlanRefs)];
  return options;
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error("private_json_input_invalid");
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  for (const key of ["mfitWorkouts", "settStudents", "context", "catalog", "exerciseAliases", "manifest"]) {
    if (!options[key]) throw new Error(`missing_required_input:${key}`);
  }
  if (!options.mfitClients && !options.targetMap) throw new Error("mfit_clients_or_preverified_target_map_required");
  const [mfitClientsPayload, targetMapPayload, mfitWorkoutsPayload, settStudentsPayload, contextPayload, catalogPayload, aliasesPayload] = await Promise.all([
    options.mfitClients ? readJson(options.mfitClients) : Promise.resolve(null),
    options.targetMap ? readJson(options.targetMap) : Promise.resolve(null),
    readJson(options.mfitWorkouts),
    readJson(options.settStudents),
    readJson(options.context),
    readJson(options.catalog),
    readJson(options.exerciseAliases),
  ]);
  const manifest = buildConflictRepairManifest({
    mfitClientsPayload,
    mfitWorkoutsPayload,
    settStudentsPayload,
    context: unwrapLinked(contextPayload, "conflict_context"),
    catalogContext: unwrapLinked(catalogPayload, "catalog_context"),
    aliasesPayload,
    targetMapPayload,
    includePlanRefs: options.includePlanRefs,
    today: options.today,
    allowVerifiedEmptySourceSessions: options.allowVerifiedEmptySourceSessions,
  });
  const outputPath = resolve(options.manifest);
  await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  await chmod(outputPath, 0o600);
  process.stdout.write(`${JSON.stringify({
    manifest_sha256: createHash("sha256").update(await readFile(outputPath)).digest("hex"),
    ...manifest.summary,
  })}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${clean(error?.message) || "conflict_repair_manifest_failed"}\n`);
    process.exitCode = 1;
  });
}
