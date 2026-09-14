import { expect, test, type Page } from "@playwright/test";

const fixturePath = "/qa/teacher-mobile-fixture.html";
const artifactDir = "output/teacher-mobile-qa";

test("Athletic Club star follows current membership without editing a student name", async ({ page }) => {
  const guard = await openFixture(page, "/trainer/students/student-mobile-1", 390, 844);
  const name = page.getByRole("heading", { name: /Ana Carolina/ });
  const star = name.locator("..").getByRole("img", { name: "Athletic Club" });
  await expect(name).toBeVisible();
  await expect(star).toHaveCount(0);
  await page.evaluate(() => (window as any).__teacherMobileFixture.changeMembership(true));
  await expect(star).toBeVisible();
  await page.screenshot({ path: `${artifactDir}/athletic-club-star-390.png`, fullPage: true });
  await expectClean(page, guard, 390);
  await page.evaluate(() => (window as any).__teacherMobileFixture.changeMembership(false));
  await expect(star).toHaveCount(0);
  await expectClean(page, guard, 390);
});

async function openFixture(page: Page, route: string, width: number, height = 900) {
  const blocked: string[] = [];
  const errors: string[] = [];
  await page.setViewportSize({ width, height });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (routeRequest) => {
    const url = new URL(routeRequest.request().url());
    if (["localhost", "127.0.0.1"].includes(url.hostname)) return routeRequest.continue();
    if (url.hostname.endsWith("supabase.co") && url.pathname.includes("/rest/v1/staff_sessions")) {
      return routeRequest.fulfill({ status: 204, body: "" });
    }
    if (url.hostname.endsWith("supabase.co") && url.pathname.includes("/functions/v1/whatsapp-manager")) {
      return routeRequest.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, messages: [] }),
      });
    }
    blocked.push(routeRequest.request().url());
    return routeRequest.abort("blockedbyclient");
  });
  await page.goto(`${fixturePath}?route=${encodeURIComponent(route)}`);
  await expect(page.locator("body")).toBeVisible();
  return { blocked, errors };
}

async function installVisualViewportMock(page: Page, initial: { width: number; height: number; offsetTop: number }) {
  await page.addInitScript((value) => {
    const listeners = new Map<string, Set<() => void>>();
    const viewport = {
      width: value.width,
      height: value.height,
      offsetTop: value.offsetTop,
      offsetLeft: 0,
      pageTop: value.offsetTop,
      pageLeft: 0,
      scale: 1,
      addEventListener(type: string, listener: () => void) {
        const set = listeners.get(type) || new Set();
        set.add(listener);
        listeners.set(type, set);
      },
      removeEventListener(type: string, listener: () => void) {
        listeners.get(type)?.delete(listener);
      },
      dispatch(type: string) {
        listeners.get(type)?.forEach((listener) => listener());
      },
    };
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    (window as any).__setVisualViewport = (next: Partial<typeof viewport>) => {
      Object.assign(viewport, next);
      viewport.dispatch("resize");
      viewport.dispatch("scroll");
    };
  }, initial);
}

async function expectClean(page: Page, guard: { blocked: string[]; errors: string[] }, width: number) {
  await page.waitForTimeout(100);
  expect(guard.blocked).toEqual([]);
  expect(guard.errors.filter((message) => !message.includes("Download the React DevTools"))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  const writes = await page.evaluate(() => (window as any).__teacherMobileFixture.getWrites());
  expect(writes.filter((write: string) => write !== 'whatsapp_chats:update:{"unread_count":0}')).toEqual([]);
}

async function expectNoExternalLeak(guard: { blocked: string[]; errors: string[] }) {
  expect(guard.blocked).toEqual([]);
  expect(guard.errors.filter((message) => !message.includes("Download the React DevTools"))).toEqual([]);
}

for (const width of [360, 390, 768, 1440]) {
  test(`teacher shell/registration has no horizontal overflow at ${width}`, async ({ page }) => {
    const guard = await openFixture(page, "/trainer/registration", width, width >= 1000 ? 1000 : 900);
    await expect(page.getByText("Interessados").first()).toBeVisible();
    await expect(page.getByText("Lead Interessada Mobile Com Sobrenome Enorme").first()).toHaveCount(1);
    await page.screenshot({ path: `${artifactDir}/registration-${width}.png`, fullPage: true });
    await expectClean(page, guard, width);
  });
}

test("Registration mobile stage selector switches visible funnel stage", async ({ page }) => {
  const guard = await openFixture(page, "/trainer/registration", 390, 900);
  await expect(page.getByText("Lead Interessada Mobile Com Sobrenome Enorme").first()).toBeVisible();
  const stageSelect = page.getByText("Etapa exibida").locator("..").getByRole("combobox");
  await stageSelect.click();
  await page.getByRole("option", { name: /Contato feito/ }).click();
  await expect(page.getByRole("heading", { name: "Contato feito" })).toBeVisible();
  await expect(page.getByText("Sem pessoas aqui.").first()).toBeVisible();
  await page.screenshot({ path: `${artifactDir}/registration-stage-contacted-390.png`, fullPage: true });
  await expectClean(page, guard, 390);
});

test("WhatsApp mobile list opens thread, back returns to list, composer stays inside viewport", async ({ page }) => {
  const guard = await openFixture(page, "/trainer/whatsapp-chat", 390, 844);
  await expect(page.getByRole("heading", { name: "Conversas" })).toBeVisible();
  await page.getByRole("button", { name: /Abrir conversa com Ana Carolina/ }).click();
  await expect(page.getByText("Claro, vou olhar sem enviar nada real.")).toBeVisible();
  await expect(page.getByPlaceholder("Digite / para templates...")).toBeVisible();
  await page.screenshot({ path: `${artifactDir}/whatsapp-thread-390.png`, fullPage: true });
  await page.getByRole("button", { name: "Voltar para conversas" }).click();
  await expect(page.getByText("Lead Interessada Mobile Com Sobrenome Enorme").first()).toBeVisible();
  await page.screenshot({ path: `${artifactDir}/whatsapp-list-back-390.png`, fullPage: true });
  await expectClean(page, guard, 390);
});

test("embedded WhatsApp Sheet respects simulated visualViewport keyboard height", async ({ page }) => {
  await installVisualViewportMock(page, { width: 390, height: 844, offsetTop: 0 });
  const guard = await openFixture(page, "/trainer/registration", 390, 844);
  await page.getByRole("button", { name: "Abrir conversas do WhatsApp" }).click();
  await expect(page.getByRole("heading", { name: "Conversas", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Abrir conversa com Ana Carolina/ }).click();
  const composer = page.getByPlaceholder("Digite / para templates...");
  await expect(composer).toBeVisible();
  await composer.focus();
  await page.evaluate(() => (window as any).__setVisualViewport({ height: 452, offsetTop: 168, pageTop: 168 }));
  await page.waitForTimeout(100);
  const metrics = await page.evaluate(() => {
    const vv = window.visualViewport!;
    const textarea = document.querySelector("textarea[placeholder='Digite / para templates...']") as HTMLElement | null;
    const sheet = document.querySelector("[role='dialog']") as HTMLElement | null;
    const composerBox = textarea?.getBoundingClientRect();
    const sheetBox = sheet?.getBoundingClientRect();
    return {
      visualHeight: vv.height,
      visualOffsetTop: vv.offsetTop,
      visualBottom: vv.offsetTop + vv.height,
      composerBottom: composerBox?.bottom ?? null,
      composerTop: composerBox?.top ?? null,
      sheetBottom: sheetBox?.bottom ?? null,
      sheetHeight: sheetBox?.height ?? null,
      documentScrollHeight: document.documentElement.scrollHeight,
      windowInnerHeight: window.innerHeight,
    };
  });
  await page.screenshot({ path: `${artifactDir}/whatsapp-sheet-keyboard-390.png`, fullPage: true });
  expect(metrics.composerBottom).not.toBeNull();
  expect(metrics.composerBottom!).toBeLessThanOrEqual(metrics.visualBottom + 2);
  expect(metrics.sheetBottom).not.toBeNull();
  expect(metrics.sheetBottom!).toBeLessThanOrEqual(metrics.windowInnerHeight + 2);
  await page.getByRole("button", { name: "Voltar para conversas" }).click();
  await expect(page.getByRole("button", { name: /Abrir conversa com Lead Interessada/ })).toBeVisible();
  await page.screenshot({ path: `${artifactDir}/whatsapp-sheet-list-back-keyboard-390.png`, fullPage: true });
  await expectNoExternalLeak(guard);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("embedded WhatsApp Sheet keeps close and bulk-send controls separate", async ({ page }) => {
  const guard = await openFixture(page, "/trainer/registration", 1440, 900);
  await page.getByRole("button", { name: "Abrir conversas do WhatsApp" }).click();
  const bulkSend = page.getByRole("button", { name: "Enviar para vários" });
  const close = page.getByRole("button", { name: "Close" });
  await expect(bulkSend).toBeVisible();
  await expect(close).toBeVisible();
  await expect.poll(async () => {
    const [bulkBox, closeBox] = await Promise.all([bulkSend.boundingBox(), close.boundingBox()]);
    if (!bulkBox || !closeBox) return false;
    const overlap = !(
      bulkBox.x + bulkBox.width <= closeBox.x
      || closeBox.x + closeBox.width <= bulkBox.x
      || bulkBox.y + bulkBox.height <= closeBox.y
      || closeBox.y + closeBox.height <= bulkBox.y
    );
    return !overlap;
  }).toBe(true);
  await close.click();
  await expect(page.getByRole("heading", { name: "Conversas", exact: true })).toHaveCount(0);
  await expectClean(page, guard, 1440);
});

test("StudentHub and StudentDetail profile surfaces fit mobile and desktop", async ({ page }) => {
  const mobileGuard = await openFixture(page, "/trainer/students/student-mobile-1", 360, 900);
  await expect(page.getByText("Visão 360")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Ana Carolina/ })).toBeVisible();
  await page.screenshot({ path: `${artifactDir}/student-hub-360.png`, fullPage: true });
  await expectClean(page, mobileGuard, 360);

  const detailGuard = await openFixture(page, "/trainer/aluno/student-mobile-1", 1440, 1000);
  await expect(page.getByRole("heading", { name: /Ana Carolina/i })).toBeVisible();
  await expect(page.getByText("Ciclos:").first()).toBeVisible();
  await page.screenshot({ path: `${artifactDir}/student-detail-1440.png`, fullPage: true });
  await expectClean(page, detailGuard, 1440);
});

test("WorkoutBuilder and embedded PrescriptionStudio render with fixture data without writes", async ({ page }) => {
  const builderGuard = await openFixture(page, "/trainer/workout/cycle-mobile-1", 390, 900);
  await expect(page.getByRole("heading", { name: "PRESCRIÇÃO DE TREINO" })).toBeVisible();
  await expect(page.getByText("Agachamento Livre com Barra").first()).toBeVisible();
  await page.screenshot({ path: `${artifactDir}/workout-builder-390.png`, fullPage: true });
  await expectClean(page, builderGuard, 390);

  const studioGuard = await openFixture(page, "/trainer/studio", 768, 1000);
  await expect(page.getByText(/Prescrição|musculação|Gerar/i).first()).toBeVisible();
  await page.screenshot({ path: `${artifactDir}/prescription-studio-768.png`, fullPage: true });
  await expectClean(page, studioGuard, 768);
});

test("WorkoutBuilder keeps weekly volume clear of the assistant card and floating mascot", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bnito-professor-position-v1", JSON.stringify({ x: 1120, y: 300 }));
  });
  const guard = await openFixture(page, "/trainer/workout/cycle-mobile-1", 1440, 720);
  const volumeCard = page.locator(".rounded-lg", { hasText: "VOLUME SEMANAL" }).first();
  const auditCard = page.locator(".rounded-lg", { hasText: /Auditoria técnica do treino/ }).first();

  await expect(volumeCard).toBeVisible();
  await expect(auditCard).toBeVisible();
  await expect(page.getByTestId("workout-builder-header-actions").getByRole("button", { name: "Conversas" })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

  const [volumeBox, auditBox] = await Promise.all([volumeCard.boundingBox(), auditCard.boundingBox()]);
  expect(volumeBox).not.toBeNull();
  expect(auditBox).not.toBeNull();
  const overlap = Math.min(volumeBox!.y + volumeBox!.height, auditBox!.y + auditBox!.height)
    - Math.max(volumeBox!.y, auditBox!.y);
  expect(overlap).toBeLessThanOrEqual(0);
  await expect(page.locator('[data-benito-fab="professor"]')).toHaveCount(0);
  await expectClean(page, guard, 1440);
});

test("WorkoutBuilder imports a library template, relinks visible exact-name exercise and saves via mocked revision", async ({ page }) => {
  const guard = await openFixture(page, "/trainer/workout/cycle-mobile-1", 390, 900);
  await expect(page.getByRole("heading", { name: "PRESCRIÇÃO DE TREINO" })).toBeVisible();
  await page.getByRole("button", { name: /Biblioteca de treinos/ }).click();
  await expect(page.getByRole("dialog", { name: /Usar treino da biblioteca/ })).toBeVisible();
  await page.getByRole("button", { name: /Template QA Nome Visível/ }).click();
  await page.getByRole("button", { name: "Usar este treino" }).click();
  await page.getByRole("button", { name: "Substituir treino atual" }).click();
  await expect(page.getByText("Template QA Nome Visível")).toHaveCount(0);
  await expect(page.getByText("Agachamento Livre com Barra").first()).toBeVisible();
  await expect(page.locator('input[value="3"]').first()).toBeVisible();
  await page.getByRole("button", { name: "Salvar Tudo" }).click();
  await expect.poll(async () => page.evaluate(() => (window as any).__teacherMobileFixture.getWrites().join("\n"))).toContain("replace_cycle_workout_revision:rpc");
  const writes = await page.evaluate(() => (window as any).__teacherMobileFixture.getWrites());
  expect(writes.join("\n")).toContain('"exercise_id":"ex-agachamento"');
  await page.screenshot({ path: `${artifactDir}/workout-template-import-save-390.png`, fullPage: true });
  await expectNoExternalLeak(guard);
});
