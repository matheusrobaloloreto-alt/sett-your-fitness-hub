export class WearableHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(code);
  }
}

interface RequestOptions {
  attempts?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

function retryDelay(response: Response, attempt: number) {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.min(retryAfter * 1000, 10_000);
  }
  return Math.min(250 * 2 ** attempt + Math.floor(Math.random() * 100), 4_000);
}

export async function requestJson<T>(
  url: string,
  init: RequestInit,
  options: RequestOptions = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ??
    ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? 12_000,
    );
    let response: Response;
    try {
      response = await fetchImpl(url, { ...init, signal: controller.signal });
    } catch (error) {
      clearTimeout(timeout);
      if (attempt + 1 < attempts) {
        await sleep(Math.min(250 * 2 ** attempt, 2_000));
        continue;
      }
      throw new WearableHttpError(
        0,
        error instanceof DOMException && error.name === "AbortError"
          ? "provider_timeout"
          : "provider_network_error",
        true,
      );
    }
    clearTimeout(timeout);
    if (response.ok) {
      if (response.status === 204) return null as T;
      const text = await response.text();
      if (!text) return null as T;
      return JSON.parse(text) as T;
    }
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt + 1 < attempts) {
      await sleep(retryDelay(response, attempt));
      continue;
    }
    const code = response.status === 401
      ? "provider_unauthorized"
      : response.status === 429
      ? "provider_rate_limited"
      : response.status >= 500
      ? "provider_unavailable"
      : "provider_request_rejected";
    throw new WearableHttpError(response.status, code, retryable);
  }
  throw new WearableHttpError(0, "provider_network_error", true);
}

export async function collectPages<T>(
  firstUrl: string,
  tokenParameter: "next_token" | "nextToken",
  load: (
    url: string,
  ) => Promise<{ records?: T[]; data?: T[]; next_token?: string | null }>,
  maxPages = 40,
  onPage?: () => Promise<void>,
) {
  const records: T[] = [];
  let url = firstUrl;
  let pages = 0;
  let nextToken: string | null = null;
  do {
    const payload = await load(url);
    if (onPage) await onPage();
    records.push(...(payload.records ?? payload.data ?? []));
    nextToken = payload.next_token ?? null;
    pages += 1;
    if (nextToken) {
      const next = new URL(firstUrl);
      next.searchParams.set(tokenParameter, nextToken);
      url = next.toString();
    }
  } while (nextToken && pages < maxPages);
  if (nextToken) throw new Error("provider_pagination_limit");
  return records;
}
