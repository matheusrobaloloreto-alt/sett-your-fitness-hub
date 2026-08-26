export function providerErrorDetails(
  status: number,
  code: string,
  _rawBody?: string,
): string {
  const safeStatus = Number.isInteger(status) ? status : 0;
  const safeCode = /^[a-z0-9_:-]+$/i.test(code) ? code : "provider_error";
  return `provider_status_${safeStatus}:${safeCode}`;
}

export function sanitizeProviderErrorForLog(
  status: number,
  code: string,
  _rawBody?: string,
) {
  return { providerStatus: status, providerCode: code };
}
