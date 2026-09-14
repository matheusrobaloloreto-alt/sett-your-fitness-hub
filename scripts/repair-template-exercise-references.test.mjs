import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BN_COMPANY_ID,
  EXPECTED_PROJECT_REF,
  MAX_MISSING_EXERCISE_IDS,
  buildApplySql,
  buildPlan,
  buildRollbackSql,
  canonicalMuscleGroup,
  deterministicUuid,
  normalizeVisibleName,
} from "./repair-template-exercise-references.mjs";

const scriptPath = new URL("./repair-template-exercise-references.mjs", import.meta.url);

function fixturePayload() {
  return {
    company: { id: BN_COMPANY_ID, slug: "bn-performance-training", name: "BN Performance Training" },
    schema_columns: ["id", "company_id", "name", "description", "is_global", "muscle_group", "category", "categories", "video_url"],
    visible_library: [{
      id: "10000000-0000-4000-8000-000000000001",
      company_id: BN_COMPANY_ID,
      name: "Supino Reto",
      description: null,
      is_global: false,
      muscle_group: "Peitoral",
      category: "base",
      categories: ["base"],
      video_url: null,
    }],
    templates: [{
      id: "20000000-0000-4000-8000-000000000001",
      name: "Template seguro",
      workouts_sha256: "a".repeat(64),
      workouts: [{
        title: "A",
        exercises: [{
          exercise_id: "30000000-0000-4000-8000-000000000001",
          exercise_name: "Puxada Aberta Barra reta",
          muscle_group: "Dorsal",
          video_url: "https://videos.example.invalid/puxada.mp4",
          sets: 3,
        }, {
          exercise_id: "40000000-0000-4000-8000-000000000001",
          exercise_name: "Supino Reto",
          muscle_group: "Peitoral",
          sets: 4,
        }],
      }],
    }],
  };
}

test("normalizes names and creates stable v4-shaped private IDs", () => {
  assert.equal(normalizeVisibleName(" Tríceps  Testa — Barra Reta "), "triceps testa barra reta");
  const first = deterministicUuid("repair", BN_COMPANY_ID, "old-id", "Nome Exato");
  const second = deterministicUuid("repair", BN_COMPANY_ID, "old-id", "Nome Exato");
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("maps only explicit anatomical muscle groups and preserves misleading groups for review", () => {
  assert.equal(canonicalMuscleGroup("Puxada Aberta Barra reta", "Dorsal"), "Dorsal");
  assert.equal(canonicalMuscleGroup("Face Pull", "Dorsal"), "Deltoide Posterior");
  assert.equal(canonicalMuscleGroup("FacePull Polia", "Dorsal"), "Deltoide Posterior");
  assert.equal(canonicalMuscleGroup("Crucifixo Inverso com Halteres", "Dorsal"), "Deltoide Posterior");
  assert.equal(canonicalMuscleGroup("Abdução de Quadril Máquina", "Estabilidade"), "Glúteos");
  assert.equal(canonicalMuscleGroup("Crucifixo Inverso", "Dorsal"), null);
  assert.equal(canonicalMuscleGroup("Estabilidade escapular", "Estabilidade"), null);
  assert.equal(canonicalMuscleGroup("Flexão", "Peso Corporal"), null);
});

test("builds a bounded manifest that inserts new private exercises and reuses one exact visible name", () => {
  const manifest = buildPlan(fixturePayload());
  assert.equal(manifest.project_ref, EXPECTED_PROJECT_REF);
  assert.equal(manifest.company_id, BN_COMPANY_ID);
  assert.equal(manifest.contains_pii, true);
  assert.equal(manifest.scope, "workout_templates_only");
  assert.equal(manifest.summary.missing_exercise_ids, 2);
  assert.equal(manifest.summary.exercise_rows_to_insert, 1);
  assert.equal(manifest.summary.exercise_rows_to_reuse, 1);
  assert.equal(manifest.summary.inserted_rows_without_primary_target, 0);
  assert.equal(manifest.summary.primary_targets_to_insert, 1);
  assert.equal(manifest.summary.slots_to_patch, 2);

  const insert = manifest.exercise_inserts[0];
  assert.equal(insert.company_id, BN_COMPANY_ID);
  assert.equal(insert.is_global, false);
  assert.equal(insert.name, "Puxada Aberta Barra reta");
  assert.equal(insert.muscle_group, "Dorsal");
  assert.equal(insert.video_url, "https://videos.example.invalid/puxada.mp4");
  assert.notEqual(insert.id, "30000000-0000-4000-8000-000000000001");
  assert.equal(insert.description, null);
  assert.deepEqual(insert.muscle_targets, [{
    muscle_group_name: "Dorsal",
    muscle_group_id: "613809f7-2188-49cb-ba31-e406e8742104",
    role: "primary",
    is_primary: true,
    volume_percentage: 100,
  }]);
  assert.match(manifest.exercise_mappings[0].source_metadata.old_exercise_id, /30000000/);

  const template = manifest.template_backups[0];
  assert.equal(template.before_workouts[0].exercises[0].exercise_id, "30000000-0000-4000-8000-000000000001");
  assert.equal(template.after_workouts[0].exercises[0].exercise_id, insert.id);
  assert.equal(template.after_workouts[0].exercises[1].exercise_id, "10000000-0000-4000-8000-000000000001");
  assert.equal(template.after_workouts[0].exercises[0].sets, 3);
});

test("does not claim primary targets when the template source group is broad or misleading", () => {
  const payload = fixturePayload();
  payload.templates[0].workouts[0].exercises = [{
    exercise_id: "70000000-0000-4000-8000-000000000002",
    exercise_name: "Estabilidade escapular",
    muscle_group: "Estabilidade",
  }];
  const manifest = buildPlan(payload);
  assert.equal(manifest.summary.exercise_rows_to_insert, 1);
  assert.equal(manifest.summary.inserted_rows_without_primary_target, 1);
  assert.equal(manifest.summary.primary_targets_to_insert, 0);
  assert.equal(manifest.exercise_inserts[0].muscle_group, null);
  assert.equal(manifest.exercise_inserts[0].description, null);
  assert.equal(manifest.exercise_inserts[0].muscle_targets.length, 0);
  assert.match(manifest.exercise_mappings[0].source_metadata.canonical_target_status, /absent_preserved_for_review/);
});

test("fails closed on ambiguous template snapshots and excessive missing IDs", () => {
  const ambiguous = fixturePayload();
  ambiguous.templates[0].workouts[0].exercises.push({
    exercise_id: "30000000-0000-4000-8000-000000000001",
    exercise_name: "Outro Nome",
  });
  assert.throws(() => buildPlan(ambiguous), /ambiguous_template_snapshot_name/);

  const excessive = fixturePayload();
  excessive.templates[0].workouts[0].exercises = Array.from({ length: MAX_MISSING_EXERCISE_IDS + 1 }, (_, index) => ({
    exercise_id: `e1000001-0000-0000-0000-${String(index).padStart(12, "0")}`,
    exercise_name: `Exercicio ${index}`,
  }));
  assert.throws(() => buildPlan(excessive), /too_many_missing_template_exercise_ids/);
});

test("apply SQL locks only template/library tables, CASes JSON, and never updates workouts/history", () => {
  const manifest = buildPlan(fixturePayload());
  const sql = buildApplySql(manifest);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /lock table public\.workout_templates, public\.exercise_library, public\.exercise_muscle_targets, public\.muscle_groups/);
  assert.match(sql, /template_repair_old_id_appeared_before_apply/);
  assert.match(sql, /template_repair_template_cas_mismatch/);
  assert.match(sql, /template_repair_post_hash_mismatch/);
  assert.match(sql, /template_repair_reused_target_not_visible_exact/);
  assert.match(sql, /template_repair_patch_changes_more_than_exercise_id/);
  assert.match(sql, /template_repair_muscle_target_invalid/);
  assert.match(sql, /insert into public\.exercise_library/);
  assert.match(sql, /insert into public\.exercise_muscle_targets/);
  assert.match(sql, /update public\.workout_templates/);
  assert.match(sql, /template\.workouts is distinct from item\.row->'after_workouts'/);
  assert.doesNotMatch(sql, /update public\.workouts/i);
  assert.doesNotMatch(sql, /delete from public\.workouts/i);
  assert.doesNotMatch(sql, /training_cycles/i);
});

test("rollback compares patched state before restoring templates and leaves catalog rows in place", () => {
  const manifest = buildPlan(fixturePayload());
  const sql = buildRollbackSql(manifest);
  assert.match(sql, /template_repair_rollback_blocked_post_apply_template_change/);
  assert.match(sql, /set workouts = desired\.row->'before_workouts'/);
  assert.match(sql, /template\.workouts = desired\.row->'after_workouts'/);
  assert.match(sql, /left_registered_private_exercises_in_place/);
  assert.doesNotMatch(sql, /delete from public\.exercise_library/i);
  assert.doesNotMatch(sql, /delete from public\.exercise_muscle_targets/i);
  assert.doesNotMatch(sql, /delete from public\.workouts/i);
});

test("CLI source keeps dry-run as default and apply guarded by project confirmation", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /apply: false/);
  assert.match(source, /supabase\/\.temp\/project-ref/);
  assert.match(source, /--output", "json"/);
  assert.match(source, /stderr_sha256/);
  assert.match(source, /private manifest\/sql output must be outside the git worktree/);
  assert.match(source, new RegExp(`--confirm-project \\$\\{EXPECTED_PROJECT_REF\\}`));
  assert.match(source, new RegExp(`--apply requires --confirm-project \\$\\{EXPECTED_PROJECT_REF\\}`));
  assert.match(source, /scope: "workout_templates_only"/);
  assert.match(source, /active workouts\/history are never updated/);
});
