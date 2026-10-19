import type { WhatsAppProviderIssue } from "./whatsappProviderState.ts";

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
type ConnectionStatus = "connected" | "waiting_qr" | "disconnected";
export type ConnectionProviderError = {
  kind: "provider_error";
  issue: WhatsAppProviderIssue;
  providerStatus: number | null;
};
export type WhatsAppConnectionProbe =
  | { kind: "existing"; status: ConnectionStatus }
  | { kind: "missing" }
  | ConnectionProviderError;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function readWhatsAppConnectionState(
  payload: unknown,
): ConnectionStatus | null {
  const value = record(payload);
  if (!value || value.error) return null;
  const instance = record(value?.instance);
  const raw = instance?.state ?? value?.state;
  if (typeof raw !== "string") return null;
  switch (raw.toLowerCase()) {
    case "open":
    case "connected":
      return "connected";
    case "connecting":
    case "waiting_qr":
      return "waiting_qr";
    case "close":
    case "closed":
    case "disconnected":
      return "disconnected";
    default:
      return null;
  }
}

export function readWhatsAppCreationEvidence(
  payload: unknown,
  expectedName: string,
): { status: "connected" | "waiting_qr"; qrCode: string | null } | null {
  const value = record(payload);
  if (!value || value.error) return null;
  const instance = record(value.instance);
  if (value.instance != null && !instance) return null;
  const names = [
    instance?.instanceName,
    instance?.name,
    value.instanceName,
    value.name,
  ]
    .filter((name) => name !== undefined);
  if (names.some((name) => name !== expectedName)) return null;
  const id = instance?.instanceId ?? instance?.id;
  if (id !== undefined && (typeof id !== "string" || !id.trim())) return null;

  // v2 create returns instance.status, while connectionState returns state.
  const rawState = instance?.state ?? instance?.status ?? value.state;
  const state = rawState === "created"
    ? "waiting_qr"
    : readWhatsAppConnectionState({ state: rawState });
  const hasState = Object.hasOwn(value, "state") ||
    (instance &&
      (Object.hasOwn(instance, "state") || Object.hasOwn(instance, "status")));
  if (hasState && !state) return null;

  const qrcode = record(value.qrcode);
  if (value.qrcode != null && !qrcode) return null;
  const candidate = qrcode?.base64;
  if (candidate != null && typeof candidate !== "string") return null;
  const qrCode = typeof candidate === "string" && candidate.trim()
    ? candidate
    : null;
  if (qrCode) {
    try {
      const bytes = atob(qrCode.replace(/^data:image\/png;base64,/, ""));
      if (!bytes.startsWith("\x89PNG\r\n\x1a\n") || bytes.length <= 8) {
        return null;
      }
    } catch {
      return null;
    }
  }
  // An opaque new provider id alone cannot establish ownership of this name.
  if (!qrCode && !(state && names.includes(expectedName))) return null;
  return {
    status: state === "connected" ? "connected" : "waiting_qr",
    qrCode: state === "connected" ? null : qrCode,
  };
}

// HTTP errors never prove a missing instance, regardless of their body text.
export function connectionProviderFailure(
  status: number | null,
): ConnectionProviderError {
  return {
    kind: "provider_error",
    issue: status === 401 || status === 403
      ? "whatsapp_provider_unauthorized"
      : status === 408 || status === 429
      ? "whatsapp_provider_busy"
      : "whatsapp_provider_failure",
    providerStatus: status,
  };
}

export async function probeWhatsAppConnection(args: {
  baseUrl: string;
  instanceName: string;
  headers: Record<string, string>;
  fetcher?: Fetcher;
}): Promise<WhatsAppConnectionProbe> {
  const fetcher = args.fetcher ?? fetch;
  const base = args.baseUrl.replace(/\/+$/, "");
  const get = (path: string) =>
    fetcher(`${base}${path}`, {
      method: "GET",
      headers: args.headers,
      signal: AbortSignal.timeout(8_000),
    });
  try {
    const response = await get(
      `/instance/connectionState/${encodeURIComponent(args.instanceName)}`,
    );
    if (response.status === 404) {
      // An independently healthy list endpoint distinguishes missing instances
      // from a proxy/route outage. Never return any of its private records.
      const listResponse = await get("/instance/fetchInstances");
      if (listResponse.status !== 200) {
        return connectionProviderFailure(listResponse.status);
      }
      const instances: unknown = await listResponse.json();
      if (!Array.isArray(instances)) return connectionProviderFailure(200);
      let found = false;
      for (const item of instances) {
        const entry = record(item);
        const instance = record(entry?.instance);
        // Evolution v2 uses name; older responses wrap instanceName/owner.
        const name = entry?.name ?? instance?.instanceName ??
          entry?.instanceName;
        if (typeof name !== "string" || !name.trim()) {
          return connectionProviderFailure(200);
        }
        if (name === args.instanceName) found = true;
      }
      return found ? connectionProviderFailure(404) : { kind: "missing" };
    }
    if (!response.ok) return connectionProviderFailure(response.status);
    const status = readWhatsAppConnectionState(await response.json());
    return status
      ? { kind: "existing", status }
      : connectionProviderFailure(response.status);
  } catch {
    return connectionProviderFailure(null);
  }
}
