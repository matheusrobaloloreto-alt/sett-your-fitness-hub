import {
  allowedOrigins,
  ApiError,
  isAllowedOrigin,
  MAX_RECORDING_BYTES,
  parseRecordingSignInput,
  ReplayGuard,
  requireAuthenticatedUser,
  safeSecretEqual,
  SlidingWindowLimiter,
  validateFinalAsset,
  validateStagingBucketPolicy,
} from "./security.ts";

function assert(
  condition: unknown,
  message = "assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectApiError(
  run: () => unknown | Promise<unknown>,
  status: number,
  code: string,
) {
  try {
    await run();
  } catch (error) {
    assert(
      error instanceof ApiError,
      `expected ApiError, got ${String(error)}`,
    );
    assert(error.status === status, `expected ${status}, got ${error.status}`);
    assert(error.code === code, `expected ${code}, got ${error.code}`);
    return;
  }
  throw new Error(`expected ${code}`);
}

Deno.test("CORS accepts only exact approved origins", () => {
  const origins = allowedOrigins(
    "https://www.settapp.com.br,https://staging.example.test",
  );
  assert(isAllowedOrigin("https://www.settapp.com.br", origins));
  assert(!isAllowedOrigin("https://www.settapp.com.br.evil.test", origins));
  assert(!isAllowedOrigin("https://www.settapp.com.br/path", origins));
  assert(!isAllowedOrigin("http://www.settapp.com.br", origins));
  assert(!isAllowedOrigin(null, origins));

  const invalidConfiguration = allowedOrigins(
    "http://www.settapp.com.br,https://www.settapp.com.br/path,*",
  );
  assert(invalidConfiguration.size === 0);
});

Deno.test("missing, invalid and expired JWTs fail closed", async () => {
  await expectApiError(
    () => requireAuthenticatedUser(null, async () => ({ userId: "unused" })),
    401,
    "missing_token",
  );
  await expectApiError(
    () =>
      requireAuthenticatedUser(
        "Bearer invalid",
        async () => ({ userId: null, error: "invalid" }),
      ),
    401,
    "invalid_token",
  );
  await expectApiError(
    () =>
      requireAuthenticatedUser(
        "Bearer expired",
        async () => ({ userId: null, error: "expired" }),
      ),
    401,
    "expired_token",
  );
  const userId = await requireAuthenticatedUser(
    "Bearer valid",
    async () => ({ userId: "user-id" }),
  );
  assert(userId === "user-id");
});

Deno.test("recording request enforces allowlisted MIME, size and UUIDv4 replay id", async () => {
  const valid = {
    codigo: "001",
    exercise_id: "071c7a8a-dc77-4f37-8fe8-60e6bb0e9351",
    request_id: "a0dd8a92-2df3-48ed-9c60-83e18125c941",
    mime_type: "video/mp4",
    size: 1024,
  };
  assert(parseRecordingSignInput(valid).extension === "mp4");
  await expectApiError(
    () => parseRecordingSignInput({ ...valid, mime_type: "text/html" }),
    415,
    "unsupported_media_type",
  );
  await expectApiError(
    () => parseRecordingSignInput({ ...valid, size: MAX_RECORDING_BYTES + 1 }),
    413,
    "file_too_large",
  );
  await expectApiError(
    () =>
      parseRecordingSignInput({
        ...valid,
        request_id: "071c7a8a-dc77-1f37-8fe8-60e6bb0e9351",
      }),
    400,
    "invalid_request_id",
  );
});

Deno.test("replay guard rejects repeated and conflicting request ids", async () => {
  const guard = new ReplayGuard(60_000);
  guard.assertFresh("user:request", "001:file", 1000);
  await expectApiError(
    () => guard.assertFresh("user:request", "001:file", 1001),
    409,
    "replayed_request",
  );

  const conflictGuard = new ReplayGuard(60_000);
  conflictGuard.assertFresh("user:request", "001:file", 1000);
  await expectApiError(
    () => conflictGuard.assertFresh("user:request", "002:file", 1001),
    409,
    "request_id_conflict",
  );
});

Deno.test("sliding window limiter blocks bursts", async () => {
  const limiter = new SlidingWindowLimiter();
  limiter.assertAllowed("user", 2, 1000, 1000);
  limiter.assertAllowed("user", 2, 1000, 1001);
  await expectApiError(
    () => limiter.assertAllowed("user", 2, 1000, 1002),
    429,
    "rate_limited",
  );
  limiter.assertAllowed("user", 2, 1000, 3000);
});

Deno.test("staging bucket must be private with strict MIME and size policy", async () => {
  const strict = {
    public: false,
    file_size_limit: MAX_RECORDING_BYTES,
    allowed_mime_types: [
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "video/x-m4v",
      "video/3gpp",
    ],
  };
  validateStagingBucketPolicy(strict);
  await expectApiError(
    () => validateStagingBucketPolicy({ ...strict, public: true }),
    503,
    "storage_policy_not_hardened",
  );
  await expectApiError(
    () =>
      validateStagingBucketPolicy({
        ...strict,
        allowed_mime_types: [...strict.allowed_mime_types, "text/html"],
      }),
    503,
    "storage_policy_not_hardened",
  );
});

Deno.test("final asset signer accepts only canonical exercise paths", async () => {
  const id = "071c7a8a-dc77-4f37-8fe8-60e6bb0e9351";
  assert(
    validateFinalAsset(`biblioteca/${id}.mp4`, "video/mp4", 1024).exerciseId ===
      id,
  );
  await expectApiError(
    () => validateFinalAsset(`../${id}.mp4`, "video/mp4", 1024),
    400,
    "invalid_asset_path",
  );
  await expectApiError(
    () => validateFinalAsset(`biblioteca/${id}.mp4`, "image/jpeg", 1024),
    415,
    "asset_mime_mismatch",
  );
});

Deno.test("service secret comparison is fail-closed", async () => {
  assert(await safeSecretEqual("same-secret", "same-secret"));
  assert(!await safeSecretEqual("same-secret", "different-secret"));
  assert(!await safeSecretEqual("", ""));
});
