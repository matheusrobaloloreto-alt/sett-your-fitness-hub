#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";
import { assertCanonicalSupabaseUrl } from "./lib/canonical-supabase-url.mjs";

const DEFAULT_COMPANY_SLUG = "bn-performance-training";
const PAGE_SIZE = 1000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const FLAG_DEFINITIONS = [
  { flag: "has_strength", key: "strength", itemModalities: ["musculacao", "strength"], table: "ai_strength_plans", pointer: "strength_plan_id", entityTypes: ["ai_strength_plan", "strength_plan"] },
  { flag: "has_cardio", key: "cardio", itemModalities: ["corrida", "cardio", "running"], table: "running_plans", pointer: "running_plan_id", entityTypes: ["running_plan"], sports: ["corrida", "running", "run", "cardio", "caminhada"] },
  { flag: "has_swimming", key: "swimming", itemModalities: ["natacao", "natação", "swimming"], table: "running_plans", pointer: "running_plan_id", entityTypes: ["running_plan"], sports: ["natacao", "natação", "swimming", "swim"] },
  { flag: "has_cycling", key: "cycling", itemModalities: ["ciclismo", "cycling", "bike", "pedal"], table: "running_plans", pointer: "running_plan_id", entityTypes: ["running_plan"], sports: ["ciclismo", "cycling", "bike", "pedal"] },
  { flag: "has_nutrition", key: "nutrition", itemModalities: ["nutricao", "nutrição", "nutrition"], table: "nutrition_plans", pointer: "nutrition_plan_id", entityTypes: ["nutrition_plan"] },
];

export function normalizeExerciseName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function bool(value) {
  return value === true;
}

function countWhere(rows, predicate) {
  return rows.reduce((total, row) => total + (predicate(row) ? 1 : 0), 0);
}

function hasText(value) {
  return clean(value).length > 0;
}

function nonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function normalizedToken(value) {
  return normalizeExerciseName(value).replace(/\s+/g, "_");
}

function isCurrentCycle(cycle, businessDate) {
  return (!cycle.start_date || cycle.start_date <= businessDate)
    && (!cycle.end_date || cycle.end_date >= businessDate);
}

function isSupersededCycle(cycle) {
  return clean(cycle?.status).toLowerCase() === "superseded"
    || Boolean(cycle?.superseded_at)
    || Boolean(cycle?.superseded_by_cycle_id);
}

function isSupersededWorkout(workout) {
  return Boolean(workout?.superseded_at) || Boolean(workout?.superseded_by_revision_id);
}

function isServingStatus(status) {
  return ["active", "scheduled"].includes(clean(status || "active").toLowerCase());
}

function isFailedBundle(bundle) {
  return clean(bundle.status).toLowerCase() === "failed" || hasText(bundle.generation_error);
}

function sourceScope(exercise, companyId) {
  if (bool(exercise.is_global)) return "global";
  if (exercise.company_id === companyId) return "company";
  return "hidden";
}

function visibleExerciseRows(exercises, companyId) {
  return exercises.filter((exercise) => {
    const scope = sourceScope(exercise, companyId);
    return scope === "global" || scope === "company";
  });
}

function safetyMetadataByExercise(metadata) {
  return new Map(metadata.map((row) => [row.exercise_id, row]));
}

function hasSafetyMetadata(row) {
  return Boolean(row)
    && (nonEmptyArray(row.contraindications) || nonEmptyArray(row.pain_limitation_tags));
}

function targetCoverageByExercise(targets) {
  const coverage = new Map();
  for (const target of targets) {
    const current = coverage.get(target.exercise_id) || { total: 0, primary: 0 };
    current.total += 1;
    if (target.is_primary === true || clean(target.role).toLowerCase() === "primary") current.primary += 1;
    coverage.set(target.exercise_id, current);
  }
  return coverage;
}

function videoSourceCounts(rows) {
  return {
    youtube_video_id: countWhere(rows, (row) => hasText(row.youtube_video_id)),
    direct_https_url: countWhere(rows, (row) => /^https:\/\//i.test(clean(row.video_url))),
    storage_path: countWhere(rows, (row) => hasText(row.video_path)),
    any: countWhere(rows, (row) => hasText(row.youtube_video_id) || hasText(row.video_url) || hasText(row.video_path)),
    none: countWhere(rows, (row) => !hasText(row.youtube_video_id) && !hasText(row.video_url) && !hasText(row.video_path)),
  };
}

function catalogScopeSummary(rows, targetsByExercise, metadataByExercise) {
  return {
    total: rows.length,
    targets: {
      with_any: countWhere(rows, (row) => (targetsByExercise.get(row.id)?.total || 0) > 0),
      without_any: countWhere(rows, (row) => (targetsByExercise.get(row.id)?.total || 0) === 0),
      with_primary: countWhere(rows, (row) => (targetsByExercise.get(row.id)?.primary || 0) > 0),
      without_primary: countWhere(rows, (row) => (targetsByExercise.get(row.id)?.primary || 0) === 0),
    },
    safety_metadata: {
      with_contraindications_or_pain_tags: countWhere(rows, (row) => hasSafetyMetadata(metadataByExercise.get(row.id))),
      without_contraindications_or_pain_tags: countWhere(rows, (row) => !hasSafetyMetadata(metadataByExercise.get(row.id))),
    },
    equipment: {
      present: countWhere(rows, (row) => hasText(row.equipment)),
      missing: countWhere(rows, (row) => !hasText(row.equipment)),
    },
    muscle_group_id: {
      present: countWhere(rows, (row) => hasText(row.muscle_group_id)),
      missing: countWhere(rows, (row) => !hasText(row.muscle_group_id)),
    },
    video_sources: videoSourceCounts(rows),
  };
}

function buildVisibleNameIndex(exercises) {
  const index = new Map();
  for (const exercise of exercises) {
    const key = normalizeExerciseName(exercise.name);
    if (!key) continue;
    index.set(key, (index.get(key) || 0) + 1);
  }
  return index;
}

function extractExerciseSlots(workout) {
  const exercises = Array.isArray(workout.exercises) ? workout.exercises : [];
  return exercises.map((exercise) => ({
    exercise_id: clean(exercise?.exercise_id || ""),
    exercise_name: clean(exercise?.exercise_name || exercise?.name || exercise?.title || ""),
  }));
}

function summarizeBrokenWorkoutLinks({ workouts, trainingCycles, visibleExerciseIds, visibleNameIndex, businessDate, companyId }) {
  const cyclesById = new Map(
    trainingCycles
      .filter((cycle) => cycle.company_id === companyId)
      .map((cycle) => [cycle.id, cycle]),
  );
  const grouped = new Map();
  let totalSlots = 0;
  let brokenSlots = 0;

  for (const workout of workouts) {
    const cycle = cyclesById.get(workout.cycle_id);
    if (!cycle) continue;
    if (workout.company_id && workout.company_id !== companyId) continue;
    if (isSupersededWorkout(workout)) continue;

    const cycleSuperseded = isSupersededCycle(cycle);
    const nonSuperseded = !cycleSuperseded;
    const current = nonSuperseded && isCurrentCycle(cycle, businessDate);

    for (const slot of extractExerciseSlots(workout)) {
      totalSlots += 1;
      if (slot.exercise_id && visibleExerciseIds.has(slot.exercise_id)) continue;
      brokenSlots += 1;

      const normalized = normalizeExerciseName(slot.exercise_name);
      const key = normalized || "(sem nome)";
      const currentGroup = grouped.get(key) || {
        exercise_name: slot.exercise_name || "(sem nome)",
        normalized_name: normalized,
        count: 0,
        current_cycle_slots: 0,
        non_superseded_cycle_slots: 0,
        exact_normalized_matches_in_visible_catalog: visibleNameIndex.get(normalized) || 0,
        match_status: "missing",
      };
      currentGroup.count += 1;
      if (current) currentGroup.current_cycle_slots += 1;
      if (nonSuperseded) currentGroup.non_superseded_cycle_slots += 1;
      const matches = currentGroup.exact_normalized_matches_in_visible_catalog;
      currentGroup.match_status = matches === 0 ? "missing" : matches === 1 ? "recoverable_exact_match" : "ambiguous_exact_match";
      grouped.set(key, currentGroup);
    }
  }

  const byExerciseName = [...grouped.values()]
    .sort((left, right) => right.count - left.count || left.exercise_name.localeCompare(right.exercise_name));

  return {
    total_workout_exercise_slots_reviewed: totalSlots,
    broken_slots: brokenSlots,
    grouped_by_exercise_name: byExerciseName,
  };
}

function indexPlans(rows, companyId) {
  return new Map(rows.filter((row) => row.company_id === companyId).map((row) => [row.id, row]));
}

function planMatchesBundleContext(plan, bundle) {
  if (!plan) return false;
  if (plan.company_id !== bundle.company_id || plan.student_id !== bundle.student_id) return false;
  if (bundle.training_cycle_id && plan.training_cycle_id !== bundle.training_cycle_id) return false;
  if (plan.bundle_id && plan.bundle_id !== bundle.id) return false;
  return true;
}

function sportMatches(plan, definition) {
  if (!definition.sports) return true;
  const sport = normalizedToken(plan?.sport || "corrida");
  return definition.sports.map(normalizedToken).includes(sport);
}

function itemMatchesDefinition(item, definition) {
  const modality = normalizedToken(item.modality);
  const type = normalizedToken(item.entity_type);
  return definition.itemModalities.map(normalizedToken).includes(modality)
    && definition.entityTypes.map(normalizedToken).includes(type);
}

function pointerPlanForDefinition(definition, bundle, plansByTable) {
  const plans = plansByTable[definition.table];
  const pointerId = clean(bundle[definition.pointer]);
  if (!pointerId) return null;
  const pointerPlan = plans.get(pointerId);
  if (!pointerPlan || !planMatchesBundleContext(pointerPlan, bundle)) return null;
  return pointerPlan;
}

function findContextualPlanForDefinition(definition, bundle, pointerPlan, items, plansByTable) {
  const plans = plansByTable[definition.table];
  if (pointerPlan && sportMatches(pointerPlan, definition)) return pointerPlan;

  for (const item of items) {
    if (!itemMatchesDefinition(item, definition)) continue;
    const itemPlan = plans.get(item.entity_id);
    if (itemPlan && planMatchesBundleContext(itemPlan, bundle) && sportMatches(itemPlan, definition)) {
      return itemPlan;
    }
  }

  for (const plan of plans.values()) {
    if (
      planMatchesBundleContext(plan, bundle)
      && sportMatches(plan, definition)
      && plan.bundle_id === bundle.id
    ) {
      return plan;
    }
  }
  return null;
}

function hasValidBundleItem(definition, bundle, plan, items) {
  if (!plan) return false;
  return items.some((item) => (
    item.bundle_id === bundle.id
    && item.company_id === bundle.company_id
    && item.student_id === bundle.student_id
    && item.entity_id === plan.id
    && itemMatchesDefinition(item, definition)
  ));
}

function enabledDefinitions(bundle) {
  return FLAG_DEFINITIONS.filter((definition) => bool(bundle[definition.flag]));
}

function checkBundleCompleteness(bundle, itemsByBundle, plansByTable) {
  const missing = [];
  const modalities = {};
  const items = itemsByBundle.get(bundle.id) || [];

  for (const definition of enabledDefinitions(bundle)) {
    const pointerValue = clean(bundle[definition.pointer]);
    const pointerPlan = pointerPlanForDefinition(definition, bundle, plansByTable);
    const contextualPlan = findContextualPlanForDefinition(definition, bundle, pointerPlan, items, plansByTable);
    const pointerPersisted = Boolean(pointerPlan);
    const contextualPlanExists = Boolean(contextualPlan);
    const itemOk = hasValidBundleItem(definition, bundle, contextualPlan, items);
    modalities[definition.key] = {
      pointer_persisted: pointerPersisted,
      pointer_status: !pointerValue ? "missing" : pointerPersisted ? "persisted" : "stale_or_mismatch",
      contextual_plan_exists: contextualPlanExists,
      item_ok: itemOk,
    };
    if (!pointerPersisted) missing.push(`${definition.key}_pointer_persisted`);
    if (!contextualPlanExists) missing.push(`${definition.key}_contextual_plan`);
    if (!itemOk) missing.push(`${definition.key}_item`);
  }

  return { complete: missing.length === 0, missing, modalities };
}

function summarizeBundles({
  companyId,
  businessDate,
  trainingCycles,
  prescriptionBundles,
  prescriptionBundleItems,
  aiStrengthPlans,
  runningPlans,
  nutritionPlans,
}) {
  const cyclesById = new Map(
    trainingCycles
      .filter((cycle) => cycle.company_id === companyId)
      .map((cycle) => [cycle.id, cycle]),
  );
  const itemsByBundle = new Map();
  for (const item of prescriptionBundleItems.filter((row) => row.company_id === companyId)) {
    if (!itemsByBundle.has(item.bundle_id)) itemsByBundle.set(item.bundle_id, []);
    itemsByBundle.get(item.bundle_id).push(item);
  }
  const plansByTable = {
    ai_strength_plans: indexPlans(aiStrengthPlans, companyId),
    running_plans: indexPlans(runningPlans, companyId),
    nutrition_plans: indexPlans(nutritionPlans, companyId),
  };
  const reasonCounts = {};
  const modalityChecks = Object.fromEntries(FLAG_DEFINITIONS.map(({ key }) => [key, {
    expected: 0,
    pointer_persisted: 0,
    pointer_missing: 0,
    pointer_stale_or_mismatch: 0,
    pointer_not_persisted: 0,
    contextual_plan_exists: 0,
    contextual_plan_missing: 0,
    item_ok: 0,
    item_missing: 0,
  }]));
  const flagCounts = Object.fromEntries(FLAG_DEFINITIONS.map(({ flag }) => [flag, 0]));
  const statusCounts = {};
  let failedAttempts = 0;
  let orphanLegacyWithoutCycle = 0;
  let servingActiveCurrent = 0;
  let servingScheduledCurrent = 0;
  let completeServingCurrent = 0;
  let incompleteServingCurrent = 0;
  let currentNotServing = 0;

  for (const bundle of prescriptionBundles.filter((row) => row.company_id === companyId)) {
    const status = clean(bundle.status || "active").toLowerCase() || "active";
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    for (const { flag } of FLAG_DEFINITIONS) {
      if (bool(bundle[flag])) flagCounts[flag] += 1;
    }
    if (isFailedBundle(bundle)) {
      failedAttempts += 1;
      continue;
    }
    if (!bundle.training_cycle_id) {
      orphanLegacyWithoutCycle += 1;
      continue;
    }
    const cycle = cyclesById.get(bundle.training_cycle_id);
    const servingCurrent = Boolean(cycle)
      && !isSupersededCycle(cycle)
      && isCurrentCycle(cycle, businessDate)
      && isServingStatus(status);
    if (!servingCurrent) {
      if (cycle && !isSupersededCycle(cycle) && isCurrentCycle(cycle, businessDate)) currentNotServing += 1;
      continue;
    }

    if (status === "scheduled") servingScheduledCurrent += 1;
    else servingActiveCurrent += 1;

    const completeness = checkBundleCompleteness(bundle, itemsByBundle, plansByTable);
    for (const definition of enabledDefinitions(bundle)) {
      modalityChecks[definition.key].expected += 1;
      const result = completeness.modalities[definition.key] || {};
      if (result.pointer_persisted) modalityChecks[definition.key].pointer_persisted += 1;
      if (result.pointer_status === "missing") modalityChecks[definition.key].pointer_missing += 1;
      if (result.pointer_status === "stale_or_mismatch") modalityChecks[definition.key].pointer_stale_or_mismatch += 1;
      if (!result.pointer_persisted) modalityChecks[definition.key].pointer_not_persisted += 1;
      if (result.contextual_plan_exists) modalityChecks[definition.key].contextual_plan_exists += 1;
      if (!result.contextual_plan_exists) modalityChecks[definition.key].contextual_plan_missing += 1;
      if (result.item_ok) modalityChecks[definition.key].item_ok += 1;
      if (!result.item_ok) modalityChecks[definition.key].item_missing += 1;
    }
    if (completeness.complete) {
      completeServingCurrent += 1;
    } else {
      incompleteServingCurrent += 1;
      for (const reason of completeness.missing) reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    }
  }

  return {
    total: prescriptionBundles.filter((row) => row.company_id === companyId).length,
    status_counts: statusCounts,
    flags: flagCounts,
    serving_current_cycle: {
      active: servingActiveCurrent,
      scheduled: servingScheduledCurrent,
      complete: completeServingCurrent,
      incomplete: incompleteServingCurrent,
      incomplete_reasons: reasonCounts,
      modality_checks: modalityChecks,
    },
    current_cycle_not_serving: currentNotServing,
    failed_attempts: failedAttempts,
    orphan_legacy_without_training_cycle_id: orphanLegacyWithoutCycle,
  };
}

export function buildPrescriptionLibraryIntegrityReport(input) {
  const companyId = input.companyId || input.company?.id;
  const companySlug = input.companySlug || input.company?.slug || DEFAULT_COMPANY_SLUG;
  const businessDate = clean(input.businessDate);
  if (!companyId) throw new Error("company_id_required");
  if (!YMD.test(businessDate)) throw new Error("business_date_required");

  const visibleExercises = visibleExerciseRows(input.exercises || [], companyId);
  const visibleExerciseIds = new Set(visibleExercises.map((exercise) => exercise.id));
  const targets = (input.targets || []).filter((target) => visibleExerciseIds.has(target.exercise_id));
  const metadata = (input.metadata || []).filter((row) => visibleExerciseIds.has(row.exercise_id));
  const targetsByExercise = targetCoverageByExercise(targets);
  const metadataByExercise = safetyMetadataByExercise(metadata);
  const globalRows = visibleExercises.filter((exercise) => sourceScope(exercise, companyId) === "global");
  const companyRows = visibleExercises.filter((exercise) => sourceScope(exercise, companyId) === "company");
  const visibleNameIndex = buildVisibleNameIndex(visibleExercises);

  return {
    mode: "read_only",
    contains_pii: false,
    company_slug: companySlug,
    business_date: businessDate,
    catalog_visible: {
      global: catalogScopeSummary(globalRows, targetsByExercise, metadataByExercise),
      company: catalogScopeSummary(companyRows, targetsByExercise, metadataByExercise),
      total: catalogScopeSummary(visibleExercises, targetsByExercise, metadataByExercise),
    },
    workout_broken_links: summarizeBrokenWorkoutLinks({
      workouts: input.workouts || [],
      trainingCycles: input.trainingCycles || [],
      visibleExerciseIds,
      visibleNameIndex,
      businessDate,
      companyId,
    }),
    bundles: summarizeBundles({
      companyId,
      businessDate,
      trainingCycles: input.trainingCycles || [],
      prescriptionBundles: input.prescriptionBundles || [],
      prescriptionBundleItems: input.prescriptionBundleItems || [],
      aiStrengthPlans: input.aiStrengthPlans || [],
      runningPlans: input.runningPlans || [],
      nutritionPlans: input.nutritionPlans || [],
    }),
  };
}

async function fetchAll(queryFactory, label) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await queryFactory().range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    rows.push(...(data || []));
    if ((data || []).length < PAGE_SIZE) return rows;
  }
}

async function fetchByIds(supabase, table, select, column, ids) {
  const rows = [];
  const values = [...ids].filter(Boolean);
  for (let index = 0; index < values.length; index += 500) {
    const chunk = values.slice(index, index + 500);
    rows.push(...await fetchAll(() => supabase.from(table).select(select).in(column, chunk), table));
  }
  return rows;
}

async function fetchBusinessDate(supabase) {
  const { data, error } = await supabase.rpc("current_business_date");
  if (error) throw new Error(`current_business_date: ${error.message}`);
  if (!YMD.test(clean(data))) throw new Error("current_business_date returned an invalid value");
  return data;
}

async function loadAuditInputFromSupabase({ supabase, companySlug }) {
  const businessDate = await fetchBusinessDate(supabase);
  const companies = await fetchAll(
    () => supabase.from("companies").select("id,slug").eq("slug", companySlug),
    "companies",
  );
  const company = companies[0];
  if (!company) throw new Error(`Company not found for AUDIT_COMPANY_SLUG=${companySlug}`);

  const exercises = await fetchAll(
    () => supabase
      .from("exercise_library")
      .select("id,company_id,name,muscle_group,muscle_group_id,equipment,is_global,video_url,youtube_video_id,video_path,thumbnail_url")
      .or(`is_global.eq.true,company_id.eq.${company.id}`),
    "exercise_library",
  );
  const exerciseIds = new Set(exercises.map((row) => row.id));
  const trainingCycles = await fetchAll(
    () => supabase
      .from("training_cycles")
      .select("id,company_id,student_id,status,start_date,end_date,superseded_at,superseded_by_cycle_id")
      .eq("company_id", company.id),
    "training_cycles",
  );
  const cycleIds = new Set(trainingCycles.map((row) => row.id));

  const [
    targets,
    metadata,
    workouts,
    prescriptionBundles,
    prescriptionBundleItems,
    aiStrengthPlans,
    runningPlans,
    nutritionPlans,
  ] = await Promise.all([
    fetchByIds(supabase, "exercise_muscle_targets", "exercise_id,muscle_group_id,role,is_primary,volume_percentage", "exercise_id", exerciseIds),
    fetchByIds(supabase, "exercise_metadata", "exercise_id,contraindications,pain_limitation_tags,regressions,progressions,equivalent_substitutes", "exercise_id", exerciseIds),
    fetchByIds(supabase, "workouts", "id,company_id,cycle_id,exercises,superseded_at,superseded_by_revision_id", "cycle_id", cycleIds),
    fetchAll(() => supabase.from("prescription_bundles").select("id,company_id,student_id,training_cycle_id,status,generation_error,modalities,strength_plan_id,running_plan_id,nutrition_plan_id,has_strength,has_cardio,has_swimming,has_cycling,has_nutrition").eq("company_id", company.id), "prescription_bundles"),
    fetchAll(() => supabase.from("prescription_bundle_items").select("bundle_id,company_id,student_id,modality,entity_type,entity_id").eq("company_id", company.id), "prescription_bundle_items"),
    fetchAll(() => supabase.from("ai_strength_plans").select("id,company_id,student_id,training_cycle_id,bundle_id").eq("company_id", company.id), "ai_strength_plans"),
    fetchAll(() => supabase.from("running_plans").select("id,company_id,student_id,training_cycle_id,bundle_id,sport,status").eq("company_id", company.id), "running_plans"),
    fetchAll(() => supabase.from("nutrition_plans").select("id,company_id,student_id,training_cycle_id,bundle_id,status").eq("company_id", company.id), "nutrition_plans"),
  ]);

  return {
    company,
    companySlug,
    businessDate,
    exercises,
    targets,
    metadata,
    workouts,
    trainingCycles,
    prescriptionBundles,
    prescriptionBundleItems,
    aiStrengthPlans,
    runningPlans,
    nutritionPlans,
  };
}

export async function runCli(env = process.env) {
  const rawUrl = clean(env.AUDIT_SUPABASE_URL);
  const key = clean(env.AUDIT_SUPABASE_SERVICE_ROLE_KEY);
  const companySlug = clean(env.AUDIT_COMPANY_SLUG) || DEFAULT_COMPANY_SLUG;
  if (!rawUrl || !key) {
    throw new Error("Export AUDIT_SUPABASE_URL and AUDIT_SUPABASE_SERVICE_ROLE_KEY for this read-only audit.");
  }
  const canonicalUrl = assertCanonicalSupabaseUrl(rawUrl);
  const supabase = createClient(canonicalUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const input = await loadAuditInputFromSupabase({ supabase, companySlug });
  const report = buildPrescriptionLibraryIntegrityReport(input);
  return { generated_at: new Date().toISOString(), ...report };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
