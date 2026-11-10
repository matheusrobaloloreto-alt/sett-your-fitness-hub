import { expect, test, type Page } from "@playwright/test";

const fixturePath = "/qa/teacher-mobile-fixture.html";
const artifactDir = "output/teacher-mobile-qa";

test("upcoming prescriptions use student status across dashboard scopes and deadline filters", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-10T12:00:00Z"));
  const guard = await openFixture(page, "/admin", 1440, 900, "light", "admin");
  const queue = page.locator(".bg-card.border-border").filter({
    has: page.getByRole("heading", { name: "Próximas prescrições" }),
  });
  const active = queue.getByRole("button", { name: /Ana Carolina/ });
  for (const scope of ["Todos os alunos", "Meus alunos"]) {
    await page.getByRole("button", { name: scope, exact: true }).click();
    for (const filter of ["Todas", "Pendentes", "Atrasadas"]) {
      await queue.getByRole("button", { name: filter, exact: true }).click();
      if (filter === "Atrasadas") {
        await expect(queue.getByText("Nenhuma próxima prescrição no período configurado.")).toBeVisible();
      } else {
        await expect(active).toBeVisible();
      }
      await expect(queue.getByText(/Bruno Lead|Aluno inativo QA/)).toHaveCount(0);
    }
  }
  await page.clock.setFixedTime(new Date("2026-10-16T12:00:00Z"));
  await page.reload();
  await queue.getByRole("button", { name: "Atrasadas", exact: true }).click();
  await expect(active).toBeVisible();
  await expect(queue.getByText(/Bruno Lead|Aluno inativo QA/)).toHaveCount(0);
  await expectClean(page, guard, 1440);
});

test("mobile dock follows the trainer and keeps long student details inside the card", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "userAgent", { get: () => "iPhone" }));
  await page.clock.setFixedTime(new Date("2026-09-14T12:00:00Z"));
  const guard = await openFixture(page, "/trainer", 320, 820);
  const dock = page.getByRole("navigation", { name: "Navegação rápida" });
  await dock.getByRole("link", { name: "Alunos" }).click();
  const email = page.getByText(/^bruno\.enderecolongo/);
  await expect(email).toBeVisible();
  const emailFits = await email.evaluate((element) => {
    const card = element.closest(".bg-card.border-border");
    if (!card) return false;
    const textBounds = element.getBoundingClientRect();
    const cardBounds = card.getBoundingClientRect();
    return element.scrollWidth <= element.clientWidth + 1
      && textBounds.left >= cardBounds.left && textBounds.right <= cardBounds.right;
  });
  expect(emailFits).toBe(true);

  await dock.getByRole("link", { name: "Agenda" }).click();
  await expect(page.getByRole("heading", { name: "AGENDA", exact: true })).toBeVisible();
  const installPrompt = page.locator("[data-sett-install-prompt]");
  await expect(installPrompt).toBeVisible();
  const menu = dock.getByRole("button", { name: "Menu", exact: true });
  await menu.click();
  const drawer = page.getByRole("dialog", { name: "Menu do painel" });
  await expect(drawer).toHaveClass(/sett-linen-drawer/);
  await expect(installPrompt).toBeHidden();
  await drawer.getByRole("link", { name: "Interessados", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Esteira de fechamento/i })).toBeVisible();
  await expect(menu).toBeFocused();
  await expect(installPrompt).toBeVisible();
  await expectClean(page, guard, 320);
});

test("Athletic Club star follows current membership without editing a student name", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-14T12:00:00Z"));
  const guard = await openFixture(page, "/trainer/students/student-mobile-1", 390, 844);
  const name = page.getByRole("heading", { name: /Ana Carolina/i });
  const star = page.getByRole("img", { name: "Athletic Club" });
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

async function openFixture(
  page: Page,
  route: string,
  width: number,
  height = 900,
  theme: "light" | "dark" = "light",
  role: "trainer" | "admin" | "coordinator" | "master" = "trainer",
) {
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
  await page.goto(`${fixturePath}?route=${encodeURIComponent(route)}&theme=${theme}&role=${role}`);
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

test("trainer can review pre-registration from the closing pipeline", async ({ page }) => {
  const guard = await openFixture(page, "/trainer/registration", 390, 900);
  await expect(page.getByRole("heading", { name: "Esteira de fechamento" })).toBeVisible();
  await expect(page.getByText("Lead Interessada Mobile Com Sobrenome Enorme").first()).toBeVisible();
  await page.getByRole("button", { name: "Ver pré-cadastro" }).first().click();
  await expect(page.getByRole("dialog")).toContainText("Lead Interessada Mobile Com Sobrenome Enorme");
  await expectClean(page, guard, 390);
});

for (const role of ["admin", "coordinator", "master"] as const) {
  test(`${role} keeps the closing pipeline and mobile stage selector`, async ({ page }) => {
    const guard = await openFixture(page, `/${role}/registration`, 390, 900, "light", role);
    await expect(page.getByRole("heading", { name: "Esteira de fechamento" })).toBeVisible();
    const stageSelect = page.getByText("Etapa exibida").locator("..").getByRole("combobox");
    await stageSelect.click();
    await page.getByRole("option", { name: /Contato feito/ }).click();
    await expect(page.getByRole("heading", { name: "Contato feito" })).toBeVisible();
    await expect(page.getByText("Sem pessoas aqui.").first()).toBeVisible();
    await page.screenshot({ path: `${artifactDir}/registration-stage-contacted-${role}-390.png`, fullPage: true });
    await expectClean(page, guard, 390);
  });
}

test("WhatsApp mobile list opens thread, back returns to list, composer stays inside viewport", async ({ page }) => {
  const guard = await openFixture(page, "/trainer/whatsapp-chat", 390, 844);
  await expect(page.getByRole("heading", { name: "Conversas" })).toBeVisible();
  await page.getByRole("button", { name: /Abrir conversa com Ana Carolina/ }).click();
  await expect(page.getByText("Claro, vou olhar sem enviar nada real.")).toBeVisible();
  await expect(page.getByPlaceholder("Digite / para templates...")).toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir conversas do WhatsApp" })).toHaveCount(0);
  await expect(page.locator('[data-benito-fab="professor"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enviar mensagem" })).toBeVisible();
  await page.screenshot({ path: `${artifactDir}/whatsapp-thread-390.png`, fullPage: true });
  await page.getByRole("button", { name: "Voltar para conversas" }).click();
  await expect(page.getByText("Lead Interessada Mobile Com Sobrenome Enorme").first()).toBeVisible();
  await page.screenshot({ path: `${artifactDir}/whatsapp-list-back-390.png`, fullPage: true });
  await expectClean(page, guard, 390);
});

test("WhatsApp dark mode keeps conversation surfaces and controls readable", async ({ page }) => {
  const guard = await openFixture(page, "/trainer/whatsapp-chat", 390, 844, "dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme-mode", "dark");
  await page.getByRole("button", { name: /Abrir conversa com Ana Carolina/ }).click();
  await expect(page.getByText("Claro, vou olhar sem enviar nada real.")).toBeVisible();
  await expect(page.getByPlaceholder("Digite / para templates...")).toBeVisible();

  const colors = await page.evaluate(() => {
    const parseRgb = (value: string) => {
      const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return null;
      return [Number(match[1]), Number(match[2]), Number(match[3])];
    };
    const luminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map((channel) => {
        const srgb = channel / 255;
        return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (foregroundValue: string, backgroundValue: string) => {
      const foreground = parseRgb(foregroundValue);
      const background = parseRgb(backgroundValue);
      if (!foreground || !background) return 0;
      const lighter = Math.max(luminance(foreground), luminance(background));
      const darker = Math.min(luminance(foreground), luminance(background));
      return (lighter + 0.05) / (darker + 0.05);
    };
    const sample = (selector: string) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const style = getComputedStyle(node);
      return {
        background: style.backgroundColor,
        color: style.color,
        contrast: contrast(style.color, style.backgroundColor),
      };
    };
    const sampleTextOnSurface = (textSelector: string, surfaceSelector: string) => {
      const textNode = document.querySelector(textSelector);
      const surfaceNode = document.querySelector(surfaceSelector);
      if (!textNode || !surfaceNode) return null;
      const textStyle = getComputedStyle(textNode);
      const surfaceStyle = getComputedStyle(surfaceNode);
      return {
        color: textStyle.color,
        background: surfaceStyle.backgroundColor,
        contrast: contrast(textStyle.color, surfaceStyle.backgroundColor),
      };
    };
    return {
      shell: sample("[data-testid='whatsapp-chat-shell']"),
      row: sample("[data-testid='whatsapp-chat-row']"),
      messagePane: sample("[data-testid='whatsapp-message-pane']"),
      incoming: sample("[data-testid='whatsapp-message'] [data-message-bubble='incoming']"),
      outgoing: sample("[data-testid='whatsapp-message'] [data-message-bubble='outgoing']"),
      outgoingMeta: sampleTextOnSurface(
        "[data-testid='whatsapp-message-meta-outgoing']",
        "[data-testid='whatsapp-message'] [data-message-bubble='outgoing']",
      ),
      composer: sample("[data-testid='whatsapp-composer']"),
    };
  });

  expect(colors.shell?.background).not.toBe("rgb(255, 255, 255)");
  expect(colors.messagePane?.background).not.toBe("rgb(255, 255, 255)");
  expect(colors.composer?.background).not.toBe("rgb(255, 255, 255)");
  expect(colors.row?.contrast ?? 0).toBeGreaterThanOrEqual(4.5);
  expect(colors.incoming?.contrast ?? 0).toBeGreaterThanOrEqual(4.5);
  expect(colors.outgoing?.contrast ?? 0).toBeGreaterThanOrEqual(4.5);
  expect(colors.outgoingMeta?.contrast ?? 0).toBeGreaterThanOrEqual(4.5);
  const sendBox = await page.getByRole("button", { name: "Enviar mensagem" }).boundingBox();
  expect(sendBox).not.toBeNull();
  expect(sendBox!.x + sendBox!.width).toBeLessThanOrEqual(390);

  await page.screenshot({ path: `${artifactDir}/whatsapp-dark-thread-390.png`, fullPage: true });
  await expectClean(page, guard, 390);
});

test("embedded WhatsApp Sheet respects simulated visualViewport keyboard height", async ({ page }) => {
  await installVisualViewportMock(page, { width: 390, height: 844, offsetTop: 0 });
  const guard = await openFixture(page, "/trainer/registration", 390, 844);
  await page.getByRole("navigation", { name: "Navegação rápida" }).getByRole("button", { name: "Conversas" }).click();
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
  const mobileGuard = await openFixture(page, "/admin/aluno/student-mobile-1", 360, 900, "light", "admin");
  await expect(page.getByText("Visão 360")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Ana Carolina/ })).toBeVisible();
  await page.screenshot({ path: `${artifactDir}/student-hub-360.png`, fullPage: true });
  await expectClean(page, mobileGuard, 360);

  const detailGuard = await openFixture(page, "/trainer/students/student-mobile-1", 1440, 1000);
  await expect(page.getByRole("heading", { name: /Ana Carolina/i })).toBeVisible();
  await page.getByRole("tab", { name: "Matrículas", exact: true }).click();
  await expect(page.getByRole("heading", { name: "MATRÍCULAS" })).toBeVisible();
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

test("PrescriptionStudio reopens a saved strength draft and uses only atomic publication", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-14T12:00:00Z"));
  const blocked: string[] = [];
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") return route.continue();
    if (url.hostname.endsWith("supabase.co") && url.pathname.includes("/rest/v1/staff_sessions")) {
      return route.fulfill({ status: 204, body: "" });
    }
    blocked.push(url.href);
    return route.abort();
  });
  await page.goto(`${fixturePath}?route=%2Ftrainer%2Fstudio&strengthDraft=1`);
  const openDraft = page.getByRole("button", { name: "Revisar rascunho · ciclo 1" });
  await page.getByRole("button", { name: "3. Prescrição" }).click();
  await expect(openDraft).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "3. Prescrição" }).click();
  await openDraft.click();
  const publish = page.getByRole("button", { name: "Publicar musculação · ciclo 1" });
  await expect(publish).toBeEnabled();
  const readWrites = () => page.evaluate(() => (window as any).__teacherMobileFixture.getWrites() as string[]);
  expect(await readWrites()).toEqual([]);

  page.once("dialog", dialog => dialog.dismiss());
  await publish.click();
  expect(await readWrites()).toEqual([]);

  page.on("dialog", dialog => dialog.accept());
  await publish.click();
  await expect(page.getByText(/Não foi possível confirmar a publicação/)).toBeVisible();
  await expect(publish).toBeEnabled();
  expect((await readWrites()).filter(write => write.startsWith("publish_studio_strength_draft:rpc:"))).toHaveLength(1);
  await publish.click();
  await expect(page.getByText(/Treino agendado/)).toBeVisible();
  const writes = await readWrites();
  expect(writes.filter(write => write.startsWith("publish_studio_strength_draft:rpc:"))).toHaveLength(2);
  expect(writes.every(write => write.startsWith("publish_studio_strength_draft:rpc:"))).toBe(true);
  expect(blocked).toEqual([]);
});

test("Agenda resolves the canonical enrollment relationship and shows scheduled cycles", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-14T12:00:00Z"));
  const guard = await openFixture(page, "/trainer/agenda", 1440, 900);
  await expect(page.getByRole("heading", { name: "AGENDA", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "setembro 2026" })).toBeVisible();
  await expect(page.getByText("Ciclo 1")).toBeVisible();
  await expect(page.getByText("Nenhum evento neste mês")).toHaveCount(0);
  await expectClean(page, guard, 1440);
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
  await expect(page.getByRole("button", { name: "Abrir conversas do WhatsApp" })).toBeVisible();
  await expect(page.getByTestId("workout-builder-header-actions").getByRole("button", { name: "Conversas" })).toHaveCount(0);
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
  const libraryDialog = page.getByRole("dialog", { name: /Usar treino da biblioteca/ });
  await page.getByRole("button", { name: /Biblioteca de treinos/ }).click();
  await expect(libraryDialog).toBeVisible();
  await page.getByRole("button", { name: /Template QA Nome Visível/ }).click();
  await page.getByRole("button", { name: "Usar este treino" }).click();
  await page.getByRole("button", { name: "Substituir treino atual" }).click();
  await expect(libraryDialog).toBeHidden();
  await expect(page.getByText("Agachamento Livre com Barra").first()).toBeVisible();
  await expect(page.locator('input[value="3"]').first()).toBeVisible();
  await page.getByRole("button", { name: "Salvar Tudo" }).click();
  await expect.poll(async () => page.evaluate(() => (window as any).__teacherMobileFixture.getWrites().join("\n"))).toContain("replace_cycle_workout_revision:rpc");
  const writes = await page.evaluate(() => (window as any).__teacherMobileFixture.getWrites());
  expect(writes.join("\n")).toContain('"exercise_id":"ex-agachamento"');
  await page.screenshot({ path: `${artifactDir}/workout-template-import-save-390.png`, fullPage: true });
  await expectNoExternalLeak(guard);
});
