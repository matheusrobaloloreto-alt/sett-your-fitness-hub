import { sameWhatsAppRecipient } from "./whatsappIdentity.ts";

export type ProviderProbeClassification =
  | "ok"
  | "unauthorized"
  | "not_found"
  | "rate_limited"
  | "provider_unavailable"
  | "network_error"
  | "unexpected_response";

export type ProviderProbe = {
  reachable: boolean;
  status: number | null;
  classification: ProviderProbeClassification;
};

type SafeFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

function digitsOnly(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

export function evolutionBaseCandidates(configuredUrl: string): string[] {
  const configured = String(configuredUrl || "").trim().replace(/\/+$/, "");
  if (!configured) return [];

  try {
    const origin = new URL(configured).origin;
    return [...new Set([configured, origin])];
  } catch {
    return [configured];
  }
}

export function safeProviderHost(configuredUrl: string): string | null {
  try {
    const parsed = new URL(configuredUrl);
    if (
      parsed.protocol !== "https:" || parsed.username || parsed.password ||
      parsed.search || parsed.hash
    ) return null;
    return parsed.hostname || null;
  } catch {
    return null;
  }
}

export async function probeProviderEndpoint(
  fetcher: SafeFetcher,
  url: string,
  headers: Record<string, string>,
): Promise<ProviderProbe> {
  try {
    const response = await fetcher(url, {
      headers,
      signal: AbortSignal.timeout(8_000),
    });
    const status = response.status;
    // Intentionally do not read or return the response body. Provider bodies
    // have historically included phone numbers, tokens and request metadata.
    if (response.ok) return { reachable: true, status, classification: "ok" };
    if (status === 401 || status === 403) {
      return { reachable: true, status, classification: "unauthorized" };
    }
    if (status === 404) {
      return { reachable: true, status, classification: "not_found" };
    }
    if (status === 408 || status === 429) {
      return { reachable: true, status, classification: "rate_limited" };
    }
    if (status >= 500) {
      return {
        reachable: true,
        status,
        classification: "provider_unavailable",
      };
    }
    return {
      reachable: true,
      status,
      classification: "unexpected_response",
    };
  } catch {
    return { reachable: false, status: null, classification: "network_error" };
  }
}

export type ZapiFallbackProbe = {
  configured: boolean;
  reachable: boolean;
  connected: boolean;
  smartphoneConnected: boolean | null;
  identityAvailable: boolean;
  identityMatches: boolean | null;
  status: number | null;
  classification: ProviderProbeClassification | "not_configured";
};

export async function probeZapiFallback(args: {
  instanceId: string;
  token: string;
  clientToken: string;
  expectedPhone: string | null;
  fetcher?: SafeFetcher;
}): Promise<ZapiFallbackProbe> {
  const configured = Boolean(
    args.instanceId && args.token && args.clientToken,
  );
  if (!configured) {
    return {
      configured: false,
      reachable: false,
      connected: false,
      smartphoneConnected: null,
      identityAvailable: false,
      identityMatches: null,
      status: null,
      classification: "not_configured",
    };
  }

  const fetcher = args.fetcher || fetch;
  const prefix = `https://api.z-api.io/instances/${
    encodeURIComponent(args.instanceId)
  }/token/${encodeURIComponent(args.token)}`;
  const headers = {
    "Client-Token": args.clientToken,
    "Content-Type": "application/json",
  };

  let statusResponse: Response;
  try {
    statusResponse = await fetcher(`${prefix}/status`, {
      headers,
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return {
      configured: true,
      reachable: false,
      connected: false,
      smartphoneConnected: null,
      identityAvailable: false,
      identityMatches: null,
      status: null,
      classification: "network_error",
    };
  }

  const safeStatus = await probeProviderEndpoint(
    async () => statusResponse,
    `${prefix}/status`,
    headers,
  );
  if (!statusResponse.ok) {
    return {
      configured: true,
      reachable: safeStatus.reachable,
      connected: false,
      smartphoneConnected: null,
      identityAvailable: false,
      identityMatches: null,
      status: safeStatus.status,
      classification: safeStatus.classification,
    };
  }

  const statusPayload = await statusResponse.json().catch(() => ({}));
  const connected = statusPayload?.connected === true;
  const smartphoneConnected = typeof statusPayload?.smartphoneConnected ===
      "boolean"
    ? statusPayload.smartphoneConnected
    : null;

  if (!connected) {
    return {
      configured: true,
      reachable: true,
      connected: false,
      smartphoneConnected,
      identityAvailable: false,
      identityMatches: null,
      status: statusResponse.status,
      classification: "ok",
    };
  }

  let deviceResponse: Response;
  try {
    deviceResponse = await fetcher(`${prefix}/device`, {
      headers,
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return {
      configured: true,
      reachable: true,
      connected: true,
      smartphoneConnected,
      identityAvailable: false,
      identityMatches: null,
      status: statusResponse.status,
      classification: "network_error",
    };
  }

  if (!deviceResponse.ok) {
    const deviceProbe = await probeProviderEndpoint(
      async () => deviceResponse,
      `${prefix}/device`,
      headers,
    );
    return {
      configured: true,
      reachable: true,
      connected: true,
      smartphoneConnected,
      identityAvailable: false,
      identityMatches: null,
      status: deviceProbe.status,
      classification: deviceProbe.classification,
    };
  }

  const devicePayload = await deviceResponse.json().catch(() => ({}));
  const devicePhone = digitsOnly(devicePayload?.phone);
  const expectedPhone = digitsOnly(args.expectedPhone);
  return {
    configured: true,
    reachable: true,
    connected: true,
    smartphoneConnected,
    identityAvailable: Boolean(devicePhone),
    identityMatches: devicePhone && expectedPhone
      ? sameWhatsAppRecipient(devicePhone, expectedPhone)
      : null,
    status: deviceResponse.status,
    classification: "ok",
  };
}
