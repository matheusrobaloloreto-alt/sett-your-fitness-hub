import { BN_CONTENT_LIMITS, bnContentRecord } from "../_shared/bnContent.ts";
import { StudioError, validateStudioImage } from "./handler.ts";

export const BN_TEXT_MODELS = ["gemini-2.5-flash", "gemini-2.5-pro"] as const;
export const BN_IMAGE_MODEL = "gemini-3.1-flash-image";
const retryable = new Set([429, 500, 502, 503, 504]);

async function responseJson(
  response: Response,
  maxBytes: number,
): Promise<unknown> {
  if (!response.body) throw new StudioError(502, "invalid_provider_response");
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new StudioError(502, "invalid_provider_response");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.length;
    }
    try {
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
    } catch {
      throw new StudioError(502, "invalid_provider_response");
    }
  } finally {
    reader.releaseLock();
  }
}

function parts(value: unknown): Record<string, unknown>[] {
  if (
    !bnContentRecord(value) || !Array.isArray(value.candidates) ||
    value.candidates.length !== 1
  ) throw new StudioError(502, "invalid_provider_response");
  const candidate = value.candidates[0];
  if (
    !bnContentRecord(candidate) || candidate.finishReason !== "STOP" ||
    !bnContentRecord(candidate.content) ||
    !Array.isArray(candidate.content.parts) ||
    !candidate.content.parts.every(bnContentRecord)
  ) throw new StudioError(502, "invalid_provider_response");
  return candidate.content.parts.filter((part) => part.thought !== true);
}

export function createGeminiProvider(
  key: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = 60000,
) {
  async function call(
    model: string,
    prompt: string,
    config: Record<string, unknown>,
    maxBytes: number,
  ) {
    if (!key.trim()) throw new StudioError(503, "provider_unavailable");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { candidateCount: 1, ...config },
          }),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        return { status: response.status, value: undefined };
      }
      return {
        status: response.status,
        value: await responseJson(response, maxBytes),
      };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new StudioError(504, "provider_timeout");
      }
      if (error instanceof StudioError) throw error;
      throw new StudioError(503, "provider_unavailable");
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async text(prompt: string): Promise<unknown> {
      for (let i = 0; i < BN_TEXT_MODELS.length; i++) {
        const result = await call(BN_TEXT_MODELS[i], prompt, {
          responseMimeType: "application/json",
          temperature: 0.6,
          maxOutputTokens: 16384,
        }, 256 * 1024);
        if (result.status < 200 || result.status >= 300) {
          if (retryable.has(result.status) && i === 0) continue;
          throw new StudioError(503, "provider_unavailable");
        }
        const text = parts(result.value).map((p) =>
          typeof p.text === "string" ? p.text : ""
        ).join("");
        if (!text || text.length > BN_CONTENT_LIMITS.requestBytes) {
          throw new StudioError(502, "invalid_provider_response");
        }
        try {
          return JSON.parse(text);
        } catch {
          throw new StudioError(502, "invalid_provider_response");
        }
      }
      throw new StudioError(503, "provider_unavailable");
    },
    async image(prompt: string, aspect: "4:5" | "9:16") {
      const result = await call(BN_IMAGE_MODEL, prompt, {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: aspect, imageSize: "1K" },
      }, Math.ceil(BN_CONTENT_LIMITS.imageBytes * 4 / 3) + 65536);
      if (result.status < 200 || result.status >= 300) {
        throw new StudioError(503, "provider_unavailable");
      }
      const images = parts(result.value).filter((part) =>
        bnContentRecord(part.inlineData)
      );
      if (images.length !== 1) {
        throw new StudioError(502, "invalid_provider_image");
      }
      const image = images[0].inlineData as Record<string, unknown>;
      if (
        !["image/png", "image/jpeg"].includes(image.mimeType as string) ||
        typeof image.data !== "string" ||
        image.data.length >
          Math.ceil(BN_CONTENT_LIMITS.imageBytes * 4 / 3) + 4 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)
      ) throw new StudioError(502, "invalid_provider_image");
      let bytes: Uint8Array;
      try {
        bytes = Uint8Array.from(atob(image.data), (c) => c.charCodeAt(0));
      } catch {
        throw new StudioError(502, "invalid_provider_image");
      }
      if (!validateStudioImage(bytes, image.mimeType as string)) {
        throw new StudioError(502, "invalid_provider_image");
      }
      return { bytes, mime: image.mimeType as string };
    },
  };
}
