import assert from "node:assert/strict";
import test from "node:test";

import { buildArtifacts } from "./generate-library-curation-v2.mjs";

test("curation v2 generator separates tracks and never auto-approves", () => {
  const result = buildArtifacts({
    generatedAt: "2026-08-20T12:00:00.000Z",
    muscleGroups: [{ id: "g1", name: "Peito" }, { id: "g2", name: "Tríceps" }],
    exercises: [
      { id: "e1", name: "Supino Reto", muscle_group: "Peito", muscle_group_id: "g1", youtube_video_id: "abcdefghijk" },
      { id: "e2", name: "Crucifixo na Máquina", muscle_group: "Peito", muscle_group_id: "g1", youtube_video_id: "abcdefghijk" },
      { id: "e3", name: "Rosca Scott Barra", muscle_group: "Bíceps", muscle_group_id: "g1", youtube_video_id: "uniquevideo1" },
    ],
    targets: [
      { exercise_id: "e1", muscle_group_id: "g1", role: "primary", is_primary: true, volume_percentage: 1 },
      { exercise_id: "e1", muscle_group_id: "g2", role: "secondary", is_primary: false, volume_percentage: 0.5 },
      { exercise_id: "e2", muscle_group_id: "g1", role: "primary", is_primary: true, volume_percentage: 1 },
      { exercise_id: "e2", muscle_group_id: "g2", role: "secondary", is_primary: false, volume_percentage: 0.5 },
      { exercise_id: "e3", muscle_group_id: "g1", role: "primary", is_primary: true, volume_percentage: 1 },
    ],
    metadata: [
      { exercise_id: "e1", contraindications: ["acute_shoulder_pain"], pain_limitation_tags: ["shoulder_pain"] },
      { exercise_id: "e2", contraindications: [], pain_limitation_tags: [] },
      { exercise_id: "e3", contraindications: [], pain_limitation_tags: [] },
    ],
    legacySources: [{ path: "legacy.csv", text: "exercise_id,exercise_name\ne1,Supino Reto\ne2,Nome Antigo\nmissing,Ausente\n" }],
  });

  assert.deepEqual(result.counts, {
    live_exercises: 3,
    target_rows: 5,
    single_target: 1,
    safety_metadata_gap: 2,
    duplicate_video_clusters: 1,
    duplicate_video_exercises: 2,
    reconciliation: { unchanged: 1, catalog_changed: 1, new: 1, missing_from_live: 1, duplicate_id_conflict: 0 },
    review_by_priority: { P0: 2, P1: 1, P2: 0, P3: 0 },
  });
  assert.match(result.files["library-curation-v2-p0-review.csv"], /Rosca Scott Barra/);
  assert.match(result.files["library-curation-v2-p0-review.csv"], /Crucifixo na Máquina/);
  assert.match(result.files["library-curation-v2-p0-review.csv"], /p0_target_inconsistency/);
  assert.match(result.files["library-curation-v2-video-clusters.csv"], /yt-001/);
  for (const filename of Object.keys(result.files).filter((name) => name.includes("review.csv"))) {
    assert.doesNotMatch(result.files[filename], /,"approved",/);
    assert.doesNotMatch(result.files[filename], /,"true"/);
  }
});

test("curation v2 output is deterministic for a frozen timestamp", () => {
  const input = {
    generatedAt: "2026-08-20T12:00:00.000Z",
    muscleGroups: [{ id: "g1", name: "Peito" }],
    exercises: [{ id: "e1", name: "Exercício", muscle_group: "Peito", muscle_group_id: "g1" }],
    targets: [{ exercise_id: "e1", muscle_group_id: "g1", role: "primary", is_primary: true, volume_percentage: 1 }],
    metadata: [{ exercise_id: "e1", contraindications: [], pain_limitation_tags: [] }],
    legacySources: [{ path: "legacy.csv", text: "exercise_id,exercise_name\ne1,Exercício\n" }],
  };
  assert.deepEqual(buildArtifacts(input), buildArtifacts(input));
});
