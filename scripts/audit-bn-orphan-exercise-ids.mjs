#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const EXPECTED_PROJECT_REF = "zshrcgbyhzxpnlccssyz";
const COMPANY_SLUG = "bn-performance-training";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SOURCE_TRUST = {
  current_library: 100,
  recording_roster: 90,
  db_snapshot: 80,
  mfit_artifact: 70,
};

function clean(value) {
  return value === null || value === undefined ? "" : String(value).normalize("NFC").trim();
}

function normalizeName(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error(`${label} is not valid readable JSON`);
  }
}

export function parseArgs(argv) {
  const options = {
    report: "",
    markdown: "",
    fixture: "",
    roster: "docs/project/gravacao/codigo-para-exercicio.json",
    mfitArtifacts: [
      "docs/project/mfit-exercise-aliases.v1.json",
      "docs/project/mfit-exact-duplicate-evidence.v1.json",
      "docs/project/mfit-linked-own-video-alias-evidence.v1.json",
      "docs/project/mfit-low-no-candidate-qa-ledger.v1.json",
      "docs/project/mfit-medium-evidence-queue.v1.json",
    ],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--report") options.report = argv[++index] || "";
    else if (arg === "--markdown") options.markdown = argv[++index] || "";
    else if (arg === "--fixture") options.fixture = argv[++index] || "";
    else if (arg === "--roster") options.roster = argv[++index] || "";
    else if (arg === "--mfit-artifact") options.mfitArtifacts.push(argv[++index] || "");
    else if (arg === "--apply") throw new Error("This audit is read-only; --apply is forbidden");
    else throw new Error(`unknown_argument:${arg}`);
  }
  if (!options.help && !options.report) throw new Error("--report is required");
  options.mfitArtifacts = [...new Set(options.mfitArtifacts.filter(Boolean))];
  return options;
}

function buildProductionSql() {
  return `
with target_company as (
  select id, slug, name
  from public.companies
  where slug = '${COMPANY_SLUG}'
  limit 1
), active_slots as (
  select
    nullif(slot.exercise ->> 'exercise_id', '') as exercise_id,
    nullif(slot.exercise ->> 'exercise_name', '') as exercise_name,
    nullif(slot.exercise ->> 'name', '') as alternate_name,
    nullif(slot.exercise ->> 'muscle_group', '') as muscle_group,
    substr(md5(cycle.student_id::text), 1, 12) as student_ref,
    substr(md5(cycle.enrollment_id::text), 1, 12) as enrollment_ref,
    substr(md5(cycle.id::text), 1, 12) as cycle_ref,
    substr(md5(workout.id::text), 1, 12) as workout_ref,
    slot.ordinality::integer - 1 as exercise_index,
    cycle.status as cycle_status,
    cycle.delivery_status,
    cycle.start_date,
    cycle.end_date,
    case
      when cycle.start_date <= public.current_business_date()
       and cycle.end_date >= public.current_business_date()
       and cycle.status = 'active'
      then 'current_active_window'
      when cycle.start_date > public.current_business_date() then 'future_visible'
      when cycle.end_date < public.current_business_date() then 'historical_visible'
      else 'visible_non_current'
    end as cycle_visibility,
    case when workout.superseded_at is null then 'current_workout' else 'superseded_workout' end as workout_visibility,
    split_part(coalesce(workout.notes, ''), E'\\n', 1) like 'mfit-import:v1:%' as mfit_tagged
  from public.workouts workout
  join public.training_cycles cycle on cycle.id = workout.cycle_id
  join target_company company on company.id = workout.company_id and company.id = cycle.company_id
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(workout.exercises) = 'array' then workout.exercises else '[]'::jsonb end
  ) with ordinality as slot(exercise, ordinality)
  where workout.superseded_at is null
    and coalesce(cycle.status, '') not in ('cancelled', 'superseded')
    and cycle.superseded_by_cycle_id is null
    and nullif(slot.exercise ->> 'exercise_id', '') is not null
    and not exists (
      select 1
      from public.exercise_library library
      where library.id::text = nullif(slot.exercise ->> 'exercise_id', '')
    )
), missing_ids as (
  select distinct exercise_id from active_slots
), library_rows as (
  select
    library.id::text as exercise_id,
    jsonb_build_object(
      'source_type', 'current_library',
      'exercise_id', library.id::text,
      'name', library.name,
      'name_normalized', lower(regexp_replace(coalesce(library.name, ''), '\\s+', ' ', 'g')),
      'tenant_visibility', case
        when library.is_global is true then 'global'
        when library.company_id = (select id from target_company) then 'tenant'
        else 'other_tenant'
      end,
      'company_ref', case when library.company_id is null then null else substr(md5(library.company_id::text), 1, 12) end,
      'muscle_group', library.muscle_group,
      'equipment', library.equipment,
      'is_global', library.is_global
    ) as evidence
  from public.exercise_library library
  join missing_ids missing on missing.exercise_id = library.id::text
), historical_workout_slots as (
  select
    nullif(slot.exercise ->> 'exercise_id', '') as exercise_id,
    jsonb_build_object(
      'source_type', 'db_snapshot',
      'source_table', 'workouts',
      'source_scope', case
        when workout.superseded_at is not null then 'superseded_workout'
        when coalesce(cycle.status, '') in ('cancelled', 'superseded') or cycle.superseded_by_cycle_id is not null then 'non_visible_cycle'
        else 'other_workout_slot'
      end,
      'exercise_name', coalesce(nullif(slot.exercise ->> 'exercise_name', ''), nullif(slot.exercise ->> 'name', '')),
      'muscle_group', nullif(slot.exercise ->> 'muscle_group', ''),
      'mfit_tagged', split_part(coalesce(workout.notes, ''), E'\\n', 1) like 'mfit-import:v1:%',
      'cycle_ref', substr(md5(cycle.id::text), 1, 12),
      'workout_ref', substr(md5(workout.id::text), 1, 12),
      'exercise_index', slot.ordinality::integer - 1,
      'cycle_status', cycle.status,
      'workout_visibility', case when workout.superseded_at is null then 'current_workout' else 'superseded_workout' end
    ) as evidence
  from public.workouts workout
  join public.training_cycles cycle on cycle.id = workout.cycle_id
  join target_company company on company.id = workout.company_id and company.id = cycle.company_id
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(workout.exercises) = 'array' then workout.exercises else '[]'::jsonb end
  ) with ordinality as slot(exercise, ordinality)
  join missing_ids missing on missing.exercise_id = nullif(slot.exercise ->> 'exercise_id', '')
  where workout.superseded_at is not null
     or coalesce(cycle.status, '') in ('cancelled', 'superseded')
     or cycle.superseded_by_cycle_id is not null
), revision_audit_slots as (
  select
    nullif(slot.exercise ->> 'exercise_id', '') as exercise_id,
    jsonb_build_object(
      'source_type', 'db_snapshot',
      'source_table', 'workout_revision_repair_audit',
      'repair_key', audit.repair_key,
      'exercise_name', coalesce(nullif(slot.exercise ->> 'exercise_name', ''), nullif(slot.exercise ->> 'name', '')),
      'muscle_group', nullif(slot.exercise ->> 'muscle_group', ''),
      'cycle_ref', substr(md5(audit.cycle_id::text), 1, 12),
      'workout_ref', substr(md5(audit.workout_id::text), 1, 12),
      'exercise_index', slot.ordinality::integer - 1,
      'before_sha256', audit.before_sha256
    ) as evidence
  from public.workout_revision_repair_audit audit
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(audit.before_row -> 'exercises') = 'array' then audit.before_row -> 'exercises' else '[]'::jsonb end
  ) with ordinality as slot(exercise, ordinality)
  join missing_ids missing on missing.exercise_id = nullif(slot.exercise ->> 'exercise_id', '')
), archive_event_slots as (
  select
    nullif(slot.exercise ->> 'exercise_id', '') as exercise_id,
    jsonb_build_object(
      'source_type', 'db_snapshot',
      'source_table', 'workout_archive_events',
      'action', event.action,
      'exercise_name', coalesce(nullif(slot.exercise ->> 'exercise_name', ''), nullif(slot.exercise ->> 'name', '')),
      'muscle_group', nullif(slot.exercise ->> 'muscle_group', ''),
      'cycle_ref', substr(md5(event.cycle_id::text), 1, 12),
      'workout_ref', substr(md5(event.workout_id::text), 1, 12),
      'exercise_index', slot.ordinality::integer - 1
    ) as evidence
  from public.workout_archive_events event
  join target_company company on company.id = event.company_id
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(event.workout_snapshot -> 'exercises') = 'array' then event.workout_snapshot -> 'exercises' else '[]'::jsonb end
  ) with ordinality as slot(exercise, ordinality)
  join missing_ids missing on missing.exercise_id = nullif(slot.exercise ->> 'exercise_id', '')
), clear_event_workouts as (
  select
    event.id,
    event.cycle_id,
    workout.item as workout_snapshot
  from public.cycle_prescription_clear_events event
  join target_company company on company.id = event.company_id
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(event.workout_snapshot) = 'array' then event.workout_snapshot else '[]'::jsonb end
  ) as workout(item)
), clear_event_slots as (
  select
    nullif(slot.exercise ->> 'exercise_id', '') as exercise_id,
    jsonb_build_object(
      'source_type', 'db_snapshot',
      'source_table', 'cycle_prescription_clear_events',
      'event_ref', substr(md5(clear_event.id::text), 1, 12),
      'exercise_name', coalesce(nullif(slot.exercise ->> 'exercise_name', ''), nullif(slot.exercise ->> 'name', '')),
      'muscle_group', nullif(slot.exercise ->> 'muscle_group', ''),
      'cycle_ref', substr(md5(clear_event.cycle_id::text), 1, 12),
      'workout_ref', substr(md5((clear_event.workout_snapshot ->> 'id')), 1, 12),
      'exercise_index', slot.ordinality::integer - 1
    ) as evidence
  from clear_event_workouts clear_event
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(clear_event.workout_snapshot -> 'exercises') = 'array' then clear_event.workout_snapshot -> 'exercises' else '[]'::jsonb end
  ) with ordinality as slot(exercise, ordinality)
  join missing_ids missing on missing.exercise_id = nullif(slot.exercise ->> 'exercise_id', '')
), ref_repair_before as (
  select
    audit.old_exercise_id as exercise_id,
    jsonb_build_object(
      'source_type', 'db_snapshot',
      'source_table', 'workout_exercise_ref_repair_audit',
      'repair_key', audit.repair_key,
      'state', audit.state,
      'exercise_name', audit.exercise_name,
      'new_exercise_id', audit.new_exercise_id::text,
      'workout_ref', substr(md5(audit.workout_id::text), 1, 12),
      'exercise_index', audit.exercise_index
    ) as evidence
  from public.workout_exercise_ref_repair_audit audit
  join missing_ids missing on missing.exercise_id = audit.old_exercise_id
), all_db_evidence as (
  select * from library_rows
  union all select * from historical_workout_slots
  union all select * from revision_audit_slots
  union all select * from archive_event_slots
  union all select * from clear_event_slots
  union all select * from ref_repair_before
)
select jsonb_build_object(
  'schema_version', 1,
  'project_ref', '${EXPECTED_PROJECT_REF}',
  'company', (select jsonb_build_object('slug', slug, 'name', name, 'company_ref', substr(md5(id::text), 1, 12)) from target_company),
  'queried_at', now(),
  'active_slots', coalesce((select jsonb_agg(to_jsonb(active_slots) order by exercise_id, cycle_ref, workout_ref, exercise_index) from active_slots), '[]'::jsonb),
  'db_evidence', coalesce((select jsonb_agg(jsonb_build_object('exercise_id', exercise_id, 'evidence', evidence) order by exercise_id, evidence ->> 'source_table') from all_db_evidence), '[]'::jsonb)
) as audit;
`;
}

export function parseLinkedEnvelope(stdout) {
  let payload;
  try {
    const text = clean(stdout);
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd <= jsonStart) throw new Error("missing_json");
    payload = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  } catch {
    throw new Error("production_read_failed:no_parseable_json");
  }
  const audit = payload?.rows?.[0]?.audit;
  if (!audit || typeof audit !== "object" || Array.isArray(audit)) {
    throw new Error("production_read_failed:unexpected_shape");
  }
  return audit;
}

export async function loadProductionAudit({ spawnSyncImpl = spawnSync, readFileImpl = readFile } = {}) {
  const linkedProjectRef = clean(await readFileImpl("supabase/.temp/project-ref", "utf8"));
  if (linkedProjectRef !== EXPECTED_PROJECT_REF) {
    throw new Error("linked_project_ref_mismatch");
  }
  const result = spawnSyncImpl(
    "supabase",
    ["db", "query", "--linked", "--output", "json", buildProductionSql()],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.status !== 0) {
    throw new Error("production_read_failed:no_raw_rows_printed");
  }
  return parseLinkedEnvelope(result.stdout);
}

function rosterEvidence(roster, missingIds) {
  const rows = [];
  for (const [code, entry] of Object.entries(roster || {})) {
    const exerciseId = clean(entry?.id);
    if (!missingIds.has(exerciseId)) continue;
    rows.push({
      exercise_id: exerciseId,
      evidence: {
        source_type: "recording_roster",
        source_file: "docs/project/gravacao/codigo-para-exercicio.json",
        code,
        name: clean(entry?.nome),
      },
    });
  }
  return rows;
}

function selectedSafeFields(value) {
  const fields = [
    "id",
    "exercise_id",
    "target_exercise_id",
    "name",
    "nome",
    "target_name",
    "source_name",
    "decision",
    "evidence_source",
    "source_media_reference",
    "rationale",
  ];
  const out = {};
  for (const field of fields) {
    if (value && Object.hasOwn(value, field)) out[field] = value[field];
  }
  return out;
}

function scanJsonForIds(value, missingIds, sourceFile, path = "$", parent = null, output = []) {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanJsonForIds(item, missingIds, sourceFile, `${path}[${index}]`, parent, output));
    return output;
  }
  const ownValues = Object.values(value).map(clean);
  const directIds = ownValues.filter((item) => missingIds.has(item));
  if (directIds.length) {
    const safe = { ...selectedSafeFields(parent), ...selectedSafeFields(value) };
    for (const exerciseId of [...new Set(directIds)]) {
      output.push({
        exercise_id: exerciseId,
        evidence: {
          source_type: "mfit_artifact",
          source_file: sourceFile,
          json_path_hash: sha256(path).slice(0, 16),
          ...safe,
        },
      });
    }
  }
  for (const [key, child] of Object.entries(value)) {
    scanJsonForIds(child, missingIds, sourceFile, `${path}.${key}`, value, output);
  }
  return output;
}

async function localArtifactEvidence(options, missingIds) {
  const [roster, ...mfitPayloads] = await Promise.all([
    readJson(options.roster, "recording roster"),
    ...options.mfitArtifacts.map((path) => readJson(path, `MFIT artifact ${path}`).then((payload) => ({ path, payload }))),
  ]);
  const rows = rosterEvidence(roster, missingIds);
  for (const { path, payload } of mfitPayloads) {
    rows.push(...scanJsonForIds(payload, missingIds, path));
  }
  return rows;
}

function evidenceName(evidence) {
  return clean(evidence.name)
    || clean(evidence.nome)
    || clean(evidence.target_name)
    || clean(evidence.exercise_name)
    || clean(evidence.source_name);
}

function evidenceKey(evidence) {
  return sha256(JSON.stringify(evidence)).slice(0, 16);
}

function summarizeSlots(slots) {
  const cycles = new Set();
  const students = new Set();
  const enrollments = new Set();
  const workouts = new Set();
  const cycleStatuses = {};
  const cycleVisibility = {};
  let mfitTaggedSlots = 0;
  for (const slot of slots) {
    if (slot.cycle_ref) cycles.add(slot.cycle_ref);
    if (slot.student_ref) students.add(slot.student_ref);
    if (slot.enrollment_ref) enrollments.add(slot.enrollment_ref);
    if (slot.workout_ref) workouts.add(slot.workout_ref);
    if (slot.cycle_status) cycleStatuses[slot.cycle_status] = (cycleStatuses[slot.cycle_status] || 0) + 1;
    if (slot.cycle_visibility) cycleVisibility[slot.cycle_visibility] = (cycleVisibility[slot.cycle_visibility] || 0) + 1;
    if (slot.mfit_tagged) mfitTaggedSlots += 1;
  }
  return {
    slots: slots.length,
    cycles: cycles.size,
    students: students.size,
    enrollments: enrollments.size,
    workouts: workouts.size,
    mfit_tagged_slots: mfitTaggedSlots,
    cycle_statuses: cycleStatuses,
    cycle_visibility: cycleVisibility,
  };
}

function classifyEvidence(evidenceRows) {
  const exact = evidenceRows
    .map((row) => row.evidence)
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      ...item,
      exact_name: evidenceName(item),
      exact_name_normalized: normalizeName(evidenceName(item)),
      trust: SOURCE_TRUST[item.source_type] || 0,
    }))
    .filter((item) => item.exact_name_normalized);
  const deduped = [];
  const seen = new Set();
  for (const item of exact.sort((a, b) => b.trust - a.trust || clean(a.source_type).localeCompare(clean(b.source_type)))) {
    const key = evidenceKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  const names = [...new Set(deduped.map((item) => item.exact_name_normalized))];
  if (!deduped.length) {
    return { classification: "sem_fonte", reason: "no_deterministic_source_for_missing_id", exact_evidence: [] };
  }
  if (names.length > 1) {
    return {
      classification: "candidato_ambiguo",
      reason: "conflicting_exact_names_for_same_missing_id",
      exact_evidence: deduped.slice(0, 12),
      conflicting_names: names,
    };
  }
  return {
    classification: "restauravel",
    reason: "single_exact_identity_across_deterministic_sources",
    canonical_name: deduped[0].exact_name,
    exact_evidence: deduped.slice(0, 12),
  };
}

export function buildReport(productionAudit, localEvidenceRows = []) {
  if (Number(productionAudit?.schema_version) !== 1) throw new Error("unsupported_production_audit_schema");
  if (productionAudit.project_ref !== EXPECTED_PROJECT_REF) throw new Error("project_ref_mismatch");
  const activeSlots = safeArray(productionAudit.active_slots);
  const missingIds = [...new Set(activeSlots.map((slot) => clean(slot.exercise_id)).filter(Boolean))].sort();
  const slotsById = new Map(missingIds.map((id) => [id, []]));
  for (const slot of activeSlots) {
    const id = clean(slot.exercise_id);
    if (slotsById.has(id)) slotsById.get(id).push(slot);
  }
  const evidenceById = new Map(missingIds.map((id) => [id, []]));
  for (const row of [...safeArray(productionAudit.db_evidence), ...localEvidenceRows]) {
    const id = clean(row.exercise_id);
    if (evidenceById.has(id)) evidenceById.get(id).push(row);
  }

  const items = missingIds.map((exerciseId) => {
    const slots = slotsById.get(exerciseId) || [];
    const evidenceRows = evidenceById.get(exerciseId) || [];
    return {
      exercise_id: exerciseId,
      active_impact: summarizeSlots(slots),
      active_metadata: {
        observed_names: [...new Set(slots.map((slot) => clean(slot.exercise_name) || clean(slot.alternate_name)).filter(Boolean))].sort(),
        observed_muscle_groups: [...new Set(slots.map((slot) => clean(slot.muscle_group)).filter(Boolean))].sort(),
        tenant_visibility: "bn-performance-training/current-visible-workouts",
      },
      ...classifyEvidence(evidenceRows),
    };
  });
  const classificationCounts = {};
  for (const item of items) {
    classificationCounts[item.classification] = (classificationCounts[item.classification] || 0) + 1;
  }
  const bySource = {};
  for (const item of items) {
    for (const evidence of item.exact_evidence || []) {
      bySource[evidence.source_type] = (bySource[evidence.source_type] || 0) + 1;
    }
  }
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    mode: "read-only",
    contains_pii: false,
    project_ref: productionAudit.project_ref,
    company: productionAudit.company,
    source_hashes: {
      production_payload_sha256: sha256(JSON.stringify(productionAudit)),
      local_evidence_sha256: sha256(JSON.stringify(localEvidenceRows)),
    },
    aggregate: {
      ...summarizeSlots(activeSlots),
      distinct_missing_exercise_ids: missingIds.length,
      classification_counts: classificationCounts,
      exact_evidence_rows_by_source: bySource,
    },
    items,
    batch_plan: {
      safe_next_batch: "Only IDs classified as restauravel, grouped by deterministic source and canonical_name, with a hard cap of 25 IDs or 150 active slots per batch.",
      preflight: [
        "BEGIN READ ONLY audit must match this report hash for active slots and evidence.",
        "Re-query exercise_library by ID and abort if any target already exists with divergent metadata.",
        "Refuse IDs classified as candidato_ambiguo or sem_fonte.",
        "Create a before-image manifest with exercise_id, canonical_name, source evidence hashes, affected slot counts, and library insert payloads.",
      ],
      apply_boundary: [
        "No workout JSON update in this phase.",
        "No training_cycle/workout visibility change.",
        "Insert-only exercise_library restoration after explicit approval, with tenant/global visibility chosen from source evidence.",
      ],
      rollback: [
        "Delete only newly inserted exercise_library rows whose IDs match the batch manifest and have no new workout_logs/workout_sessions references after apply.",
        "If any row has post-apply usage, roll back by disabling visibility/marking curated status only through an approved follow-up plan, not by deleting history.",
        "Keep audit manifest immutable; compare-and-swap on exact inserted row JSON before rollback.",
      ],
    },
  };
}

function markdownReport(report) {
  const counts = report.aggregate.classification_counts;
  const sourceCounts = report.aggregate.exact_evidence_rows_by_source;
  const risks = [];
  if ((counts.candidato_ambiguo || 0) > 0) risks.push("IDs ambíguos existem e não podem entrar em lote automático.");
  if ((counts.sem_fonte || 0) > 0) risks.push("IDs sem fonte determinística exigem curadoria/manual evidence, não restauração.");
  if (!risks.length) risks.push("Risco principal é drift de produção entre auditoria e aplicação futura.");
  return `# Auditoria BN de exercise_id órfãos - 2026-09-14

## Veredito

Auditoria determinística, read-only e pseudonimizada gerada contra produção. Não houve escrita remota, alteração de workouts, deploy, commit ou push.

## Contagens

- Slots ativos afetados: ${report.aggregate.slots}
- IDs únicos ausentes: ${report.aggregate.distinct_missing_exercise_ids}
- Ciclos afetados: ${report.aggregate.cycles}
- Alunos afetados: ${report.aggregate.students}
- Matrículas afetadas: ${report.aggregate.enrollments}
- Workouts afetados: ${report.aggregate.workouts}
- Restauráveis: ${counts.restauravel || 0}
- Candidatos ambíguos: ${counts.candidato_ambiguo || 0}
- Sem fonte: ${counts.sem_fonte || 0}

## Fontes

- Biblioteca atual: ${sourceCounts.current_library || 0} evidências
- Roster de gravação: ${sourceCounts.recording_roster || 0} evidências
- Snapshots/revisões/arquivos do banco: ${sourceCounts.db_snapshot || 0} evidências
- Artefatos MFIT locais: ${sourceCounts.mfit_artifact || 0} evidências

## Tenant e visibilidade

Tenant: \`${report.company?.slug || COMPANY_SLUG}\` (${report.company?.company_ref || "sem-ref"}). Os slots vêm de workouts atuais não superseded e ciclos visíveis não cancelados/superseded. Visibilidade por janela:

\`\`\`json
${JSON.stringify(report.aggregate.cycle_visibility, null, 2)}
\`\`\`

## Riscos

${risks.map((risk) => `- ${risk}`).join("\n")}

## Próximo lote seguro

${report.batch_plan.safe_next_batch}

Pré-flight obrigatório:
${report.batch_plan.preflight.map((item) => `- ${item}`).join("\n")}

Rollback:
${report.batch_plan.rollback.map((item) => `- ${item}`).join("\n")}

## Artefato completo

O JSON ao lado contém a classificação por \`exercise_id\`, impacto pseudonimizado, metadados disponíveis e evidências exatas sem nomes de alunos, telefones ou secrets.
`;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write("Usage: node scripts/audit-bn-orphan-exercise-ids.mjs --report <json> [--markdown <md>] [--fixture <json>]\n");
    return 0;
  }
  const productionAudit = options.fixture
    ? await readJson(options.fixture, "audit fixture")
    : await loadProductionAudit();
  const missingIds = new Set(safeArray(productionAudit.active_slots).map((slot) => clean(slot.exercise_id)).filter(Boolean));
  const localEvidence = await localArtifactEvidence(options, missingIds);
  const report = buildReport(productionAudit, localEvidence);
  await mkdir(dirname(resolve(options.report)), { recursive: true });
  await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await chmod(options.report, 0o600);
  if (options.markdown) {
    await mkdir(dirname(resolve(options.markdown)), { recursive: true });
    await writeFile(options.markdown, markdownReport(report), { mode: 0o644 });
  }
  process.stdout.write(`${JSON.stringify({
    report: options.report,
    markdown: options.markdown || null,
    slots: report.aggregate.slots,
    missing_ids: report.aggregate.distinct_missing_exercise_ids,
    classifications: report.aggregate.classification_counts,
    contains_pii: report.contains_pii,
  }, null, 2)}\n`);
  return 0;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    process.stderr.write(`${clean(error?.message) || "audit_failed"}\n`);
    process.exitCode = 1;
  });
}
