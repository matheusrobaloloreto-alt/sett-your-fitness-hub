import assert from "node:assert/strict";
import {
  BN_CONTENT_DEFAULT_SPEC,
  BN_CONTENT_LIMITS,
} from "../_shared/bnContent.ts";
import {
  BN_IMAGE_MODEL,
  BN_TEXT_MODELS,
  createGeminiProvider,
} from "./provider.ts";
import { StudioError } from "./handler.ts";

const pngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=";
const success = (parts: unknown[], finishReason = "STOP") =>
  Response.json({ candidates: [{ finishReason, content: { parts } }] });
const textResponse = () =>
  success([{ text: JSON.stringify(BN_CONTENT_DEFAULT_SPEC) }]);
function errorCode(status: number, code: string) {
  return (e: unknown) =>
    e instanceof StudioError && e.status === status && e.code === code;
}

Deno.test("Gemini REST fixed model, JSON mode, key header and bounded output", async () => {
  const requests: {
    url: string;
    headers: Headers;
    body: Record<string, unknown>;
  }[] = [];
  const provider = createGeminiProvider(
    "synthetic-private-key",
    async (input, init) => {
      requests.push({
        url: String(input),
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)),
      });
      return textResponse();
    },
  );
  assert.deepEqual(
    await provider.text("synthetic prompt"),
    BN_CONTENT_DEFAULT_SPEC,
  );
  assert.ok(
    requests[0].url.endsWith(`/models/${BN_TEXT_MODELS[0]}:generateContent`),
  );
  assert.equal(requests[0].url.includes("synthetic-private-key"), false);
  assert.equal(
    requests[0].headers.get("x-goog-api-key"),
    "synthetic-private-key",
  );
  assert.deepEqual(requests[0].body.generationConfig, {
    candidateCount: 1,
    responseMimeType: "application/json",
    temperature: 0.6,
    maxOutputTokens: 16384,
  });
});

Deno.test("text falls back to fixed pro only on transient HTTP errors", async () => {
  const urls: string[] = [];
  const provider = createGeminiProvider("synthetic", async (input) => {
    urls.push(String(input));
    return urls.length === 1
      ? Response.json({ private: "not exposed" }, { status: 503 })
      : textResponse();
  });
  assert.deepEqual(await provider.text("prompt"), BN_CONTENT_DEFAULT_SPEC);
  assert.equal(urls.length, 2);
  assert.ok(urls[1].includes(BN_TEXT_MODELS[1]));
  let deniedCalls = 0;
  const denied = createGeminiProvider("synthetic", async () => {
    deniedCalls++;
    return Response.json({ error: "PRIVATE provider payload" }, {
      status: 403,
    });
  });
  await assert.rejects(
    () => denied.text("prompt"),
    errorCode(503, "provider_unavailable"),
  );
  assert.equal(deniedCalls, 1);
});

Deno.test("truncated, blocked, markdown, empty and malformed provider text fail without fallback", async () => {
  for (
    const respond of [
      () =>
        success(
          [{ text: JSON.stringify(BN_CONTENT_DEFAULT_SPEC) }],
          "MAX_TOKENS",
        ),
      () => success([], "SAFETY"),
      () => success([{ text: "```json\n{}\n```" }]),
      () => success([{ text: "" }]),
      () => Response.json({ candidates: [] }),
      () => new Response("invalid json"),
      () => success([{ text: "x".repeat(BN_CONTENT_LIMITS.requestBytes + 1) }]),
    ]
  ) {
    let calls = 0;
    const provider = createGeminiProvider("synthetic", async () => {
      calls++;
      return respond();
    });
    await assert.rejects(
      () => provider.text("prompt"),
      errorCode(502, "invalid_provider_response"),
    );
    assert.equal(calls, 1);
  }
});

Deno.test("provider streams are size bounded even without Content-Length", async () => {
  let canceled = false;
  const provider = createGeminiProvider(
    "synthetic",
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(256 * 1024 + 1));
          },
          cancel() {
            canceled = true;
          },
        }),
      ),
  );
  await assert.rejects(
    () => provider.text("prompt"),
    errorCode(502, "invalid_provider_response"),
  );
  assert.equal(canceled, true);
});

Deno.test("image uses exactly one fixed Gemini request and aspect, accepts PNG/JPEG", async () => {
  for (
    const [mime, data] of [["image/png", pngBase64], [
      "image/jpeg",
      btoa(
        String.fromCharCode(255, 216, 255, 224, 0, 16, 1, 2, 3, 4, 255, 217),
      ),
    ]]
  ) {
    let calls = 0;
    const provider = createGeminiProvider("synthetic", async (input, init) => {
      calls++;
      assert.ok(
        String(input).endsWith(`/models/${BN_IMAGE_MODEL}:generateContent`),
      );
      assert.deepEqual(JSON.parse(String(init?.body)).generationConfig, {
        candidateCount: 1,
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: "4:5", imageSize: "1K" },
      });
      return success([{ inlineData: { mimeType: mime, data } }]);
    });
    const image = await provider.image("background without text", "4:5");
    assert.equal(image.mime, mime);
    assert.ok(image.bytes.length > 0);
    assert.equal(calls, 1);
  }
});

Deno.test("image has no quiet fallback on provider failure", async () => {
  let calls = 0;
  const provider = createGeminiProvider("synthetic", async () => {
    calls++;
    return Response.json({ error: "private provider key" }, { status: 503 });
  });
  await assert.rejects(
    () => provider.image("prompt", "9:16"),
    errorCode(503, "provider_unavailable"),
  );
  assert.equal(calls, 1);
});

Deno.test("provider image rejects MIME, signature, multi-image and invalid base64", async () => {
  const image = (mimeType: string, data = pngBase64) => ({
    inlineData: { mimeType, data },
  });
  for (
    const respond of [
      () => success([image("image/webp")]),
      () => success([image("image/jpeg")]),
      () => success([image("image/png", "not base64?!")]),
      () => success([image("image/png", btoa("this is not a png image"))]),
      () => success([image("image/png"), image("image/png")]),
      () => success([{ thought: true, ...image("image/png") }]),
    ]
  ) {
    const provider = createGeminiProvider("synthetic", async () => respond());
    await assert.rejects(
      () => provider.image("prompt", "4:5"),
      errorCode(502, "invalid_provider_image"),
    );
  }
});

Deno.test("image rejects responses larger than ten MB before decode/upload", async () => {
  const tooBig = "A".repeat(
    Math.ceil(BN_CONTENT_LIMITS.imageBytes * 4 / 3) + 8,
  );
  const provider = createGeminiProvider(
    "synthetic",
    async () =>
      success([{ inlineData: { mimeType: "image/png", data: tooBig } }]),
  );
  await assert.rejects(
    () => provider.image("prompt", "4:5"),
    errorCode(502, "invalid_provider_image"),
  );
});

Deno.test("provider timeout aborts fetch and returns explicit generic error", async () => {
  const provider = createGeminiProvider(
    "synthetic",
    async (_input, init) =>
      await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new Error("private internal URL")),
          { once: true },
        );
      }),
    5,
  );
  await assert.rejects(
    () => provider.image("prompt", "9:16"),
    errorCode(504, "provider_timeout"),
  );
});

Deno.test("missing key and network errors never expose secrets", async () => {
  let calls = 0;
  const missing = createGeminiProvider("", async () => {
    calls++;
    return textResponse();
  });
  await assert.rejects(
    () => missing.text("prompt"),
    errorCode(503, "provider_unavailable"),
  );
  assert.equal(calls, 0);
  const network = createGeminiProvider("synthetic", async () => {
    throw new Error("private token in URL");
  });
  await assert.rejects(
    () => network.text("prompt"),
    errorCode(503, "provider_unavailable"),
  );
});
