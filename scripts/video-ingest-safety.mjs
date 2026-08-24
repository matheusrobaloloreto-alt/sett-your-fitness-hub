const STAGING_NAME_RE =
  /^(\d{3})__([0-9a-f]{16})__([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(mp4|mov|webm|m4v|3gp)$/i;

const DURATION_MIN_SECONDS = 3;
const DURATION_MAX_SECONDS = 90;
const MIN_ACCEPTED_EDGE_PX = 360;
const LOW_RES_WARNING_EDGE_PX = 480;
const UPLOADABLE_CODECS = new Set(["h264", "hevc", "mpeg4"]);

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

  if (!finiteNumber(dur) || dur <= 0 || !finiteNumber(w) || !finiteNumber(h) || w <= 0 || h <= 0) {
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

  if (!codec) {
    blockers.push("codec incompatível (desconhecido)");
  } else if (!UPLOADABLE_CODECS.has(codec)) {
    blockers.push(`codec incompatível (${codec})`);
  }

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
