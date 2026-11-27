import { StudioError, validateStudioImage } from "./handler.ts";

export async function readReferenceBytes(body: ReadableStream<Uint8Array> | null, limit: number) {
  if (!body) throw new StudioError(422, "reference_unavailable");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new StudioError(413, "request_too_large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export async function fetchInstagramReference(value: string, fetcher: typeof fetch = fetch) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || !["instagram.com", "www.instagram.com"].includes(url.hostname) || !/^\/(p|reel)\/[\w-]+\/?$/.test(url.pathname)) throw new StudioError(422, "reference_requires_upload");
  const response = await fetcher(url.href, { redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new StudioError(422, "reference_requires_upload");
  const html = new TextDecoder().decode(await readReferenceBytes(response.body, 2 * 1024 * 1024));
  const tag = html.match(/<meta\b[^>]*(?:property|name)=["']og:image["'][^>]*>/i)?.[0];
  const content = tag?.match(/\bcontent=["']([^"']+)["']/i)?.[1]?.replaceAll("&amp;", "&");
  if (!content) throw new StudioError(422, "reference_requires_upload");
  const imageUrl = new URL(content);
  if (imageUrl.protocol !== "https:" || imageUrl.username || imageUrl.password || !/\.(cdninstagram\.com|fbcdn\.net)$/.test(imageUrl.hostname)) throw new StudioError(422, "reference_requires_upload");
  const image = await fetcher(imageUrl.href, { redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!image.ok) throw new StudioError(422, "reference_requires_upload");
  const mime = image.headers.get("content-type")?.split(";")[0] || "";
  const bytes = await readReferenceBytes(image.body, 10 * 1024 * 1024);
  if (!validateStudioImage(bytes, mime)) throw new StudioError(422, "reference_requires_upload");
  return { bytes, mime };
}
