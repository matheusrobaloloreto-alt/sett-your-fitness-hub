#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { buildArtifacts } from "./generate-library-curation-v2.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outputArg = process.argv.indexOf("--output-dir");
const outputDir = outputArg >= 0
  ? path.resolve(process.argv[outputArg + 1])
  : path.join(ROOT, "docs/prescription/curation-v2");
const snapshotPath = path.join(outputDir, "library-curation-v2-catalog-snapshot.json");
const runSummaryPath = path.join(outputDir, "library-curation-v2-run-summary.json");
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));

const exercises = snapshot.exercises.map((exercise) => ({
  id: exercise.exercise_id,
  name: exercise.exercise_name,
  muscle_group: exercise.muscle_group,
  muscle_group_id: exercise.muscle_group_id,
  equipment: exercise.equipment,
  difficulty: exercise.difficulty,
  youtube_video_id: exercise.media.youtube_video_id,
  video_url: exercise.media.video_url,
  video_path: exercise.media.video_path,
  thumbnail_url: exercise.media.thumbnail_url,
}));
const targets = snapshot.exercises.flatMap((exercise) => exercise.targets.map((target) => ({
  exercise_id: exercise.exercise_id,
  muscle_group_id: target.muscle_group_id,
  role: target.role,
  is_primary: target.is_primary,
  volume_percentage: target.volume_percentage,
})));
const metadata = snapshot.exercises.map((exercise) => ({ exercise_id: exercise.exercise_id, ...exercise.metadata }));
const groupNames = new Map();
for (const exercise of snapshot.exercises) {
  for (const target of exercise.targets) groupNames.set(target.muscle_group_id, target.muscle_group_name);
}
const muscleGroups = [...groupNames].map(([id, name]) => ({ id, name }));
const legacySources = [
  "docs/prescription/library-curation-v1-consolidated-manifest.csv",
  "docs/prescription/library-curation-v1-catalog-delta.csv",
].map((relative) => ({ path: relative, text: fs.readFileSync(path.join(ROOT, relative), "utf8") }));

const result = buildArtifacts({
  exercises,
  targets,
  metadata,
  muscleGroups,
  legacySources,
  generatedAt: snapshot.generated_at,
});
const count = result.counts.target_signature_outliers;
const highSignalCount = result.counts.target_signature_high_signal;
fs.writeFileSync(
  path.join(outputDir, "library-curation-v2-target-signature-outliers.csv"),
  result.files["library-curation-v2-target-signature-outliers.csv"],
);
fs.writeFileSync(
  path.join(outputDir, "library-curation-v2-target-signature-high-signal-review.csv"),
  result.files["library-curation-v2-target-signature-high-signal-review.csv"],
);

snapshot.counts.target_signature_outliers = count;
snapshot.counts.target_signature_high_signal = highSignalCount;
fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
const runSummary = JSON.parse(fs.readFileSync(runSummaryPath, "utf8"));
runSummary.counts.target_signature_outliers = count;
runSummary.counts.target_signature_high_signal = highSignalCount;
fs.writeFileSync(runSummaryPath, `${JSON.stringify(runSummary, null, 2)}\n`);

console.log(JSON.stringify({
  mode: "snapshot_derived_read_only",
  contains_pii: false,
  target_signature_outliers: count,
  target_signature_high_signal: highSignalCount,
  output_file: "library-curation-v2-target-signature-outliers.csv",
}, null, 2));
