#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const EXPECTED_PROJECT_REF = "zshrcgbyhzxpnlccssyz";
export const BN_COMPANY_ID = "dad65c62-e700-4ae9-930a-43b18357c171";
export const MAX_MISSING_EXERCISE_IDS = 50;
export const REPAIR_KEY = "bn_template_exercise_refs_20260914";
export const PRIVATE_OUTPUT_DIR = "/Users/macbookpro/.codex/private/sett-template-exercise-references";

const CANONICAL_MUSCLE_GROUP_IDS = new Map([
  ["Dorsal", "613809f7-2188-49cb-ba31-e406e8742104"],
  ["Deltoide Posterior", "64d81d34-cb15-44d0-b460-5cd209c664e3"],
  ["Glúteos", "5cbe97cd-5ae8-4fbe-9f30-5b37203a19d5"],
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BROAD_CATEGORY_KEYS = new Set([
  "base",
  "basico",
  "composto",
  "compostos",
  "estabilidade",
  "funcional",
  "funcionais",
  "fisioterapia",
  "fisio",
  "mobilidade",
  "mobilidades",
  "peso corporal",
  "bodyweight",
  "calistenia",
  "maquina",
  "maquinas",
  "polia",
  "cabo",
  "pesos livre",
  "pesos livres",
  "peso livre",
  "halteres",
  "barra",
  "alongamento",
  "pliometria",
]);

function clean(value) {
  return value === null || value === undefined ? "" : String(value).normalize("NFC").trim();
}

export function normalizeVisibleName(value) {
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

function stableJson(value) {
  return JSON.stringify(sortJson(value));
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
}

export function deterministicUuid(...parts) {
  const hash = createHash("sha256").update(parts.map(clean).join("\u001f")).digest();
  const bytes = Uint8Array.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function jsonSql(value) {
  return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
}

function extractExercises(workouts) {
  const slots = [];
  if (!Array.isArray(workouts)) return slots;
  workouts.forEach((workout, workoutIndex) => {
    const exercises = Array.isArray(workout?.exercises) ? workout.exercises : [];
    exercises.forEach((exercise, exerciseIndex) => {
      if (!exercise || typeof exercise !== "object" || Array.isArray(exercise)) return;
      const oldExerciseId = clean(exercise.exercise_id || exercise.id);
      if (!UUID_RE.test(oldExerciseId)) return;
      slots.push({
        workoutIndex,
        exerciseIndex,
        oldExerciseId: oldExerciseId.toLowerCase(),
        exercise,
        name: clean(exercise.exercise_name || exercise.name),
        sourceGroup: clean(exercise.muscle_group || exercise.group || exercise.category),
        sourceCategory: clean(exercise.category || exercise.type),
        sourceVideoUrl: clean(exercise.video_url || exercise.videoUrl || exercise.video_path || exercise.videoPath),
      });
    });
  });
  return slots;
}

function setExerciseId(workouts, workoutIndex, exerciseIndex, newExerciseId) {
  const next = structuredClone(workouts);
  const exercise = next?.[workoutIndex]?.exercises?.[exerciseIndex];
  if (!exercise || typeof exercise !== "object" || Array.isArray(exercise)) {
    throw new Error("manifest_patch_path_missing");
  }
  if ("exercise_id" in exercise || !("id" in exercise)) exercise.exercise_id = newExerciseId;
  else exercise.id = newExerciseId;
  return next;
}

function withoutExerciseReference(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const next = { ...value };
  delete next.exercise_id;
  delete next.id;
  return sortJson(next);
}

function canonicalKey(value) {
  return normalizeVisibleName(value);
}

export function canonicalMuscleGroup(name, sourceGroup) {
  const nameKey = canonicalKey(name);
  const groupKey = canonicalKey(sourceGroup);
  if (nameKey === "puxada aberta barra reta") return "Dorsal";
  if (nameKey === "face pull" || nameKey.includes("facepull") || nameKey.includes("face pull")) return "Deltoide Posterior";
  if (nameKey === "crucifixo inverso com halteres") return "Deltoide Posterior";
  if (nameKey === "abducao de quadril maquina") return "Glúteos";
  if (groupKey === "dorsal" && (nameKey.includes("facepull") || nameKey.includes("face pull") || nameKey.includes("crucifixo"))) {
    return null;
  }
  if (BROAD_CATEGORY_KEYS.has(groupKey) || groupKey.includes("ombro") || groupKey === "outros") return null;
  const aliases = new Map([
    ["abdomen", "Abdômen"], ["abdominal", "Abdômen"], ["abdominais", "Abdômen"],
    ["quadriceps", "Quadríceps"], ["quadri", "Quadríceps"],
    ["posterior", "Posterior de coxa"], ["posterior de coxa", "Posterior de coxa"], ["isquiotibiais", "Posterior de coxa"],
    ["gluteos", "Glúteos"], ["gluteo", "Glúteos"],
    ["adutores", "Adutores"], ["adutor", "Adutores"],
    ["panturrilha", "Panturrilha"], ["panturrilhas", "Panturrilha"],
    ["deltoide lateral", "Deltoide Lateral"], ["lateral de ombro", "Deltoide Lateral"],
    ["deltoide posterior", "Deltoide Posterior"], ["posterior de ombro", "Deltoide Posterior"],
    ["deltoide anterior", "Deltoide Anterior"], ["anterior de ombro", "Deltoide Anterior"],
    ["antebraco", "Antebraço"], ["antebracos", "Antebraço"],
    ["biceps", "Bíceps"], ["triceps", "Tríceps"],
    ["dorsal", "Dorsal"], ["dorsais", "Dorsal"], ["costas", "Dorsal"],
    ["trapezio", "Trapézio"], ["trapezios", "Trapézio"],
    ["peitoral", "Peitoral"], ["peito", "Peitoral"], ["peitorais", "Peitoral"],
  ]);
  return aliases.get(groupKey) || null;
}

export function canonicalCategory(sourceGroup, sourceCategory) {
  const key = canonicalKey(sourceCategory || sourceGroup);
  if (!key) return null;
  if (["estabilidade", "funcional", "funcionais", "fisioterapia", "fisio"].includes(key)) return "funcionais";
  if (["peso corporal", "bodyweight", "calistenia"].includes(key)) return "peso_corporal";
  if (["mobilidade", "mobilidades", "alongamento"].includes(key)) return "mobilidades";
  if (["maquina", "maquinas", "polia", "cabo"].includes(key)) return "maquinas";
  if (["pesos livre", "pesos livres", "peso livre", "halteres", "barra"].includes(key)) return "pesos_livre";
  if (["base", "basico", "composto", "compostos"].includes(key)) return "base";
  if (key === "pliometria") return "pliometria";
  return null;
}

export function buildAuditSql(companyId = BN_COMPANY_ID) {
  return `
with target_company as (
  select id, slug, name from public.companies where id = ${sqlLiteral(companyId)}::uuid
), payload as (
  select jsonb_build_object(
    'company', (select to_jsonb(target_company) from target_company),
    'schema_columns', (
      select coalesce(jsonb_agg(column_name order by ordinal_position), '[]'::jsonb)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'exercise_library'
        and column_name in ('id', 'company_id', 'name', 'description', 'is_global', 'muscle_group', 'category', 'categories', 'video_url')
    ),
    'templates', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', template.id::text,
        'name', template.name,
        'workouts', template.workouts,
        'workouts_sha256', encode(extensions.digest(convert_to(template.workouts::text, 'UTF8'), 'sha256'), 'hex')
      ) order by template.id::text), '[]'::jsonb)
      from public.workout_templates template
      join target_company company on company.id = template.company_id
    ),
    'visible_library', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', library.id::text,
        'company_id', library.company_id::text,
        'name', library.name,
        'description', library.description,
        'is_global', library.is_global,
        'muscle_group', library.muscle_group,
        'category', library.category,
        'categories', to_jsonb(library.categories),
        'video_url', library.video_url
      ) order by library.id::text), '[]'::jsonb)
      from public.exercise_library library
      join target_company company on true
      where library.company_id = company.id or library.is_global is true
    )
  ) as data
)
select data from payload;
`.trim();
}

export function buildPlan(auditPayload, options = {}) {
  const company = auditPayload?.company;
  if (!company?.id || company.id !== (options.companyId || BN_COMPANY_ID)) throw new Error("bn_company_not_found_or_mismatched");
  const schemaColumns = new Set(auditPayload.schema_columns || []);
  for (const column of ["id", "company_id", "name", "description", "is_global", "muscle_group", "category", "categories", "video_url"]) {
    if (!schemaColumns.has(column)) throw new Error(`exercise_library_missing_column:${column}`);
  }

  const visibleByOldId = new Set((auditPayload.visible_library || []).map((row) => clean(row.id).toLowerCase()));
  const visibleByName = new Map();
  for (const row of auditPayload.visible_library || []) {
    const key = normalizeVisibleName(row.name);
    if (!key) continue;
    if (!visibleByName.has(key)) visibleByName.set(key, []);
    visibleByName.get(key).push(row);
  }

  const missing = new Map();
  for (const template of auditPayload.templates || []) {
    for (const slot of extractExercises(template.workouts)) {
      if (visibleByOldId.has(slot.oldExerciseId)) continue;
      if (!missing.has(slot.oldExerciseId)) missing.set(slot.oldExerciseId, []);
      missing.get(slot.oldExerciseId).push({ template, slot });
    }
  }

  if (missing.size > MAX_MISSING_EXERCISE_IDS) {
    throw new Error(`too_many_missing_template_exercise_ids:${missing.size}`);
  }

  const exerciseMappings = [];
  const inserts = [];
  const patchByTemplate = new Map();

  for (const [oldExerciseId, refs] of [...missing.entries()].sort()) {
    const names = [...new Set(refs.map(({ slot }) => slot.name).filter(Boolean).map(normalizeVisibleName))];
    const sourceGroups = [...new Set(refs.map(({ slot }) => slot.sourceGroup).filter(Boolean).map(normalizeVisibleName))];
    const videoVariants = [...new Set(refs.map(({ slot }) => slot.sourceVideoUrl).filter(Boolean))];
    if (names.length !== 1) throw new Error(`ambiguous_template_snapshot_name:${oldExerciseId}`);
    if (sourceGroups.length > 1) throw new Error(`ambiguous_template_source_group:${oldExerciseId}`);
    if (videoVariants.length > 1) throw new Error(`ambiguous_template_video_variant:${oldExerciseId}`);

    const first = refs[0].slot;
    const exactName = first.name;
    if (!exactName) throw new Error(`missing_template_snapshot_name:${oldExerciseId}`);
    const nameKey = normalizeVisibleName(exactName);
    const exactVisible = (visibleByName.get(nameKey) || []).filter((row) => normalizeVisibleName(row.name) === nameKey);
    const reusable = exactVisible.length === 1 ? exactVisible[0] : null;
    const newExerciseId = reusable?.id || deterministicUuid(REPAIR_KEY, company.id, oldExerciseId, exactName);
    const muscleGroup = reusable ? reusable.muscle_group : canonicalMuscleGroup(exactName, first.sourceGroup);
    const category = reusable ? reusable.category : canonicalCategory(first.sourceGroup, first.sourceCategory);
    const sourceMetadata = {
      repair_key: REPAIR_KEY,
      source: "workout_templates",
      old_exercise_id: oldExerciseId,
      exact_name: exactName,
      source_group: first.sourceGroup || null,
      source_category: first.sourceCategory || null,
      source_video_url: first.sourceVideoUrl || null,
      canonical_target_status: muscleGroup ? "mapped_from_explicit_source" : "absent_preserved_for_review",
      note: reusable ? "reused_single_visible_exact_name" : "created_private_company_exercise_from_template_snapshot",
    };

    exerciseMappings.push({
      old_exercise_id: oldExerciseId,
      new_exercise_id: newExerciseId,
      action: reusable ? "reuse_visible_exact_name" : "insert_private_company_exercise",
      exact_name: exactName,
      source_group: first.sourceGroup || null,
      source_video_url: first.sourceVideoUrl || null,
      affected_slots: refs.length,
      affected_templates: [...new Set(refs.map(({ template }) => template.id))].length,
      source_metadata: sourceMetadata,
    });

    if (!reusable) {
      inserts.push({
        id: newExerciseId,
        company_id: company.id,
        name: exactName,
        description: null,
        is_global: false,
        muscle_group: muscleGroup,
        category,
        categories: category ? [category] : [],
        video_url: first.sourceVideoUrl || null,
        muscle_targets: muscleGroup && CANONICAL_MUSCLE_GROUP_IDS.has(muscleGroup)
          ? [{
              muscle_group_name: muscleGroup,
              muscle_group_id: CANONICAL_MUSCLE_GROUP_IDS.get(muscleGroup),
              role: "primary",
              is_primary: true,
              volume_percentage: 100,
            }]
          : [],
      });
    }

    for (const { template, slot } of refs) {
      if (!patchByTemplate.has(template.id)) {
        patchByTemplate.set(template.id, {
          template_id: template.id,
          template_name: template.name,
          before_sha256: template.workouts_sha256 || sha256(JSON.stringify(template.workouts)),
          before_workouts: template.workouts,
          after_workouts: template.workouts,
          patches: [],
        });
      }
      const patch = patchByTemplate.get(template.id);
      patch.after_workouts = setExerciseId(patch.after_workouts, slot.workoutIndex, slot.exerciseIndex, newExerciseId);
      patch.patches.push({
        workout_index: slot.workoutIndex,
        exercise_index: slot.exerciseIndex,
        old_exercise_id: oldExerciseId,
        new_exercise_id: newExerciseId,
        exact_name: exactName,
      });
    }
  }

  const templates = [...patchByTemplate.values()].map((template) => ({
    ...template,
    after_sha256: sha256(JSON.stringify(template.after_workouts)),
  })).sort((a, b) => a.template_id.localeCompare(b.template_id));

  for (const template of templates) {
    for (const patch of template.patches) {
      const before = template.before_workouts?.[patch.workout_index]?.exercises?.[patch.exercise_index];
      const after = template.after_workouts?.[patch.workout_index]?.exercises?.[patch.exercise_index];
      const beforeRef = clean(before?.exercise_id || before?.id).toLowerCase();
      const afterRef = clean(after?.exercise_id || after?.id).toLowerCase();
      if (beforeRef !== patch.old_exercise_id || afterRef !== patch.new_exercise_id) {
        throw new Error("manifest_patch_reference_mismatch");
      }
      if (JSON.stringify(withoutExerciseReference(before)) !== JSON.stringify(withoutExerciseReference(after))) {
        throw new Error("manifest_patch_changed_more_than_exercise_id");
      }
    }
  }

  const manifest = {
    schema_version: 1,
    repair_key: REPAIR_KEY,
    project_ref: EXPECTED_PROJECT_REF,
    company_id: company.id,
    generated_at: new Date().toISOString(),
    contains_pii: true,
    scope: "workout_templates_only",
    summary: {
      missing_exercise_ids: missing.size,
      templates_to_patch: templates.length,
      slots_to_patch: templates.reduce((sum, template) => sum + template.patches.length, 0),
      exercise_rows_to_insert: inserts.length,
      exercise_rows_to_reuse: exerciseMappings.filter((item) => item.action === "reuse_visible_exact_name").length,
      inserted_rows_without_primary_target: inserts.filter((item) => !item.muscle_group).length,
      primary_targets_to_insert: inserts.reduce((sum, item) => sum + item.muscle_targets.length, 0),
    },
    exercise_mappings: exerciseMappings,
    exercise_inserts: inserts,
    template_backups: templates,
    manifest_sha256: "",
  };
  manifest.manifest_sha256 = sha256(stableJson({ ...manifest, manifest_sha256: "" }));
  return manifest;
}

export function buildApplySql(manifest) {
  return `
begin;
select pg_advisory_xact_lock(hashtext(${sqlLiteral(REPAIR_KEY)}));
lock table public.workout_templates, public.exercise_library, public.exercise_muscle_targets, public.muscle_groups in share row exclusive mode;

do $repair$
declare
  v_manifest jsonb := ${jsonSql(manifest)};
  v_company_id uuid := (v_manifest->>'company_id')::uuid;
  v_expected_project text := ${sqlLiteral(EXPECTED_PROJECT_REF)};
  v_template_count integer := jsonb_array_length(v_manifest->'template_backups');
  v_insert_count integer := jsonb_array_length(v_manifest->'exercise_inserts');
  v_mapping_count integer := jsonb_array_length(v_manifest->'exercise_mappings');
  v_target_expected integer := 0;
  v_targets_inserted integer := 0;
  v_updated integer := 0;
  v_inserted integer := 0;
begin
  select coalesce(sum(jsonb_array_length(coalesce(row->'muscle_targets', '[]'::jsonb))), 0)
    into v_target_expected
  from jsonb_array_elements(v_manifest->'exercise_inserts') item(row);
  if v_manifest->>'project_ref' is distinct from v_expected_project then
    raise exception 'template_repair_project_ref_mismatch';
  end if;
  if v_company_id is distinct from ${sqlLiteral(BN_COMPANY_ID)}::uuid then
    raise exception 'template_repair_company_mismatch';
  end if;
  if v_mapping_count > ${MAX_MISSING_EXERCISE_IDS} then
    raise exception 'template_repair_too_many_missing_ids';
  end if;
  if not exists (select 1 from public.companies where id = v_company_id) then
    raise exception 'template_repair_company_not_found';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_manifest->'exercise_mappings') mapping(row)
    join public.exercise_library existing on existing.id::text = mapping.row->>'old_exercise_id'
  ) then
    raise exception 'template_repair_old_id_appeared_before_apply';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_manifest->'exercise_mappings') mapping(row)
    where mapping.row->>'action' = 'reuse_visible_exact_name'
      and not exists (
        select 1
        from public.exercise_library existing
        where existing.id = (mapping.row->>'new_exercise_id')::uuid
          and existing.name = mapping.row->>'exact_name'
          and (existing.company_id = v_company_id or existing.is_global is true)
      )
  ) then
    raise exception 'template_repair_reused_target_not_visible_exact';
  end if;

  with rows as (
    select row from jsonb_array_elements(v_manifest->'exercise_inserts') item(row)
  ), inserted as (
    insert into public.exercise_library (
      id, company_id, name, description, is_global, muscle_group, category, categories, video_url
    )
    select
      (row->>'id')::uuid,
      (row->>'company_id')::uuid,
      row->>'name',
      nullif(row->>'description', ''),
      false,
      nullif(row->>'muscle_group', ''),
      nullif(row->>'category', ''),
      coalesce(array(select jsonb_array_elements_text(coalesce(row->'categories', '[]'::jsonb))), '{}'::text[]),
      nullif(row->>'video_url', '')
    from rows
    on conflict (id) do nothing
    returning id
  )
  select count(*) into v_inserted from inserted;

  if v_inserted <> v_insert_count then
    if exists (
      select 1
      from jsonb_array_elements(v_manifest->'exercise_inserts') item(row)
      join public.exercise_library existing on existing.id = (item.row->>'id')::uuid
      where existing.company_id is distinct from (item.row->>'company_id')::uuid
         or existing.name is distinct from item.row->>'name'
         or coalesce(existing.is_global, false) is distinct from false
    ) then
      raise exception 'template_repair_insert_conflict_diverged';
    end if;
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_manifest->'exercise_mappings') mapping(row)
    where not exists (
      select 1
      from public.exercise_library target
      where target.id = (mapping.row->>'new_exercise_id')::uuid
        and (target.company_id = v_company_id or target.is_global is true)
    )
  ) then
    raise exception 'template_repair_target_not_visible_after_insert';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_manifest->'exercise_inserts') exercise(row)
    cross join lateral jsonb_array_elements(coalesce(exercise.row->'muscle_targets', '[]'::jsonb)) target(row)
    left join public.muscle_groups muscle on muscle.id = (target.row->>'muscle_group_id')::uuid
    where muscle.id is null
       or public.canonical_volume_muscle_group(muscle.name) is null
  ) then
    raise exception 'template_repair_muscle_target_invalid';
  end if;
  with targets as (
    select
      (exercise.row->>'id')::uuid as exercise_id,
      (target.row->>'muscle_group_id')::uuid as muscle_group_id,
      target.row->>'role' as role,
      (target.row->>'is_primary')::boolean as is_primary,
      (target.row->>'volume_percentage')::numeric as volume_percentage
    from jsonb_array_elements(v_manifest->'exercise_inserts') exercise(row)
    cross join lateral jsonb_array_elements(coalesce(exercise.row->'muscle_targets', '[]'::jsonb)) target(row)
  ), inserted_targets as (
    insert into public.exercise_muscle_targets (
      exercise_id, muscle_group_id, role, is_primary, volume_percentage
    )
    select exercise_id, muscle_group_id, role, is_primary, volume_percentage
    from targets
    on conflict (exercise_id, muscle_group_id) do nothing
    returning exercise_id
  )
  select count(*) into v_targets_inserted from inserted_targets;
  if v_targets_inserted <> v_target_expected then
    if exists (
      select 1
      from jsonb_array_elements(v_manifest->'exercise_inserts') exercise(row)
      cross join lateral jsonb_array_elements(coalesce(exercise.row->'muscle_targets', '[]'::jsonb)) target(row)
      join public.exercise_muscle_targets existing
        on existing.exercise_id = (exercise.row->>'id')::uuid
       and existing.muscle_group_id = (target.row->>'muscle_group_id')::uuid
      where existing.role is distinct from target.row->>'role'
         or existing.is_primary is distinct from (target.row->>'is_primary')::boolean
         or existing.volume_percentage is distinct from (target.row->>'volume_percentage')::numeric
    ) then
      raise exception 'template_repair_muscle_target_conflict_diverged';
    end if;
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_manifest->'template_backups') template(row)
    cross join lateral jsonb_array_elements(template.row->'patches') patch(row)
    where coalesce((template.row->'before_workouts') #>> array[patch.row->>'workout_index', 'exercises', patch.row->>'exercise_index', 'exercise_id'],
                   (template.row->'before_workouts') #>> array[patch.row->>'workout_index', 'exercises', patch.row->>'exercise_index', 'id'])
            is distinct from patch.row->>'old_exercise_id'
       or coalesce((template.row->'after_workouts') #>> array[patch.row->>'workout_index', 'exercises', patch.row->>'exercise_index', 'exercise_id'],
                   (template.row->'after_workouts') #>> array[patch.row->>'workout_index', 'exercises', patch.row->>'exercise_index', 'id'])
            is distinct from patch.row->>'new_exercise_id'
       or (((template.row->'before_workouts') #> array[patch.row->>'workout_index', 'exercises', patch.row->>'exercise_index']) - 'exercise_id' - 'id')
            is distinct from (((template.row->'after_workouts') #> array[patch.row->>'workout_index', 'exercises', patch.row->>'exercise_index']) - 'exercise_id' - 'id')
  ) then
    raise exception 'template_repair_patch_changes_more_than_exercise_id';
  end if;

  with desired as (
    select row
    from jsonb_array_elements(v_manifest->'template_backups') item(row)
  ), live as (
    select template.id, template.workouts, desired.row
    from desired
    join public.workout_templates template
      on template.id = (desired.row->>'template_id')::uuid
     and template.company_id = v_company_id
    for update
  ), changed as (
    update public.workout_templates template
    set workouts = live.row->'after_workouts'
    from live
    where template.id = live.id
      and encode(extensions.digest(convert_to(template.workouts::text, 'UTF8'), 'sha256'), 'hex') = live.row->>'before_sha256'
    returning template.id, template.workouts, live.row
  )
  select count(*) into v_updated from changed;

  if v_updated <> v_template_count then
    raise exception 'template_repair_template_cas_mismatch';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_manifest->'template_backups') item(row)
    join public.workout_templates template on template.id = (item.row->>'template_id')::uuid
    where template.workouts is distinct from item.row->'after_workouts'
  ) then
    raise exception 'template_repair_post_hash_mismatch';
  end if;
  raise notice 'template_repair_applied:%', jsonb_build_object(
    'templates_updated', v_updated,
    'exercise_rows_inserted', v_inserted,
    'primary_targets_inserted', v_targets_inserted,
    'slots_patched', v_manifest#>>'{summary,slots_to_patch}',
    'manifest_sha256', v_manifest->>'manifest_sha256'
  )::text;
end
$repair$;

commit;
`.trim();
}

export function buildRollbackSql(manifest) {
  return `
begin;
select pg_advisory_xact_lock(hashtext(${sqlLiteral(`${REPAIR_KEY}:rollback`)}));
lock table public.workout_templates, public.exercise_library, public.exercise_muscle_targets in share row exclusive mode;

do $rollback$
declare
  v_manifest jsonb := ${jsonSql(manifest)};
  v_company_id uuid := (v_manifest->>'company_id')::uuid;
  v_restored integer := 0;
begin
  if v_company_id is distinct from ${sqlLiteral(BN_COMPANY_ID)}::uuid then
    raise exception 'template_repair_rollback_company_mismatch';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_manifest->'template_backups') item(row)
    join public.workout_templates template on template.id = (item.row->>'template_id')::uuid
    where template.workouts is distinct from item.row->'after_workouts'
  ) then
    raise exception 'template_repair_rollback_blocked_post_apply_template_change';
  end if;

  with desired as (
    select row from jsonb_array_elements(v_manifest->'template_backups') item(row)
  ), restored as (
    update public.workout_templates template
    set workouts = desired.row->'before_workouts'
    from desired
    where template.id = (desired.row->>'template_id')::uuid
      and template.company_id = v_company_id
      and template.workouts = desired.row->'after_workouts'
    returning template.id
  )
  select count(*) into v_restored from restored;

  if v_restored <> jsonb_array_length(v_manifest->'template_backups') then
    raise exception 'template_repair_rollback_restore_count_mismatch';
  end if;

  raise notice 'template_repair_rolled_back:%', jsonb_build_object(
    'templates_restored', v_restored,
    'private_exercise_rows_deleted', 0,
    'catalog_rollback_policy', 'left_registered_private_exercises_in_place',
    'manifest_sha256', v_manifest->>'manifest_sha256'
  )::text;
end
$rollback$;
commit;
`.trim();
}

function parseArgs(argv) {
  const options = {
    apply: false,
    confirmProject: "",
    companyId: BN_COMPANY_ID,
    sqlOut: "",
    backupOut: "",
    rollbackOut: "",
    manifestOut: "",
    linkedWorkdir: process.cwd(),
    noExecute: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--apply") options.apply = true;
    else if (arg === "--no-execute") options.noExecute = true;
    else if (arg === "--confirm-project") options.confirmProject = argv[++index] || "";
    else if (arg === "--company-id") options.companyId = argv[++index] || "";
    else if (arg === "--sql-out") options.sqlOut = argv[++index] || "";
    else if (arg === "--backup-out") options.backupOut = argv[++index] || "";
    else if (arg === "--rollback-out") options.rollbackOut = argv[++index] || "";
    else if (arg === "--manifest-out") options.manifestOut = argv[++index] || "";
    else if (arg === "--linked-workdir") options.linkedWorkdir = argv[++index] || "";
    else throw new Error(`unknown_argument:${arg}`);
  }
  if (options.apply && options.confirmProject !== EXPECTED_PROJECT_REF) {
    throw new Error(`--apply requires --confirm-project ${EXPECTED_PROJECT_REF}`);
  }
  if (options.companyId !== BN_COMPANY_ID) throw new Error("This repair is scoped to the BN company only");
  return options;
}

function runSupabaseQuery(sql, cwd) {
  assertLinkedProject(cwd);
  const result = spawnSync("supabase", ["db", "query", "--linked", "--output", "json", sql], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const stderrHash = sha256(result.stderr || "");
    throw new Error(`supabase db query failed with code ${result.status}; stderr_sha256=${stderrHash}`);
  }
  const output = result.stdout.trim();
  if (!output) return [];
  try {
    const payload = JSON.parse(output);
    if (Array.isArray(payload?.rows)) return payload.rows;
    if (Array.isArray(payload)) return payload;
    if (payload?.data && Array.isArray(payload.data)) return payload.data;
    if (payload && typeof payload === "object") return [payload];
  } catch {
    throw new Error(`supabase db query returned non_json_output; stdout_sha256=${sha256(output)}`);
  }
  return [];
}

function assertLinkedProject(cwd) {
  const projectRefPath = resolve(cwd, "supabase/.temp/project-ref");
  if (!existsSync(projectRefPath)) throw new Error("supabase linked project-ref is missing");
  const projectRef = clean(readFileSync(projectRefPath, "utf8"));
  if (projectRef !== EXPECTED_PROJECT_REF) {
    throw new Error(`refusing linked Supabase project ${projectRef || "unknown"}; expected ${EXPECTED_PROJECT_REF}`);
  }
}

async function writePrivateJson(path, payload) {
  assertPrivateOutputPath(path);
  await mkdir(dirname(resolve(path)), { recursive: true, mode: 0o700 });
  await chmod(dirname(resolve(path)), 0o700);
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
}

async function writePrivateText(path, payload) {
  assertPrivateOutputPath(path);
  await mkdir(dirname(resolve(path)), { recursive: true, mode: 0o700 });
  await chmod(dirname(resolve(path)), 0o700);
  await writeFile(path, `${payload}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
}

function assertPrivateOutputPath(path) {
  const resolved = resolve(path);
  const repo = resolve(process.cwd());
  if (resolved === repo || resolved.startsWith(`${repo}/`)) {
    throw new Error("private manifest/sql output must be outside the git worktree");
  }
}

const USAGE = `
Usage:
  node scripts/repair-template-exercise-references.mjs [--manifest-out path] [--sql-out path]
  node scripts/repair-template-exercise-references.mjs --apply --confirm-project ${EXPECTED_PROJECT_REF} [--backup-out private-backup.json] [--rollback-out rollback.sql]

Safety:
  Dry-run is the default. Scope is BN workout_templates only; active workouts/history are never updated.
  Apply writes require --apply, --confirm-project ${EXPECTED_PROJECT_REF}, linked project-ref verification, a private backup manifest, SQL locks, and template JSON CAS/equality checks.
  Default private artifacts are written under ~/.codex/private/sett-template-exercise-references, not the git worktree.
  Rollback restores template JSON only and intentionally leaves registered private catalog rows in place.
  The script refuses more than ${MAX_MISSING_EXERCISE_IDS} missing template exercise IDs and never restores old orphan IDs.
`;

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  const auditSql = buildAuditSql(options.companyId);
  const rows = runSupabaseQuery(auditSql, options.linkedWorkdir);
  const payload = rows[0]?.data;
  if (!payload) throw new Error("template_repair_audit_returned_no_payload");
  const manifest = buildPlan(payload, { companyId: options.companyId });
  const sql = `${options.apply ? "" : "-- DRY RUN PREVIEW ONLY: candidate apply SQL generated from live read-only audit and not executed by this run\n"}${buildApplySql(manifest)}`;

  if (options.manifestOut) await writePrivateJson(options.manifestOut, manifest);
  if (options.sqlOut) await writePrivateText(options.sqlOut, sql);
  if (options.apply) {
    const backupOut = options.backupOut || `${PRIVATE_OUTPUT_DIR}/private-${REPAIR_KEY}-${manifest.manifest_sha256.slice(0, 12)}.json`;
    await writePrivateJson(backupOut, manifest);
    if (options.rollbackOut) await writePrivateText(options.rollbackOut, buildRollbackSql(manifest));
    if (!options.noExecute) runSupabaseQuery(sql, options.linkedWorkdir);
  }
  process.stdout.write(`${JSON.stringify({
    mode: options.apply ? "apply" : "dry-run",
    executed: options.apply && !options.noExecute,
    project_ref: EXPECTED_PROJECT_REF,
    company_id: options.companyId,
    manifest_sha256: manifest.manifest_sha256,
    summary: manifest.summary,
    files: {
      manifest: options.manifestOut || null,
      sql: options.sqlOut || null,
      backup: options.apply ? (options.backupOut || `${PRIVATE_OUTPUT_DIR}/private-${REPAIR_KEY}-${manifest.manifest_sha256.slice(0, 12)}.json`) : null,
      rollback: options.rollbackOut || null,
    },
  }, null, 2)}\n`);
  return 0;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main()
    .then((code) => { process.exitCode = code; })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : "template repair failed"}\n`);
      process.exitCode = 1;
    });
}
