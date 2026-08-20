#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { assertCanonicalSupabaseUrl } from "../lib/canonical-supabase-url.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_OUTPUT = path.join(ROOT, "docs/prescription/curation-v2");
const LEGACY_FILES = [
  "docs/prescription/library-curation-v1-consolidated-manifest.csv",
  "docs/prescription/library-curation-v1-catalog-delta.csv",
];

const P0_NAMES = new Set([
  "rosca scott barra",
  "remada alta barra",
  "crucifixo na maquina",
  "kettlebell swing",
  "mobilidade sapinho",
  "prancha com pes no trx",
  "pulldown barra",
  "pulldown corda",
  "flexao de braco",
  "graviton pronado",
  "serrote banco",
  "step up",
]);

const P1_PATTERN = /agach|terra|rdl|stiff|afundo|leg press|levantamento|desenvolvimento|overhead|supino|remada|puxada|barra fixa|salto|pliometr|burpee|swing|step.?up|subida|crucifixo|pulldown/i;

export function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((cells) => cells.some((cell) => cell.trim()));
  if (!nonEmpty.length) return [];
  const headers = nonEmpty[0].map((cell) => cell.trim());
  return nonEmpty.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, (cells[index] || "").trim()])));
}

const hash = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const sorted = (rows, key = "id") => [...rows].sort((a, b) => String(a[key] || "").localeCompare(String(b[key] || "")));
const list = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
const csv = (headers, rows) => `${headers.map(csvCell).join(",")}\n${rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")).join("\n")}\n`;
const isP0Name = (name) => {
  const normalized = normalize(name);
  return [...P0_NAMES].some((candidate) => normalized.includes(candidate));
};

function canonicalSourceGroup(value) {
  const group = normalize(value);
  if (["peito", "peitoral"].includes(group)) return "peitoral";
  if (["costas", "dorsal"].includes(group)) return "costas";
  if (["abdomen", "abdominais"].includes(group)) return "abdomen";
  if (["ombro", "ombros"].includes(group)) return "ombro";
  return group;
}

function canonicalTargetPercentage(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value ?? "");
  const percentage = numeric >= 0 && numeric <= 1 ? numeric * 100 : numeric;
  return String(Number(percentage.toFixed(6)));
}

function targetSignature(targets) {
  return targets
    .map((target) => `${target.muscle_group_name}:${target.role}:${canonicalTargetPercentage(target.volume_percentage)}`)
    .sort()
    .join(" | ");
}

function legacyIndex(legacySources) {
  const byId = new Map();
  for (const source of legacySources) {
    for (const row of parseCsv(source.text)) {
      const id = row.exercise_id;
      if (!id) continue;
      const name = row.exercise_name || row.name || "";
      const entry = byId.get(id) || { names: new Set(), sources: new Set() };
      if (name) entry.names.add(name);
      entry.sources.add(source.path);
      byId.set(id, entry);
    }
  }
  return byId;
}

function priorityFor(exercise, isCandidate) {
  if (!isCandidate) return "";
  const exerciseName = exercise.exercise_name || exercise.name || "";
  if (isP0Name(exerciseName)) return "P0";
  if (P1_PATTERN.test(exerciseName)) return "P1";
  if ((exercise.targets || []).length === 1 || exercise.safety_gap) return "P2";
  return "P3";
}

export function buildArtifacts({ exercises, targets, metadata, muscleGroups, legacySources, generatedAt }) {
  const groupsById = new Map(muscleGroups.map((row) => [row.id, row.name]));
  const targetsByExercise = new Map();
  for (const row of targets) {
    const bucket = targetsByExercise.get(row.exercise_id) || [];
    bucket.push({
      muscle_group_id: row.muscle_group_id,
      muscle_group_name: groupsById.get(row.muscle_group_id) || "",
      role: row.role,
      is_primary: row.is_primary,
      volume_percentage: row.volume_percentage,
    });
    targetsByExercise.set(row.exercise_id, bucket);
  }
  const metadataByExercise = new Map(metadata.map((row) => [row.exercise_id, row]));
  const youtubeCounts = new Map();
  for (const row of exercises) if (row.youtube_video_id) youtubeCounts.set(row.youtube_video_id, (youtubeCounts.get(row.youtube_video_id) || 0) + 1);

  const records = sorted(exercises).map((row) => {
    const exerciseTargets = sorted(targetsByExercise.get(row.id) || [], "muscle_group_id");
    const meta = metadataByExercise.get(row.id) || {};
    return {
      exercise_id: row.id,
      exercise_name: row.name,
      muscle_group: row.muscle_group || "",
      muscle_group_id: row.muscle_group_id || "",
      equipment: row.equipment || "",
      difficulty: row.difficulty || "",
      targets: exerciseTargets,
      metadata: {
        contraindications: list(meta.contraindications),
        pain_limitation_tags: list(meta.pain_limitation_tags),
        equivalent_substitutes: list(meta.equivalent_substitutes),
        regressions: list(meta.regressions),
        progressions: list(meta.progressions),
      },
      media: {
        youtube_video_id: row.youtube_video_id || "",
        video_url: row.video_url || "",
        video_path: row.video_path || "",
        thumbnail_url: row.thumbnail_url || "",
      },
      safety_gap: list(meta.contraindications).length === 0 && list(meta.pain_limitation_tags).length === 0,
      duplicate_video_cluster: Boolean(row.youtube_video_id && youtubeCounts.get(row.youtube_video_id) > 1),
    };
  });

  const old = legacyIndex(legacySources);
  const liveIds = new Set(records.map((row) => row.exercise_id));
  const reconciliation = records.map((row) => {
    const previous = old.get(row.exercise_id);
    let status = "new";
    if (previous) {
      const normalizedNames = [...previous.names].map(normalize);
      status = previous.names.size > 1 ? "duplicate_id_conflict" : normalizedNames.includes(normalize(row.exercise_name)) ? "unchanged" : "catalog_changed";
    }
    return {
      exercise_id: row.exercise_id,
      exercise_name: row.exercise_name,
      reconciliation_status: status,
      legacy_names: previous ? [...previous.names].sort().join(" | ") : "",
      legacy_sources: previous ? [...previous.sources].sort().join(" | ") : "",
    };
  });
  for (const [id, previous] of old) {
    if (!liveIds.has(id)) reconciliation.push({
      exercise_id: id,
      exercise_name: "",
      reconciliation_status: "missing_from_live",
      legacy_names: [...previous.names].sort().join(" | "),
      legacy_sources: [...previous.sources].sort().join(" | "),
    });
  }
  reconciliation.sort((a, b) => a.exercise_id.localeCompare(b.exercise_id));

  const signatureClusters = new Map();
  for (const row of records) {
    const signature = targetSignature(row.targets);
    const sourceGroup = canonicalSourceGroup(row.muscle_group);
    if (!signature || !sourceGroup) continue;
    const cluster = signatureClusters.get(signature) || [];
    cluster.push({ row, sourceGroup });
    signatureClusters.set(signature, cluster);
  }
  const signatureOutliers = [];
  for (const [signature, cluster] of signatureClusters) {
    if (cluster.length < 10) continue;
    const groupCounts = new Map();
    for (const item of cluster) groupCounts.set(item.sourceGroup, (groupCounts.get(item.sourceGroup) || 0) + 1);
    const ranked = [...groupCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const [dominantGroup, dominantCount] = ranked[0] || ["", 0];
    const dominantShare = dominantCount / cluster.length;
    if (!dominantGroup || dominantShare < 0.5 || ranked[1]?.[1] === dominantCount) continue;
    for (const { row, sourceGroup } of cluster) {
      if (sourceGroup === dominantGroup) continue;
      signatureOutliers.push({
        exercise_id: row.exercise_id,
        exercise_name: row.exercise_name,
        source_muscle_group: row.muscle_group,
        target_signature: signature,
        signature_cluster_size: cluster.length,
        dominant_source_group: dominantGroup,
        dominant_source_count: dominantCount,
        dominant_share: dominantShare.toFixed(4),
        review_status: "needs_review",
        evidence: `Repeated target signature is dominated by source group ${dominantGroup}; verify copy/template contamination without inferring replacement targets.`,
        ready_for_upsert: "false",
      });
    }
  }
  signatureOutliers.sort((a, b) => a.exercise_name.localeCompare(b.exercise_name) || a.exercise_id.localeCompare(b.exercise_id));
  const signatureHighSignal = signatureOutliers.filter((row) => /^(flexao de punho|cadeira flexora|coice polia|gluteo coice|remada alta|crucifixo invertido|rosca scott|extensao de quadril banco romano)/.test(normalize(row.exercise_name)));

  const reviewRows = records.flatMap((row) => {
    const forcedP0TargetReview = isP0Name(row.exercise_name);
    const targetCandidate = row.targets.length === 1 || forcedP0TargetReview;
    const safetyCandidate = row.safety_gap;
    const mediaCandidate = row.duplicate_video_cluster;
    const candidate = targetCandidate || safetyCandidate || mediaCandidate;
    if (!candidate) return [];
    const priority = priorityFor(row, candidate);
    const reasons = [
      row.targets.length === 1 ? "single_target" : "",
      forcedP0TargetReview && row.targets.length > 1 ? "p0_target_inconsistency" : "",
      safetyCandidate ? "safety_metadata_gap" : "",
      mediaCandidate ? "duplicate_video_cluster" : "",
    ].filter(Boolean);
    return [{
      exercise_id: row.exercise_id,
      exercise_name: row.exercise_name,
      priority,
      target_count: row.targets.length,
      current_targets: row.targets.map((target) => `${target.muscle_group_name}:${target.role}:${target.volume_percentage}`).join(" | "),
      targets_review_status: targetCandidate ? "needs_review" : "not_in_scope",
      safety_review_status: safetyCandidate ? "needs_review" : "not_in_scope",
      media_review_status: mediaCandidate ? "needs_review" : "not_in_scope",
      youtube_video_id: row.media.youtube_video_id,
      queue_reason: reasons.join(" | "),
      reviewer_name: "",
      reviewed_at: "",
      decision_reason: "",
      evidence: "",
      ready_for_upsert: "false",
    }];
  }).sort((a, b) => a.priority.localeCompare(b.priority) || a.exercise_name.localeCompare(b.exercise_name));

  const videoClusters = [...youtubeCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([youtubeId], clusterIndex) => records
      .filter((row) => row.media.youtube_video_id === youtubeId)
      .map((row) => ({
        cluster_id: `yt-${String(clusterIndex + 1).padStart(3, "0")}`,
        youtube_video_id: youtubeId,
        exercise_id: row.exercise_id,
        exercise_name: row.exercise_name,
        media_review_status: "needs_review",
        decision: "",
        reviewer_name: "",
        reviewed_at: "",
        evidence: "",
      })));

  const counts = {
    live_exercises: records.length,
    target_rows: targets.length,
    single_target: records.filter((row) => row.targets.length === 1).length,
    safety_metadata_gap: records.filter((row) => row.safety_gap).length,
    duplicate_video_clusters: [...youtubeCounts.values()].filter((count) => count > 1).length,
    duplicate_video_exercises: videoClusters.length,
    target_signature_outliers: signatureOutliers.length,
    target_signature_high_signal: signatureHighSignal.length,
    reconciliation: Object.fromEntries(["unchanged", "catalog_changed", "new", "missing_from_live", "duplicate_id_conflict"].map((status) => [status, reconciliation.filter((row) => row.reconciliation_status === status).length])),
    review_by_priority: Object.fromEntries(["P0", "P1", "P2", "P3"].map((priority) => [priority, reviewRows.filter((row) => row.priority === priority).length])),
  };

  const snapshot = {
    schema_version: 2,
    generated_at: generatedAt,
    mode: "read_only_sanitized",
    contains_pii: false,
    source_project: "zshrcgbyhzxpnlccssyz",
    counts,
    hashes: {
      exercises: hash(records),
      targets: hash(sorted(targets, "exercise_id")),
      metadata: hash(sorted(metadata, "exercise_id")),
      muscle_groups: hash(sorted(muscleGroups)),
      legacy_sources: Object.fromEntries(legacySources.map((source) => [source.path, hash(source.text)])),
    },
    exercises: records,
  };

  const reviewHeaders = ["exercise_id", "exercise_name", "priority", "target_count", "current_targets", "targets_review_status", "safety_review_status", "media_review_status", "youtube_video_id", "queue_reason", "reviewer_name", "reviewed_at", "decision_reason", "evidence", "ready_for_upsert"];
  const reconciliationHeaders = ["exercise_id", "exercise_name", "reconciliation_status", "legacy_names", "legacy_sources"];
  const videoHeaders = ["cluster_id", "youtube_video_id", "exercise_id", "exercise_name", "media_review_status", "decision", "reviewer_name", "reviewed_at", "evidence"];
  const signatureOutlierHeaders = ["exercise_id", "exercise_name", "source_muscle_group", "target_signature", "signature_cluster_size", "dominant_source_group", "dominant_source_count", "dominant_share", "review_status", "evidence", "ready_for_upsert"];
  return {
    counts,
    files: {
      "library-curation-v2-catalog-snapshot.json": `${JSON.stringify(snapshot, null, 2)}\n`,
      "library-curation-v2-reconciliation.csv": csv(reconciliationHeaders, reconciliation),
      "library-curation-v2-p0-review.csv": csv(reviewHeaders, reviewRows.filter((row) => row.priority === "P0")),
      "library-curation-v2-p1-review.csv": csv(reviewHeaders, reviewRows.filter((row) => row.priority === "P1")),
      "library-curation-v2-p2-review.csv": csv(reviewHeaders, reviewRows.filter((row) => row.priority === "P2")),
      "library-curation-v2-p3-review.csv": csv(reviewHeaders, reviewRows.filter((row) => row.priority === "P3")),
      "library-curation-v2-video-clusters.csv": csv(videoHeaders, videoClusters),
      "library-curation-v2-target-signature-outliers.csv": csv(signatureOutlierHeaders, signatureOutliers),
      "library-curation-v2-target-signature-high-signal-review.csv": csv(signatureOutlierHeaders, signatureHighSignal),
      "library-curation-v2-run-summary.json": `${JSON.stringify({ schema_version: 2, generated_at: generatedAt, mode: "read_only_sanitized", contains_pii: false, counts }, null, 2)}\n`,
    },
  };
}

async function fetchAll(supabase, table, select) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if ((data || []).length < 1000) return rows;
  }
}

async function main() {
  const outputArg = process.argv.indexOf("--output-dir");
  const nowArg = process.argv.indexOf("--now");
  const outputDir = outputArg >= 0 ? path.resolve(process.argv[outputArg + 1]) : DEFAULT_OUTPUT;
  const generatedAt = nowArg >= 0 ? process.argv[nowArg + 1] : new Date().toISOString();
  const url = process.env.AUDIT_SUPABASE_URL || "";
  const key = process.env.AUDIT_SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Export AUDIT_SUPABASE_URL and AUDIT_SUPABASE_SERVICE_ROLE_KEY for this read-only generator.");
  const supabase = createClient(assertCanonicalSupabaseUrl(url), key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [exercises, targets, metadata, muscleGroups] = await Promise.all([
    fetchAll(supabase, "exercise_library", "id,name,muscle_group,muscle_group_id,equipment,difficulty,video_url,youtube_video_id,video_path,thumbnail_url"),
    fetchAll(supabase, "exercise_muscle_targets", "exercise_id,muscle_group_id,role,is_primary,volume_percentage"),
    fetchAll(supabase, "exercise_metadata", "exercise_id,contraindications,pain_limitation_tags,equivalent_substitutes,regressions,progressions"),
    fetchAll(supabase, "muscle_groups", "id,name"),
  ]);
  const legacySources = LEGACY_FILES.map((relative) => ({ path: relative, text: fs.readFileSync(path.join(ROOT, relative), "utf8") }));
  const result = buildArtifacts({ exercises, targets, metadata, muscleGroups, legacySources, generatedAt });
  fs.mkdirSync(outputDir, { recursive: true });
  for (const [filename, contents] of Object.entries(result.files)) fs.writeFileSync(path.join(outputDir, filename), contents);
  console.log(JSON.stringify({ output_dir: outputDir, ...result.counts }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
