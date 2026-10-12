import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { BnContentSpec, BnStudioPost, BnStudioCalendar, BnStudioBootstrap, BnStudioSettings } from "../../supabase/functions/_shared/bnContent";
import { isBnContentAssetPath, validateBnContentSpec } from "../../supabase/functions/_shared/bnContent";

export type { BnContentSpec, BnStudioPost, BnStudioCalendar, BnStudioBootstrap, BnStudioSettings };

const text = z.string();
const slideSchema = z.object({
  role: z.enum(["capa", "conteudo", "cta"]), title: text.trim().min(1),
  subtitle: text.optional(), body: text.optional(), bullets: z.array(text).optional(),
  image_scene: text.optional(), background_path: text.optional(),
});
export const bnContentSpecSchema = z.object({
  format: text.min(1), aesthetic: text.min(1), topic: text, audience: text,
  slides: z.array(slideSchema).min(1).max(20), caption: text, hashtags: z.array(text),
}).strict().refine(validateBnContentSpec);
const postSchema = z.object({
  id: text.min(1), brief: text, spec: bnContentSpecSchema,
  status: z.enum(["draft", "approved"]), version: z.number().int().positive(),
  created_at: text.min(1), updated_at: text.min(1),
});
const calendarSchema = z.object({ id: text.min(1), calendar: z.unknown().refine(v => v != null), created_at: text.min(1) });
const signedUrl = z.string().url().refine(value => value.startsWith("https://"));
const bootstrapSchema = z.object({
  posts: z.array(postSchema), calendars: z.array(calendarSchema),
  settings: z.object({
    aesthetics: z.array(z.object({ key: text.min(1), label: text, formats: z.array(text).optional() })),
    objectives: z.array(z.object({ key: text.min(1), label: text })),
    formats: z.array(z.object({ key: text.min(1), name: text, format_type: text.min(1) })),
    pillars: z.array(text),
  }),
  assets: z.record(signedUrl), capabilities: z.object({ text: z.boolean(), images: z.boolean() }),
});
export type SaveBnContentInput = {
  id?: string; expected_version?: number; brief: string; spec: BnContentSpec; status: "draft" | "approved";
};
export type BnContentDraft = { post?: BnStudioPost; brief: string; spec: BnContentSpec };
export const bnContentDraftSnapshot = (draft: BnContentDraft) => JSON.stringify({ brief: draft.brief, spec: draft.spec });

export class BnContentStudioError extends Error {
  constructor(message: string, public readonly code: "conflict" | "request" | "response" = "request") {
    super(message);
    this.name = "BnContentStudioError";
  }
}

async function request<T>(body: Record<string, unknown>, schema: z.ZodTypeAny): Promise<T> {
  let result: Awaited<ReturnType<typeof supabase.functions.invoke>>;
  try {
    result = await supabase.functions.invoke("bn-content-studio", { body });
  } catch {
    throw new BnContentStudioError("Não foi possível conectar ao BN Content. Tente novamente.");
  }
  if (result.error) {
    const context = (result.error as { context?: { status?: number; json?: () => Promise<unknown> } }).context;
    let payload: unknown;
    try { payload = await context?.json?.(); } catch { /* The response may be empty or non-JSON. */ }
    const fields = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const message = typeof fields.message === "string" ? fields.message : typeof fields.error === "string" ? fields.error : "";
    if (context?.status === 409 || fields.code === "conflict" || fields.error === "version_conflict") {
      throw new BnContentStudioError("Outro Master alterou este post. Sua edição foi preservada. Atualize a lista e exporte a edição antes de reabrir a versão atual.", "conflict");
    }
    const statusMessages: Record<number, string> = {
      401: "Sua sessão expirou. Entre novamente para continuar.",
      403: "Este conteúdo está disponível somente para Masters autorizados.",
      429: "Limite de geração atingido. Aguarde e tente novamente.",
      503: "A geração está indisponível. Você pode continuar editando e salvando manualmente.",
    };
    const codeMessages: Record<string, string> = {
      invalid_request: "Revise os campos do conteúdo antes de continuar.",
      post_not_found: "Post não encontrado. Atualize a lista de posts.",
      invalid_provider_response: "A geração retornou conteúdo inválido. Sua edição foi preservada.",
      save_failed: "O servidor não confirmou o salvamento. Sua edição foi preservada.",
      calendar_save_failed: "O servidor não confirmou o calendário. Tente novamente.",
    };
    // Never surface raw provider errors, URLs, headers, or credentials to the UI.
    const safeMessage = /^(O briefing é obrigatório\.|Informe um tema\.|Instrução de revisão obrigatória\.|Post não encontrado\.|Salve o post antes de gerar a imagem\.)$/.test(message) ? message : undefined;
    throw new BnContentStudioError(statusMessages[context?.status || 0] || (typeof fields.error === "string" ? codeMessages[fields.error] : undefined) || safeMessage || "Não foi possível concluir a operação. Sua edição foi preservada.");
  }
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) throw new BnContentStudioError("O servidor retornou uma resposta incompleta. Sua edição foi preservada.", "response");
  return parsed.data;
}

export const bootstrapBnContentStudio = () => request<BnStudioBootstrap>({ action: "bootstrap" }, bootstrapSchema);
function normalizeDraftSpec(input: BnContentSpec): BnContentSpec {
  return {
    ...input, topic: input.topic.trim() || input.slides[0]?.title.trim() || "", audience: input.audience.trim() || "misto",
    slides: input.slides.map(slide => ({ ...slide, ...(slide.bullets ? { bullets: slide.bullets.filter(item => item.trim()) } : {}) })),
  };
}

export async function saveBnContentPost(input: SaveBnContentInput): Promise<BnStudioPost> {
  const spec = normalizeDraftSpec(input.spec);
  const brief = input.brief.trim() || spec.topic;
  if (!bnContentSpecSchema.safeParse(spec).success || brief.length > 6000) throw new BnContentStudioError("Revise os títulos, textos e hashtags antes de salvar.");
  if (!input.id && spec.slides.some(slide => slide.background_path)) throw new BnContentStudioError("Este post contém imagens vinculadas ao original. Exporte a edição antes de reabrir a versão atual.");
  const { post } = await request<{ post: BnStudioPost }>({ action: "save", ...input, brief, spec }, z.object({ post: postSchema }));
  if ((input.id && post.id !== input.id) || post.status !== input.status || post.version !== (input.expected_version === undefined ? 1 : input.expected_version + 1) || post.brief !== brief || JSON.stringify(bnContentSpecSchema.parse(post.spec)) !== JSON.stringify(bnContentSpecSchema.parse(spec))) {
    throw new BnContentStudioError("O servidor não confirmou o salvamento solicitado. Sua edição foi preservada.", "response");
  }
  return post;
}
export async function generateBnContent(input: { brief: string; format: string; audience: string; aesthetic: string; objective?: string; format_key?: string; pillar?: string }): Promise<BnContentSpec> {
  return (await request<{ spec: BnContentSpec }>({ action: "generate", ...input }, z.object({ spec: bnContentSpecSchema }))).spec;
}
export async function reviseBnContent(spec: BnContentSpec, instruction: string): Promise<BnContentSpec> {
  return (await request<{ spec: BnContentSpec }>({ action: "revise", spec: normalizeDraftSpec(spec), instruction }, z.object({ spec: bnContentSpecSchema }))).spec;
}
export const generateBnContentImage = (input: { post_id: string; slide_index: number; scene: string; aspect: "4:5" | "9:16" }) =>
  request<{ path: string; signedUrl: string }>({ action: "image", ...input }, z.object({ path: text.refine(path => isBnContentAssetPath(path) && path.startsWith(`studio/${input.post_id}/assets/`)), signedUrl }));
export async function generateBnContentCalendar(input: { weeks: number; posts_per_week: number; focus: string }): Promise<BnStudioCalendar> {
  return (await request<{ calendar: BnStudioCalendar }>({ action: "calendar", ...input }, z.object({ calendar: calendarSchema }))).calendar;
}

export function newBnContentSpec(settings: BnStudioSettings): BnContentSpec {
  return {
    format: settings.formats[0]?.format_type || "carrossel",
    aesthetic: settings.aesthetics[0]?.key || "l1_educativo", topic: "", audience: "misto",
    slides: [{ role: "capa", title: "" }], caption: "", hashtags: [],
  } as BnContentSpec;
}
