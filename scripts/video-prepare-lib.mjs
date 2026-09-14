import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { decideVideoIngestSafety, inspectVideoSource } from "./video-ingest-safety.mjs";

export const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm", ".hevc", ".mpg", ".mpeg", ".3gp"]);

export function sha256File(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

export function discoverVideoFiles(sourceDir) {
  return readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() || entry.isSymbolicLink())
    .map((entry) => entry.name)
    .filter((name) => VIDEO_EXTENSIONS.has(extname(name).toLowerCase()) && !name.startsWith("."))
    .sort((a, b) => a.localeCompare(b));
}

export function codeFromFileName(fileName) {
  return basename(fileName, extname(fileName)).match(/^(\d{3})(?=\D|$)/)?.[1] || null;
}

export function stableRunId(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export async function buildVideoPreparationManifest({
  sourceDir,
  stagingRoot = "docs/project/gravacao/_staging",
  mapPath = "docs/project/gravacao/codigo-para-exercicio.json",
  runId = stableRunId(),
  mode = "copy",
  inspect = inspectVideoSource,
  now = () => new Date(),
} = {}) {
  if (!sourceDir) throw new Error("Informe --source <pasta-com-videos>.");
  const resolvedSource = resolve(sourceDir);
  const resolvedMap = resolve(mapPath);
  if (!existsSync(resolvedSource)) throw new Error(`Pasta de origem não encontrada: ${resolvedSource}`);
  if (!existsSync(resolvedMap)) throw new Error(`Mapa de códigos não encontrado: ${resolvedMap}`);
  if (!["copy", "symlink"].includes(mode)) throw new Error("Modo inválido: use copy ou symlink.");

  const codeMap = JSON.parse(readFileSync(resolvedMap, "utf8"));
  const stagingDir = resolve(stagingRoot, runId);
  mkdirSync(stagingDir, { recursive: true });

  const files = discoverVideoFiles(resolvedSource);
  const byCode = new Map();
  const unmatched = [];

  for (const fileName of files) {
    const absolutePath = resolve(resolvedSource, fileName);
    const code = codeFromFileName(fileName);
    const stats = lstatSync(absolutePath);
    const hash = sha256File(absolutePath);
    const baseItem = {
      code,
      source_name: fileName,
      source_path: absolutePath,
      bytes: stats.size,
      mtime_ms: stats.mtimeMs,
      sha256: hash,
    };
    if (!code || !codeMap[code]) {
      unmatched.push({
        ...baseItem,
        status: code ? "stale_code" : "unmatched",
        blockers: [code ? "código ausente do roteiro" : "nome sem código de 3 dígitos"],
        warnings: [],
      });
      continue;
    }
    const list = byCode.get(code) || [];
    list.push(baseItem);
    byCode.set(code, list);
  }

  const items = [];
  const missing_codes = [];
  const duplicate_hashes = new Map();
  for (const group of byCode.values()) {
    for (const item of group) {
      const list = duplicate_hashes.get(item.sha256) || [];
      list.push(item.source_name);
      duplicate_hashes.set(item.sha256, list);
    }
  }

  for (const [code, exercise] of Object.entries(codeMap)) {
    const candidates = byCode.get(code) || [];
    if (!candidates.length) {
      missing_codes.push({ code, exercise_id: exercise.id, exercise_name: exercise.nome });
      continue;
    }

    candidates.sort((a, b) => b.mtime_ms - a.mtime_ms || a.source_name.localeCompare(b.source_name));
    const [selected, ...duplicates] = candidates;
    const stagedName = `${code}__${exercise.id}${extname(selected.source_name).toLowerCase()}`;
    const stagedPath = resolve(stagingDir, stagedName);
    if (mode === "symlink") {
      if (!existsSync(stagedPath)) symlinkSync(selected.source_path, stagedPath);
    } else {
      copyFileSync(selected.source_path, stagedPath);
    }
    const info = await inspect(stagedPath);
    const decision = decideVideoIngestSafety(info);
    items.push({
      code,
      exercise_id: exercise.id,
      exercise_name: exercise.nome,
      source_name: selected.source_name,
      source_path: selected.source_path,
      staged_name: stagedName,
      staged_path: stagedPath,
      bytes: selected.bytes,
      sha256: selected.sha256,
      duplicate_hash: (duplicate_hashes.get(selected.sha256) || []).length > 1,
      duration_seconds: info?.dur ?? null,
      width: info?.w ?? null,
      height: info?.h ?? null,
      codec: info?.codec ?? "",
      pixel_format: info?.pixFmt ?? "",
      decodable: info?.decodable ?? null,
      destination: {
        video_path: `biblioteca/${exercise.id}.mp4`,
        thumbnail_path: `biblioteca/${exercise.id}.jpg`,
      },
      status: decision.ready ? "ready" : "blocked",
      blockers: decision.blockers,
      warnings: decision.warnings,
    });
    for (const duplicate of duplicates) {
      items.push({
        code,
        exercise_id: exercise.id,
        exercise_name: exercise.nome,
        source_name: duplicate.source_name,
        source_path: duplicate.source_path,
        bytes: duplicate.bytes,
        sha256: duplicate.sha256,
        duplicate_of: selected.source_name,
        status: "duplicate",
        blockers: ["duplicado para o mesmo código"],
        warnings: [],
      });
    }
  }

  items.push(...unmatched);
  items.sort((a, b) => String(a.code || "zzz").localeCompare(String(b.code || "zzz")) || a.source_name.localeCompare(b.source_name));

  const manifest = {
    schema: "sett-video-preparation/v1",
    generated_at: now().toISOString(),
    source_dir: resolvedSource,
    staging_dir: stagingDir,
    map_path: resolvedMap,
    map_sha256: sha256File(resolvedMap),
    mode,
    roster_count: Object.keys(codeMap).length,
    totals: {
      source_files: files.length,
      ready: items.filter((item) => item.status === "ready").length,
      blocked: items.filter((item) => item.status === "blocked").length,
      duplicate: items.filter((item) => item.status === "duplicate").length,
      unmatched: items.filter((item) => item.status === "unmatched").length,
      stale_code: items.filter((item) => item.status === "stale_code").length,
      missing: missing_codes.length,
    },
    missing_codes,
    items,
  };

  const manifestPath = join(stagingDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  writeFileSync(join(stagingDir, "manifest.csv"), manifestToCsv(manifest), "utf8");
  return { manifest, manifestPath, stagingDir };
}

export function manifestToCsv(manifest) {
  const rows = [[
    "status",
    "code",
    "source_name",
    "exercise_name",
    "exercise_id",
    "sha256",
    "bytes",
    "duration_seconds",
    "resolution",
    "codec",
    "destination_video",
    "detail",
  ]];
  for (const item of manifest.items || []) {
    rows.push([
      item.status,
      item.code || "",
      item.source_name || "",
      item.exercise_name || "",
      item.exercise_id || "",
      item.sha256 || "",
      item.bytes || "",
      item.duration_seconds ?? "",
      item.width && item.height ? `${item.width}x${item.height}` : "",
      item.codec || "",
      item.destination?.video_path || "",
      [...(item.blockers || []), ...(item.warnings || []), item.duplicate_of ? `duplica ${item.duplicate_of}` : ""].filter(Boolean).join("; "),
    ]);
  }
  for (const item of manifest.missing_codes || []) {
    rows.push(["missing", item.code, "", item.exercise_name, item.exercise_id, "", "", "", "", "", "", "sem arquivo recebido"]);
  }
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}

