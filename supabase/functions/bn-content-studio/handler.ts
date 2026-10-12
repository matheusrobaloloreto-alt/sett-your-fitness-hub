import {
  BN_CONTENT_FORMATS,
  BN_CONTENT_LIMITS,
  BN_CONTENT_UUID,
  bnContentKeys,
  bnContentRecord,
  bnContentText,
  isUsableBnContentSpec,
  validateBnContentSpec,
} from "../_shared/bnContent.ts";
import type {
  BnContentSpec,
  BnStudioCalendar,
  BnStudioPost,
} from "../_shared/bnContent.ts";
import {
  BN_STUDIO_SETTINGS,
  calendarPrompt,
  generatePrompt,
  imagePrompt,
  revisePrompt,
} from "./prompts.ts";
import type { GenerateInput } from "./prompts.ts";

export class StudioError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

export interface StudioStore {
  posts(): Promise<BnStudioPost[]>;
  calendars(): Promise<BnStudioCalendar[]>;
  approvedExamples(): Promise<BnContentSpec[]>;
  post(id: string): Promise<BnStudioPost | null>;
  save(actor: string, input: SaveInput): Promise<BnStudioPost>;
  calendar(actor: string, calendar: unknown): Promise<BnStudioCalendar>;
  quota(actor: string, kind: "text" | "image"): Promise<boolean>;
  signedAssets(paths: string[]): Promise<Record<string, string>>;
  upload(path: string, bytes: Uint8Array, mime: string): Promise<void>;
}
export interface SaveInput {
  id?: string;
  expected_version?: number;
  brief: string;
  spec: BnContentSpec;
  status: "draft" | "approved";
}
export interface StudioDependencies {
  authenticate(token: string): Promise<{ id: string; master: boolean } | null>;
  store(): StudioStore;
  capabilities(): { text: boolean; images: boolean };
  text(prompt: string): Promise<unknown>;
  image(
    prompt: string,
    aspect: "4:5" | "9:16",
  ): Promise<{ bytes: Uint8Array; mime: string }>;
  uuid(): string;
}

export function studioOriginAllowed(origin: string): boolean {
  return [
    "https://www.settapp.com.br",
    "https://settapp.com.br",
    "https://bn-performance-webapp-matheus.netlify.app",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
  ].includes(origin) ||
    /^https:\/\/(?:deploy-preview-[1-9][0-9]*|[a-f0-9]{24})--bn-performance-webapp-matheus\.netlify\.app$/
      .test(origin);
}

export async function readStudioJson(request: Request): Promise<unknown> {
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  ) throw new StudioError(415, "invalid_content_type");
  const length = request.headers.get("content-length");
  if (length && Number(length) > BN_CONTENT_LIMITS.requestBytes) {
    throw new StudioError(413, "request_too_large");
  }
  if (!request.body) throw new StudioError(400, "invalid_request");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BN_CONTENT_LIMITS.requestBytes) {
        await reader.cancel();
        throw new StudioError(413, "request_too_large");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof StudioError) throw error;
    throw new StudioError(400, "invalid_json");
  } finally {
    reader.releaseLock();
  }
}

function invalid(): never {
  throw new StudioError(400, "invalid_request");
}
function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length &&
      left.every((v, i) => sameJson(v, right[i]));
  }
  if (bnContentRecord(left) && bnContentRecord(right)) {
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length &&
      keys.every((k) => Object.hasOwn(right, k) && sameJson(left[k], right[k]));
  }
  return false;
}
function requireKeys(input: Record<string, unknown>, keys: string[]) {
  if (!bnContentKeys(input, ["action", ...keys])) invalid();
}
function validateSave(input: Record<string, unknown>): SaveInput {
  requireKeys(input, ["id", "expected_version", "brief", "spec", "status"]);
  if (
    !bnContentText(input.brief, BN_CONTENT_LIMITS.brief) ||
    !validateBnContentSpec(input.spec) ||
    !["draft", "approved"].includes(input.status as string)
  ) invalid();
  if (input.status === "approved" && !isUsableBnContentSpec(input.spec)) {
    invalid();
  }
  if (input.id !== undefined) {
    if (
      typeof input.id !== "string" || !BN_CONTENT_UUID.test(input.id) ||
      !Number.isInteger(input.expected_version) ||
      (input.expected_version as number) < 1 ||
      (input.expected_version as number) >= 2147483647
    ) invalid();
  } else if (input.expected_version !== undefined) invalid();
  const { id, expected_version, brief, spec, status } = input;
  return { id, expected_version, brief, spec, status } as SaveInput;
}
function validateGenerate(input: Record<string, unknown>): GenerateInput {
  requireKeys(input, [
    "brief",
    "format",
    "audience",
    "aesthetic",
    "objective",
    "format_key",
    "pillar",
  ]);
  const aes = BN_STUDIO_SETTINGS.aesthetics.find((a) =>
    a.key === input.aesthetic
  );
  if (
    !bnContentText(input.brief, BN_CONTENT_LIMITS.brief) ||
    !bnContentText(input.audience, 200) ||
    !(BN_CONTENT_FORMATS as readonly unknown[]).includes(input.format) ||
    !aes ||
    (aes.formats && !aes.formats.includes(input.format as string))
  ) invalid();
  if (
    input.objective !== undefined &&
    !BN_STUDIO_SETTINGS.objectives.some((o) => o.key === input.objective)
  ) invalid();
  if (
    input.format_key !== undefined &&
    !BN_STUDIO_SETTINGS.formats.some((f) =>
      f.key === input.format_key && f.format_type === input.format
    )
  ) invalid();
  if (
    input.pillar !== undefined &&
    !BN_STUDIO_SETTINGS.pillars.includes(input.pillar as string)
  ) invalid();
  const { brief, format, audience, aesthetic, objective, format_key, pillar } =
    input;
  return {
    brief,
    format,
    audience,
    aesthetic,
    objective,
    format_key,
    pillar,
  } as GenerateInput;
}

function validateCalendar(
  value: unknown,
  weeks: number,
  postsPerWeek: number,
): boolean {
  if (
    !bnContentRecord(value) || !bnContentKeys(value, ["weeks"]) ||
    !Array.isArray(value.weeks) ||
    value.weeks.length !== weeks || JSON.stringify(value).length > 75000
  ) return false;
  return value.weeks.every((week, i) => {
    if (
      !bnContentRecord(week) || !bnContentKeys(week, ["week", "items"]) ||
      week.week !== i + 1 ||
      !Array.isArray(week.items) || week.items.length !== postsPerWeek
    ) return false;
    return week.items.every((item) =>
      bnContentRecord(item) && bnContentKeys(item, [
        "day",
        "bucket",
        "objetivo",
        "format_key",
        "format_name",
        "aesthetic",
        "layout_id",
        "pillar",
        "topic",
        "hook",
      ]) &&
      ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"].includes(
        item.day as string,
      ) &&
      ["atracao", "engajamento", "conversao"].includes(item.bucket as string) &&
      BN_STUDIO_SETTINGS.objectives.some((o) => o.key === item.objetivo) &&
      BN_STUDIO_SETTINGS.formats.some((f) => f.key === item.format_key) &&
      BN_STUDIO_SETTINGS.aesthetics.some((a) => a.key === item.aesthetic) &&
      BN_STUDIO_SETTINGS.pillars.includes(item.pillar as string) &&
      ["L1", "L2", "L3", "L4", ""].includes(item.layout_id as string) &&
      ["format_name", "topic", "hook"].every((key) =>
        bnContentText(item[key], 500)
      )
    );
  });
}

export function validateStudioImage(bytes: Uint8Array, mime: string): boolean {
  if (bytes.length < 12 || bytes.length > BN_CONTENT_LIMITS.imageBytes) {
    return false;
  }
  if (mime === "image/png") {
    return bytes.length >= 45 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n) &&
      String.fromCharCode(...bytes.slice(12, 16)) === "IHDR" &&
      new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
          16,
        ) > 0 &&
      new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
          20,
        ) > 0 &&
      String.fromCharCode(...bytes.slice(-8, -4)) === "IEND";
  }
  return mime === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 &&
    bytes[2] === 255 &&
    bytes.at(-2) === 255 && bytes.at(-1) === 217;
}

export function createBnContentHandler(deps: StudioDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Vary": "Origin",
    };
    if (origin && studioOriginAllowed(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers["Access-Control-Allow-Headers"] =
        "authorization, apikey, content-type, x-client-info";
      headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    }
    const reply = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers });
    try {
      if (origin && !studioOriginAllowed(origin)) {
        throw new StudioError(403, "origin_denied");
      }
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers });
      }
      if (request.method !== "POST") {
        throw new StudioError(405, "method_not_allowed");
      }
      const token = /^Bearer\s+(\S+)$/i.exec(
        request.headers.get("authorization") ?? "",
      )?.[1];
      if (!token || token.length > 8192) {
        throw new StudioError(401, "unauthorized");
      }
      const actor = await deps.authenticate(token);
      if (!actor) throw new StudioError(401, "unauthorized");
      if (!actor.master) throw new StudioError(403, "forbidden");
      const input = await readStudioJson(request);
      if (!bnContentRecord(input) || typeof input.action !== "string") {
        invalid();
      }
      // The privileged store is instantiated only after live identity and master-role checks.
      if (input.action === "bootstrap") {
        requireKeys(input, []);
        const store = deps.store();
        const [posts, calendars] = await Promise.all([
          store.posts(),
          store.calendars(),
        ]);
        const paths = [
          ...new Set(
            posts.flatMap((p) =>
              p.spec.slides.flatMap((s) =>
                s.background_path ? [s.background_path] : []
              )
            ),
          ),
        ];
        return reply(200, {
          posts,
          calendars,
          settings: BN_STUDIO_SETTINGS,
          assets: await store.signedAssets(paths),
          capabilities: deps.capabilities(),
        });
      }
      if (input.action === "save") {
        const save = validateSave(input);
        const store = deps.store();
        const paths = save.spec.slides.flatMap((s) =>
          s.background_path ? [s.background_path] : []
        );
        if (
          paths.some((path) =>
            !save.id || !path.startsWith(`studio/${save.id}/assets/`)
          )
        ) invalid();
        if (paths.length) await store.signedAssets([...new Set(paths)]);
        const post = await store.save(actor.id, save);
        if (
          !post?.id ||
          post.version !== (save.id ? save.expected_version! + 1 : 1) ||
          (save.id && post.id !== save.id) || post.brief !== save.brief ||
          post.status !== save.status ||
          !sameJson(post.spec, save.spec)
        ) throw new StudioError(500, "save_failed");
        return reply(200, { post });
      }
      if (input.action === "generate" || input.action === "revise") {
        let generate: GenerateInput | undefined;
        let original: BnContentSpec | undefined;
        let instruction: string | undefined;
        if (input.action === "generate") generate = validateGenerate(input);
        else {
          requireKeys(input, ["spec", "instruction"]);
          if (
            !validateBnContentSpec(input.spec) ||
            !bnContentText(input.instruction, BN_CONTENT_LIMITS.instruction)
          ) invalid();
          original = input.spec;
          instruction = input.instruction;
        }
        if (!deps.capabilities().text) {
          throw new StudioError(503, "text_unavailable");
        }
        const store = deps.store();
        const examples = generate ? await store.approvedExamples() : [];
        if (!await store.quota(actor.id, "text")) {
          throw new StudioError(429, "quota_exceeded");
        }
        const spec = await deps.text(
          generate
            ? generatePrompt(generate, examples)
            : revisePrompt(original!, instruction!),
        );
        if (
          !validateBnContentSpec(spec) ||
          spec.format !== (generate?.format ?? original!.format) ||
          spec.aesthetic !== (generate?.aesthetic ?? original!.aesthetic)
        ) throw new StudioError(502, "invalid_provider_response");
        const allowedPaths = new Set(
          original?.slides.map((s) => s.background_path).filter(Boolean) ?? [],
        );
        if (
          spec.slides.some((s) =>
            s.background_path && !allowedPaths.has(s.background_path)
          )
        ) throw new StudioError(502, "invalid_provider_response");
        return reply(200, { spec });
      }
      if (input.action === "image") {
        requireKeys(input, ["post_id", "slide_index", "scene", "aspect"]);
        if (
          typeof input.post_id !== "string" ||
          !BN_CONTENT_UUID.test(input.post_id) ||
          !Number.isInteger(input.slide_index) ||
          (input.slide_index as number) < 0 ||
          (input.slide_index as number) >= 20 ||
          !bnContentText(input.scene, BN_CONTENT_LIMITS.scene) ||
          !["4:5", "9:16"].includes(input.aspect as string)
        ) invalid();
        const store = deps.store();
        const post = await store.post(input.post_id);
        if (!post) throw new StudioError(404, "post_not_found");
        if ((input.slide_index as number) >= post.spec.slides.length) invalid();
        if (!deps.capabilities().images) {
          throw new StudioError(503, "images_unavailable");
        }
        if (!await store.quota(actor.id, "image")) {
          throw new StudioError(429, "quota_exceeded");
        }
        const { bytes, mime } = await deps.image(
          imagePrompt(input.scene),
          input.aspect as "4:5" | "9:16",
        );
        if (!validateStudioImage(bytes, mime)) {
          throw new StudioError(502, "invalid_provider_image");
        }
        const path = `studio/${post.id}/assets/${deps.uuid()}.png`;
        await store.upload(path, bytes, mime);
        const urls = await store.signedAssets([path]);
        if (!urls[path]) throw new StudioError(500, "asset_signing_failed");
        return reply(200, { path, signedUrl: urls[path] });
      }
      if (input.action === "calendar") {
        requireKeys(input, ["weeks", "posts_per_week", "focus"]);
        if (
          !Number.isInteger(input.weeks) || (input.weeks as number) < 1 ||
          (input.weeks as number) > 6 ||
          !Number.isInteger(input.posts_per_week) ||
          (input.posts_per_week as number) < 1 ||
          (input.posts_per_week as number) > 7 ||
          !bnContentText(input.focus, 4000, false)
        ) invalid();
        if (!deps.capabilities().text) {
          throw new StudioError(503, "text_unavailable");
        }
        const store = deps.store();
        if (!await store.quota(actor.id, "text")) {
          throw new StudioError(429, "quota_exceeded");
        }
        const calendar = await deps.text(
          calendarPrompt(
            input.weeks as number,
            input.posts_per_week as number,
            input.focus,
          ),
        );
        if (
          !validateCalendar(
            calendar,
            input.weeks as number,
            input.posts_per_week as number,
          )
        ) throw new StudioError(502, "invalid_provider_response");
        const saved = await store.calendar(actor.id, calendar);
        if (!saved?.id) throw new StudioError(500, "calendar_save_failed");
        return reply(200, { calendar: saved });
      }
      invalid();
    } catch (error) {
      // Never reflect provider/DB/auth exception text or log payloads and secrets.
      const known = error instanceof StudioError
        ? error
        : new StudioError(500, "studio_unavailable");
      return reply(known.status, { error: known.code });
    }
  };
}
