#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_SUPABASE_PROJECT_REF,
  runMigration,
} from "./mfit-active-workouts-migration.mjs";

const COMPANY_SLUG = "bn-performance-training";
const READONLY_ERROR = "linked read-only dry-run adapter forbids database writes";

function cleanText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function asRows(value, label) {
  if (!Array.isArray(value)) throw new Error(`Linked snapshot is missing ${label}`);
  return value;
}

function filterByIds(rows, column, ids) {
  const wanted = new Set(ids.filter(Boolean));
  return rows.filter((row) => wanted.has(row?.[column]));
}

export function createLinkedReadonlyAdapter(snapshot) {
  const students = asRows(snapshot?.students, "students");
  const enrollments = asRows(snapshot?.enrollments, "enrollments");
  const cycles = asRows(snapshot?.cycles, "cycles");
  const workouts = asRows(snapshot?.workouts, "workouts");
  const exercises = asRows(snapshot?.exercises, "exercises");
  const workoutExercises = asRows(snapshot?.workout_exercises, "workout_exercises");
  const normalizedAvailable = snapshot?.normalized_support?.available === true;
  const normalizedHasId = snapshot?.normalized_support?.has_id === true;
  const rejectWrite = async () => {
    throw new Error(READONLY_ERROR);
  };

  return {
    normalizedSupport: { available: normalizedAvailable, has_id: normalizedHasId },
    async getStudentsByIds(ids) {
      return filterByIds(students, "id", ids);
    },
    async getEnrollments(studentIds) {
      return filterByIds(enrollments, "student_id", studentIds);
    },
    async getCycles(enrollmentIds) {
      return filterByIds(cycles, "enrollment_id", enrollmentIds);
    },
    async getCyclesByIds(ids) {
      return filterByIds(cycles, "id", ids);
    },
    async getWorkouts(cycleIds) {
      return filterByIds(workouts, "cycle_id", cycleIds);
    },
    async getWorkoutsByIds(ids) {
      return filterByIds(workouts, "id", ids);
    },
    async getExercises(companyIds) {
      const allowedCompanies = new Set(companyIds.filter(Boolean));
      return exercises.filter((row) => row?.is_global === true || allowedCompanies.has(row?.company_id));
    },
    async getExercisesByIds(ids) {
      return filterByIds(exercises, "id", ids);
    },
    async getWorkoutExercises(workoutIds) {
      return normalizedAvailable ? filterByIds(workoutExercises, "workout_id", workoutIds) : [];
    },
    insertCycles: rejectWrite,
    insertWorkouts: rejectWrite,
    insertExercises: rejectWrite,
    insertWorkoutExercises: rejectWrite,
  };
}

export function parseLinkedEnvelope(stdout) {
  let envelope;
  try {
    envelope = JSON.parse(cleanText(stdout));
  } catch {
    throw new Error("Linked production snapshot could not be parsed; no raw rows were printed");
  }
  const snapshot = envelope?.rows?.[0]?.snapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("Linked production snapshot returned an unexpected shape");
  }
  return snapshot;
}

export function loadLinkedProductionSnapshot({ spawnSyncImpl = spawnSync } = {}) {
  const sql = `
with target_company as (
  select id, slug
  from public.companies
  where slug = '${COMPANY_SLUG}'
  limit 1
), active_students as (
  select s.id, s.company_id, s.user_id, s.full_name, s.email, s.phone, s.whatsapp, s.status
  from public.students s
  join target_company c on c.id = s.company_id
  where s.status in ('active', 'awaiting_renewal')
), company_enrollments as (
  select e.id, e.student_id, e.company_id, e.status, e.created_at
  from public.enrollments e
  join target_company c on c.id = e.company_id
), company_cycles as (
  select tc.id, tc.enrollment_id, tc.student_id, tc.company_id, tc.cycle_number,
         tc.start_date, tc.end_date, tc.status, tc.name, tc.objective,
         tc.duration_weeks, tc.delivery_status
  from public.training_cycles tc
  join target_company c on c.id = tc.company_id
), company_workouts as (
  select w.id, w.cycle_id, w.company_id, w.name, w.title, w.description,
         w.day_of_week, w.sort_order, w.exercises, w.notes
  from public.workouts w
  join target_company c on c.id = w.company_id
), visible_exercises as (
  select el.id, el.company_id, el.name, el.description, el.muscle_group, el.equipment, el.is_global
  from public.exercise_library el
  where el.is_global = true
     or el.company_id = (select id from target_company)
), normalized_schema as (
  select
    to_regclass('public.workout_exercises') is not null as available,
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'workout_exercises'
        and column_name = 'id'
    ) as has_id
), normalized_rows as (
  select jsonb_build_object(
    'id', to_jsonb(we) -> 'id',
    'workout_id', we.workout_id,
    'exercise_id', we.exercise_id,
    'exercise_name', we.exercise_name,
    'exercise_order', we.exercise_order,
    'sets', we.sets,
    'reps', we.reps,
    'rest_seconds', we.rest_seconds,
    'notes', we.notes
  ) as payload
  from public.workout_exercises we
  join company_workouts w on w.id = we.workout_id
)
select jsonb_build_object(
  'company', (select to_jsonb(c) from target_company c),
  'students', coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from active_students s), '[]'::jsonb),
  'enrollments', coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from company_enrollments e), '[]'::jsonb),
  'cycles', coalesce((select jsonb_agg(to_jsonb(tc) order by tc.id) from company_cycles tc), '[]'::jsonb),
  'workouts', coalesce((select jsonb_agg(to_jsonb(w) order by w.id) from company_workouts w), '[]'::jsonb),
  'exercises', coalesce((select jsonb_agg(to_jsonb(el) order by el.id) from visible_exercises el), '[]'::jsonb),
  'workout_exercises', coalesce((select jsonb_agg(we.payload order by we.payload ->> 'workout_id', (we.payload ->> 'exercise_order')::integer) from normalized_rows we), '[]'::jsonb),
  'normalized_support', (select to_jsonb(ns) from normalized_schema ns)
) as snapshot;
`;
  const result = spawnSyncImpl(
    "supabase",
    ["db", "query", "--linked", "--output", "json", sql],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.status !== 0) {
    throw new Error("Linked production snapshot failed; no raw rows were printed");
  }
  return parseLinkedEnvelope(result.stdout);
}

export function parseArgs(argv) {
  const options = {
    mfitClients: "",
    mfitWorkouts: "",
    exerciseAliases: "",
    report: "",
    allowVerifiedEmptySourceSessions: false,
    createNewCycleOnAmbiguousEmpty: false,
    mergeOverlapIntoActiveCycle: false,
    createPendingCycleOnOverlap: false,
  };
  const valueFlags = new Map([
    ["--mfit-clients", "mfitClients"],
    ["--mfit-workouts", "mfitWorkouts"],
    ["--exercise-aliases", "exerciseAliases"],
    ["--report", "report"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--allow-verified-empty-source-sessions") {
      options.allowVerifiedEmptySourceSessions = true;
      continue;
    }
    if (arg === "--create-new-cycle-on-ambiguous-empty") {
      options.createNewCycleOnAmbiguousEmpty = true;
      continue;
    }
    if (arg === "--merge-overlap-into-active-cycle") {
      options.mergeOverlapIntoActiveCycle = true;
      continue;
    }
    if (arg === "--create-pending-cycle-on-overlap") {
      options.createPendingCycleOnOverlap = true;
      continue;
    }
    if (arg === "--apply") throw new Error("Linked mode is dry-run only; --apply is forbidden");
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    const [flag, inlineValue] = arg.split("=", 2);
    const key = valueFlags.get(flag);
    if (!key) throw new Error("Unknown command-line argument");
    const value = inlineValue ?? argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    options[key] = value;
  }
  return options;
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error(`${label} is not valid readable JSON`);
  }
}

function businessToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write("Usage: node scripts/mfit-active-workouts-linked-dry-run.mjs --mfit-clients <json> --mfit-workouts <json> [--exercise-aliases <json>] [--allow-verified-empty-source-sessions] [--create-new-cycle-on-ambiguous-empty] [--merge-overlap-into-active-cycle] [--create-pending-cycle-on-overlap] [--report <json>]\n");
    return 0;
  }
  if (!options.mfitClients || !options.mfitWorkouts) {
    throw new Error("--mfit-clients and --mfit-workouts are required");
  }
  const linkedProjectRef = cleanText(await readFile("supabase/.temp/project-ref", "utf8"));
  if (linkedProjectRef !== EXPECTED_SUPABASE_PROJECT_REF) {
    throw new Error("Supabase CLI is not linked to the canonical SETT project");
  }
  const [mfitClientsPayload, mfitWorkoutsPayload, exerciseAliasPayload] = await Promise.all([
    readJson(options.mfitClients, "MFIT clients input"),
    readJson(options.mfitWorkouts, "MFIT workouts input"),
    options.exerciseAliases
      ? readJson(options.exerciseAliases, "MFIT exercise aliases input")
      : Promise.resolve({ schema_version: 1, contains_pii: false, aliases: [] }),
  ]);
  const snapshot = loadLinkedProductionSnapshot();
  const companyId = cleanText(snapshot?.company?.id);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(companyId)) {
    throw new Error("Canonical BN company was not found in the linked snapshot");
  }
  const report = await runMigration({
    settPayload: snapshot.students,
    mfitClientsPayload,
    mfitWorkoutsPayload,
    exerciseAliasPayload,
    db: createLinkedReadonlyAdapter(snapshot),
    companyId,
    apply: false,
    partitionCompletePlans: true,
    identityContactOnly: true,
    exerciseSimilarityFallback: true,
    createMissingExerciseTargets: false,
    createNewCycleOnAmbiguousEmpty: options.createNewCycleOnAmbiguousEmpty,
    mergeOverlapIntoActiveCycle: options.mergeOverlapIntoActiveCycle,
    createPendingCycleOnOverlap: options.createPendingCycleOnOverlap,
    allowVerifiedEmptySourceSessions: options.allowVerifiedEmptySourceSessions,
    includePlanRefs: [],
    today: businessToday(),
    defaultDurationWeeks: 6,
  });
  if (options.report) {
    await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await chmod(options.report, 0o600);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return 0;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main()
    .then((code) => { process.exitCode = code; })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : "MFIT linked dry-run failed"}\n`);
      process.exitCode = 1;
    });
}
