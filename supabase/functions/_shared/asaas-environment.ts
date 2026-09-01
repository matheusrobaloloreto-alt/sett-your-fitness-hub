export type AsaasEnvironment = "production" | "sandbox";

export type AsaasApiConfig = {
  baseUrl: string;
  environment: AsaasEnvironment;
};

const ALLOWED_ASAAS_BASE_URLS: Readonly<Record<string, AsaasEnvironment>> = Object.freeze({
  "https://api.asaas.com/v3": "production",
  "https://api-sandbox.asaas.com/v3": "sandbox",
});

export function resolveAsaasApiConfig(rawBaseUrl: string | null | undefined): AsaasApiConfig {
  const baseUrl = rawBaseUrl?.trim() || "";
  const environment = ALLOWED_ASAAS_BASE_URLS[baseUrl];
  if (!environment) {
    throw new Error("ASAAS_BASE_URL ausente ou fora da allowlist oficial.");
  }
  return { baseUrl, environment };
}

export function asaasApiUrl(config: AsaasApiConfig, path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Path Asaas invalido.");
  }
  return `${config.baseUrl}${path}`;
}
