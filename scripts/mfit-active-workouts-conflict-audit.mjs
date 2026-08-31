#!/usr/bin/env node

import { readFile, writeFile, chmod } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
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

const ACTIVE_ENROLLMENT_STATUSES = ["active", "awaiting_training", "awaiting_renewal"];
const REF_RE = /^[0-9a-f]{12}$/;

function clean(value) {
  return value === null || value === undefined ? "" : String(value).normalize("NFC").trim();
}

function normalizedName(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
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
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function unwrapLinked(path, key) {
  return readJson(path).then((payload) => {
    const value = payload?.rows?.[0]?.[key];
    if (!value || typeof value !== "object") throw new Error(`${key} linked payload is invalid`);
    return value;
  });
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error("A required private JSON input is unreadable or invalid");
  }
}

function parseArgs(argv) {
  const options = { includePlanRefs: [], today: businessToday() };
  const valueFlags = new Map([
    ["--mfit-clients", "mfitClients"],
    ["--mfit-workouts", "mfitWorkouts"],
    ["--sett-students", "settStudents"],
    ["--context", "context"],
    ["--catalog", "catalog"],
    ["--exercise-aliases", "exerciseAliases"],
    ["--report", "report"],
    ["--today", "today"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--include-plan-ref" || arg.startsWith("--include-plan-ref=")) {
      const value = arg.includes("=") ? arg.split("=", 2)[1] : argv[++index];
      if (!value || !REF_RE.test(value)) throw new Error("--include-plan-ref must be a 12-character sanitized ref");
      options.includePlanRefs.push(value);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    const [flag, inline] = arg.split("=", 2);
    const key = valueFlags.get(flag);
    if (!key) throw new Error("Unknown command-line argument");
    const value = inline ?? argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    options[key] = value;
  }
  options.includePlanRefs = [...new Set(options.includePlanRefs)];
  if (options.includePlanRefs.length < 1 || options.includePlanRefs.length > 20) {
    throw new Error("Conflict audit requires 1-20 explicit plan refs");
  }
  if (!parseYmd(options.today)) throw new Error("--today must use YYYY-MM-DD");
  return options;
}

export function planRef(plan) {
  return sha256([IMPORT_VERSION, plan.client_id || plan.input_index, plan.source_id].join("\u0000")).slice(0, 12);
}

export function chooseEnrollment(rows) {
  const priority = new Map(ACTIVE_ENROLLMENT_STATUSES.map((status, index) => [status, index]));
  return [...rows]
    .map((row) => ({ ...row, status: clean(row.status).toLocaleLowerCase("pt-BR") }))
    .filter((row) => priority.has(row.status))
    .sort((a, b) => priority.get(a.status) - priority.get(b.status)
      || clean(b.created_at).localeCompare(clean(a.created_at)))[0] || null;
}

export function resolveExerciseId(catalog, companyId, exercise, aliases) {
  const name = normalizedName(exercise.name);
  const own = catalog.filter((row) => row.company_id === companyId
    && row.is_global !== true && normalizedName(row.name) === name);
  const exact = own.length ? own : catalog.filter((row) => row.is_global === true && normalizedName(row.name) === name);
  if (exact.length === 1) return exact[0].id;
  const alias = aliases.get(name);
  if (!alias) throw new Error("Conflict audit found unresolved exercise catalog coverage");
  const target = catalog.filter((row) => row.id === alias.target_exercise_id)
    .filter((row) => row.is_global === true || row.company_id === companyId);
  if (target.length !== 1 || normalizedName(target[0].name) !== normalizedName(alias.target_name)) {
    throw new Error("Conflict audit found an invalid exercise alias target");
  }
  return target[0].id;
}

export function projectedExercise(exercise, exerciseId) {
  return {
    exercise_id: exerciseId,
    exercise_name: exercise.name,
    muscle_group: exercise.muscle_group,
    sets: exercise.sets,
    reps: exercise.reps,
    rest: exercise.rest,
    notes: exercise.notes,
    video_url: exercise.video_url || null,
    video_path: null,
    thumbnail_url: exercise.thumbnail_url || null,
    ...(exercise.method ? { method: exercise.method } : {}),
    ...(exercise.group_id ? { group_id: exercise.group_id } : {}),
    ...(exercise.method_seconds ? { method_seconds: exercise.method_seconds } : {}),
    ...(exercise.tempo ? { tempo: exercise.tempo } : {}),
    ...(exercise.load ? { load: exercise.load } : {}),
    ...(exercise.mfit_protocol?.length ? { mfit_protocol: exercise.mfit_protocol } : {}),
    ...(exercise.rir ? { rir: exercise.rir } : {}),
    ...(exercise.set_types?.length ? { set_types: exercise.set_types } : {}),
  };
}

const EXERCISE_FIELD_GROUPS = {
  structure: ["exercise_id", "exercise_name"],
  prescription: ["sets", "reps", "rest", "load", "notes"],
  method: ["method", "group_id", "method_seconds", "tempo", "mfit_protocol", "rir", "set_types"],
  media: ["video_url", "video_path", "thumbnail_url"],
  metadata: ["muscle_group"],
};

function valuesEqual(left, right) {
  return stableStringify(left ?? null) === stableStringify(right ?? null);
}

function exerciseDiffs(existing, expected) {
  const counts = { structure: 0, prescription: 0, method: 0, media: 0, metadata: 0 };
  const length = Math.max(existing.length, expected.length);
  for (let index = 0; index < length; index += 1) {
    const current = existing[index];
    const next = expected[index];
    if (!current || !next) {
      counts.structure += 1;
      continue;
    }
    for (const [group, fields] of Object.entries(EXERCISE_FIELD_GROUPS)) {
      if (fields.some((field) => !valuesEqual(current[field], next[field]))) counts[group] += 1;
    }
  }
  return counts;
}

export function sourceSessionNotes(notes) {
  const lines = clean(notes).split("\n");
  return lines[0]?.startsWith("mfit-import:v1:") ? lines.slice(1).join("\n") : clean(notes);
}

function analyzePlan({ plan, ref, student, matchMethod, context, catalog, companyId, aliases, today }) {
  const enrollments = context.enrollments.filter((row) => row.student_id === student.id);
  const enrollment = chooseEnrollment(enrollments);
  if (!enrollment) return { ref, status: "blocked", reason: "no_current_enrollment" };
  const cycles = context.cycles.filter((row) => row.enrollment_id === enrollment.id);
  const covering = cycles.filter((row) => clean(row.status).toLocaleLowerCase("pt-BR") === "active"
    && row.start_date <= today && today <= row.end_date);
  if (covering.length !== 1) {
    return { ref, status: "blocked", reason: "active_covering_cycle_not_unique", active_covering_cycles: covering.length };
  }
  const cycle = covering[0];
  const durationWeeks = Math.max(1, Number(plan.duration_weeks) || 6);
  const startDate = plan.start_date || today;
  const endDate = plan.end_date && plan.end_date >= startDate ? plan.end_date : addDays(startDate, durationWeeks * 7 - 1);
  const normalizedPlan = {
    source_id: plan.source_id,
    name: plan.name,
    objective: plan.objective,
    start_date: startDate,
    end_date: endDate,
    sessions: plan.sessions,
  };
  const currentMarker = sha256(stableStringify(normalizedPlan));
  const existingWorkouts = context.workouts.filter((row) => row.cycle_id === cycle.id);
  const usageByWorkout = new Map(context.usage.map((row) => [row.workout_id, row]));
  const workoutDiffs = [];
  for (let index = 0; index < plan.sessions.length; index += 1) {
    const session = plan.sessions[index];
    const id = deterministicUuid(IMPORT_VERSION, "workout", cycle.id, session.source_id, index);
    const existing = existingWorkouts.find((row) => row.id === id);
    if (!existing) {
      workoutDiffs.push({
        missing_workout: true,
        metadata_fields: 0,
        exercise_diffs: { structure: session.exercises.length, prescription: 0, method: 0, media: 0, metadata: 0 },
        logs: 0,
        sessions: 0,
      });
      continue;
    }
    const expectedExercises = session.exercises.map((exercise) => projectedExercise(
      exercise,
      resolveExerciseId(catalog, companyId, exercise, aliases),
    ));
    const metadataFields = [
      [existing.name, session.name],
      [existing.title, session.name],
      [existing.description, session.description || session.notes || null],
      [existing.day_of_week, session.day_of_week],
      [sourceSessionNotes(existing.notes), session.notes],
    ].filter(([left, right]) => !valuesEqual(left, right)).length;
    const usage = usageByWorkout.get(id) || {};
    workoutDiffs.push({
      missing_workout: false,
      metadata_fields: metadataFields,
      exercise_diffs: exerciseDiffs(Array.isArray(existing.exercises) ? existing.exercises : [], expectedExercises),
      logs: Number(usage.logs) || 0,
      sessions: Number(usage.sessions) || 0,
      previous_marker_matches_current: clean(existing.notes).split("\n")[0] === `mfit-import:v1:${currentMarker}`,
    });
  }
  const summed = workoutDiffs.reduce((acc, row) => {
    acc.missing_workouts += row.missing_workout ? 1 : 0;
    acc.metadata_fields += row.metadata_fields;
    acc.logs += row.logs;
    acc.sessions += row.sessions;
    for (const key of Object.keys(acc.exercise_diffs)) acc.exercise_diffs[key] += row.exercise_diffs[key];
    return acc;
  }, {
    missing_workouts: 0,
    metadata_fields: 0,
    logs: 0,
    sessions: 0,
    exercise_diffs: { structure: 0, prescription: 0, method: 0, media: 0, metadata: 0 },
  });
  const markerMatches = workoutDiffs.filter((row) => row.previous_marker_matches_current).length;
  return {
    ref,
    status: "audited",
    reason: null,
    match_method: matchMethod,
    target: sha256(student.id).slice(0, 12),
    source_capture_complete: plan.source_capture_complete === true,
    source_sessions: plan.sessions.length,
    source_empty_sessions: plan.source_empty_session_count,
    existing_expected_workouts: plan.sessions.length - summed.missing_workouts,
    current_marker_workouts: markerMatches,
    usage: { logs: summed.logs, sessions: summed.sessions },
    differences: {
      missing_workouts: summed.missing_workouts,
      workout_metadata_fields: summed.metadata_fields,
      ...summed.exercise_diffs,
    },
  };
}

export async function runAudit(options) {
  const [mfitClientsPayload, mfitWorkoutsPayload, settStudentsPayload, context, catalogContext, aliasesPayload] = await Promise.all([
    readJson(options.mfitClients),
    readJson(options.mfitWorkouts),
    readJson(options.settStudents),
    unwrapLinked(options.context, "conflict_context"),
    unwrapLinked(options.catalog, "catalog_context"),
    readJson(options.exerciseAliases),
  ]);
  const clients = normalizeMfitClients(mfitClientsPayload);
  const students = normalizeSettStudents(settStudentsPayload);
  const matches = matchMfitClientsToSett(clients, students, { identityContactOnly: true });
  const clientsById = new Map(clients.map((client) => [client.source_id, client]));
  const refs = new Set(options.includePlanRefs);
  const plans = normalizeMfitPlans(mfitWorkoutsPayload)
    .map((plan) => ({ plan, ref: planRef(plan) }))
    .filter((row) => refs.has(row.ref));
  if (plans.length !== refs.size) throw new Error("Not every requested conflict ref exists in the source snapshot");
  const aliases = buildExerciseAliasIndex(aliasesPayload);
  const results = plans.map(({ plan, ref }) => {
    const client = clientsById.get(plan.client_id);
    const match = client ? matches.get(client.source_id) : null;
    if (!match?.student) return { ref, status: "blocked", reason: "identity_match_missing" };
    return analyzePlan({
      plan,
      ref,
      student: match.student,
      matchMethod: match.method,
      context,
      catalog: catalogContext.catalog,
      companyId: catalogContext.company_id,
      aliases,
      today: options.today,
    });
  }).sort((a, b) => a.ref.localeCompare(b.ref));
  const summary = {
    requested: refs.size,
    audited: results.filter((row) => row.status === "audited").length,
    blocked: results.filter((row) => row.status === "blocked").length,
    source_sessions: results.reduce((sum, row) => sum + (row.source_sessions || 0), 0),
    existing_expected_workouts: results.reduce((sum, row) => sum + (row.existing_expected_workouts || 0), 0),
    current_marker_workouts: results.reduce((sum, row) => sum + (row.current_marker_workouts || 0), 0),
    logs: results.reduce((sum, row) => sum + (row.usage?.logs || 0), 0),
    sessions: results.reduce((sum, row) => sum + (row.usage?.sessions || 0), 0),
  };
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    contains_pii: false,
    mode: "read-only-conflict-audit",
    summary,
    results,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write("Usage: node scripts/mfit-active-workouts-conflict-audit.mjs --mfit-clients <private.json> --mfit-workouts <private.json> --sett-students <private.json> --context <private-linked.json> --catalog <private-linked.json> --exercise-aliases <json> --include-plan-ref <12-char-ref>... --report <private.json> [--today YYYY-MM-DD]\n");
    return 0;
  }
  for (const key of ["mfitClients", "mfitWorkouts", "settStudents", "context", "catalog", "exerciseAliases", "report"]) {
    if (!options[key]) throw new Error(`Missing required input: ${key}`);
  }
  const report = await runAudit(options);
  const outputPath = resolve(options.report);
  await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await chmod(outputPath, 0o600);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write("MFIT conflict audit failed; no private input was printed.\n");
    process.exitCode = 1;
  });
}
