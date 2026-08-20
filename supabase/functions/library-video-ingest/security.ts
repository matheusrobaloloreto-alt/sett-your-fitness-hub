export const MAX_RECORDING_BYTES = 64 * 1024 * 1024;
export const MAX_JSON_BYTES = 16 * 1024;
export const SIGN_REQUESTS_PER_MINUTE = 20;
export const UPLOADS_PER_HOUR = 180;
export const UPLOADS_PER_DAY = 400;
export const STAGING_QUEUE_LIMIT = 950;
export const RESERVATION_RETENTION_MS = 8 * 24 * 60 * 60 * 1000;

export const RECORDING_MIME_TO_EXTENSION = new Map([
  ["video/mp4", "mp4"],
  ["video/quicktime", "mov"],
  ["video/webm", "webm"],
  ["video/x-m4v", "m4v"],
  ["video/3gpp", "3gp"],
]);

export const DEFAULT_ALLOWED_ORIGINS = [
  "https://settapp.com.br",
  "https://www.settapp.com.br",
  "https://bn-performance-webapp-matheus.netlify.app",
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_RE = /^\d{3}$/;
const RESERVATION_NAME_RE = new RegExp(
  `^${REQUEST_ID_RE.source.slice(1, -1)}\\.mp4$`,
  "i",
);

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type RecordingSignInput = {
  codigo: string;
  exerciseId: string;
  requestId: string;
  mimeType: string;
  size: number;
  extension: string;
};

export function parseCsvSet(raw: string | undefined): Set<string> {
  return new Set(
    (raw || "").split(",").map((value) => value.trim()).filter(Boolean),
  );
}

export function allowedOrigins(raw: string | undefined): Set<string> {
  const configured = parseCsvSet(raw);
  const source = configured.size
    ? configured
    : new Set(DEFAULT_ALLOWED_ORIGINS);
  const normalized = new Set<string>();
  for (const candidate of source) {
    try {
      const url = new URL(candidate);
      if (
        url.protocol === "https:" && candidate === url.origin &&
        !url.username && !url.password
      ) {
        normalized.add(url.origin);
      }
    } catch {
      // Configuração inválida não abre fallback: a origem simplesmente não entra.
    }
  }
  return normalized;
}

export function isAllowedOrigin(
  origin: string | null,
  allowed: Set<string>,
): boolean {
  if (!origin) return false;
  try {
    return allowed.has(new URL(origin).origin) &&
      origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

export function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
}

export function parseRecordingSignInput(body: unknown): RecordingSignInput {
  const value = (body && typeof body === "object")
    ? body as Record<string, unknown>
    : {};
  const codigo = String(value.codigo || "");
  const exerciseId = String(value.exercise_id || "");
  const requestId = String(value.request_id || "");
  const mimeType = String(value.mime_type || "").toLowerCase();
  const size = Number(value.size);
  const extension = RECORDING_MIME_TO_EXTENSION.get(mimeType);

  if (!CODE_RE.test(codigo)) {
    throw new ApiError(
      400,
      "invalid_exercise_code",
      "Código de exercício inválido.",
    );
  }
  if (!UUID_RE.test(exerciseId)) {
    throw new ApiError(400, "invalid_exercise_id", "Exercício inválido.");
  }
  if (!REQUEST_ID_RE.test(requestId)) {
    throw new ApiError(
      400,
      "invalid_request_id",
      "Identificador de envio inválido.",
    );
  }
  if (!extension) {
    throw new ApiError(
      415,
      "unsupported_media_type",
      "Formato de vídeo não permitido.",
    );
  }
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_RECORDING_BYTES) {
    throw new ApiError(
      413,
      "file_too_large",
      "O vídeo excede o limite de 64 MB.",
    );
  }

  return { codigo, exerciseId, requestId, mimeType, size, extension };
}

export function validateFinalAsset(
  path: unknown,
  mimeType: unknown,
  size: unknown,
): {
  path: string;
  exerciseId: string;
  mimeType: "video/mp4" | "image/jpeg";
  size: number;
} {
  const normalizedPath = String(path || "");
  const normalizedMime = String(mimeType || "");
  const normalizedSize = Number(size);
  const match = normalizedPath.match(
    /^biblioteca\/([0-9a-f-]{36})\.(mp4|jpg)$/i,
  );
  if (!match || !UUID_RE.test(match[1])) {
    throw new ApiError(
      400,
      "invalid_asset_path",
      "Caminho de publicação inválido.",
    );
  }
  const expectedMime = match[2].toLowerCase() === "mp4"
    ? "video/mp4"
    : "image/jpeg";
  const maxBytes = expectedMime === "video/mp4"
    ? 25 * 1024 * 1024
    : 3 * 1024 * 1024;
  if (normalizedMime !== expectedMime) {
    throw new ApiError(
      415,
      "asset_mime_mismatch",
      "Tipo do arquivo não corresponde ao caminho.",
    );
  }
  if (
    !Number.isSafeInteger(normalizedSize) || normalizedSize < 1 ||
    normalizedSize > maxBytes
  ) {
    throw new ApiError(
      413,
      "asset_too_large",
      "Arquivo processado excede o limite permitido.",
    );
  }
  return {
    path: normalizedPath,
    exerciseId: match[1].toLowerCase(),
    mimeType: expectedMime,
    size: normalizedSize,
  };
}

export function validateStagingBucketPolicy(
  bucket: Record<string, unknown>,
): void {
  const isPublic = bucket.public === true;
  const limit = Number(bucket.file_size_limit ?? bucket.fileSizeLimit);
  const mimeTypes = bucket.allowed_mime_types ?? bucket.allowedMimeTypes;
  const configuredTypes = new Set(
    Array.isArray(mimeTypes) ? mimeTypes.map(String) : [],
  );
  const expectedTypes = new Set(RECORDING_MIME_TO_EXTENSION.keys());
  const exactTypes = configuredTypes.size === expectedTypes.size &&
    [...expectedTypes].every((type) => configuredTypes.has(type));

  if (
    isPublic || !Number.isFinite(limit) || limit < 1 ||
    limit > MAX_RECORDING_BYTES || !exactTypes
  ) {
    throw new ApiError(
      503,
      "storage_policy_not_hardened",
      "A área de triagem não está configurada com a política de segurança exigida.",
    );
  }
}

type ReservationItem = { name: string; created_at?: string | null };

export function recordingRemovalPaths(names: string[]): string[] {
  return [...names];
}

export function assertPersistentUploadQuota(
  reservations: ReservationItem[],
  queuedOperatorRecordings: number,
  now = Date.now(),
): void {
  const attempts = reservations.filter((item) =>
    RESERVATION_NAME_RE.test(item.name)
  );
  const elapsedAttempts = attempts.map((item) =>
    now - Date.parse(item.created_at || "")
  );
  if (elapsedAttempts.some((elapsed) => !Number.isFinite(elapsed))) {
    throw new ApiError(
      503,
      "quota_ledger_invalid",
      "Não foi possível validar a cota de gravações.",
    );
  }
  const inHour = elapsedAttempts.filter((elapsed) => {
    return elapsed >= 0 && elapsed < 60 * 60 * 1000;
  }).length;
  const inDay = elapsedAttempts.filter((elapsed) => {
    return elapsed >= 0 && elapsed < 24 * 60 * 60 * 1000;
  }).length;
  if (
    inHour > UPLOADS_PER_HOUR || inDay > UPLOADS_PER_DAY ||
    queuedOperatorRecordings >= UPLOADS_PER_DAY
  ) {
    throw new ApiError(
      429,
      "upload_quota_exceeded",
      "Limite de gravações atingido. Aguarde antes de continuar.",
    );
  }
}

export function expiredReservationNames(
  reservations: ReservationItem[],
  now = Date.now(),
  retentionMs = RESERVATION_RETENTION_MS,
): string[] {
  return reservations.filter((item) => {
    if (!RESERVATION_NAME_RE.test(item.name)) return false;
    const createdAt = Date.parse(item.created_at || "");
    return Number.isFinite(createdAt) && now - createdAt >= retentionMs;
  }).map((item) => item.name);
}

export async function sha256Tag(value: string, length = 16): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("").slice(0, length);
}

export async function safeSecretEqual(
  left: string,
  right: string,
): Promise<boolean> {
  if (!left || !right) return false;
  const [leftDigest, rightDigest] = await Promise.all([
    sha256Tag(left, 64),
    sha256Tag(right, 64),
  ]);
  let diff = leftDigest.length ^ rightDigest.length;
  for (
    let index = 0;
    index < Math.max(leftDigest.length, rightDigest.length);
    index++
  ) {
    diff |= (leftDigest.charCodeAt(index) || 0) ^
      (rightDigest.charCodeAt(index) || 0);
  }
  return diff === 0;
}

export async function requireAuthenticatedUser(
  authHeader: string | null,
  verify: (token: string) => Promise<{ userId: string | null; error?: string }>,
): Promise<string> {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new ApiError(401, "missing_token", "Sessão obrigatória.");
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) throw new ApiError(401, "missing_token", "Sessão obrigatória.");
  const result = await verify(token);
  if (!result.userId) {
    throw new ApiError(
      401,
      result.error === "expired" ? "expired_token" : "invalid_token",
      "Sessão inválida ou expirada.",
    );
  }
  return result.userId;
}

type ReplayEntry = { fingerprint: string; expiresAt: number };

export class ReplayGuard {
  #entries = new Map<string, ReplayEntry>();
  #ttlMs: number;

  constructor(ttlMs = 10 * 60 * 1000) {
    this.#ttlMs = ttlMs;
  }

  assertFresh(key: string, fingerprint: string, now = Date.now()): void {
    for (const [entryKey, entry] of this.#entries) {
      if (entry.expiresAt <= now) this.#entries.delete(entryKey);
    }
    const existing = this.#entries.get(key);
    if (existing) {
      const code = existing.fingerprint === fingerprint
        ? "replayed_request"
        : "request_id_conflict";
      throw new ApiError(
        409,
        code,
        "Este identificador de envio já foi utilizado.",
      );
    }
    this.#entries.set(key, { fingerprint, expiresAt: now + this.#ttlMs });
  }
}

export class SlidingWindowLimiter {
  #events = new Map<string, number[]>();

  assertAllowed(
    key: string,
    limit: number,
    windowMs: number,
    now = Date.now(),
  ): void {
    const cutoff = now - windowMs;
    const recent = (this.#events.get(key) || []).filter((timestamp) =>
      timestamp > cutoff
    );
    if (recent.length >= limit) {
      throw new ApiError(
        429,
        "rate_limited",
        "Muitos envios em sequência. Aguarde e tente novamente.",
      );
    }
    recent.push(now);
    this.#events.set(key, recent);
  }
}
