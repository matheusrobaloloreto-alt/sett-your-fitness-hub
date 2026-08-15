import { requestJson, WearableHttpError } from "./http.ts";
import type { ConnectableProvider, TokenBundle } from "./types.ts";

export const REQUIRED_SCOPES: Record<ConnectableProvider, string[]> = {
  oura: ["daily", "workout"],
  whoop: [
    "read:recovery",
    "read:cycles",
    "read:workout",
    "read:sleep",
    "offline",
  ],
  strava: ["read", "activity:read_all"],
  polar: ["accesslink.read_all"],
};

const AUTHORIZE_ENDPOINTS: Record<ConnectableProvider, string> = {
  oura: "https://cloud.ouraring.com/oauth/authorize",
  whoop: "https://api.prod.whoop.com/oauth/oauth2/auth",
  strava: "https://www.strava.com/oauth/authorize",
  polar: "https://flow.polar.com/oauth2/authorization",
};

const TOKEN_ENDPOINTS: Record<ConnectableProvider, string> = {
  oura: "https://api.ouraring.com/oauth/token",
  whoop: "https://api.prod.whoop.com/oauth/oauth2/token",
  strava: "https://www.strava.com/oauth/token",
  polar: "https://polarremote.com/v2/oauth2/token",
};

export function createOAuthState() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll(
    "/",
    "_",
  ).replaceAll("=", "");
}

export function authorizeUrl(
  provider: ConnectableProvider,
  clientId: string,
  state: string,
  callbackUrl: string,
) {
  const url = new URL(AUTHORIZE_ENDPOINTS[provider]);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set(
    "scope",
    provider === "strava"
      ? REQUIRED_SCOPES[provider].join(",")
      : REQUIRED_SCOPES[provider].join(" "),
  );
  url.searchParams.set("state", state);
  if (provider === "strava") url.searchParams.set("approval_prompt", "auto");
  return url.toString();
}

export function grantedScopes(payload: Record<string, unknown>) {
  const raw = payload.scope;
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  return String(raw ?? "").split(/[\s,]+/).filter(Boolean);
}

export function missingScopes(provider: ConnectableProvider, scopes: string[]) {
  const normalized = new Set(scopes.map((scope) => scope.toLowerCase()));
  return REQUIRED_SCOPES[provider].filter((scope) =>
    !normalized.has(scope.toLowerCase())
  );
}

export function resolveGrantedScopes(
  provider: ConnectableProvider,
  tokenScopes: string[],
  callbackScope: string | null,
) {
  const callbackScopes = String(callbackScope ?? "").split(/[\s,]+/).filter(
    Boolean,
  );
  if (tokenScopes.length) return tokenScopes;
  if (callbackScopes.length) return callbackScopes;
  // Polar AccessLink grants the single requested accesslink.read_all permission,
  // but its documented token response does not echo a scope field.
  return provider === "polar" ? [...REQUIRED_SCOPES.polar] : [];
}

function tokenBundle(payload: Record<string, unknown>): TokenBundle {
  if (!payload.access_token) throw new Error("oauth_token_missing");
  const expiresIn = Number(payload.expires_in);
  return {
    accessToken: String(payload.access_token),
    refreshToken: payload.refresh_token ? String(payload.refresh_token) : null,
    expiresAt: Number.isFinite(expiresIn)
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null,
    tokenType: payload.token_type ? String(payload.token_type) : null,
    scopes: grantedScopes(payload),
    externalUserId: polarExternalUserId(payload),
  };
}

export function polarExternalUserId(payload: Record<string, unknown>) {
  const value = payload["polar-user-id"] ?? payload.x_user_id;
  return value === null || value === undefined || value === ""
    ? null
    : String(value);
}

export async function registerPolarUser(
  accessToken: string,
  memberId: string,
  tokenExternalUserId: string | null,
) {
  try {
    const payload = await requestJson<Record<string, unknown>>(
      "https://www.polaraccesslink.com/v3/users",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ "member-id": memberId }),
      },
    );
    const externalUserId = polarExternalUserId(payload ?? {});
    if (!externalUserId) throw new Error("polar_user_id_missing");
    return externalUserId;
  } catch (error) {
    if (
      error instanceof WearableHttpError && error.status === 409 &&
      tokenExternalUserId
    ) return tokenExternalUserId;
    throw error;
  }
}

export async function exchangeAuthorizationCode(
  provider: ConnectableProvider,
  code: string,
  clientId: string,
  clientSecret: string,
  callbackUrl: string,
) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl,
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (provider === "polar") {
    headers.Authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
  } else {
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
  }
  return tokenBundle(
    await requestJson<Record<string, unknown>>(TOKEN_ENDPOINTS[provider], {
      method: "POST",
      headers,
      body,
    }),
  );
}

export async function refreshProviderToken(
  provider: ConnectableProvider,
  refreshToken: string,
  clientId: string,
  clientSecret: string,
) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (provider === "polar") {
    headers.Authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
  } else {
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
  }
  if (provider === "whoop") body.set("scope", "offline");
  return tokenBundle(
    await requestJson<Record<string, unknown>>(TOKEN_ENDPOINTS[provider], {
      method: "POST",
      headers,
      body,
    }),
  );
}

export async function revokeProviderToken(
  provider: ConnectableProvider,
  accessToken: string,
  clientId: string,
  externalUserId: string | null = null,
) {
  const request = providerRevocationRequest(
    provider,
    accessToken,
    clientId,
    externalUserId,
  );
  await requestJson(request.url, request.init, { attempts: 2 });
}

export function providerRevocationRequest(
  provider: ConnectableProvider,
  accessToken: string,
  clientId: string,
  externalUserId: string | null = null,
): { url: string; init: RequestInit } {
  if (provider === "oura") {
    const url = new URL("https://api.ouraring.com/oauth/revoke");
    url.searchParams.set("access_token", accessToken);
    return {
      url: url.toString(),
      init: { method: "POST" } satisfies RequestInit,
    };
  }
  if (provider === "polar") {
    if (!externalUserId || !/^\d+$/.test(externalUserId)) {
      throw new Error("polar_user_id_missing");
    }
    return {
      url: `https://www.polaraccesslink.com/v3/users/${externalUserId}`,
      init: {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      } satisfies RequestInit,
    };
  }
  const endpoint = provider === "whoop"
    ? {
      url: "https://api.prod.whoop.com/developer/v2/user/access",
      method: "DELETE",
    }
    : { url: "https://www.strava.com/oauth/deauthorize", method: "POST" };
  return {
    url: endpoint.url,
    init: {
      method: endpoint.method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Client-Id": clientId,
      },
    } satisfies RequestInit,
  };
}
