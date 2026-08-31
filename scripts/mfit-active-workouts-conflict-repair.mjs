#!/usr/bin/env node

import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { chmod, copyFile, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { EXPECTED_SUPABASE_PROJECT_REF, stableStringify } from "./mfit-active-workouts-migration.mjs";

const COMPANY_SLUG = "bn-performance-training";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_RE = /^[0-9a-f]{64}$/;
const REF_RE = /^[0-9a-f]{12}$/;

function clean(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function markerHash(notes) {
  return sha256(clean(notes).split("\n")[0]);
}

function assertSameIdentities(beforeRows, afterRows) {
  if (beforeRows.length !== afterRows.length) throw new Error("normalized_row_count_changed");
  for (let index = 0; index < beforeRows.length; index += 1) {
    const before = beforeRows[index];
    const after = afterRows[index];
    if (!UUID_RE.test(clean(before?.id)) || clean(before?.id) !== clean(after?.id)
      || clean(before?.workout_id) !== clean(after?.workout_id)
      || Number(before?.exercise_order) !== Number(after?.exercise_order)) {
      throw new Error("normalized_row_identity_changed");
    }
  }
}

export function validateRepairManifest(manifest) {
  if (Number(manifest?.schema_version) !== 1) throw new Error("unsupported_manifest_schema");
  if (manifest?.contains_private_workout_content !== true) throw new Error("private_manifest_marker_required");
  if (clean(manifest?.project_ref) !== EXPECTED_SUPABASE_PROJECT_REF) throw new Error("project_ref_mismatch");
  if (clean(manifest?.company_slug) !== COMPANY_SLUG || !UUID_RE.test(clean(manifest?.company_id))) {
    throw new Error("company_boundary_invalid");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(manifest?.business_date))) throw new Error("business_date_invalid");
  if (!SHA_RE.test(clean(manifest?.source_snapshot_sha256))) throw new Error("source_snapshot_hash_invalid");
  if (!Array.isArray(manifest?.plan_refs) || manifest.plan_refs.length < 1 || manifest.plan_refs.length > 5
    || manifest.plan_refs.some((ref) => !REF_RE.test(clean(ref)))
    || new Set(manifest.plan_refs).size !== manifest.plan_refs.length) {
    throw new Error("plan_ref_scope_invalid");
  }
  if (manifest.target_map_sha256 !== null && manifest.target_map_sha256 !== undefined
    && !SHA_RE.test(clean(manifest.target_map_sha256))) throw new Error("target_map_hash_invalid");
  if (!Array.isArray(manifest?.workouts) || manifest.workouts.length < 1 || manifest.workouts.length > 20) {
    throw new Error("workout_scope_invalid");
  }
  const workoutIds = new Set();
  let normalizedRows = 0;
  let normalizedChanges = 0;
  for (const item of manifest.workouts) {
    if (!REF_RE.test(clean(item?.plan_ref)) || !REF_RE.test(clean(item?.workout_ref))) {
      throw new Error("sanitized_ref_invalid");
    }
    if (!manifest.plan_refs.includes(item.plan_ref)) throw new Error("workout_plan_ref_out_of_scope");
    if (!SHA_RE.test(clean(item?.previous_marker_sha256)) || !SHA_RE.test(clean(item?.next_marker_sha256))) {
      throw new Error("marker_hash_invalid");
    }
    const before = item?.before_full;
    const beforeTarget = item?.before_target;
    const afterTarget = item?.after_target;
    const workoutId = clean(before?.id);
    if (!UUID_RE.test(workoutId) || workoutIds.has(workoutId)) throw new Error("workout_identity_invalid");
    workoutIds.add(workoutId);
    if (!UUID_RE.test(clean(item?.student_id)) || !UUID_RE.test(clean(item?.enrollment_id))) {
      throw new Error("student_enrollment_scope_invalid");
    }
    if (clean(before?.company_id) !== clean(manifest.company_id)
      || clean(beforeTarget?.id) !== workoutId || clean(afterTarget?.id) !== workoutId
      || clean(beforeTarget?.cycle_id) !== clean(before?.cycle_id)
      || clean(afterTarget?.cycle_id) !== clean(before?.cycle_id)
      || clean(beforeTarget?.company_id) !== clean(manifest.company_id)
      || clean(afterTarget?.company_id) !== clean(manifest.company_id)) {
      throw new Error("workout_boundary_mismatch");
    }
    if (clean(before?.created_at) !== clean(before?.updated_at)) throw new Error("workout_not_pristine_import");
    if (markerHash(before?.notes) !== clean(item.previous_marker_sha256)
      || markerHash(afterTarget?.notes) !== clean(item.next_marker_sha256)) {
      throw new Error("marker_snapshot_mismatch");
    }
    const beforeRows = item?.normalized_before;
    const afterRows = item?.normalized_after;
    if (!Array.isArray(beforeRows) || !Array.isArray(afterRows)) throw new Error("normalized_rows_invalid");
    assertSameIdentities(beforeRows, afterRows);
    if (beforeRows.some((row) => clean(row.workout_id) !== workoutId)) throw new Error("normalized_workout_scope_mismatch");
    normalizedRows += beforeRows.length;
    normalizedChanges += beforeRows.filter((row, index) => stableStringify(row) !== stableStringify(afterRows[index])).length;
    if (stableStringify(beforeTarget) === stableStringify(afterTarget)
      && stableStringify(beforeRows) === stableStringify(afterRows)) {
      throw new Error("workout_has_no_repair_difference");
    }
  }
  if (Number(manifest?.summary?.plans) !== manifest.plan_refs.length
    || Number(manifest?.summary?.workouts) !== manifest.workouts.length
    || Number(manifest?.summary?.normalized_rows) !== normalizedRows
    || Number(manifest?.summary?.normalized_rows_changed) !== normalizedChanges
    || Number(manifest?.summary?.logs) !== 0
    || Number(manifest?.summary?.sessions) !== 0) {
    throw new Error("manifest_summary_mismatch");
  }
  return {
    plans: manifest.plan_refs.length,
    workouts: manifest.workouts.length,
    normalized_rows: normalizedRows,
    normalized_rows_changed: normalizedChanges,
  };
}

const workoutFullSql = (alias) => `jsonb_build_object(
  'id', ${alias}.id,
  'cycle_id', ${alias}.cycle_id,
  'company_id', ${alias}.company_id,
  'name', ${alias}.name,
  'title', ${alias}.title,
  'description', ${alias}.description,
  'day_of_week', ${alias}.day_of_week,
  'sort_order', ${alias}.sort_order,
  'exercises', coalesce(${alias}.exercises, '[]'::jsonb),
  'notes', ${alias}.notes,
  'created_at', ${alias}.created_at,
  'created_by', ${alias}.created_by,
  'updated_at', ${alias}.updated_at
)`;

const workoutTargetSql = (alias) => `jsonb_build_object(
  'id', ${alias}.id,
  'cycle_id', ${alias}.cycle_id,
  'company_id', ${alias}.company_id,
  'name', ${alias}.name,
  'title', ${alias}.title,
  'description', ${alias}.description,
  'day_of_week', ${alias}.day_of_week,
  'sort_order', ${alias}.sort_order,
  'exercises', coalesce(${alias}.exercises, '[]'::jsonb),
  'notes', ${alias}.notes,
  'created_at', ${alias}.created_at,
  'created_by', ${alias}.created_by
)`;

const normalizedSql = (workoutIdSql) => `coalesce((
  select jsonb_agg(jsonb_build_object(
    'id', we.id,
    'workout_id', we.workout_id,
    'exercise_id', we.exercise_id,
    'exercise_name', we.exercise_name,
    'exercise_order', coalesce(we.exercise_order, 0),
    'sets', coalesce(we.sets, 0),
    'reps', we.reps,
    'rest_seconds', coalesce(we.rest_seconds, 0),
    'notes', we.notes,
    'created_at', we.created_at
  ) order by coalesce(we.exercise_order, 0), we.id)
  from public.workout_exercises we
  where we.workout_id = ${workoutIdSql}
), '[]'::jsonb)`;

function manifestSqlLiteral(manifest) {
  return `convert_from(decode('${Buffer.from(JSON.stringify(manifest)).toString("base64")}', 'base64'), 'UTF8')::jsonb`;
}

export function buildDryRunSql(manifest) {
  const literal = manifestSqlLiteral(manifest);
  return `with manifest as (
  select ${literal} as value
), items as (
  select item
  from manifest cross join lateral jsonb_array_elements(value->'workouts') item
), live as (
  select
    item,
    workout.id,
    ${workoutFullSql("workout")} as full_projection,
    ${workoutTargetSql("workout")} as target_projection,
    ${normalizedSql("workout.id")} as normalized_projection,
    (select count(*) from public.workout_logs log where log.workout_id = workout.id) as logs,
    (select count(*) from public.workout_sessions session where session.workout_id = workout.id) as sessions
  from items
  left join public.workouts workout
    on workout.id = (item->'before_full'->>'id')::uuid
   and workout.company_id = (select (value->>'company_id')::uuid from manifest)
)
select jsonb_build_object(
  'expected_workouts', (select jsonb_array_length(value->'workouts') from manifest),
  'workouts_found', count(id),
  'exact_before', count(*) filter (where full_projection = item->'before_full' and normalized_projection = item->'normalized_before'),
  'exact_after', count(*) filter (where target_projection = item->'after_target' and normalized_projection = item->'normalized_after'),
  'logs', coalesce(sum(logs), 0),
  'sessions', coalesce(sum(sessions), 0),
  'eligible_scope', count(*) filter (where exists (
    select 1
    from public.training_cycles cycle
    join public.enrollments enrollment on enrollment.id = cycle.enrollment_id
    join public.students student on student.id = enrollment.student_id
    where cycle.id = (item->'before_full'->>'cycle_id')::uuid
      and enrollment.id = (item->>'enrollment_id')::uuid
      and student.id = (item->>'student_id')::uuid
      and cycle.company_id = (select (value->>'company_id')::uuid from manifest)
      and enrollment.company_id = cycle.company_id
      and student.company_id = cycle.company_id
      and cycle.status = 'active'
      and enrollment.status in ('active', 'awaiting_training', 'awaiting_renewal')
      and student.status in ('active', 'awaiting_renewal')
      and cycle.start_date <= (select (value->>'business_date')::date from manifest)
      and cycle.end_date >= (select (value->>'business_date')::date from manifest)
  )),
  'company_boundary', (select count(*) from public.companies company
    where company.id = (select (value->>'company_id')::uuid from manifest)
      and company.slug = '${COMPANY_SLUG}')
) as result
from live;`;
}

export function buildApplySql(manifest) {
  const literal = manifestSqlLiteral(manifest);
  const expectedWorkouts = manifest.workouts.length;
  const expectedRows = manifest.summary.normalized_rows;
  return `begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
select pg_advisory_xact_lock(hashtextextended('sett:mfit-conflict-repair:v1', 0));
lock table public.students, public.enrollments, public.training_cycles, public.workouts,
  public.workout_exercises, public.workout_logs, public.workout_sessions in share row exclusive mode;
create temp table mfit_conflict_manifest (value jsonb not null) on commit drop;
insert into mfit_conflict_manifest values (${literal});
do $mfit_conflict_repair$
declare
  v_manifest jsonb;
  v_count integer;
  v_affected integer;
begin
  select value into v_manifest from mfit_conflict_manifest;
  if jsonb_array_length(v_manifest->'workouts') <> ${expectedWorkouts} then
    raise exception 'mfit_conflict_manifest_scope_mismatch';
  end if;
  if (select count(*) from public.companies company
      where company.id = (v_manifest->>'company_id')::uuid and company.slug = '${COMPANY_SLUG}') <> 1 then
    raise exception 'mfit_conflict_company_boundary_mismatch';
  end if;
  select count(*)::integer into v_count
  from jsonb_array_elements(v_manifest->'workouts') item
  join public.training_cycles cycle on cycle.id = (item->'before_full'->>'cycle_id')::uuid
  join public.enrollments enrollment on enrollment.id = cycle.enrollment_id
  join public.students student on student.id = enrollment.student_id
  where enrollment.id = (item->>'enrollment_id')::uuid
    and student.id = (item->>'student_id')::uuid
    and cycle.company_id = (v_manifest->>'company_id')::uuid
    and enrollment.company_id = cycle.company_id
    and student.company_id = cycle.company_id
    and cycle.status = 'active'
    and enrollment.status in ('active', 'awaiting_training', 'awaiting_renewal')
    and student.status in ('active', 'awaiting_renewal')
    and cycle.start_date <= (v_manifest->>'business_date')::date
    and cycle.end_date >= (v_manifest->>'business_date')::date;
  if v_count <> ${expectedWorkouts} then
    raise exception 'mfit_conflict_live_eligibility_changed expected=% actual=%', ${expectedWorkouts}, v_count;
  end if;
  select count(*)::integer into v_count
  from jsonb_array_elements(v_manifest->'workouts') item
  join public.workouts workout
    on workout.id = (item->'before_full'->>'id')::uuid
   and workout.company_id = (v_manifest->>'company_id')::uuid
  where ${workoutFullSql("workout")} = item->'before_full'
    and ${normalizedSql("workout.id")} = item->'normalized_before';
  if v_count <> ${expectedWorkouts} then
    raise exception 'mfit_conflict_before_image_changed expected=% actual=%', ${expectedWorkouts}, v_count;
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_manifest->'workouts') item
    where exists (select 1 from public.workout_logs log where log.workout_id = (item->'before_full'->>'id')::uuid)
       or exists (select 1 from public.workout_sessions session where session.workout_id = (item->'before_full'->>'id')::uuid)
  ) then
    raise exception 'mfit_conflict_new_usage_detected';
  end if;

  update public.workouts workout
  set
    name = item->'after_target'->>'name',
    title = item->'after_target'->>'title',
    description = item->'after_target'->>'description',
    day_of_week = (item->'after_target'->>'day_of_week')::integer,
    exercises = item->'after_target'->'exercises',
    notes = item->'after_target'->>'notes'
  from jsonb_array_elements(v_manifest->'workouts') item
  where workout.id = (item->'before_full'->>'id')::uuid
    and workout.company_id = (v_manifest->>'company_id')::uuid;
  get diagnostics v_affected = row_count;
  if v_affected <> ${expectedWorkouts} then
    raise exception 'mfit_conflict_workout_update_count_mismatch expected=% actual=%', ${expectedWorkouts}, v_affected;
  end if;

  update public.workout_exercises exercise
  set
    exercise_id = case
      when desired.row->>'exercise_id' is null then null
      else (desired.row->>'exercise_id')::uuid
    end,
    exercise_name = desired.row->>'exercise_name',
    exercise_order = (desired.row->>'exercise_order')::integer,
    sets = (desired.row->>'sets')::integer,
    reps = desired.row->>'reps',
    rest_seconds = (desired.row->>'rest_seconds')::integer,
    notes = desired.row->>'notes'
  from (
    select normalized_row as row
    from jsonb_array_elements(v_manifest->'workouts') item
    cross join lateral jsonb_array_elements(item->'normalized_after') normalized_row
  ) desired
  where exercise.id = (desired.row->>'id')::uuid
    and exercise.workout_id = (desired.row->>'workout_id')::uuid;
  get diagnostics v_affected = row_count;
  if v_affected <> ${expectedRows} then
    raise exception 'mfit_conflict_normalized_update_count_mismatch expected=% actual=%', ${expectedRows}, v_affected;
  end if;

  select count(*)::integer into v_count
  from jsonb_array_elements(v_manifest->'workouts') item
  join public.workouts workout on workout.id = (item->'before_full'->>'id')::uuid
  where ${workoutTargetSql("workout")} = item->'after_target'
    and ${normalizedSql("workout.id")} = item->'normalized_after';
  if v_count <> ${expectedWorkouts} then
    raise exception 'mfit_conflict_post_image_mismatch expected=% actual=%', ${expectedWorkouts}, v_count;
  end if;
end
$mfit_conflict_repair$;
commit;
select jsonb_build_object(
  'status', 'applied',
  'workouts', ${expectedWorkouts},
  'normalized_rows', ${expectedRows},
  'post_audit_passes', 1
) as result;`;
}

export function parseAuditResult(result, expected) {
  const safe = {
    expected_workouts: Number(result?.expected_workouts) || 0,
    workouts_found: Number(result?.workouts_found) || 0,
    exact_before: Number(result?.exact_before) || 0,
    exact_after: Number(result?.exact_after) || 0,
    logs: Number(result?.logs) || 0,
    sessions: Number(result?.sessions) || 0,
    company_boundary: Number(result?.company_boundary) || 0,
    eligible_scope: Number(result?.eligible_scope) || 0,
  };
  if (safe.expected_workouts !== expected.workouts || safe.workouts_found !== expected.workouts
    || safe.company_boundary !== 1 || safe.eligible_scope !== expected.workouts
    || safe.logs !== 0 || safe.sessions !== 0) {
    throw new Error("live_repair_gate_failed");
  }
  if (safe.exact_after === expected.workouts) return { status: "already_applied", ...safe };
  if (safe.exact_before === expected.workouts) return { status: "planned", ...safe };
  throw new Error("live_before_image_changed");
}

function parseEnvelope(stdout) {
  try {
    const envelope = JSON.parse(clean(stdout));
    const result = envelope?.rows?.findLast?.((row) => row?.result)?.result
      || [...(envelope?.rows || [])].reverse().find((row) => row?.result)?.result;
    if (!result || typeof result !== "object") throw new Error("missing_result");
    return result;
  } catch {
    throw new Error("linked_query_result_invalid");
  }
}

function runLinkedSql(sql, spawnSyncImpl = spawnSync) {
  const result = spawnSyncImpl("supabase", ["db", "query", "--linked", "--output", "json", sql], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) throw new Error("linked_query_failed_without_raw_output");
  return parseEnvelope(result.stdout);
}

function parseArgs(argv) {
  const options = { apply: false, manifest: "", report: "", backup: "", confirmProject: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") options.apply = true;
    else if (["--manifest", "--report", "--backup", "--confirm-project"].includes(arg)) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      options[key] = argv[++index] || "";
    } else throw new Error("unknown_argument");
  }
  return options;
}

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(argv);
  if (!options.manifest || !options.report) throw new Error("manifest_and_report_required");
  const linkedProjectRef = clean(await readFile("supabase/.temp/project-ref", "utf8"));
  if (linkedProjectRef !== EXPECTED_SUPABASE_PROJECT_REF) throw new Error("canonical_link_required");
  if (options.apply && clean(options.confirmProject) !== EXPECTED_SUPABASE_PROJECT_REF) {
    throw new Error("confirm_project_required");
  }
  if (options.apply && !options.backup) throw new Error("private_backup_required");
  const manifestBytes = await readFile(options.manifest);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const expected = validateRepairManifest(manifest);
  const manifestSha = sha256(manifestBytes);
  const runSql = dependencies.runLinkedSql || runLinkedSql;
  const preflight = parseAuditResult(runSql(buildDryRunSql(manifest)), expected);
  let result = preflight;
  let backupSha = null;
  if (options.apply && preflight.status === "planned") {
    await copyFile(options.manifest, options.backup, constants.COPYFILE_EXCL);
    await chmod(options.backup, 0o600);
    backupSha = sha256(await readFile(options.backup));
    if (backupSha !== manifestSha) throw new Error("backup_hash_mismatch");
    const applied = runSql(buildApplySql(manifest));
    if (clean(applied?.status) !== "applied"
      || Number(applied?.workouts) !== expected.workouts
      || Number(applied?.normalized_rows) !== expected.normalized_rows) {
      throw new Error("apply_result_invalid");
    }
    const postOne = parseAuditResult(runSql(buildDryRunSql(manifest)), expected);
    const postTwo = parseAuditResult(runSql(buildDryRunSql(manifest)), expected);
    if (postOne.status !== "already_applied" || postTwo.status !== "already_applied") {
      throw new Error("post_audit_target_mismatch");
    }
    result = { status: "applied", ...expected, post_audit_passes: 2 };
  }
  const report = {
    schema_version: 1,
    created_at: new Date().toISOString(),
    contains_pii: false,
    mode: options.apply ? "apply" : "dry-run",
    project_ref: linkedProjectRef,
    manifest_sha256: manifestSha,
    backup_sha256: backupSha,
    result,
  };
  await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await chmod(options.report, 0o600);
  process.stdout.write(`${JSON.stringify({ mode: report.mode, ...result })}\n`);
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${clean(error?.message) || "mfit_conflict_repair_failed"}\n`);
    process.exitCode = 1;
  });
}
