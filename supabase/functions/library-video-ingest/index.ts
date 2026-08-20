// Pipeline de vídeos próprios da biblioteca SETT/BN.
//
// Browser de gravação: JWT Supabase + master OU operador explicitamente allowlisted e vinculado
// à empresa configurada. O HTML nunca recebe segredo operacional.
// CLI de ingestão: segredo server-to-server separado, aceito somente sem Origin, ou JWT master.
// Gravações entram num bucket privado de triagem; publicação continua sendo uma ação manual do CLI.
import { createClient } from "npm:@supabase/supabase-js@2.101.0";
import recordingExerciseAllowlist from "./recording-exercise-allowlist.json" with {
  type: "json",
};
import {
  allowedOrigins,
  ApiError,
  corsHeaders,
  isAllowedOrigin,
  MAX_JSON_BYTES,
  parseCsvSet,
  parseRecordingSignInput,
  ReplayGuard,
  requireAuthenticatedUser,
  safeSecretEqual,
  sha256Tag,
  SIGN_REQUESTS_PER_MINUTE,
  SlidingWindowLimiter,
  STAGING_QUEUE_LIMIT,
  UPLOADS_PER_DAY,
  UPLOADS_PER_HOUR,
  validateFinalAsset,
  validateStagingBucketPolicy,
} from "./security.ts";

const FINAL_BUCKET = "exercises-videos";
const STAGING_BUCKET = "exercise-video-staging";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAGING_NAME_RE =
  /^(\d{3})__([0-9a-f]{16})__([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(mp4|mov|webm|m4v|3gp)$/i;
const replayGuard = new ReplayGuard();
const signLimiter = new SlidingWindowLimiter();
const exerciseAllowlist = recordingExerciseAllowlist as Record<
  string,
  { id: string; nome?: string }
>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  "";
const ALLOWED_ORIGINS = allowedOrigins(
  Deno.env.get("RECORDING_ALLOWED_ORIGINS"),
);

function response(req: Request, body: unknown, status = 200): Response {
  const origin = req.headers.get("Origin");
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (origin && isAllowedOrigin(origin, ALLOWED_ORIGINS)) {
    Object.assign(headers, corsHeaders(origin));
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function errorResponse(
  req: Request,
  error: unknown,
  requestId: string,
): Response {
  if (error instanceof ApiError) {
    return response(req, {
      error: { code: error.code, message: error.message },
      request_id: requestId,
    }, error.status);
  }
  console.error("library-video-ingest: unhandled", {
    requestId,
    message: error instanceof Error ? error.message : String(error),
  });
  return response(req, {
    error: {
      code: "internal_error",
      message: "Falha interna no pipeline de vídeo.",
    },
    request_id: requestId,
  }, 500);
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  const declaredLength = Number(req.headers.get("Content-Length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) {
    throw new ApiError(
      413,
      "request_too_large",
      "Payload excede o limite permitido.",
    );
  }
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_JSON_BYTES) {
    throw new ApiError(
      413,
      "request_too_large",
      "Payload excede o limite permitido.",
    );
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("object required");
    }
    return parsed;
  } catch {
    throw new ApiError(400, "invalid_json", "JSON inválido.");
  }
}

function adminClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new ApiError(
      503,
      "backend_not_configured",
      "Backend de vídeo não configurado.",
    );
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function authenticatedUserId(req: Request): Promise<string> {
  return requireAuthenticatedUser(
    req.headers.get("Authorization"),
    async (token) => {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) {
        const expired = /expired|exp claim/i.test(error?.message || "");
        return { userId: null, error: expired ? "expired" : "invalid" };
      }
      return { userId: data.user.id };
    },
  );
}

async function isMaster(
  admin: ReturnType<typeof adminClient>,
  userId: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc("has_role", {
    _user_id: userId,
    _role: "master",
  });
  if (error) {
    console.error("library-video-ingest: master role lookup failed", {
      code: error.code,
      message: error.message,
    });
    throw new ApiError(
      503,
      "authorization_unavailable",
      "Não foi possível validar a permissão.",
    );
  }
  return data === true;
}

async function authorizeRecordingOperator(
  req: Request,
  admin: ReturnType<typeof adminClient>,
): Promise<string> {
  const origin = req.headers.get("Origin");
  if (!isAllowedOrigin(origin, ALLOWED_ORIGINS)) {
    throw new ApiError(403, "origin_forbidden", "Origem não autorizada.");
  }
  const userId = await authenticatedUserId(req);
  if (await isMaster(admin, userId)) return userId;

  const allowedUsers = parseCsvSet(Deno.env.get("RECORDING_OPERATOR_USER_IDS"));
  const companyId = Deno.env.get("RECORDING_COMPANY_ID") || "";
  if (!allowedUsers.has(userId) || !UUID_RE.test(companyId)) {
    throw new ApiError(
      403,
      "operator_forbidden",
      "Usuário não autorizado para gravação.",
    );
  }
  const { data, error } = await admin.from("company_members").select("id")
    .eq("user_id", userId).eq("company_id", companyId).maybeSingle();
  if (error) {
    throw new ApiError(
      503,
      "authorization_unavailable",
      "Não foi possível validar o vínculo do operador.",
    );
  }
  if (!data) {
    throw new ApiError(
      403,
      "tenant_forbidden",
      "Operador sem vínculo com a empresa autorizada.",
    );
  }
  return userId;
}

async function authorizeAdmin(
  req: Request,
  admin: ReturnType<typeof adminClient>,
): Promise<"service" | string> {
  const origin = req.headers.get("Origin");
  const configuredSecret = Deno.env.get("VIDEO_INGEST_SECRET") || "";
  const suppliedSecret = req.headers.get("x-webhook-secret") || "";
  if (!origin && await safeSecretEqual(configuredSecret, suppliedSecret)) {
    return "service";
  }

  const userId = await authenticatedUserId(req);
  if (!await isMaster(admin, userId)) {
    throw new ApiError(
      403,
      "admin_forbidden",
      "Ação restrita ao administrador master.",
    );
  }
  return userId;
}

async function assertExerciseExists(
  admin: ReturnType<typeof adminClient>,
  exerciseId: string,
): Promise<void> {
  const { data, error } = await admin.from("exercise_library").select("id").eq(
    "id",
    exerciseId,
  ).maybeSingle();
  if (error) {
    throw new ApiError(
      503,
      "exercise_lookup_failed",
      "Não foi possível validar o exercício.",
    );
  }
  if (!data) {
    throw new ApiError(404, "exercise_not_found", "Exercício não encontrado.");
  }
}

async function assertStagingPolicy(
  admin: ReturnType<typeof adminClient>,
): Promise<void> {
  const { data, error } = await admin.storage.getBucket(STAGING_BUCKET);
  if (error || !data) {
    throw new ApiError(
      503,
      "staging_bucket_unavailable",
      "Área privada de triagem indisponível.",
    );
  }
  validateStagingBucketPolicy(data as unknown as Record<string, unknown>);
}

async function signRecording(
  req: Request,
  body: Record<string, unknown>,
  admin: ReturnType<typeof adminClient>,
) {
  const userId = await authorizeRecordingOperator(req, admin);
  const input = parseRecordingSignInput(body);
  const allowedExercise = exerciseAllowlist[input.codigo];
  if (!allowedExercise || allowedExercise.id !== input.exerciseId) {
    throw new ApiError(
      403,
      "exercise_not_allowlisted",
      "Exercício fora da lista de gravação aprovada.",
    );
  }

  signLimiter.assertAllowed(userId, SIGN_REQUESTS_PER_MINUTE, 60_000);
  replayGuard.assertFresh(
    `${userId}:${input.requestId}`,
    `${input.codigo}:${input.exerciseId}:${input.mimeType}:${input.size}`,
  );
  await assertStagingPolicy(admin);
  await assertExerciseExists(admin, input.exerciseId);

  const operatorTag = await sha256Tag(userId);
  const { data: queued, error: listError } = await admin.storage.from(
    STAGING_BUCKET,
  ).list("", {
    limit: 1000,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (listError) {
    throw new ApiError(
      503,
      "staging_list_failed",
      "Não foi possível consultar a fila de triagem.",
    );
  }
  const queuedRecordings = (queued || []).filter((item) =>
    STAGING_NAME_RE.test(item.name)
  );
  if (queuedRecordings.length >= STAGING_QUEUE_LIMIT) {
    throw new ApiError(
      429,
      "staging_queue_full",
      "Fila de triagem cheia. Publique os vídeos pendentes antes de continuar.",
    );
  }

  const operatorUploads = queuedRecordings.filter((item) =>
    item.name.includes(`__${operatorTag}__`)
  );
  const path =
    `${input.codigo}__${operatorTag}__${input.requestId}.${input.extension}`;
  if (queuedRecordings.some((item) => item.name === path)) {
    throw new ApiError(409, "replayed_upload", "Este envio já foi concluído.");
  }

  // A memória da Edge reduz rajadas, mas não é uma barreira distribuída: duas
  // instâncias podem atender o mesmo request_id. A reserva privada no Storage é
  // a trava persistente e atômica (upsert=false) antes de assinar o vídeo real.
  const reservationPrefix = `_requests/${operatorTag}`;
  const reservationName = `${input.requestId}.mp4`;
  const reservationPath = `${reservationPrefix}/${reservationName}`;
  const { error: reservationError } = await admin.storage.from(STAGING_BUCKET)
    .upload(reservationPath, new Uint8Array([0]), {
      contentType: "video/mp4",
      upsert: false,
    });
  if (reservationError) {
    const detail = `${reservationError.message} ${reservationError.name}`;
    if (/already exists|duplicate|409/i.test(detail)) {
      throw new ApiError(
        409,
        "replayed_request",
        "Este identificador de envio já foi utilizado.",
      );
    }
    throw new ApiError(
      503,
      "replay_reservation_failed",
      "Não foi possível reservar este envio com segurança.",
    );
  }

  const { data: reservations, error: reservationsError } = await admin.storage
    .from(STAGING_BUCKET).list(reservationPrefix, {
      limit: 1000,
      sortBy: { column: "created_at", order: "desc" },
    });
  if (reservationsError) {
    throw new ApiError(
      503,
      "quota_lookup_failed",
      "Não foi possível validar a cota de gravações.",
    );
  }
  const now = Date.now();
  const attempts = (reservations || []).filter((item) =>
    /^[0-9a-f-]{36}\.mp4$/i.test(item.name)
  );
  const inHour =
    attempts.filter((item) =>
      now - Date.parse(item.created_at || "") < 60 * 60 * 1000
    ).length;
  const inDay =
    attempts.filter((item) =>
      now - Date.parse(item.created_at || "") < 24 * 60 * 60 * 1000
    ).length;
  if (
    inHour > UPLOADS_PER_HOUR || inDay > UPLOADS_PER_DAY ||
    operatorUploads.length >= UPLOADS_PER_DAY
  ) {
    throw new ApiError(
      429,
      "upload_quota_exceeded",
      "Limite de gravações atingido. Aguarde antes de continuar.",
    );
  }

  const { data, error } = await admin.storage.from(STAGING_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });
  if (error || !data) {
    throw new ApiError(
      503,
      "upload_signing_failed",
      "Não foi possível iniciar o envio.",
    );
  }
  return response(req, {
    signed_url: data.signedUrl,
    path,
    expires_in: 7200,
    request_id: input.requestId,
  });
}

async function listLibrary(
  req: Request,
  admin: ReturnType<typeof adminClient>,
) {
  const all: unknown[] = [];
  const pageSize = 1000;
  for (let from = 0;; from += pageSize) {
    const { data, error } = await admin.from("exercise_library")
      .select(
        "id, name, muscle_group, equipment, description, video_path, video_url, youtube_video_id, thumbnail_url",
      )
      .order("muscle_group").order("name").range(from, from + pageSize - 1);
    if (error) {
      throw new ApiError(
        503,
        "library_list_failed",
        "Não foi possível consultar a biblioteca.",
      );
    }
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return response(req, { total: all.length, items: all });
}

async function listRecordings(
  req: Request,
  admin: ReturnType<typeof adminClient>,
) {
  await assertStagingPolicy(admin);
  const { data, error } = await admin.storage.from(STAGING_BUCKET).list("", {
    limit: 1000,
    sortBy: { column: "created_at", order: "asc" },
  });
  if (error) {
    throw new ApiError(
      503,
      "staging_list_failed",
      "Não foi possível consultar a triagem.",
    );
  }
  const items = [];
  for (
    const item of (data || []).filter((candidate) =>
      STAGING_NAME_RE.test(candidate.name)
    )
  ) {
    const { data: signed, error: signedError } = await admin.storage.from(
      STAGING_BUCKET,
    ).createSignedUrl(item.name, 900);
    if (signedError || !signed) {
      throw new ApiError(
        503,
        "download_signing_failed",
        "Não foi possível liberar a leitura da triagem.",
      );
    }
    items.push({
      name: item.name,
      size: item.metadata?.size ?? null,
      created_at: item.created_at,
      url: signed.signedUrl,
    });
  }
  return response(req, {
    total: items.length,
    items,
    download_expires_in: 900,
  });
}

async function removeRecordings(
  req: Request,
  body: Record<string, unknown>,
  admin: ReturnType<typeof adminClient>,
) {
  const names = Array.isArray(body.names) ? body.names.map(String) : [];
  if (
    !names.length || names.length > 100 ||
    names.some((name) => !STAGING_NAME_RE.test(name))
  ) {
    throw new ApiError(
      400,
      "invalid_recording_names",
      "Lista de gravações inválida.",
    );
  }
  const reservations = names.map((name) => {
    const match = name.match(STAGING_NAME_RE)!;
    return `_requests/${match[2]}/${match[3]}.mp4`;
  });
  const { error } = await admin.storage.from(STAGING_BUCKET).remove([
    ...names,
    ...reservations,
  ]);
  if (error) {
    throw new ApiError(
      503,
      "staging_remove_failed",
      "Não foi possível limpar a triagem.",
    );
  }
  return response(req, { removed: names.length });
}

async function coverage(req: Request, admin: ReturnType<typeof adminClient>) {
  const { data, error } = await admin.from("exercise_library").select(
    "video_path, video_url, youtube_video_id",
  );
  if (error) {
    throw new ApiError(
      503,
      "coverage_failed",
      "Não foi possível consultar a cobertura.",
    );
  }
  const rows = data || [];
  return response(req, {
    total: rows.length,
    proprio: rows.filter((row) => row.video_path).length,
    mfit: rows.filter((row) =>
      !row.video_path && (row.video_url || "").includes("cloudfront")
    ).length,
    youtube: rows.filter((row) =>
      !row.video_path && !(row.video_url || "").includes("cloudfront") &&
      row.youtube_video_id
    ).length,
    sem_video: rows.filter((row) =>
      !row.video_path && !row.video_url && !row.youtube_video_id
    ).length,
  });
}

async function signFinalAsset(
  req: Request,
  body: Record<string, unknown>,
  admin: ReturnType<typeof adminClient>,
) {
  const asset = validateFinalAsset(body.path, body.mime_type, body.size);
  await assertExerciseExists(admin, asset.exerciseId);
  const { data, error } = await admin.storage.from(FINAL_BUCKET)
    .createSignedUploadUrl(asset.path, { upsert: true });
  if (error || !data) {
    throw new ApiError(
      503,
      "asset_signing_failed",
      "Não foi possível iniciar a publicação do arquivo.",
    );
  }
  return response(req, { signed_url: data.signedUrl, path: data.path });
}

async function commitAssets(
  req: Request,
  body: Record<string, unknown>,
  admin: ReturnType<typeof adminClient>,
) {
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (!rawItems.length || rawItems.length > 50) {
    throw new ApiError(
      400,
      "invalid_commit_batch",
      "Lote de publicação inválido.",
    );
  }
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const rawItem of rawItems) {
    const item = (rawItem && typeof rawItem === "object")
      ? rawItem as Record<string, unknown>
      : {};
    const id = String(item.id || "");
    const expectedVideoPath = `biblioteca/${id}.mp4`;
    if (!UUID_RE.test(id) || item.video_path !== expectedVideoPath) {
      results.push({ id, ok: false, error: "invalid_asset_binding" });
      continue;
    }
    const { data: stored, error: storedError } = await admin.storage.from(
      FINAL_BUCKET,
    ).list("biblioteca", { search: id, limit: 10 });
    const storedByName = new Map(
      (stored || []).map((file) => [file.name, file]),
    );
    let storedAssetsAreValid = !storedError;
    for (
      const [name, mimeType] of [
        [`${id}.mp4`, "video/mp4"],
        [`${id}.jpg`, "image/jpeg"],
      ] as const
    ) {
      const file = storedByName.get(name);
      try {
        validateFinalAsset(
          `biblioteca/${name}`,
          file?.metadata?.mimetype,
          file?.metadata?.size,
        );
        if (file?.metadata?.mimetype !== mimeType) {
          storedAssetsAreValid = false;
        }
      } catch {
        storedAssetsAreValid = false;
      }
    }
    if (!storedAssetsAreValid) {
      results.push({ id, ok: false, error: "asset_not_stored" });
      continue;
    }
    const thumbnailUrl =
      `${SUPABASE_URL}/storage/v1/object/public/${FINAL_BUCKET}/biblioteca/${id}.jpg`;
    const { data: updated, error } = await admin.from("exercise_library")
      .update({
        video_path: expectedVideoPath,
        thumbnail_url: thumbnailUrl,
        video_url: null,
        youtube_video_id: null,
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    results.push({
      id,
      ok: !error && updated?.id === id,
      ...(error || updated?.id !== id
        ? { error: "database_update_failed" }
        : {}),
    });
  }
  return response(req, {
    updated: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok),
    results,
  });
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  try {
    if (req.method === "OPTIONS") {
      const origin = req.headers.get("Origin");
      if (!isAllowedOrigin(origin, ALLOWED_ORIGINS)) {
        throw new ApiError(403, "origin_forbidden", "Origem não autorizada.");
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin!) });
    }
    if (req.method !== "POST") {
      throw new ApiError(405, "method_not_allowed", "Método não permitido.");
    }
    const origin = req.headers.get("Origin");
    if (origin && !isAllowedOrigin(origin, ALLOWED_ORIGINS)) {
      throw new ApiError(403, "origin_forbidden", "Origem não autorizada.");
    }

    const body = await readJson(req);
    const action = String(body.action || "");
    const admin = adminClient();

    if (action === "authorize-recording") {
      await authorizeRecordingOperator(req, admin);
      return response(req, { authorized: true });
    }
    if (action === "sign-recording") {
      return await signRecording(req, body, admin);
    }

    await authorizeAdmin(req, admin);
    if (action === "list-recordings") return await listRecordings(req, admin);
    if (action === "remove-recordings") {
      return await removeRecordings(req, body, admin);
    }
    if (action === "list") return await listLibrary(req, admin);
    if (action === "coverage") return await coverage(req, admin);
    if (action === "sign") return await signFinalAsset(req, body, admin);
    if (action === "commit") return await commitAssets(req, body, admin);
    throw new ApiError(400, "unknown_action", "Ação desconhecida.");
  } catch (error) {
    return errorResponse(req, error, requestId);
  }
});
