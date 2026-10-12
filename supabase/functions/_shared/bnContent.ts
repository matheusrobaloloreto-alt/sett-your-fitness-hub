// Runtime-independent contract shared by the edge function and Studio UI.
export const BN_CONTENT_FORMATS = [
  "carrossel",
  "storytelling",
  "aviso",
  "evento",
  "post",
  "story",
  "reels",
] as const;
export const BN_CONTENT_AESTHETICS = [
  "l1_educativo",
  "l2_storytelling",
  "l3_aviso",
  "l4_evento_poster",
  "l4_evento_teaser",
  "navy",
] as const;
export const BN_CONTENT_LIMITS = {
  requestBytes: 128 * 1024,
  imageBytes: 10 * 1024 * 1024,
  slides: 20,
  brief: 6000,
  instruction: 4000,
  title: 240,
  subtitle: 500,
  body: 4000,
  caption: 6000,
  scene: 2000,
} as const;

export interface BnContentSpec {
  format: string;
  aesthetic: string;
  topic: string;
  audience: string;
  slides: {
    role: "capa" | "conteudo" | "cta";
    title: string;
    subtitle?: string;
    body?: string;
    bullets?: string[];
    image_scene?: string;
    background_path?: string;
  }[];
  caption: string;
  hashtags: string[];
}

export interface BnStudioPost {
  id: string;
  brief: string;
  spec: BnContentSpec;
  status: "draft" | "approved";
  version: number;
  created_at: string;
  updated_at: string;
}

export interface BnStudioCalendar {
  id: string;
  calendar: unknown;
  created_at: string;
}

export interface BnStudioSettings {
  aesthetics: { key: string; label: string; formats?: string[] }[];
  objectives: { key: string; label: string }[];
  formats: { key: string; name: string; format_type: string }[];
  pillars: string[];
}

export interface BnStudioBootstrap {
  posts: BnStudioPost[];
  calendars: BnStudioCalendar[];
  settings: BnStudioSettings;
  assets: Record<string, string>;
  capabilities: { text: boolean; images: boolean };
}

export const BN_CONTENT_DEFAULT_SPEC: BnContentSpec = {
  format: "carrossel",
  aesthetic: "l1_educativo",
  topic: "Novo conteudo BN",
  audience: "misto",
  slides: [
    { role: "capa", title: "Novo conteudo BN", subtitle: "" },
    { role: "conteudo", title: "Conteudo", body: "" },
    { role: "cta", title: "Proximo passo", body: "" },
  ],
  caption: "",
  hashtags: [],
};

export const BN_CONTENT_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const BN_CONTENT_ASSET_PATH =
  /^studio\/[0-9a-f-]{36}\/assets\/[0-9a-f-]{36}\.png$/;

export function isBnContentAssetPath(value: unknown): value is string {
  if (typeof value !== "string" || !BN_CONTENT_ASSET_PATH.test(value)) {
    return false;
  }
  const parts = value.split("/");
  return BN_CONTENT_UUID.test(parts[1]) &&
    BN_CONTENT_UUID.test(parts[3].slice(0, -4));
}

export function bnContentRecord(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function bnContentText(
  value: unknown,
  max: number,
  required = true,
): value is string {
  return typeof value === "string" && value.length <= max &&
    (!required || value.trim().length > 0) && !value.includes("\u0000");
}

export function bnContentKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export function validateBnContentSpec(value: unknown): value is BnContentSpec {
  if (
    !bnContentRecord(value) || !bnContentKeys(value, [
      "format",
      "aesthetic",
      "topic",
      "audience",
      "slides",
      "caption",
      "hashtags",
    ])
  ) return false;
  if (
    !(BN_CONTENT_FORMATS as readonly unknown[]).includes(value.format) ||
    !(BN_CONTENT_AESTHETICS as readonly unknown[]).includes(value.aesthetic) ||
    !bnContentText(value.topic, 300) || !bnContentText(value.audience, 200) ||
    !bnContentText(value.caption, BN_CONTENT_LIMITS.caption, false)
  ) return false;
  if (
    !Array.isArray(value.hashtags) || value.hashtags.length > 30 ||
    !value.hashtags.every((tag) =>
      bnContentText(tag, 100) && /^#[\p{L}\p{N}_]+$/u.test(tag)
    )
  ) return false;
  if (
    !Array.isArray(value.slides) || value.slides.length < 1 ||
    value.slides.length > BN_CONTENT_LIMITS.slides
  ) return false;
  return value.slides.every((slide) => {
    if (
      !bnContentRecord(slide) || !bnContentKeys(slide, [
        "role",
        "title",
        "subtitle",
        "body",
        "bullets",
        "image_scene",
        "background_path",
      ]) || !["capa", "conteudo", "cta"].includes(slide.role as string) ||
      !bnContentText(slide.title, BN_CONTENT_LIMITS.title)
    ) return false;
    for (
      const [key, max] of [
        ["subtitle", BN_CONTENT_LIMITS.subtitle],
        ["body", BN_CONTENT_LIMITS.body],
        ["image_scene", BN_CONTENT_LIMITS.scene],
      ] as const
    ) {
      if (slide[key] !== undefined && !bnContentText(slide[key], max, false)) {
        return false;
      }
    }
    if (
      slide.bullets !== undefined && (!Array.isArray(slide.bullets) ||
        slide.bullets.length > 12 || !slide.bullets.every((s) =>
          bnContentText(s, 500)
        ))
    ) return false;
    return slide.background_path === undefined ||
      isBnContentAssetPath(slide.background_path);
  });
}

export function isUsableBnContentSpec(spec: BnContentSpec): boolean {
  return validateBnContentSpec(spec) && spec.caption.trim().length > 0 &&
    spec.slides[0].role === "capa" &&
    (spec.slides.length === 1 || spec.slides.at(-1)?.role === "cta") &&
    spec.slides.every((slide) => slide.title.trim().length > 0);
}
