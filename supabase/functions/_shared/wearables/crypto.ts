import type {
  CredentialEnvelope,
  EncryptedValue,
  TokenBundle,
} from "./types.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function parseKeyring(raw: string, activeKeyId: string) {
  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("wearable_keyring_invalid");
  }
  if (!activeKeyId || !parsed[activeKeyId]) {
    throw new Error("wearable_active_key_missing");
  }
  return parsed;
}

async function importKey(keyring: Record<string, string>, keyId: string) {
  const encoded = keyring[keyId];
  if (!encoded) throw new Error("wearable_key_not_found");
  const bytes = base64ToBytes(encoded);
  if (bytes.byteLength !== 32) throw new Error("wearable_key_invalid_length");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encryptValue(
  value: string,
  key: CryptoKey,
  aad: string,
): Promise<EncryptedValue> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(aad) },
    key,
    encoder.encode(value),
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
  };
}

async function decryptValue(
  value: EncryptedValue,
  key: CryptoKey,
  aad: string,
) {
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64ToBytes(value.iv),
        additionalData: encoder.encode(aad),
      },
      key,
      base64ToBytes(value.ciphertext),
    );
    return decoder.decode(plaintext);
  } catch {
    throw new Error("wearable_credential_decryption_failed");
  }
}

export async function encryptTokens(
  tokens: TokenBundle,
  keyring: Record<string, string>,
  keyId: string,
  deviceId: string,
): Promise<CredentialEnvelope> {
  const key = await importKey(keyring, keyId);
  return {
    keyId,
    accessToken: await encryptValue(
      tokens.accessToken,
      key,
      `${deviceId}:access`,
    ),
    refreshToken: tokens.refreshToken
      ? await encryptValue(tokens.refreshToken, key, `${deviceId}:refresh`)
      : null,
  };
}

export async function decryptTokens(
  envelope: CredentialEnvelope,
  keyring: Record<string, string>,
  deviceId: string,
) {
  const key = await importKey(keyring, envelope.keyId);
  return {
    accessToken: await decryptValue(
      envelope.accessToken,
      key,
      `${deviceId}:access`,
    ),
    refreshToken: envelope.refreshToken
      ? await decryptValue(envelope.refreshToken, key, `${deviceId}:refresh`)
      : null,
  };
}

export function sanitizeError(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : "wearable_unknown_error";
  if (
    /token|secret|credential/i.test(message) &&
    !/^wearable_[a-z_]+$/.test(message)
  ) {
    return "wearable_provider_error";
  }
  return message.slice(0, 240);
}
