import { expect, test, type Page } from "@playwright/test";

const artifactDir = "output/playwright/whatsapp-signature";
const preferenceKey = "sett:whatsapp-signature:20000000-0000-4000-8000-000000000001:10000000-0000-4000-8000-000000000001";

async function openFixture(page: Page, width: number, draft = false) {
  const sends: Record<string, any>[] = [];
  const blocked: string[] = [];
  const errors: string[] = [];
  const control = { rejectSignature: false };
  await page.setViewportSize({ width, height: width < 1000 ? 844 : 1000 });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["localhost", "127.0.0.1"].includes(url.hostname)) return route.continue();
    if (url.hostname.endsWith("supabase.co") && url.pathname.includes("/rest/v1/staff_sessions")) {
      return route.fulfill({ status: 204, body: "" });
    }
    if (url.hostname.endsWith("supabase.co") && url.pathname.endsWith("/functions/v1/whatsapp-manager")) {
      const body = route.request().postDataJSON();
      if (!["send-message", "send-media"].includes(body.action)) {
        return route.fulfill({ json: { ok: true, messages: [], contacts: [], groups: [] } });
      }
      sends.push(body);
      if (control.rejectSignature && body.signMessages) {
        return route.fulfill({ status: 400, json: { code: "whatsapp_signature_name_missing", error: "Preencha seu nome no perfil antes de assinar mensagens." } });
      }
      const id = `signature-qa-${sends.length}`;
      const media = body.action === "send-media";
      const separateSignature = media && ["audio", "sticker"].includes(body.mediatype) && body.signMessages;
      const warning = separateSignature && body.mediatype === "sticker";
      const message = {
        id, chat_id: body.chatId, content: `${body.signMessages && !separateSignature ? "*Nome do Backend QA*\n\n" : ""}${body.content || body.caption || "Mídia QA"}`,
        source: "outgoing", type: media ? body.mediatype || "document" : "text",
        created_at: new Date().toISOString(), timestamp: new Date().toISOString(),
        message_id_external: id, media_url: null, media_type: null,
      };
      return route.fulfill({ json: {
        ok: true, message,
        signatureMessage: separateSignature && !warning ? { ...message, id: `${id}-name`, message_id_external: `${id}-name`, type: "text", content: "*Nome do Backend QA*" } : null,
        signatureWarning: warning,
        persistenceWarning: warning,
      } });
    }
    blocked.push(`${url.origin}${url.pathname}`);
    return route.abort("blockedbyclient");
  });
  await page.addInitScript(() => {
    const stream = { getTracks: () => [{ stop() {} }] };
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => stream } });
    class Recorder {
      stream = stream;
      onstop: (() => void) | null = null;
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      static isTypeSupported() { return true; }
      start() {}
      stop() {
        this.ondataavailable?.({ data: new Blob([new Uint8Array(256)], { type: "audio/webm" }) });
        this.onstop?.();
      }
    }
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: Recorder });
  });
  const route = draft ? "/trainer/registration" : "/trainer/whatsapp-chat";
  await page.goto(`/qa/whatsapp-signature-fixture.html?route=${encodeURIComponent(route)}`);
  if (draft) {
    await expect(page.getByRole("button", { name: "Abrir conversas do WhatsApp" })).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("sett:open-whatsapp-chat", { detail: {
      mode: "draft", studentId: "student-mobile-2", phone: "5548999990002", contactName: "Destinatário QA sintético",
    } })));
    await expect(page.getByPlaceholder("Digite a mensagem...")).toBeVisible();
  } else {
    await page.getByRole("button", { name: /Abrir conversa com Ana Carolina/ }).click();
    await expect(page.getByPlaceholder("Digite / para templates...")).toBeVisible();
  }
  return { sends, blocked, errors, control };
}

async function checkLayout(page: Page, width: number) {
  const toggle = page.getByRole("switch", { name: "Assinar mensagens" });
  // A visible Sheet can still be sliding in from outside the viewport.
  await expect.poll(async () => {
    const visible = await toggle.isVisible();
    const box = await toggle.boundingBox();
    const viewport = await page.evaluate(() => ({
      width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
    }));
    const sheetSettled = await toggle.evaluate((element) => {
      const sheet = element.closest('[role="dialog"]');
      return !sheet?.getAnimations().some((animation) => animation.pending || animation.playState === "running");
    });
    return {
      visible,
      boxPresent: box !== null,
      leftInside: box !== null && box.x >= 0,
      topInside: box !== null && box.y >= 0,
      rightInside: box !== null && box.x + box.width <= width,
      bottomInside: box !== null && box.y + box.height <= viewport.height,
      noOverflow: viewport.scrollWidth <= width,
      viewportUnchanged: viewport.width === width,
      sheetSettled,
    };
  }).toEqual({
    visible: true, boxPresent: true, leftInside: true, topInside: true,
    rightInside: true, bottomInside: true, noOverflow: true, viewportUnchanged: true, sheetSettled: true,
  });
}

async function reopenComposer(page: Page, draft: boolean) {
  await page.reload();
  if (draft) {
    await expect(page.getByRole("button", { name: "Abrir conversas do WhatsApp" })).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("sett:open-whatsapp-chat", { detail: {
      mode: "draft", studentId: "student-mobile-2", phone: "5548999990002", contactName: "Destinatário QA sintético",
    } })));
  } else await page.getByRole("button", { name: /Abrir conversa com Ana Carolina/ }).click();
  await expect(page.getByRole("switch", { name: "Assinar mensagens" })).toBeVisible();
}

async function waitForToasts(page: Page) {
  // Hover pauses Sonner's real dismissal timer and can cover composer actions.
  await page.mouse.move(0, 0);
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 10_000 });
}

for (const width of [320, 390, 1440]) {
  for (const draft of [false, true]) {
    test(`assinatura ${draft ? "draft" : "selected"} ON/OFF e sem overflow ${width}`, async ({ page }) => {
      const guard = await openFixture(page, width, draft);
      const toggle = page.getByRole("switch", { name: "Assinar mensagens" });
      const input = page.getByPlaceholder(draft ? "Digite a mensagem..." : "Digite / para templates...");
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await checkLayout(page, width);
      await page.screenshot({ path: `${artifactDir}/${draft ? "draft" : "selected"}-${width}-off.png`, fullPage: true });
      await toggle.focus();
      await page.keyboard.press("Space");
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      await input.fill("Mensagem QA sem nome no frontend");
      await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
      await expect.poll(() => guard.sends.length).toBe(1);
      expect(guard.sends[0]).toMatchObject({ action: "send-message", signMessages: true, content: "Mensagem QA sem nome no frontend" });
      if (!draft) await expect(page.getByTestId("whatsapp-message").filter({ hasText: "Nome do Backend QA" })).toBeVisible();
      await expect(toggle).toBeEnabled();
      await checkLayout(page, width);
      await page.screenshot({ path: `${artifactDir}/${draft ? "draft" : "selected"}-${width}-on.png`, fullPage: true });
      await reopenComposer(page, draft);
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      await toggle.click();
      await input.fill("Mensagem QA desligada");
      await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
      await expect.poll(() => guard.sends.length).toBe(2);
      expect(guard.sends[1]).toMatchObject({ signMessages: false, content: "Mensagem QA desligada" });
      expect(await page.evaluate((key) => localStorage.getItem(key), preferenceKey)).toBe("false");
      await reopenComposer(page, draft);
      await expect(page.getByRole("switch", { name: "Assinar mensagens" })).toHaveAttribute("aria-checked", "false");
      expect(guard.blocked).toEqual([]);
      expect(guard.errors).toEqual([]);
    });
  }
}

for (const enabled of [true, false]) {
  test(`arquivo, avaliação, áudio, figurinha e bulk enviam a flag ${enabled ? "ON" : "OFF"} e exibem respostas da edge`, async ({ page }) => {
    const guard = await openFixture(page, 1440);
    // Extend the existing in-memory fixture only for the evaluation-file branch.
    await page.evaluate(async () => {
      // @ts-expect-error Vite serves this existing local module to the QA browser.
      const { supabase } = await import("/src/integrations/supabase/client.ts");
      const original = supabase.from.bind(supabase);
      Object.defineProperty(supabase, "from", { configurable: true, value: (table: string) => table === "student_files" ? {
        select() { return this; }, eq() { return this; },
        order: async () => ({ data: [{ kind: "assessment_report", file_name: "avaliacao-qa.pdf", file_path: "qa/avaliacao-qa.pdf" }], error: null }),
      } : original(table) });
    });
    const toggle = page.getByRole("switch", { name: "Assinar mensagens" });
    if ((await toggle.getAttribute("aria-checked")) !== String(enabled)) await toggle.click();
    const start = guard.sends.length;
    const composer = page.getByTestId("whatsapp-composer");
    await composer.locator('input[type="file"]').first().setInputFiles({ name: "arquivo-qa.pdf", mimeType: "application/pdf", buffer: Buffer.from("QA synthetic PDF") });
    await expect.poll(() => guard.sends.length).toBe(start + 1);
    await expect(toggle).toBeEnabled();
    await waitForToasts(page);
    await page.getByRole("button", { name: "Anexar último treino/avaliação" }).click();
    await expect.poll(() => guard.sends.length).toBe(start + 2);
    await expect(toggle).toBeEnabled();
    await waitForToasts(page);
    await page.getByRole("button", { name: "Gravar áudio" }).click();
    await expect(toggle).toBeDisabled();
    await waitForToasts(page);
    await page.getByRole("button", { name: "Parar e enviar" }).click();
    await expect.poll(() => guard.sends.length).toBe(start + 3);
    await expect(toggle).toBeEnabled();
    if (enabled) {
      await expect(page.locator(`[data-message-id="signature-qa-${start + 3}-name"]`)).toContainText("*Nome do Backend QA*");
      await expect(page.locator(`[data-message-id="signature-qa-${start + 3}"]`)).toBeVisible();
      await page.screenshot({ path: `${artifactDir}/audio-signature-on.png`, fullPage: true });
    }
    await waitForToasts(page);
    await page.getByRole("button", { name: "Abrir figurinhas" }).click();
    await page.getByRole("button", { name: /Enviar figurinha / }).first().click();
    await expect.poll(() => guard.sends.length).toBe(start + 4);
    await expect(toggle).toBeEnabled();
    if (enabled) {
      await expect(page.getByText("Mídia enviada, mas a assinatura não chegou.", { exact: false })).toBeVisible();
      await expect(page.getByText("Mensagem enviada, mas o histórico pode demorar para sincronizar")).toBeVisible();
      await page.screenshot({ path: `${artifactDir}/sticker-warning-on.png`, fullPage: true });
    }
    await page.keyboard.press("Escape");
    await waitForToasts(page);
    await page.getByRole("button", { name: "Enviar para vários" }).click();
    const dialog = page.getByRole("dialog", { name: "Mensagem em massa" });
    await dialog.locator("textarea").fill("Bulk QA");
    await waitForToasts(page);
    await dialog.getByRole("button", { name: /Enviar/ }).click();
    await expect(dialog).not.toBeVisible();
    const sent = guard.sends.slice(start);
    expect(sent.length).toBeGreaterThanOrEqual(5);
    expect(sent.every((request) => request.signMessages === enabled)).toBe(true);
    expect(sent.slice(0, 4).map((request) => request.action)).toEqual(Array(4).fill("send-media"));
    expect(sent[1]).toMatchObject({ mediaSource: "student-upload" });
    expect(sent[2]).toMatchObject({ mediatype: "audio" });
    expect(sent[3]).toMatchObject({ mediatype: "sticker" });
    expect(sent.slice(4).every((request) => request.action === "send-message")).toBe(true);
    if (enabled) await expect(page.getByTestId("whatsapp-message").filter({ hasText: "Bulk QA" }).filter({ hasText: "Nome do Backend QA" })).toBeVisible();
    await waitForToasts(page);
    expect(guard.blocked).toEqual([]);
    expect(guard.errors).toEqual([]);
    await test.info().attach("synthetic-signature-send-requests", { body: JSON.stringify(guard.sends, null, 2), contentType: "application/json" });
  });
}

test("erro de perfil vem da edge e preserva o texto para tentar novamente", async ({ page }) => {
  const guard = await openFixture(page, 390);
  guard.control.rejectSignature = true;
  await page.getByRole("switch", { name: "Assinar mensagens" }).click();
  const input = page.getByPlaceholder("Digite / para templates...");
  await input.fill("Texto QA preservado");
  await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
  await expect(page.getByText("Preencha seu nome no perfil antes de assinar mensagens.")).toBeVisible();
  await expect(input).toHaveValue("Texto QA preservado");
  await expect(page.getByRole("switch", { name: "Assinar mensagens" })).toBeEnabled();
  await page.screenshot({ path: `${artifactDir}/profile-error-390.png`, fullPage: true });
  expect(guard.sends[0].signMessages).toBe(true);
  expect(guard.blocked).toEqual([]);
  expect(guard.errors).toEqual([]);
});
