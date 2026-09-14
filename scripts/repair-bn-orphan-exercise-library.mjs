#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_PROJECT_REF = "zshrcgbyhzxpnlccssyz";
const COMPANY_SLUG = "bn-performance-training";
const DEFAULT_AUDIT = "docs/project/AUDITORIA-2026-09-14-EXERCISE-ID-ORFAOS.json";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MUSCLES = [
  ["abdomen", "Abdômen", ["abdomen", "abdominal", "abdominais", "abs"]],
  ["quadriceps", "Quadríceps", ["quadriceps", "quadri", "reto femoral"]],
  ["posterior_de_coxa", "Posterior de coxa", ["posterior de coxa", "posterior", "posteriores", "isquiotibiais", "hamstrings"]],
  ["gluteos", "Glúteos", ["gluteo", "gluteos"]],
  ["adutores", "Adutores", ["adutor", "adutores"]],
  ["panturrilha", "Panturrilha", ["panturrilha", "panturrilhas", "gastrocnemio", "soleo"]],
  ["deltoide_lateral", "Deltoide Lateral", ["deltoide lateral", "lateral de ombro"]],
  ["deltoide_posterior", "Deltoide Posterior", ["deltoide posterior", "posterior de ombro"]],
  ["deltoide_anterior", "Deltoide Anterior", ["deltoide anterior", "anterior de ombro", "deltoide frontal"]],
  ["antebraco", "Antebraço", ["antebraco", "antebracos", "braquiorradial"]],
  ["biceps", "Biceps", ["biceps"]],
  ["triceps", "Triceps", ["triceps"]],
  ["dorsal", "Dorsal", ["dorsal", "dorsais", "costas", "latissimo", "latissimos"]],
  ["trapezio", "Trapezio", ["trapezio", "trapezios"]],
  ["peitoral", "Peitoral", ["peitoral", "peitorais", "peito", "chest"]],
];

const CATEGORIES = [
  ["core", ["core", "abdomen", "abdominal", "abdominais", "abs"]],
  ["mobilidades", ["mobilidade", "mobilidades", "alongamento", "liberacao miofascial"]],
  ["funcionais", ["funcional", "funcionais", "controle motor", "fisioterapia", "fisio", "ativacao", "estabilidade", "elasticos e faixas", "corrida", "mat pilates"]],
  ["base", ["base", "inferiores", "pernas", "geral"]],
  ["pesos_livre", ["peso livre", "pesos livre", "pesos livres"]],
  ["peso_corporal", ["peso corporal", "para fazer em casa"]],
  ["maquinas", ["maquina", "maquinas"]],
  ["pliometria", ["pliometria", "performance"]],
];

function clean(value) {
  return value == null ? "" : String(value).normalize("NFC").trim();
}

function key(value) {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function canonicalMuscle(value) {
  const normalized = key(value);
  for (const [slug, label, aliases] of MUSCLES) {
    if ([slug, label, ...aliases].some((candidate) => key(candidate) === normalized)) return { slug, label };
  }
  return null;
}

function categoryFor(item) {
  const candidates = [...(item.active_metadata?.observed_muscle_groups || []), item.canonical_name];
  for (const candidate of candidates) {
    const normalized = key(candidate);
    for (const [slug, aliases] of CATEGORIES) {
      if ([slug, ...aliases].some((alias) => key(alias) === normalized)) return slug;
    }
  }
  const name = key(item.canonical_name);
  if (/salto|jump|hop|bound|pliometr|arremesso|slam/.test(name)) return "pliometria";
  if (/mobil|along|libera|amplitude/.test(name)) return "mobilidades";
  if (/prancha|abdom|pallof|bird dog|dead bug|anti rotacao/.test(name)) return "core";
  if (/maquina|polia|cabo|leg press|cadeira|mesa flexora/.test(name)) return "maquinas";
  if (/halter|barra|kettlebell|anilha/.test(name)) return "pesos_livre";
  if (/peso corporal|bodyweight|flexao|barra fixa|solo/.test(name)) return "peso_corporal";
  if (/agach|terra|levantamento|supino|remada|puxada/.test(name)) return "base";
  return "funcionais";
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = { audit: DEFAULT_AUDIT, apply: false, batch: 0, confirmProject: "", confirmAuditSha256: "", manifest: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--audit") options.audit = argv[++index] || "";
    else if (arg === "--apply") options.apply = true;
    else if (arg === "--batch") options.batch = Number(argv[++index] || 0);
    else if (arg === "--confirm-project") options.confirmProject = argv[++index] || "";
    else if (arg === "--confirm-audit-sha256") options.confirmAuditSha256 = argv[++index] || "";
    else if (arg === "--manifest") options.manifest = argv[++index] || "";
    else if (arg === "--rollback-manifest") options.rollbackManifest = argv[++index] || "";
    else throw new Error(`unknown_argument:${arg}`);
  }
  if (options.rollbackManifest && !options.apply) throw new Error("--rollback-manifest requires --apply");
  if (options.apply) {
    if (options.confirmProject !== EXPECTED_PROJECT_REF) throw new Error(`apply requires canonical --confirm-project ${EXPECTED_PROJECT_REF}`);
    if (!/^[0-9a-f]{64}$/i.test(options.confirmAuditSha256)) throw new Error("apply requires --confirm-audit-sha256");
    if (!Number.isInteger(options.batch) || options.batch < 1) throw new Error("apply requires exactly one --batch");
  }
  return options;
}

export function validateAudit(audit, { expectedRestorableCount = 184 } = {}) {
  if (audit?.project_ref !== EXPECTED_PROJECT_REF) throw new Error("audit_project_ref_mismatch");
  if (audit?.company?.slug !== COMPANY_SLUG) throw new Error("audit_company_mismatch");
  if (audit?.contains_pii !== false) throw new Error("audit_contains_pii");
  const restorable = (audit?.items || []).filter((item) => item.classification === "restauravel");
  if (restorable.length !== expectedRestorableCount || audit?.aggregate?.classification_counts?.restauravel !== restorable.length) {
    throw new Error("audit_restauravel_count_mismatch");
  }
  if (restorable.some((item) => !UUID_RE.test(item.exercise_id) || !clean(item.canonical_name) || item.classification !== "restauravel")) {
    throw new Error("audit_non_restauravel_or_invalid_item");
  }
  return restorable;
}

export function auditScopeHash(audit) {
  const scope = (audit.items || []).filter((item) => item.classification === "restauravel").map((item) => ({
    exercise_id: item.exercise_id,
    canonical_name: item.canonical_name,
    active_impact: item.active_impact,
    active_metadata: item.active_metadata,
    exact_evidence: item.exact_evidence,
  })).sort((a, b) => a.exercise_id.localeCompare(b.exercise_id));
  return sha256(JSON.stringify(scope));
}

export function planBatches(items) {
  const batches = [];
  let current = { items: [], slot_count: 0 };
  for (const item of [...items].sort((a, b) => a.exercise_id.localeCompare(b.exercise_id))) {
    const slots = Number(item.active_impact?.slots || 0);
    if (slots < 1 || slots > 150) throw new Error(`item_exceeds_150 slots:${item.exercise_id}`);
    if (current.items.length && (current.items.length >= 25 || current.slot_count + slots > 150)) {
      batches.push(current);
      current = { items: [], slot_count: 0 };
    }
    current.items.push(item);
    current.slot_count += slots;
  }
  if (current.items.length) batches.push(current);
  return batches.map((batch, index) => ({ ...batch, number: index + 1 }));
}

export function deriveInsertPayload(item, companyId = "__TARGET_COMPANY__") {
  if (!(item.exact_evidence || []).some((evidence) => ["recording_roster", "db_snapshot", "mfit_artifact"].includes(evidence.source_type))) {
    throw new Error(`deterministic_evidence_missing:${item.exercise_id}`);
  }
  const muscles = [...new Map((item.active_metadata?.observed_muscle_groups || []).map(canonicalMuscle).filter(Boolean).map((muscle) => [muscle.slug, muscle])).values()];
  if (muscles.length > 1) throw new Error(`conflicting_canonical_muscles:${item.exercise_id}`);
  const isGlobal = item.exact_evidence.some((evidence) => evidence.source_type === "recording_roster");
  const category = categoryFor(item);
  return {
    id: item.exercise_id,
    company_id: isGlobal ? null : companyId,
    name: clean(item.canonical_name),
    description: null,
    difficulty: "intermediate",
    is_global: isGlobal,
    muscle_group: muscles[0]?.label || null,
    category,
    categories: [category],
    body_regions: [],
    muscle_targets: muscles.map((muscle) => ({ muscle_slug: muscle.slug, muscle_label: muscle.label, role: "primary", is_primary: true, volume_percentage: 100 })),
  };
}

function valuesSql(batch, payloads) {
  return batch.items.map((item, index) => {
    const payload = payloads[index];
    return `(${sqlLiteral(item.exercise_id)}::uuid, ${Number(item.active_impact.slots)}, ${sqlLiteral(JSON.stringify(payload))}::jsonb)`;
  }).join(",\n    ");
}

export function buildApplySql({ batch, payloads, auditSha256, scopeSha256, companyRef }) {
  const values = valuesSql(batch, payloads);
  return `
begin;
select pg_advisory_xact_lock(hashtextextended('sett:repair:exercise-library:${scopeSha256}', 0));
lock table public.exercise_library in share row exclusive mode;

do $repair$
declare
  v_company_id uuid;
  v_existing integer;
  v_drift integer;
  v_inserted integer;
  v_targets_inserted integer;
begin
  select id into strict v_company_id from public.companies where slug = '${COMPANY_SLUG}';
  if substr(md5(v_company_id::text), 1, 12) <> ${sqlLiteral(companyRef)} then
    raise exception 'repair_company_mismatch';
  end if;

  with expected(exercise_id, expected_slots, payload) as (values ${values})
  select count(*) into v_existing from expected join public.exercise_library lib on lib.id = expected.exercise_id;
  if v_existing <> 0 then raise exception 'repair_existing_row_diverged count=%', v_existing; end if;

  with expected(exercise_id, expected_slots, payload) as (values ${values}), actual as (
    select nullif(slot.exercise ->> 'exercise_id', '') exercise_id, count(*)::integer slots
    from public.workouts workout
    join public.training_cycles cycle on cycle.id = workout.cycle_id
    join public.companies company on company.id = workout.company_id and company.id = cycle.company_id
    cross join lateral jsonb_array_elements(case when jsonb_typeof(workout.exercises) = 'array' then workout.exercises else '[]'::jsonb end) slot(exercise)
    where company.slug = '${COMPANY_SLUG}' and workout.superseded_at is null
      and coalesce(cycle.status, '') not in ('cancelled', 'superseded') and cycle.superseded_by_cycle_id is null
      and nullif(slot.exercise ->> 'exercise_id', '') is not null
    group by 1
  )
  select count(*) into v_drift from expected left join actual on actual.exercise_id = expected.exercise_id::text where coalesce(actual.slots, 0) <> expected.expected_slots;
  if v_drift <> 0 then raise exception 'repair_active_scope_drift count=%', v_drift; end if;

  with expected(exercise_id, expected_slots, payload) as (values ${values})
  insert into public.exercise_library (id, company_id, name, description, difficulty, is_global, muscle_group, category, categories, body_regions)
  select expected.exercise_id,
    case when (payload ->> 'is_global')::boolean then null else v_company_id end,
    payload ->> 'name', nullif(payload ->> 'description', ''), payload ->> 'difficulty',
    (payload ->> 'is_global')::boolean, nullif(payload ->> 'muscle_group', ''), nullif(payload ->> 'category', ''),
    array(select jsonb_array_elements_text(payload -> 'categories')),
    array(select jsonb_array_elements_text(payload -> 'body_regions'))
  from expected on conflict (id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted <> ${batch.items.length} then raise exception 'repair_insert_count_mismatch expected=${batch.items.length} actual=%', v_inserted; end if;

  with expected(exercise_id, expected_slots, payload) as (values ${values}), targets as (
    select expected.exercise_id, target
    from expected cross join lateral jsonb_array_elements(expected.payload -> 'muscle_targets') target
  )
  insert into public.exercise_muscle_targets (exercise_id, muscle_group_id, role, is_primary, volume_percentage)
  select targets.exercise_id, groups.id, targets.target ->> 'role', (targets.target ->> 'is_primary')::boolean,
    (targets.target ->> 'volume_percentage')::numeric
  from targets join public.muscle_groups groups on lower(groups.name) = lower(case targets.target ->> 'muscle_slug'
    when 'abdomen' then 'Abdominais' when 'quadriceps' then 'Quadríceps'
    when 'posterior_de_coxa' then 'Posterior de Coxa' when 'gluteos' then 'Glúteo'
    when 'adutores' then 'Adutores' when 'panturrilha' then 'Panturrilha'
    when 'deltoide_lateral' then 'Deltoide Lateral' when 'deltoide_posterior' then 'Deltoide Posterior'
    when 'deltoide_anterior' then 'Deltoide Anterior' when 'antebraco' then 'Antebraço'
    when 'biceps' then 'Bíceps' when 'triceps' then 'Tríceps' when 'dorsal' then 'Dorsal'
    when 'trapezio' then 'Trapézio' when 'peitoral' then 'Peitoral' else null end)
  on conflict (exercise_id, muscle_group_id) do nothing;
  get diagnostics v_targets_inserted = row_count;
  if v_targets_inserted <> ${payloads.reduce((sum, payload) => sum + payload.muscle_targets.length, 0)} then
    raise exception 'repair_target_insert_count_mismatch expected=${payloads.reduce((sum, payload) => sum + payload.muscle_targets.length, 0)} actual=%', v_targets_inserted;
  end if;
end
$repair$;

with selected(exercise_id) as (values ${batch.items.map((item) => `(${sqlLiteral(item.exercise_id)}::uuid)`).join(",")}),
affected as (
  select selected.exercise_id, array_agg(distinct workout.id order by workout.id) workout_ids
  from public.workouts workout join public.training_cycles cycle on cycle.id = workout.cycle_id
  cross join lateral jsonb_array_elements(case when jsonb_typeof(workout.exercises)='array' then workout.exercises else '[]'::jsonb end) slot(exercise)
  join selected on selected.exercise_id::text = nullif(slot.exercise ->> 'exercise_id', '')
  where workout.superseded_at is null and coalesce(cycle.status,'') not in ('cancelled','superseded') and cycle.superseded_by_cycle_id is null
  group by 1
), inserted as (
  select lib.*, affected.workout_ids from public.exercise_library lib join selected on selected.exercise_id=lib.id left join affected on affected.exercise_id=lib.id
)
select jsonb_build_object(
  'project_ref', '${EXPECTED_PROJECT_REF}', 'mode', 'applied', 'batch', ${batch.number},
  'audit_sha256', '${auditSha256}', 'scope_sha256', '${scopeSha256}', 'applied_at', now(),
  'inserted_rows', jsonb_agg(jsonb_build_object('exercise_id', id, 'after_row_sha256', encode(extensions.digest((to_jsonb(inserted)-'updated_at'-'created_at'-'workout_ids')::text, 'sha256'), 'hex'), 'affected_workout_ids', workout_ids) order by id)
) as repair_result from inserted;
commit;
`;
}

export function buildRollbackSql(manifest) {
  const rows = manifest.inserted_rows || [];
  return `
begin;
select pg_advisory_xact_lock(hashtextextended('sett:repair:exercise-library:${manifest.scope_sha256 || "rollback"}', 0));
do $rollback$
declare v_changed integer; v_used integer; begin
  with expected(exercise_id, after_sha256) as (values ${rows.map((row) => `(${sqlLiteral(row.exercise_id)}::uuid, ${sqlLiteral(row.after_row_sha256)})`).join(",")})
  select count(*) into v_changed from expected join public.exercise_library lib on lib.id=expected.exercise_id
  where encode(extensions.digest((to_jsonb(lib)-'updated_at'-'created_at')::text,'sha256'),'hex') <> expected.after_sha256;
  if v_changed <> 0 then raise exception 'rollback_row_changed count=%', v_changed; end if;
  with expected(exercise_id) as (values ${rows.map((row) => `(${sqlLiteral(row.exercise_id)}::uuid)`).join(",")})
  select count(*) into v_used from expected where exists (select 1 from public.workout_logs where exercise_id=expected.exercise_id) or exists (select 1 from public.workout_sessions where exercise_id=expected.exercise_id);
  if v_used <> 0 then raise exception 'rollback_post_repair_usage count=%', v_used; end if;
  delete from public.exercise_library lib using (values ${rows.map((row) => `(${sqlLiteral(row.exercise_id)}::uuid)`).join(",")}) expected(exercise_id) where lib.id=expected.exercise_id;
end $rollback$;
commit;
`;
}

export function parseLinkedEnvelope(stdout, keyName = "repair_result") {
  const source = clean(stdout);
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("linked_query_failed:no_parseable_json");
  let payload;
  try { payload = JSON.parse(source.slice(start, end + 1)); } catch { throw new Error("linked_query_failed:no_parseable_json"); }
  const value = payload?.rows?.[0]?.[keyName];
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("linked_query_failed:unexpected_shape");
  return value;
}

function runLinked(sql) {
  const linkedRef = clean(spawnSync("cat", ["supabase/.temp/project-ref"], { encoding: "utf8" }).stdout);
  if (linkedRef !== EXPECTED_PROJECT_REF) throw new Error("linked_project_ref_mismatch");
  const result = spawnSync("supabase", ["db", "query", "--linked", "--output", "json", sql], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`linked_query_failed:${clean(result.stderr) || "unknown"}`);
  return result.stdout;
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    process.stdout.write(`Usage: node scripts/repair-bn-orphan-exercise-library.mjs [--audit FILE] [--apply --batch N --confirm-project ${EXPECTED_PROJECT_REF} --confirm-audit-sha256 SHA --manifest FILE]\n`);
    return;
  }
  const auditBytes = await readFile(options.audit);
  const auditSha256 = sha256(auditBytes);
  const audit = JSON.parse(auditBytes.toString("utf8"));
  const items = validateAudit(audit);
  const scopeSha256 = auditScopeHash(audit);
  const batches = planBatches(items);
  if (!options.apply) {
    process.stdout.write(`${JSON.stringify({ mode: "dry-run", audit_sha256: auditSha256, scope_sha256: scopeSha256, restorable_ids: items.length, restorable_slots: items.reduce((sum, item) => sum + item.active_impact.slots, 0), batches: batches.map((batch) => ({ batch: batch.number, ids: batch.items.length, slots: batch.slot_count })) }, null, 2)}\n`);
    return;
  }
  if (auditSha256 !== options.confirmAuditSha256) throw new Error("confirmed_audit_sha256_mismatch");
  const batch = batches[options.batch - 1];
  if (!batch) throw new Error("batch_out_of_range");
  const payloads = batch.items.map((item) => deriveInsertPayload(item));
  const sql = buildApplySql({ batch, payloads, auditSha256, scopeSha256, companyRef: audit.company.company_ref });
  const manifest = parseLinkedEnvelope(runLinked(sql));
  if ((manifest.inserted_rows || []).length !== batch.items.length) throw new Error("post_apply_manifest_count_mismatch");
  if (options.manifest) {
    await writeFile(options.manifest, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    await chmod(options.manifest, 0o600);
  }
  process.stdout.write(`${JSON.stringify({ mode: "applied", batch: batch.number, inserted: manifest.inserted_rows.length, manifest: options.manifest || null }, null, 2)}\n`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((error) => { process.stderr.write(`${clean(error?.message) || "repair_failed"}\n`); process.exitCode = 1; });
