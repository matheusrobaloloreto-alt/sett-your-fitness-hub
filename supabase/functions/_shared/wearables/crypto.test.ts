import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decryptTokens, encryptTokens, sanitizeError } from "./crypto.ts";

const key = btoa(
  String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
);
const otherKey = btoa(
  String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
);

Deno.test("wearable crypto roundtrip keeps tokens confidential", async () => {
  const envelope = await encryptTokens(
    {
      accessToken: "access-sensitive",
      refreshToken: "refresh-sensitive",
      expiresAt: null,
      tokenType: "Bearer",
      scopes: [],
    },
    { current: key },
    "current",
    "device-a",
  );
  assertEquals(JSON.stringify(envelope).includes("access-sensitive"), false);
  assertEquals(await decryptTokens(envelope, { current: key }, "device-a"), {
    accessToken: "access-sensitive",
    refreshToken: "refresh-sensitive",
  });
});

Deno.test("wearable crypto rejects a wrong key and wrong device AAD", async () => {
  const envelope = await encryptTokens(
    {
      accessToken: "access-sensitive",
      refreshToken: null,
      expiresAt: null,
      tokenType: null,
      scopes: [],
    },
    { current: key },
    "current",
    "device-a",
  );
  await assertRejects(
    () => decryptTokens(envelope, { current: otherKey }, "device-a"),
    Error,
    "wearable_credential_decryption_failed",
  );
  await assertRejects(
    () => decryptTokens(envelope, { current: key }, "device-b"),
    Error,
    "wearable_credential_decryption_failed",
  );
});

Deno.test("wearable errors never echo provider tokens", () => {
  assertEquals(
    sanitizeError(new Error("token access-sensitive rejected")),
    "wearable_provider_error",
  );
});
