#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const CANONICAL_REF = "zshrcgbyhzxpnlccssyz";
const url = process.env.AUDIT_SUPABASE_URL || "";
const key = process.env.AUDIT_SUPABASE_SERVICE_ROLE_KEY || "";

if (!url || !key) {
  throw new Error("Export AUDIT_SUPABASE_URL and AUDIT_SUPABASE_SERVICE_ROLE_KEY for this read-only audit.");
}
if (!url.includes(CANONICAL_REF)) {
  throw new Error(`Refusing non-canonical Supabase project; expected ${CANONICAL_REF}.`);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function fetchAll(table, select) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if ((data || []).length < 1000) return rows;
  }
}

const [exercises, targets, metadata, muscleGroups, overrides] = await Promise.all([
  fetchAll("exercise_library", "id, muscle_group, muscle_group_id, equipment, difficulty, video_url, youtube_video_id, video_path, thumbnail_url"),
  fetchAll("exercise_muscle_targets", "exercise_id, muscle_group_id, role, is_primary, volume_percentage"),
  fetchAll("exercise_metadata", "exercise_id, contraindications, pain_limitation_tags"),
  fetchAll("muscle_groups", "id, name"),
  fetchAll("company_exercise_volumes", "exercise_id, muscle_group_id, role, volume_percentage"),
]);

const targetCountByExercise = new Map();
const targetExerciseIds = new Set();
const percentageDistribution = {};
let inconsistentRoles = 0;
for (const target of targets) {
  targetExerciseIds.add(target.exercise_id);
  targetCountByExercise.set(target.exercise_id, (targetCountByExercise.get(target.exercise_id) || 0) + 1);
  const key = String(target.volume_percentage);
  percentageDistribution[key] = (percentageDistribution[key] || 0) + 1;
  if ((target.role === "primary") !== (target.is_primary === true)) inconsistentRoles += 1;
}

const targetCountDistribution = {};
for (const exercise of exercises) {
  const count = targetCountByExercise.get(exercise.id) || 0;
  targetCountDistribution[count] = (targetCountDistribution[count] || 0) + 1;
}

const metadataByExercise = new Map(metadata.map((row) => [row.exercise_id, row]));
const metadataWithoutSafety = exercises.filter((exercise) => {
  const row = metadataByExercise.get(exercise.id);
  return !row || (!(row.contraindications || []).length && !(row.pain_limitation_tags || []).length);
}).length;

const youtubeIdCounts = new Map();
for (const exercise of exercises) {
  if (exercise.youtube_video_id) {
    youtubeIdCounts.set(exercise.youtube_video_id, (youtubeIdCounts.get(exercise.youtube_video_id) || 0) + 1);
  }
}
const duplicateYoutubeIds = [...youtubeIdCounts.values()].filter((count) => count > 1);
const validYoutubeId = /^[A-Za-z0-9_-]{11}$/;
const validUrl = /^https:\/\//i;

const report = {
  generated_at: new Date().toISOString(),
  mode: "read_only",
  exercise_library: {
    total: exercises.length,
    missing_general_muscle_group: exercises.filter((row) => !row.muscle_group).length,
    missing_muscle_group_id: exercises.filter((row) => !row.muscle_group_id).length,
    missing_equipment: exercises.filter((row) => !row.equipment).length,
    missing_difficulty: exercises.filter((row) => !row.difficulty).length,
  },
  targets: {
    rows: targets.length,
    exercises_covered: targetExerciseIds.size,
    exercises_missing_targets: exercises.length - targetExerciseIds.size,
    target_count_per_exercise: targetCountDistribution,
    role_is_primary_conflicts: inconsistentRoles,
    volume_percentage_distribution: percentageDistribution,
    company_overrides: overrides.length,
  },
  safety_metadata: {
    rows: metadata.length,
    exercises_without_contraindications_and_pain_tags: metadataWithoutSafety,
  },
  taxonomy: {
    muscle_groups: muscleGroups.length,
  },
  media: {
    exercises_with_any_source: exercises.filter((row) => row.video_url || row.youtube_video_id || row.video_path).length,
    valid_youtube_ids: exercises.filter((row) => validYoutubeId.test(row.youtube_video_id || "")).length,
    direct_https_urls: exercises.filter((row) => validUrl.test(row.video_url || "")).length,
    video_paths: exercises.filter((row) => row.video_path).length,
    missing_thumbnails: exercises.filter((row) => !row.thumbnail_url).length,
    duplicate_youtube_ids: duplicateYoutubeIds.length,
    exercises_using_duplicate_youtube_ids: duplicateYoutubeIds.reduce((sum, count) => sum + count, 0),
  },
};

console.log(JSON.stringify(report, null, 2));
