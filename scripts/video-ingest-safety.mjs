import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const STAGING_NAME_RE =
  /^(\d{3})__([0-9a-f]{16})__([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(mp4|mov|webm|m4v|3gp)$/i;

const DURATION_MIN_SECONDS = 3;
const DURATION_MAX_SECONDS = 90;
const MIN_ACCEPTED_EDGE_PX = 360;
const LOW_RES_WARNING_EDGE_PX = 480;

export class VideoIngestBlockedError extends Error {
  constructor(blockers) {
    super(blockers.join("; "));
    this.name = "VideoIngestBlockedError";
    this.blockers = blockers;
  }
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizedCodec(info) {
  return String(info?.codec || info?.codec_name || "").trim().toLowerCase();
}

export function buildUploadTranscodeArgs({ recorte = [], src, outMp4 }) {
  return ["-y", "-loglevel", "info", ...recorte, "-i", src,
    "-vf", "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30,freezedetect=n=-60dB:d=2",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "27", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", "-an", outMp4];
}

export async function inspectVideoSource(file, runImpl = run) {
  try {
    const { stdout } = await runImpl("ffprobe", ["-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height,codec_name,pix_fmt:format=duration", "-of", "json", file],
      { maxBuffer: 1 << 20 });
    const j = JSON.parse(stdout);
    const s = j.streams?.[0] || {};
    const decodable = await isVideoSourceDecodable(file, runImpl);
    return {
      dur: parseFloat(j.format?.duration) || 0,
      w: s.width || 0,
      h: s.height || 0,
      codec: s.codec_name || "",
      pixFmt: s.pix_fmt || "",
      decodable,
    };
  } catch {
    return null;
  }
}

export async function isVideoSourceDecodable(file, runImpl = run) {
  try {
    await runImpl("ffmpeg", ["-v", "error", "-i", file, "-map", "0:v:0", "-an", "-f", "null", "-"],
      { maxBuffer: 8 << 20 });
    return true;
  } catch {
    return false;
  }
}

export function decideVideoIngestSafety(info) {
  const blockers = [];
  const warnings = [];

  if (!info || typeof info !== "object") {
    return { ready: false, blockers: ["ilegível/corrompido"], warnings };
  }

  const dur = Number(info.dur);
  const w = Number(info.w);
  const h = Number(info.h);
  const codec = normalizedCodec(info);

  if (info.decodable === false || !finiteNumber(dur) || dur <= 0 || !finiteNumber(w) || !finiteNumber(h) || w <= 0 || h <= 0) {
    blockers.push("ilegível/corrompido");
  } else {
    if (dur < DURATION_MIN_SECONDS) blockers.push(`curto demais (${dur.toFixed(1)}s)`);
    if (dur > DURATION_MAX_SECONDS) blockers.push(`longo demais (${dur.toFixed(1)}s)`);

    const shortEdge = Math.min(w, h);
    if (shortEdge < MIN_ACCEPTED_EDGE_PX) {
      blockers.push(`dimensão inválida (${w}x${h})`);
    } else if (shortEdge < LOW_RES_WARNING_EDGE_PX && w > h) {
      warnings.push(`resolução ${w}x${h} aceita no limite 360p`);
    }
  }

  if (!codec) warnings.push("codec de origem não identificado; ffmpeg validou a decodificação");

  return { ready: blockers.length === 0, blockers, warnings };
}

export function assertUploadableVideoMetadata(info) {
  const decision = decideVideoIngestSafety(info);
  if (!decision.ready) throw new VideoIngestBlockedError(decision.blockers);
  return decision;
}

export function localStagingFileName(remoteName) {
  const name = String(remoteName || "");
  if (!STAGING_NAME_RE.test(name)) {
    throw new Error("Nome remoto de staging inválido.");
  }
  return name;
}

export function stagingCodeFromName(remoteName) {
  const match = String(remoteName || "").match(STAGING_NAME_RE);
  if (!match) throw new Error("Nome remoto de staging inválido.");
  return match[1];
}

export function selectLatestStagingItems(items) {
  const latestByCode = new Map();
  for (const item of items || []) {
    const match = String(item?.name || "").match(STAGING_NAME_RE);
    if (!match) continue;
    const candidate = {
      ...item,
      cod: match[1],
      ts: Date.parse(item.created_at || "") || 0,
    };
    const current = latestByCode.get(candidate.cod);
    if (
      !current || candidate.ts > current.ts ||
      (candidate.ts === current.ts && candidate.name > current.name)
    ) {
      latestByCode.set(candidate.cod, candidate);
    }
  }
  return [...latestByCode.values()].sort((a, b) => a.cod.localeCompare(b.cod));
}

export function stagingNamesForSuccessfulCommits(processed, successfulIds) {
  const names = [];
  const seen = new Set();
  for (const item of processed || []) {
    if (!successfulIds.has(item.exerciseId)) continue;
    const remoteName = localStagingFileName(item.remoteName);
    if (!seen.has(remoteName)) {
      seen.add(remoteName);
      names.push(remoteName);
    }
  }
  return names;
}
