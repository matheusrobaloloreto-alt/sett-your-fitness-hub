import {
  providerErrorDetails,
  sanitizeProviderErrorForLog,
} from "./provider-error-redaction.ts";

Deno.test("provider send error details never echo raw body identifiers or secrets", () => {
  const unsafeBody = JSON.stringify({
    message: "failed for +55 (48) 99143-2057 / 5548991432057@s.whatsapp.net",
    authorization: "Bearer sk-live-provider-secret",
    api_key: "provider_api_key_123",
    nested: { secret: "tenant-secret-value", token: "raw-token-value" },
  });

  const details = providerErrorDetails(
    401,
    "whatsapp_provider_unauthorized",
    unsafeBody,
  );

  if (details !== "provider_status_401:whatsapp_provider_unauthorized") {
    throw new Error(`unexpected sanitized details: ${details}`);
  }

  const serialized = JSON.stringify(details).toLowerCase();
  for (
    const leaked of [
      "99143",
      "@s.whatsapp.net",
      "bearer",
      "sk-live",
      "api_key",
      "secret",
      "raw-token",
    ]
  ) {
    if (serialized.includes(leaked)) throw new Error(`leaked ${leaked}`);
  }
});

Deno.test("provider error log metadata keeps status and safe code only", () => {
  const unsafeBody = "token=abc phone=5548991432057@s.whatsapp.net secret=abc";

  const log = sanitizeProviderErrorForLog(
    429,
    "whatsapp_provider_busy",
    unsafeBody,
  );

  if (
    JSON.stringify(log) !==
      '{"providerStatus":429,"providerCode":"whatsapp_provider_busy"}'
  ) {
    throw new Error(`unexpected log metadata: ${JSON.stringify(log)}`);
  }
});
