import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Link, Route, Routes } from "react-router-dom";
import { Blob as NodeBlob } from "node:buffer";
import { strFromU8, unzipSync } from "fflate";
import { parseBnContentManifest } from "@/lib/bnContentArchive";
import type { BnContentSpec, BnStudioBootstrap } from "@/lib/bnContentStudio";

const { invoke, storageFrom, renderer, downloadBlob } = vi.hoisted(() => ({ invoke: vi.fn(), storageFrom: vi.fn(), renderer: vi.fn(), downloadBlob: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke }, storage: { from: storageFrom } } }));
vi.mock("@/lib/bnContentRenderer", () => ({ renderBnContentSlide: renderer, downloadBnContentBlob: downloadBlob, bnSlideDimensions: (format: string) => ({ width: 1080, height: ["story", "reels"].includes(format) ? 1920 : 1350 }) }));
import MasterBnContent from "./MasterBnContent";

const id = "11111111-1111-4111-8111-111111111111";
const spec: BnContentSpec = { format: "carrossel", aesthetic: "l1_educativo", topic: "Força compartilhada", audience: "misto", slides: [{ role: "capa", title: "Força começa aqui", image_scene: "Athlete training" }], caption: "Legenda original", hashtags: ["#treino"] };
const post = { id, brief: "Treino seguro", spec, status: "draft" as const, version: 1, created_at: "2026-10-12T10:00:00Z", updated_at: "2026-10-12T10:00:00Z" };
const bootstrap: BnStudioBootstrap = {
  posts: [post], calendars: [],
  settings: {
    aesthetics: [{ key: "l1_educativo", label: "L1 Educativo", formats: ["carrossel", "story"] }],
    objectives: [{ key: "autoridade", label: "Autoridade" }],
    formats: [{ key: "educativo", name: "Educativo", format_type: "carrossel" }, { key: "curto", name: "Story", format_type: "story" }],
    pillars: ["Ciência do treino"],
  }, assets: {}, capabilities: { text: false, images: false },
};
const manifest = JSON.stringify([{ id: "post-1", title: "Treino individualizado", status: "draft", slides: ["posts/post-1/slide_1.png"], caption: "Legenda segura" }]);
function tab(name: string) { fireEvent.keyDown(screen.getByRole("tab", { name }), { key: "Enter" }); }
async function ready() { await screen.findByLabelText("Título do slide"); }
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
const calls = (action: string) => invoke.mock.calls.filter(([, options]) => options.body.action === action);

describe("MasterBnContent cloud", () => {
  beforeEach(() => {
    invoke.mockReset(); storageFrom.mockReset(); renderer.mockReset(); downloadBlob.mockReset();
    vi.stubGlobal("Blob", NodeBlob);
    renderer.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    invoke.mockImplementation(async (_name, { body }) => {
      if (body.action === "bootstrap") return { data: structuredClone(bootstrap), error: null };
      if (body.action === "save") return { data: { post: { ...post, id: body.id || "22222222-2222-4222-8222-222222222222", brief: body.brief, spec: body.spec, status: body.status, version: (body.expected_version || 0) + 1 } }, error: null };
      if (body.action === "generate" || body.action === "revise") return { data: { spec: { ...spec, slides: [{ role: "capa", title: "Conteúdo gerado" }] } }, error: null };
      if (body.action === "image") return { data: { path: `studio/${id}/assets/33333333-3333-4333-8333-333333333333.png`, signedUrl: "https://signed.example/image.png" }, error: null };
      if (body.action === "calendar") return { data: { calendar: { id: "calendar-1", calendar: { weeks: [{ week: 1, items: [{ topic: "Calendário real" }] }] }, created_at: post.created_at } }, error: null };
      throw new Error("Unexpected action");
    });
    storageFrom.mockReturnValue({
      download: vi.fn().mockResolvedValue({ data: { text: async () => manifest }, error: null }),
      createSignedUrls: vi.fn().mockResolvedValue({ data: [{ path: "posts/post-1/slide_1.png", signedUrl: "https://signed.example/slide.png" }], error: null }),
    });
  });
  afterEach(async () => { await act(async () => {}); cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("creates a manual draft and saves without a generation key or a client-generated id", async () => {
    render(<MasterBnContent />); await ready();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
    change("Título do slide", "Título manual");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Rascunho salvo.")).toBeInTheDocument();
    expect(calls("save")[0][1].body).not.toHaveProperty("id");
    expect(calls("save")[0][1].body.spec.slides[0].title).toBe("Título manual");
    expect(screen.queryByText(/127\.0\.0\.1|neste computador|custo adicional zero/)).not.toBeInTheDocument();
  });
  it("reopens shared drafts, edits every slide field, and saves with CAS", async () => {
    render(<MasterBnContent />); await ready();
    fireEvent.click(screen.getByRole("button", { name: /Força compartilhada/ }));
    expect(screen.getByLabelText("Título do slide")).toHaveValue("Força começa aqui");
    change("Subtítulo", "Apoio"); change("Texto", "Texto final"); change("Tópicos", "Primeiro\n\nSegundo\n"); change("Cena da imagem", "Athlete"); change("Legenda", "Nova legenda"); change("Hashtags", "#força #treino");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await screen.findByText("Rascunho salvo.");
    expect(calls("save")[0][1].body).toMatchObject({ id, expected_version: 1, spec: { caption: "Nova legenda", hashtags: ["#força", "#treino"], slides: [{ subtitle: "Apoio", body: "Texto final", bullets: ["Primeiro", "Segundo"], image_scene: "Athlete" }] } });
  });
  it("preserves unsaved draft and CAS version while refreshing shared posts", async () => {
    render(<MasterBnContent />); await ready();
    fireEvent.click(screen.getByRole("button", { name: /Força compartilhada/ }));
    change("Título do slide", "Minha edição");
    fireEvent.click(screen.getByRole("button", { name: "Atualizar Studio" }));
    await waitFor(() => expect(calls("bootstrap")).toHaveLength(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled());
    expect(screen.getByLabelText("Título do slide")).toHaveValue("Minha edição");
    expect(window.confirm).not.toHaveBeenCalled();
  });
  it("keeps edits after failed save and does not announce saved or approved", async () => {
    render(<MasterBnContent />); await ready(); change("Título do slide", "Preservar");
    invoke.mockResolvedValueOnce({ data: null, error: { context: { status: 500, json: async () => ({ error: "save_failed" }) } } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/não confirmou/);
    expect(screen.getByLabelText("Título do slide")).toHaveValue("Preservar");
    expect(screen.queryByText("Rascunho salvo.")).not.toBeInTheDocument();
  });
  it("preserves conflicting edits and can explicitly save a new copy without backgrounds", async () => {
    render(<MasterBnContent />); await ready(); fireEvent.click(screen.getByRole("button", { name: /Força compartilhada/ })); change("Título do slide", "Conflito preservado");
    invoke.mockResolvedValueOnce({ data: null, error: { context: { status: 409, json: async () => ({ error: "version_conflict" }) } } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Outro Master/);
    expect(screen.getByLabelText("Título do slide")).toHaveValue("Conflito preservado");
    fireEvent.click(screen.getByRole("button", { name: "Salvar cópia" }));
    await screen.findByText("Rascunho salvo.");
    expect(calls("save")[1][1].body).not.toHaveProperty("id");
  });
  it("confirms before new or open and keeps the draft when cancelled", async () => {
    render(<MasterBnContent />); await ready(); change("Título do slide", "Não perder");
    vi.mocked(window.confirm).mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Novo rascunho" }));
    fireEvent.click(screen.getByRole("button", { name: /Força compartilhada/ }));
    expect(window.confirm).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Título do slide")).toHaveValue("Não perder");
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
    await screen.findByRole("img", { name: "Slide 1: Não perder" });
  });
  it("guards internal route exit with a dirty draft", async () => {
    render(<MemoryRouter initialEntries={["/bn"]}><Routes><Route path="/bn" element={<><Link to="/other">Sair</Link><MasterBnContent /></>} /><Route path="/other" element={<p>Outra página</p>} /></Routes></MemoryRouter>);
    await ready(); change("Título do slide", "Não perder"); vi.mocked(window.confirm).mockReturnValue(false);
    fireEvent.click(screen.getByRole("link", { name: "Sair" }));
    expect(window.confirm).toHaveBeenCalled(); expect(screen.getByLabelText("Título do slide")).toHaveValue("Não perder");
    await screen.findByRole("img", { name: "Slide 1: Não perder" });
  });
  it("confirms native browser back and restores a cancelled traversal", async () => {
    window.history.replaceState({ idx: 3 }, "");
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    render(<MasterBnContent />); await ready(); change("Título do slide", "Preservar ao voltar");
    vi.mocked(window.confirm).mockReturnValue(false);
    window.dispatchEvent(new PopStateEvent("popstate", { state: { idx: 2 } }));
    expect(window.confirm).toHaveBeenCalledOnce(); expect(go).toHaveBeenCalledWith(1);
    window.dispatchEvent(new PopStateEvent("popstate", { state: { idx: 3 } }));
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Título do slide")).toHaveValue("Preservar ao voltar");
    await screen.findByRole("img", { name: "Slide 1: Preservar ao voltar" });
  });
  it("adds, reorders, and removes slides", async () => {
    render(<MasterBnContent />); await ready(); change("Título do slide", "Primeiro");
    fireEvent.click(screen.getByRole("button", { name: "Adicionar slide" })); change("Título do slide", "Segundo");
    fireEvent.click(screen.getByRole("button", { name: "Mover slide para cima" }));
    expect(screen.getByLabelText("Título do slide")).toHaveValue("Segundo");
    fireEvent.click(screen.getByRole("tab", { name: "Slide 2" })); expect(screen.getByLabelText("Título do slide")).toHaveValue("Primeiro");
    fireEvent.click(screen.getByRole("button", { name: "Remover slide" })); expect(screen.getByLabelText("Título do slide")).toHaveValue("Segundo");
    expect(screen.getByRole("button", { name: "Remover slide" })).toBeDisabled();
    await screen.findByRole("img", { name: "Slide 1: Segundo" });
  });
  it("generates and revises without implicitly saving or approving", async () => {
    invoke.mockResolvedValueOnce({ data: { ...bootstrap, capabilities: { text: true, images: true } }, error: null });
    render(<MasterBnContent />); await ready(); change("Briefing", "Criar um conteúdo sobre força");
    fireEvent.click(screen.getByRole("button", { name: "Gerar conteúdo" }));
    await waitFor(() => expect(screen.getByLabelText("Título do slide")).toHaveValue("Conteúdo gerado"));
    change("Revisão", "Encurtar o texto"); fireEvent.click(screen.getByRole("button", { name: "Revisar" }));
    await waitFor(() => expect(calls("revise")).toHaveLength(1));
    expect(calls("save")).toHaveLength(0);
    expect(calls("generate")[0][1].body).toMatchObject({ format: "carrossel", format_key: "educativo", audience: "misto" });
  });
  it("requires a saved draft for images and persists the generated background association", async () => {
    invoke.mockResolvedValueOnce({ data: { ...bootstrap, capabilities: { text: true, images: true } }, error: null });
    render(<MasterBnContent />); await ready(); change("Título do slide", "Manual"); change("Cena da imagem", "Athlete");
    fireEvent.click(screen.getByRole("button", { name: "Gerar imagem" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Salve o rascunho/); expect(calls("image")).toHaveLength(0);
    vi.mocked(window.confirm).mockReturnValue(true); fireEvent.click(screen.getByRole("button", { name: /Força compartilhada/ }));
    fireEvent.click(screen.getByRole("button", { name: "Gerar imagem" }));
    await waitFor(() => expect(calls("save")).toHaveLength(1)); await screen.findByText("Rascunho salvo.");
    expect(calls("image")[0][1].body).toMatchObject({ post_id: id, slide_index: 0, aspect: "4:5" });
    expect(calls("save")[0][1].body.spec.slides[0].background_path).toContain(`studio/${id}/assets/`);
    expect(screen.queryByRole("button", { name: "Salvar como novo rascunho" })).not.toBeInTheDocument();
  });
  it("announces approval only after positive ACK and downloads one ZIP with every PNG, caption and JSON", async () => {
    const exportSpec = { ...spec, slides: [spec.slides[0], { role: "cta" as const, title: "Próximo passo" }] };
    invoke.mockResolvedValueOnce({ data: { ...bootstrap, posts: [{ ...post, spec: exportSpec }] }, error: null });
    render(<MasterBnContent />); await ready(); fireEvent.click(screen.getByRole("button", { name: /Força compartilhada/ }));
    fireEvent.click(screen.getByRole("button", { name: "Aprovar" })); await screen.findByText("Post aprovado e salvo.");
    fireEvent.click(screen.getByRole("button", { name: "Exportar conteúdo" })); await screen.findByText("Arquivos exportados.");
    expect(downloadBlob).toHaveBeenCalledOnce();
    const [archive, filename] = downloadBlob.mock.calls[0];
    expect(filename).toBe(`${id}.zip`);
    expect(archive.type).toBe("application/zip");
    const files = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    expect(Object.keys(files)).toEqual([`${id}-slide-1.png`, `${id}-slide-2.png`, `${id}-legenda.txt`, `${id}.json`]);
    expect(strFromU8(files[`${id}-legenda.txt`])).toBe(`${spec.caption}\n\n${spec.hashtags.join(" ")}`);
    expect(JSON.parse(strFromU8(files[`${id}.json`]))).toEqual(exportSpec);
  });
  it("shows actionable renderer overflow errors in preview and export", async () => {
    const message = "O texto do slide 1 não cabe sem cortes. Divida o conteúdo em mais slides.";
    renderer.mockRejectedValue(new Error(message));
    render(<MasterBnContent />); await ready(); fireEvent.click(screen.getByRole("button", { name: /Força compartilhada/ }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Exportar conteúdo" }));
    await waitFor(() => expect(screen.getAllByText(message)).toHaveLength(2)); expect(downloadBlob).not.toHaveBeenCalled();
  });
  it("downloads nothing when a later slide fails after the first PNG was rendered", async () => {
    const exportSpec = { ...spec, slides: [spec.slides[0], { role: "cta" as const, title: "Próximo passo" }] };
    invoke.mockResolvedValueOnce({ data: { ...bootstrap, posts: [{ ...post, spec: exportSpec }] }, error: null });
    render(<MasterBnContent />); await ready(); fireEvent.click(screen.getByRole("button", { name: /Força compartilhada/ }));
    await screen.findByRole("img", { name: "Slide 1: Força começa aqui" });
    renderer.mockImplementation(async (_spec, index) => {
      if (index === 1) throw new Error("O texto do slide 2 não cabe sem cortes. Divida o conteúdo em mais slides.");
      return new Blob(["first-png"], { type: "image/png" });
    });
    fireEvent.click(screen.getByRole("button", { name: "Exportar conteúdo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/texto do slide 2/);
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(screen.queryByText("Arquivos exportados.")).not.toBeInTheDocument();
  });
  it("creates a calendar and reopens the persisted response", async () => {
    invoke.mockResolvedValueOnce({ data: { ...bootstrap, capabilities: { text: true, images: true } }, error: null });
    render(<MasterBnContent />); await ready(); tab("Calendário");
    change("Foco", "Autoridade"); fireEvent.click(screen.getByRole("button", { name: "Gerar calendário" }));
    expect(await screen.findByText("Calendário real")).toBeInTheDocument();
    expect(calls("calendar")[0][1].body).toMatchObject({ weeks: 4, posts_per_week: 3, focus: "Autoridade" });
  });
  it("preserves legacy archive and caption download with renewable private URLs", async () => {
    render(<MasterBnContent />); await ready(); tab("Acervo");
    fireEvent.click(await screen.findByRole("button", { name: /Treino individualizado/ }));
    expect(screen.getByText("Legenda segura")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Baixar legenda" }));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "post-1-legenda.txt");
    expect(storageFrom).toHaveBeenCalledWith("bn-content-archive");
  });
  it("fails closed when a legacy slide has no signed URL", async () => {
    storageFrom.mockReturnValue({ download: vi.fn().mockResolvedValue({ data: { text: async () => manifest }, error: null }), createSignedUrls: vi.fn().mockResolvedValue({ data: [], error: null }) });
    render(<MasterBnContent />); await ready(); tab("Acervo");
    expect(await screen.findByRole("alert")).toHaveTextContent(/arquivo privado está indisponível ou incompleto/);
    expect(screen.queryByRole("button", { name: /Treino individualizado/ })).not.toBeInTheDocument();
  });
  it("rejects invalid legacy manifest entries", () => {
    for (const raw of ['[{"id":"x"}]', '[{"id":"x","title":"Sem capa","slides":[]}]', '[{"id":"post-1","title":"Outro","slides":["posts/outro/slide_1.png"]}]', '[{"id":"../post","title":"Traversal","slides":["manifest.json"]}]']) expect(() => parseBnContentManifest(raw)).toThrow(/itens inválidos/i);
  });
});
