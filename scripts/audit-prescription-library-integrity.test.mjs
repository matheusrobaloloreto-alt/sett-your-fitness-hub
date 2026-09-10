import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPrescriptionLibraryIntegrityReport,
  normalizeExerciseName,
} from "./audit-prescription-library-integrity.mjs";

const BN = "company-bn";
const OTHER = "company-other";
const TODAY = "2026-09-10";

function exercise(overrides = {}) {
  return {
    id: overrides.id,
    company_id: overrides.company_id ?? null,
    name: overrides.name,
    muscle_group_id: overrides.muscle_group_id ?? "mg-1",
    equipment: overrides.equipment ?? "halteres",
    is_global: overrides.is_global ?? false,
    youtube_video_id: overrides.youtube_video_id ?? null,
    video_url: overrides.video_url ?? null,
    video_path: overrides.video_path ?? null,
  };
}

function cycle(overrides = {}) {
  return {
    id: overrides.id,
    company_id: overrides.company_id ?? BN,
    student_id: overrides.student_id ?? "student-a",
    status: overrides.status ?? "active",
    start_date: overrides.start_date ?? "2026-09-01",
    end_date: overrides.end_date ?? "2026-10-12",
    superseded_at: overrides.superseded_at ?? null,
    superseded_by_cycle_id: overrides.superseded_by_cycle_id ?? null,
  };
}

function workout(overrides = {}) {
  return {
    id: overrides.id,
    company_id: overrides.company_id ?? BN,
    cycle_id: overrides.cycle_id,
    superseded_at: overrides.superseded_at ?? null,
    superseded_by_revision_id: overrides.superseded_by_revision_id ?? null,
    exercises: overrides.exercises ?? [],
  };
}

function bundle(overrides = {}) {
  return {
    id: overrides.id,
    company_id: overrides.company_id ?? BN,
    student_id: overrides.student_id ?? "student-a",
    training_cycle_id: Object.hasOwn(overrides, "training_cycle_id") ? overrides.training_cycle_id : "cycle-current",
    status: overrides.status ?? "active",
    generation_error: overrides.generation_error ?? null,
    strength_plan_id: overrides.strength_plan_id ?? null,
    running_plan_id: overrides.running_plan_id ?? null,
    nutrition_plan_id: overrides.nutrition_plan_id ?? null,
    has_strength: overrides.has_strength ?? false,
    has_cardio: overrides.has_cardio ?? false,
    has_swimming: overrides.has_swimming ?? false,
    has_cycling: overrides.has_cycling ?? false,
    has_nutrition: overrides.has_nutrition ?? false,
  };
}

function plan(overrides = {}) {
  return {
    id: overrides.id,
    company_id: overrides.company_id ?? BN,
    student_id: overrides.student_id ?? "student-a",
    training_cycle_id: overrides.training_cycle_id ?? "cycle-current",
    bundle_id: overrides.bundle_id ?? null,
    sport: overrides.sport ?? null,
    status: overrides.status ?? "active",
  };
}

function item(overrides = {}) {
  return {
    bundle_id: overrides.bundle_id,
    company_id: overrides.company_id ?? BN,
    student_id: overrides.student_id ?? "student-a",
    modality: overrides.modality,
    entity_type: overrides.entity_type,
    entity_id: overrides.entity_id,
  };
}

function baseInput(overrides = {}) {
  return {
    company: { id: BN, slug: "bn-performance-training" },
    businessDate: TODAY,
    exercises: [
      exercise({ id: "global-a", name: "Agachamento Livre", is_global: true, youtube_video_id: "abc123def45" }),
      exercise({ id: "company-a", company_id: BN, name: "Remada Baixa", video_url: "https://video.example/remada" }),
      exercise({ id: "other-a", company_id: OTHER, name: "Outro Tenant Excluido" }),
    ],
    targets: [
      { exercise_id: "global-a", role: "primary", is_primary: true },
      { exercise_id: "company-a", role: "secondary", is_primary: false },
      { exercise_id: "other-a", role: "primary", is_primary: true },
    ],
    metadata: [
      { exercise_id: "global-a", contraindications: ["dor"], pain_limitation_tags: [] },
      { exercise_id: "other-a", contraindications: ["nao entra"], pain_limitation_tags: [] },
    ],
    workouts: [],
    trainingCycles: [],
    prescriptionBundles: [],
    prescriptionBundleItems: [],
    aiStrengthPlans: [],
    runningPlans: [],
    nutritionPlans: [],
    ...overrides,
  };
}

test("normalizes names without hard-coded exercise vocabulary", () => {
  assert.equal(normalizeExerciseName("Agachamento Búlgaro (DB)"), "agachamento bulgaro db");
  assert.equal(normalizeExerciseName("  Puxada---Alta  "), "puxada alta");
});

test("catalog audit isolates tenant while keeping global and company-visible exercises", () => {
  const report = buildPrescriptionLibraryIntegrityReport(baseInput());
  assert.equal(report.catalog_visible.global.total, 1);
  assert.equal(report.catalog_visible.company.total, 1);
  assert.equal(report.catalog_visible.total.total, 2);
  assert.equal(report.catalog_visible.total.targets.with_any, 2);
  assert.equal(report.catalog_visible.total.targets.with_primary, 1);
  assert.equal(report.catalog_visible.total.safety_metadata.with_contraindications_or_pain_tags, 1);
  assert.equal(report.catalog_visible.total.video_sources.youtube_video_id, 1);
  assert.equal(report.catalog_visible.total.video_sources.direct_https_url, 1);
  assert.equal(JSON.stringify(report).includes("Outro Tenant Excluido"), false);
});

test("broken workout links are grouped dynamically by normalized name, not a fixed list", () => {
  const dynamicNames = Array.from({ length: 12 }, (_, index) => `Exercicio Sintetico ${index + 1}`);
  const exercises = [
    exercise({ id: "visible-duplicate-a", name: "Elevação Lateral", is_global: true }),
    exercise({ id: "visible-duplicate-b", name: "Elevacao lateral", company_id: BN }),
  ];
  const report = buildPrescriptionLibraryIntegrityReport(baseInput({
    exercises,
    targets: [],
    metadata: [],
    trainingCycles: [
      cycle({ id: "cycle-current" }),
      cycle({ id: "cycle-old", start_date: "2026-01-01", end_date: "2026-02-01" }),
      cycle({ id: "cycle-other", company_id: OTHER }),
    ],
    workouts: [
      workout({
        id: "workout-current",
        cycle_id: "cycle-current",
        exercises: [
          { exercise_name: "Elevação lateral", exercise_id: "missing-id" },
          ...dynamicNames.map((name) => ({ exercise_name: name, exercise_id: `missing-${name}` })),
        ],
      }),
      workout({
        id: "workout-old",
        cycle_id: "cycle-old",
        exercises: [{ exercise_name: dynamicNames[0], exercise_id: "still-missing" }],
      }),
      workout({
        id: "workout-other",
        company_id: OTHER,
        cycle_id: "cycle-other",
        exercises: [{ exercise_name: "Outro Tenant Excluido", exercise_id: "missing" }],
      }),
    ],
  }));

  const grouped = report.workout_broken_links.grouped_by_exercise_name;
  assert.equal(grouped.length, 13);
  assert.equal(grouped.some((row) => row.exercise_name === "Exercicio Sintetico 12"), true);
  const ambiguous = grouped.find((row) => row.normalized_name === "elevacao lateral");
  assert.equal(ambiguous.exact_normalized_matches_in_visible_catalog, 2);
  assert.equal(ambiguous.match_status, "ambiguous_exact_match");
  const repeated = grouped.find((row) => row.exercise_name === dynamicNames[0]);
  assert.equal(repeated.count, 2);
  assert.equal(repeated.current_cycle_slots, 1);
  assert.equal(repeated.non_superseded_cycle_slots, 2);
  assert.equal(JSON.stringify(report).includes("Outro Tenant Excluido"), false);
});

test("bundle audit separates failed, serving complete, serving incomplete, and legacy orphan states", () => {
  const complete = bundle({
    id: "bundle-complete",
    has_strength: true,
    has_cardio: true,
    has_swimming: true,
    has_cycling: true,
    has_nutrition: true,
    strength_plan_id: "strength-complete",
    running_plan_id: "run-complete",
    nutrition_plan_id: "nutrition-complete",
  });
  const incomplete = bundle({
    id: "bundle-incomplete",
    has_strength: true,
    has_nutrition: true,
    strength_plan_id: "strength-incomplete",
    nutrition_plan_id: "missing-nutrition",
  });
  const failed = bundle({
    id: "bundle-failed",
    status: "failed",
    generation_error: "synthetic failure",
    has_strength: true,
    strength_plan_id: "missing-failed-strength",
  });
  const legacy = bundle({
    id: "bundle-legacy",
    training_cycle_id: null,
    status: "active",
    has_cardio: true,
  });
  const otherTenant = bundle({
    id: "bundle-other",
    company_id: OTHER,
    status: "active",
    has_strength: true,
  });

  const report = buildPrescriptionLibraryIntegrityReport(baseInput({
    trainingCycles: [cycle({ id: "cycle-current" })],
    prescriptionBundles: [complete, incomplete, failed, legacy, otherTenant],
    aiStrengthPlans: [
      plan({ id: "strength-complete", bundle_id: "bundle-complete" }),
      plan({ id: "strength-incomplete", bundle_id: "bundle-incomplete" }),
    ],
    runningPlans: [
      plan({ id: "run-complete", bundle_id: "bundle-complete", sport: "corrida" }),
      plan({ id: "swim-complete", bundle_id: "bundle-complete", sport: "natacao" }),
      plan({ id: "bike-complete", bundle_id: "bundle-complete", sport: "ciclismo" }),
    ],
    nutritionPlans: [
      plan({ id: "nutrition-complete", bundle_id: "bundle-complete" }),
    ],
    prescriptionBundleItems: [
      item({ bundle_id: "bundle-complete", modality: "musculacao", entity_type: "ai_strength_plan", entity_id: "strength-complete" }),
      item({ bundle_id: "bundle-complete", modality: "corrida", entity_type: "running_plan", entity_id: "run-complete" }),
      item({ bundle_id: "bundle-complete", modality: "natacao", entity_type: "running_plan", entity_id: "swim-complete" }),
      item({ bundle_id: "bundle-complete", modality: "ciclismo", entity_type: "running_plan", entity_id: "bike-complete" }),
      item({ bundle_id: "bundle-complete", modality: "nutricao", entity_type: "nutrition_plan", entity_id: "nutrition-complete" }),
      item({ bundle_id: "bundle-incomplete", modality: "musculacao", entity_type: "ai_strength_plan", entity_id: "strength-incomplete" }),
    ],
  }));

  assert.equal(report.bundles.total, 4);
  assert.equal(report.bundles.flags.has_strength, 3);
  assert.equal(report.bundles.flags.has_cardio, 2);
  assert.equal(report.bundles.flags.has_swimming, 1);
  assert.equal(report.bundles.flags.has_cycling, 1);
  assert.equal(report.bundles.flags.has_nutrition, 2);
  assert.equal(report.bundles.serving_current_cycle.active, 2);
  assert.equal(report.bundles.serving_current_cycle.complete, 1);
  assert.equal(report.bundles.serving_current_cycle.incomplete, 1);
  assert.equal(report.bundles.failed_attempts, 1);
  assert.equal(report.bundles.orphan_legacy_without_training_cycle_id, 1);
  assert.equal(report.bundles.serving_current_cycle.modality_checks.swimming.expected, 1);
  assert.equal(report.bundles.serving_current_cycle.modality_checks.cycling.expected, 1);
  assert.equal(report.bundles.serving_current_cycle.modality_checks.nutrition.expected, 2);
  assert.equal(report.bundles.serving_current_cycle.incomplete_reasons.nutrition_pointer, 1);
  assert.equal(report.bundles.serving_current_cycle.incomplete_reasons.nutrition_item, 1);
});

test("scheduled bundles in current non-superseded cycles serve, superseded cycles do not", () => {
  const report = buildPrescriptionLibraryIntegrityReport(baseInput({
    trainingCycles: [
      cycle({ id: "cycle-current" }),
      cycle({ id: "cycle-superseded", status: "superseded", superseded_at: "2026-09-02T00:00:00Z" }),
    ],
    prescriptionBundles: [
      bundle({
        id: "bundle-scheduled",
        status: "scheduled",
        has_nutrition: true,
        nutrition_plan_id: "nutrition-scheduled",
      }),
      bundle({
        id: "bundle-superseded-cycle",
        training_cycle_id: "cycle-superseded",
        status: "active",
        has_nutrition: true,
        nutrition_plan_id: "nutrition-hidden",
      }),
    ],
    nutritionPlans: [
      plan({ id: "nutrition-scheduled", bundle_id: "bundle-scheduled" }),
      plan({ id: "nutrition-hidden", training_cycle_id: "cycle-superseded", bundle_id: "bundle-superseded-cycle" }),
    ],
    prescriptionBundleItems: [
      item({ bundle_id: "bundle-scheduled", modality: "nutricao", entity_type: "nutrition_plan", entity_id: "nutrition-scheduled" }),
      item({ bundle_id: "bundle-superseded-cycle", modality: "nutricao", entity_type: "nutrition_plan", entity_id: "nutrition-hidden" }),
    ],
  }));

  assert.equal(report.bundles.serving_current_cycle.scheduled, 1);
  assert.equal(report.bundles.serving_current_cycle.complete, 1);
  assert.equal(report.bundles.current_cycle_not_serving, 0);
});
