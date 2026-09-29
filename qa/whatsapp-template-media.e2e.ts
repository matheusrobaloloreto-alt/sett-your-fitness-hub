import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";

const companyId = "20000000-0000-4000-8000-000000000001";
const artifactDir = "output/playwright/whatsapp-template-media";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
const wav = Buffer.alloc(844);
wav.write("RIFF"); wav.writeUInt32LE(836, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(800, 40);
const mp4 = execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=red:s=32x32:r=5", "-t", "0.4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "frag_keyframe+empty_moov", "-f", "mp4", "pipe:1"]);
const files = [
  { name: "foto.png", mimeType: "image/png", buffer: png },
  { name: "video.mp4", mimeType: "video/mp4", buffer: mp4 },
  { name: "audio.wav", mimeType: "audio/wav", buffer: wav },
  { name: "manual.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%QA synthetic\n%%EOF") },
];

async function openFixture(page: Page, width: number, route = "/admin/whatsapp-templates") {
  const sends: Record<string, any>[] = [];
  const blocked: string[] = [];
  const errors: string[] = [];
  const control = { failAudio: false, holdNext: false, release: null as null | (() => void), unconfirmedReply: null as null | { json?: unknown; body?: string } };
  await page.setViewportSize({ width, height: width < 1000 ? 844 : 1000 });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["localhost", "127.0.0.1"].includes(url.hostname)) return route.continue();
    if (url.hostname.endsWith("supabase.co") && url.pathname.includes("/rest/v1/staff_sessions")) return route.fulfill({ status: 204, body: "" });
    if (url.hostname.endsWith("supabase.co") && url.pathname.endsWith("/functions/v1/whatsapp-webhook")) return route.fulfill({ json: { ok: true, inserted: 0, updated: 0 } });
    if (url.hostname.endsWith("supabase.co") && url.pathname.endsWith("/functions/v1/whatsapp-manager")) {
      const body = route.request().postDataJSON();
      if (!["send-message", "send-media"].includes(body.action)) return route.fulfill({ json: { ok: true, contacts: [], groups: [], messages: [] } });
      sends.push(body);
      if (control.holdNext) { control.holdNext = false; await new Promise<void>((resolve) => { control.release = resolve; }); }
      if (control.unconfirmedReply) {
        const reply = control.unconfirmedReply;
        control.unconfirmedReply = null;
        return route.fulfill({ status: 200, ...reply });
      }
      if (control.failAudio && body.mediatype === "audio") { control.failAudio = false; return route.fulfill({ status: 502, json: { error: "Falha conhecida no audio QA" } }); }
      const id = `template-media-${sends.length}`;
      const signature = body.signMessages ? "*Nome do backend QA*\n\n" : "";
      const message = { id, chat_id: body.chatId, content: `${body.mediatype === "audio" ? "" : signature}${body.content || body.fileName || "Midia QA"}`, type: body.mediatype || "text", source: "outgoing", timestamp: new Date().toISOString(), created_at: new Date().toISOString(), message_id_external: id, sender_id: null, media_url: null, media_type: null };
      await page.evaluate((message) => (window as any).__templateMediaQA.addMessage(message), message);
      return route.fulfill({ json: { ok: true, message, signatureMessage: body.mediatype === "audio" && body.signMessages ? { ...message, id: `${id}-name`, type: "text", content: "*Nome do backend QA*" } : null, persistenceWarning: body.mediatype === "audio" } });
    }
    blocked.push(`${url.origin}${url.pathname}`);
    return route.abort("blockedbyclient");
  });
  await page.goto(`/qa/whatsapp-template-media-fixture.html?route=${encodeURIComponent(route)}`);
  await expect(page.getByRole("link", { name: "Templates QA" })).toBeVisible();
  return { sends, blocked, errors, control };
}

async function settleToasts(page: Page) {
  await page.mouse.move(0, 0);
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 10_000 });
}

async function checkBounds(page: Page, width: number) {
  await expect.poll(() => page.evaluate((width) => {
    const dialog = document.querySelector('[role="dialog"]');
    const box = dialog?.getBoundingClientRect();
    return document.documentElement.scrollWidth <= width && innerWidth === width
      && (!dialog || (!dialog.getAnimations().some((animation) => animation.pending || animation.playState === "running")
        && box!.left >= 0 && box!.right <= width && box!.top >= 0 && box!.bottom <= innerHeight));
  }, width)).toBe(true);
}

async function openChat(page: Page, name = "Contato QA sintetico") {
  await page.getByRole("link", { name: "Chat QA", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(`Abrir conversa com ${name}`) }).click();
  await expect(page.getByPlaceholder("Digite / para templates...")).toBeVisible();
}

async function pickTemplate(page: Page, title: string) {
  await page.getByPlaceholder("Digite / para templates...").fill(`/${title}`);
  await page.getByRole("button", { name: new RegExp(title) }).last().click();
}

for (const width of [320, 390, 1440]) {
  test(`criar editar reabrir e selecionar quatro midias sem enviar ${width}`, async ({ page }) => {
    const guard = await openFixture(page, width);
    await page.getByRole("button", { name: /Novo/ }).click();
    await page.getByLabel("Título", { exact: true }).fill("Quatro tipos QA");
    await page.getByLabel("Atalho (usado com /)").fill("quatro");
    await page.getByLabel("Conteúdo", { exact: true }).fill("Texto revisavel {{primeiro_nome}}");
    await page.getByLabel("Selecionar anexos").setInputFiles(files);
    for (const file of files) await expect(page.getByRole("button", { name: `Remover ${file.name}`, exact: true })).toBeVisible();
    await expect.poll(() => page.locator('img[alt="foto.png"]').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.videoWidth)).toBe(32);
    await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.readyState)).toBeGreaterThanOrEqual(1);
    await checkBounds(page, width);
    await page.screenshot({ path: `${artifactDir}/editor-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Criar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const persisted = await page.evaluate(() => (window as any).__templateMediaQA.getTemplates().find((item: any) => item.title === "Quatro tipos QA"));
    expect(persisted.attachments.map((item: any) => item.mimeType)).toEqual(files.map((file) => file.mimeType));
    for (const item of persisted.attachments) expect(item.path).toMatch(new RegExp(`^${companyId}/templates/${persisted.id}/`));
    await settleToasts(page);
    await page.reload();
    await page.getByRole("button", { name: "Editar Quatro tipos QA", exact: true }).click();
    for (const file of files) await expect(page.getByRole("button", { name: `Remover ${file.name}`, exact: true })).toBeVisible();
    await page.getByLabel("Título", { exact: true }).fill("Editado QA");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await settleToasts(page);
    await openChat(page);
    await pickTemplate(page, "Editado QA");
    expect(guard.sends).toHaveLength(0);
    for (const file of files) await expect(page.getByRole("button", { name: `Remover ${file.name}`, exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Digite / para templates...")).toHaveValue("Texto revisavel Contato");
    await checkBounds(page, width);
    await page.screenshot({ path: `${artifactDir}/draft-${width}.png`, fullPage: true });
    await pickTemplate(page, "Texto legado QA");
    await expect(page.getByRole("button", { name: /^Remover (foto|video|audio|manual)/ })).toHaveCount(0);
    await expect(page.getByPlaceholder("Digite / para templates...")).toHaveValue("Texto legado sem anexos");
    expect(guard.sends).toHaveLength(0);
    expect(guard.blocked).toEqual([]); expect(guard.errors).toEqual([]);
  });
}

for (const signMessages of [false, true]) {
  test(`sucesso parcial retry sem repetir confirmados assinatura ${signMessages}`, async ({ page }) => {
    const guard = await openFixture(page, signMessages ? 390 : 1440);
    await openChat(page);
    if (signMessages) await page.getByRole("switch", { name: "Assinar mensagens" }).click();
    await pickTemplate(page, "Multimidia QA");
    expect(guard.sends).toHaveLength(0);
    guard.control.failAudio = true;
    await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
    await expect(page.getByText("Falha conhecida no audio QA", { exact: true })).toBeVisible();
    expect(guard.sends.map((item) => item.mediatype || "text")).toEqual(["text", "image", "video", "audio"]);
    await expect(page.getByPlaceholder("Digite / para templates...")).toHaveValue("");
    await expect(page.getByRole("button", { name: "Remover foto.png", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remover video.mp4", exact: true })).toHaveCount(0);
    await settleToasts(page);
    await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
    await expect(page.getByText("Mensagem rápida enviada.", { exact: true })).toBeVisible();
    expect(guard.sends.map((item) => item.mediatype || "text")).toEqual(["text", "image", "video", "audio", "audio", "document"]);
    for (const item of guard.sends) {
      expect(item).toMatchObject({ companyId, chatId: "chat-qa", signMessages });
      expect(item).not.toHaveProperty("signatureName");
      if (item.action === "send-media") expect(item).toMatchObject({ templateId: "media-template", mediaSource: "template-upload", mediaStorageBucket: "whatsapp-media" });
    }
    if (signMessages) await expect(page.getByTestId("whatsapp-message").filter({ hasText: "Nome do backend QA" }).last()).toBeVisible();
    await expect(page.getByText("Mensagem enviada, mas o histórico pode demorar para sincronizar", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Remover (foto|video|audio|manual)/ })).toHaveCount(0);
    await page.screenshot({ path: `${artifactDir}/partial-retry-signature-${signMessages}.png`, fullPage: true });
    expect(guard.blocked).toEqual([]); expect(guard.errors).toEqual([]);
  });
}

test("anexo removido nao ressuscita ao trocar de conversa apos falha parcial", async ({ page }) => {
  const guard = await openFixture(page, 390);
  await openChat(page);
  await pickTemplate(page, "Multimidia QA");
  guard.control.failAudio = true;
  await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
  await expect(page.getByText("Falha conhecida no audio QA", { exact: true })).toBeVisible();
  await settleToasts(page);
  await page.getByRole("button", { name: "Remover manual.pdf", exact: true }).click();
  await page.getByRole("button", { name: "Voltar para conversas", exact: true }).click();
  await page.getByRole("button", { name: /Abrir conversa com Segundo QA sintetico/ }).click();
  await expect(page.getByRole("button", { name: /^Remover / })).toHaveCount(0);
  await expect(page.getByPlaceholder("Digite / para templates...")).toHaveValue("");
  await page.getByRole("button", { name: "Voltar para conversas", exact: true }).click();
  await page.getByRole("button", { name: /Abrir conversa com Contato QA sintetico/ }).click();
  await expect(page.getByRole("button", { name: "Remover audio.wav", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remover manual.pdf", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
  await expect(page.getByText("Mensagem rápida enviada.", { exact: true })).toBeVisible();
  expect(guard.sends.map((item) => item.mediatype || "text")).toEqual(["text", "image", "video", "audio", "audio"]);
  expect(guard.blocked).toEqual([]); expect(guard.errors).toEqual([]);
});

test("empresa diferente rejeitada e troca durante ACK nao envia partes ao novo escopo", async ({ page }) => {
  const guard = await openFixture(page, 1440);
  await openChat(page);
  await pickTemplate(page, "Invalido QA");
  await expect(page.getByText(/contém anexos inválidos/)).toBeVisible();
  expect(guard.sends).toHaveLength(0);
  await settleToasts(page);
  await pickTemplate(page, "Multimidia QA");
  guard.control.holdNext = true;
  await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
  await expect.poll(() => guard.sends.length).toBe(1);
  for (const name of ["Enviar imagem ou arquivo", "Gravar áudio", "Adicionar emoji", "Abrir figurinhas"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
  }
  await page.getByRole("button", { name: "Trocar empresa QA" }).click();
  await expect(page.getByRole("button", { name: /Abrir conversa com Outra empresa QA/ })).toBeVisible();
  guard.control.release?.();
  await expect(page.getByText(/Envio interrompido ao trocar/)).toBeVisible();
  expect(guard.sends).toHaveLength(1);
  await settleToasts(page);
  await page.getByRole("button", { name: "Trocar empresa QA" }).click();
  await page.getByRole("button", { name: /Abrir conversa com Contato QA sintetico/ }).click();
  await expect(page.getByPlaceholder("Digite / para templates...")).toHaveValue("");
  await expect(page.getByRole("button", { name: /^Remover (foto|video|audio|manual)/ })).toHaveCount(4);
  expect(guard.blocked).toEqual([]); expect(guard.errors).toEqual([]);
});

test("troca de empresa sem envio pendente", async ({ page }) => {
  const guard = await openFixture(page, 1440);
  await openChat(page);
  await page.getByRole("button", { name: "Trocar empresa QA" }).click();
  await expect(page.getByRole("button", { name: /Abrir conversa com Outra empresa QA/ })).toBeVisible();
  expect(guard.sends).toHaveLength(0);
  expect(guard.blocked).toEqual([]); expect(guard.errors).toEqual([]);
});

test("sair da tela durante ACK interrompe as partes seguintes", async ({ page }) => {
  const guard = await openFixture(page, 390);
  await openChat(page);
  await pickTemplate(page, "Multimidia QA");
  guard.control.holdNext = true;
  await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
  await expect.poll(() => guard.sends.length).toBe(1);
  await page.getByRole("link", { name: "Templates QA" }).click();
  await expect(page.getByRole("button", { name: /Novo/ })).toBeVisible();
  guard.control.release?.();
  await expect(page.getByText(/Envio interrompido/)).toBeVisible();
  expect(guard.sends).toHaveLength(1);
  expect(guard.blocked).toEqual([]); expect(guard.errors).toEqual([]);
});

test("respostas 200 sem confirmacao preservam texto e todos os anexos", async ({ page }) => {
  const guard = await openFixture(page, 390);
  await openChat(page);
  await pickTemplate(page, "Multimidia QA");
  for (const reply of [{ json: {} }, { json: { success: false, messageId: "not-confirmed" } }, { body: "malformed JSON" }]) {
    guard.control.unconfirmedReply = reply;
    await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
    await expect(page.getByText(/Envio não confirmado/)).toBeVisible();
    await expect(page.getByPlaceholder("Digite / para templates...")).toHaveValue("Ola Contato");
    await expect(page.getByRole("button", { name: /^Remover (foto|video|audio|manual)/ })).toHaveCount(4);
    await settleToasts(page);
  }
  expect(guard.sends.map((item) => item.action)).toEqual(["send-message", "send-message", "send-message"]);
  expect(guard.blocked).toEqual([]); expect(guard.errors).toEqual([]);
});

test("save com commit e ACK perdido seguido de cancelar mantem arquivos referenciados", async ({ page }) => {
  const guard = await openFixture(page, 390);
  await page.getByRole("button", { name: /Novo/ }).click();
  await page.getByLabel("Título", { exact: true }).fill("Commit sem ACK QA");
  await page.getByLabel("Selecionar anexos").setInputFiles([files[3]]);
  await expect(page.getByRole("button", { name: "Remover manual.pdf", exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).__templateMediaQA.loseSaveAck());
  await page.getByRole("button", { name: "Criar", exact: true }).click();
  await expect(page.getByText("ACK de salvamento QA perdido", { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => (window as any).__templateMediaQA.getTemplates().find((row: any) => row.title === "Commit sem ACK QA"));
  expect(saved.attachments).toHaveLength(1);
  await settleToasts(page);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await openChat(page);
  expect(await page.evaluate(() => (window as any).__templateMediaQA.getLog().removals)).not.toContain(saved.attachments[0].path);
  expect(await page.evaluate(() => (window as any).__templateMediaQA.getFilePaths())).toContain(saved.attachments[0].path);
  expect(guard.sends).toHaveLength(0);
  expect(guard.blocked).toEqual([]); expect(guard.errors).toEqual([]);
});
