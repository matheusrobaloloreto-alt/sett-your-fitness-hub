import { beforeEach, describe, expect, it, vi } from "vitest";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
import { bootstrapBnContentStudio, generateBnContent, generateBnContentImage, newBnContentSpec, saveBnContentPost, type BnContentSpec } from "./bnContentStudio";

const id = "11111111-1111-4111-8111-111111111111";
const spec: BnContentSpec = { format: "carrossel", aesthetic: "l1_educativo", topic: "Força", audience: "misto", slides: [{ role: "capa", title: "Treino de força" }], caption: "Legenda real", hashtags: ["#treino"] };
const post = { id, brief: "Força", spec, status: "draft", version: 1, created_at: "2026-10-12T10:00:00Z", updated_at: "2026-10-12T10:00:00Z" };
const settings = { aesthetics: [{ key: "l1_educativo", label: "L1" }], objectives: [], formats: [{ key: "educativo", name: "Educativo", format_type: "carrossel" }], pillars: [] };

describe("BN Content cloud service", () => {
  beforeEach(() => { invoke.mockReset(); });
  it("bootstraps the shared workspace through the authenticated function", async () => {
    const data = { posts: [post], calendars: [], settings, assets: {}, capabilities: { text: false, images: false } };
    invoke.mockResolvedValue({ data, error: null });
    expect(await bootstrapBnContentStudio()).toEqual(data);
    expect(invoke).toHaveBeenCalledWith("bn-content-studio", { body: { action: "bootstrap" } });
  });
  it("does not put sample content in new manual drafts", () => {
    expect(newBnContentSpec(settings)).toMatchObject({ topic: "", audience: "misto", slides: [{ title: "" }], caption: "" });
  });
  it("uses real title for an otherwise empty manual brief and topic, and removes empty bullets only on save", async () => {
    invoke.mockImplementation(async (_name, { body }) => ({ data: { post: { ...post, brief: body.brief, spec: body.spec } }, error: null }));
    const input = { ...spec, topic: "", slides: [{ ...spec.slides[0], bullets: ["Primeiro", "", " ", "Segundo", ""] }] };
    await saveBnContentPost({ brief: "", spec: input, status: "draft" });
    expect(invoke.mock.calls[0][1].body).toMatchObject({ brief: "Treino de força", spec: { topic: "Treino de força", slides: [{ bullets: ["Primeiro", "Segundo"] }] } });
    expect(input.slides[0].bullets).toHaveLength(5);
  });
  it("accepts only a positive save acknowledgement for the same content and next version", async () => {
    invoke.mockResolvedValue({ data: { post: { ...post, version: 2 } }, error: null });
    expect(await saveBnContentPost({ id, expected_version: 1, brief: "Força", spec, status: "draft" })).toMatchObject({ version: 2 });
    expect(invoke.mock.calls[0][1].body).toMatchObject({ id, expected_version: 1 });
  });
  it.each([
    { data: {}, error: null },
    { data: { post: { ...post, status: "approved" } }, error: null },
    { data: { post: { ...post, spec: { ...spec, caption: "Conteúdo diferente" } } }, error: null },
    { data: { post: { ...post, version: 9 } }, error: null },
    { data: { post: { ...post, spec: { ...spec, slides: [] } } }, error: null },
  ])("rejects incomplete or mismatched save acknowledgements %#", async response => {
    invoke.mockResolvedValue(response);
    await expect(saveBnContentPost({ brief: "Força", spec, status: "draft" })).rejects.toMatchObject({ code: "response" });
  });
  it("parses FunctionsHttpError context JSON and reports CAS conflict without raw details", async () => {
    const json = vi.fn().mockResolvedValue({ error: "version_conflict", message: "secret=never-show" });
    invoke.mockResolvedValue({ data: null, error: { context: { status: 409, json } } });
    await expect(saveBnContentPost({ id, expected_version: 1, brief: "Força", spec, status: "draft" })).rejects.toMatchObject({ code: "conflict", message: expect.stringMatching(/edição foi preservada/) });
    expect(json).toHaveBeenCalledOnce();
  });
  it("does not leak raw provider errors", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "Authorization: secret", context: { status: 500, json: async () => ({ message: "API_KEY=private https://provider.example/?token=private" }) } } });
    await expect(bootstrapBnContentStudio()).rejects.toThrow("Não foi possível concluir a operação. Sua edição foi preservada.");
  });
  it("handles non-JSON error bodies and unavailable generation safely", async () => {
    invoke.mockResolvedValue({ data: null, error: { context: { status: 503, json: async () => { throw new Error("html"); } } } });
    await expect(bootstrapBnContentStudio()).rejects.toThrow(/continuar editando e salvando manualmente/);
  });
  it("rejects generated specs that fail the canonical contract", async () => {
    invoke.mockResolvedValue({ data: { spec: { ...spec, slides: [{ role: "capa", title: "" }] } }, error: null });
    await expect(generateBnContent({ brief: "Força", format: spec.format, aesthetic: spec.aesthetic, audience: spec.audience })).rejects.toMatchObject({ code: "response" });
  });
  it("rejects an image acknowledgement for another post", async () => {
    invoke.mockResolvedValue({ data: { path: "studio/22222222-2222-4222-8222-222222222222/assets/33333333-3333-4333-8333-333333333333.png", signedUrl: "https://signed.example/image.png" }, error: null });
    await expect(generateBnContentImage({ post_id: id, slide_index: 0, scene: "Athlete", aspect: "4:5" })).rejects.toMatchObject({ code: "response" });
  });
  it("prevents unsupported cross-post background copies before making a write", async () => {
    await expect(saveBnContentPost({ brief: "Força", status: "draft", spec: { ...spec, slides: [{ ...spec.slides[0], background_path: `studio/${id}/assets/33333333-3333-4333-8333-333333333333.png` }] } })).rejects.toThrow(/imagens vinculadas/);
    expect(invoke).not.toHaveBeenCalled();
  });
});
