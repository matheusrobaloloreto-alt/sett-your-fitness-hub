import { expect, type Page, test } from "@playwright/test";
import { createLinenPortalFixture, fixtureLogin, fixtureTime, sessionId, studentId, workoutId } from "./student-linen-portal-fixture";

const mobile = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  reducedMotion: "no-preference",
  serviceWorkers: "block",
  timezoneId: "America/Sao_Paulo",
} as const;
test.use({ ...mobile, actionTimeout: 15_000 });
test.setTimeout(150_000);


const dockLabels = ["Início", "Treino", "Corrida", "Ciclismo", "Natação", "Nutri"];
const reflection = "Série concluída com controle. Quero manter essa carga.";
const dock = (page: Page) => page.getByRole("navigation", { name: "Navegação do aluno" });
const tab = (page: Page, name: string) => dock(page).getByRole("button", { name, exact: true });

const fixtureTimestamp = Date.parse(fixtureTime);

async function openPortal(page: Page) {
  await page.clock.setFixedTime(fixtureTimestamp);
  await page.goto("/aluno");
  await page.getByLabel("Email", { exact: true }).fill(fixtureLogin.email);
  await page.getByLabel("Senha", { exact: true }).fill(fixtureLogin.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(dock(page)).toBeVisible({ timeout: 15_000 });
  await expect(dock(page).getByRole("button")).toHaveText(dockLabels);
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
}

test("Linho mobile preserves workout, rest, feedback and persisted history across views", async ({ page, browser, baseURL }, testInfo) => {
  const appOrigin = new URL(baseURL!).origin;
  const fixture = createLinenPortalFixture("published");
  await fixture.install(page.context(), appOrigin);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openPortal(page);

  await test.step("Home and user theme survive a reload", async () => {
    await expect(page.getByText("Treino A · Linho", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(tab(page, "Início")).toHaveAttribute("aria-current", "page");
    await noHorizontalOverflow(page);
    const setty = page.locator('[data-benito-fab="student"]');
    await expect(setty).toBeVisible();
    const measureGap = () => page.evaluate(() => {
      const assistant = document.querySelector('[data-benito-fab="student"]')!.getBoundingClientRect();
      const dock = document.querySelector(".student-linen-dock")!.getBoundingClientRect();
      return dock.top - assistant.bottom;
    });
    await expect.poll(measureGap).toBeGreaterThan(0);
    await page.evaluate(() => document.documentElement.style.setProperty("--sett-install-height", "140px"));
    await expect.poll(measureGap).toBeGreaterThan(0);
    await page.evaluate(() => document.documentElement.style.removeProperty("--sett-install-height"));
    await page.getByRole("button", { name: "Avisos", exact: true }).click();
    await expect(page.locator('[data-state="open"]').getByText("Avisos", { exact: true }).last()).toBeVisible();
    await page.keyboard.press("Escape");
    const coachLater = page.getByRole("button", { name: "Depois", exact: true });
    if (await coachLater.isVisible()) await coachLater.click();
    await page.screenshot({ path: testInfo.outputPath("01-home.png"), scale: "css" });
    await page.getByRole("button", { name: "Alternar para tema escuro" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme-mode", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme-mode", "dark");
    await page.getByRole("button", { name: "Alternar para tema claro" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme-mode", "light");
  });

  await test.step("Start, complete a set, switch to Nutri and return to the same active session", async () => {
    await tab(page, "Treino").click();
    await expect(tab(page, "Treino")).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Iniciar Treino", exact: true }).click();
    await expect(page.getByRole("button", { name: "Finalizar Treino", exact: true })).toBeVisible();
    expect(fixture.state.session).toMatchObject({ id: sessionId, status: "in_progress", workout_id: workoutId });
    expect(fixture.state.starts).toHaveLength(1);
    await page.getByText("Agachamento de teste", { exact: true }).click();
    const load = page.getByRole("spinbutton").first();
    await load.fill("20");
    // This checkbox-shaped action currently has only a Lucide icon.
    await load.locator("..").locator("button:has(svg.lucide-check)").click();
    await expect(page.getByText("Descanso: 30s", { exact: true })).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: /^1\/2$/ })).toBeVisible();
    await noHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("02-workout.png"), scale: "css" });

    await tab(page, "Nutri").click();
    await expect(page.getByRole("heading", { name: "Plano alimentar", exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(tab(page, "Nutri")).toHaveAttribute("aria-current", "page");
    const breakfast = page.locator("summary").filter({ hasText: "Café da manhã" });
    await breakfast.click();
    await expect(page.getByText("Iogurte com banana", { exact: true })).toBeVisible();
    await breakfast.click();
    await expect(page.getByText("Iogurte com banana", { exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: "Finalizar Treino", exact: true })).toHaveCount(0);
    await noHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("03-nutri.png"), scale: "css" });
    await page.clock.setFixedTime(fixtureTimestamp + 5_000);
    await tab(page, "Treino").click();
    await expect(page.getByRole("button", { name: "Finalizar Treino", exact: true })).toBeVisible();
    await expect(page.getByText("Descanso: 25s", { exact: true })).toBeVisible();
    await expect(page.getByRole("spinbutton").first()).toHaveValue("20");
    expect(fixture.state.starts).toHaveLength(1);
    expect(fixture.state.session).toMatchObject({ id: sessionId, status: "in_progress" });
    await page.clock.setFixedTime(fixtureTimestamp + 31_000);
    await expect(page.getByText(/^Descanso: \d+s$/)).toHaveCount(0);
  });

  await test.step("Finish after save, submit feedback and read both in a fresh browser context", async () => {
    await page.getByRole("button", { name: "Finalizar Treino", exact: true }).click();
    await expect.poll(() => fixture.state.session?.status).toBe("completed");
    expect(fixture.state.completions).toHaveLength(1);
    expect(fixture.state.session).toMatchObject({ id: sessionId, total_sets_completed: 1, total_volume: 200 });
    expect([...fixture.state.logs.values()]).toEqual(expect.arrayContaining([
      expect.objectContaining({ workout_id: workoutId, set_number: 1, completed: true, weight: 20, reps_done: 10 }),
    ]));
    const feedback = page.getByRole("dialog", { name: "Como foi o treino?" });
    await expect(feedback).toBeVisible();
    await feedback.getByRole("button", { name: /Bom/ }).click();
    await feedback.getByPlaceholder(/O que você quer que seu treinador saiba/).fill(reflection);
    await feedback.getByRole("button", { name: "Enviar ao treinador" }).click();
    await expect(page.getByText("Feedback registrado", { exact: true })).toBeVisible();
    expect(fixture.state.feedback).toMatchObject({ workout_session_id: sessionId, notes: reflection });

    const fresh = await browser.newContext(mobile);
    try {
      await fixture.install(fresh, appOrigin);
      const history = await fresh.newPage();
      await openPortal(history);
      await history.getByRole("navigation", { name: "Acompanhamento" }).getByRole("button", { name: /Calendário/ }).click();
      await expect(history.getByRole("heading", { name: "Histórico", exact: true })).toBeVisible();
      await expect(history.getByText("Treino A · Linho", { exact: true })).toBeVisible();
      await expect(history.getByText(reflection, { exact: true })).toBeVisible();
    } finally {
      await fresh.close();
    }
  });
  expect(fixture.state.unexpectedRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("Linho mobile keeps the dock visible without plans and guards inactive prescriptions", async ({ page, browser, baseURL }) => {
  const appOrigin = new URL(baseURL!).origin;
  const empty = createLinenPortalFixture("no-plan");
  await empty.install(page.context(), appOrigin);
  await openPortal(page);
  await tab(page, "Nutri").click();
  await expect(page.getByRole("heading", { name: "Nenhuma dica nutricional publicada" })).toBeVisible();
  await tab(page, "Corrida").click();
  await expect(page.getByRole("heading", { name: "Nenhum plano de corrida publicado" })).toBeVisible();
  await tab(page, "Treino").click();
  await expect(page.getByRole("heading", { name: "Aguardando prescrição" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Iniciar Treino", exact: true })).toHaveCount(0);
  expect(empty.state.starts).toEqual([]);
  expect(empty.state.unexpectedRequests).toEqual([]);

  const inactiveContext = await browser.newContext(mobile);
  try {
    const inactive = createLinenPortalFixture("inactive");
    await inactive.install(inactiveContext, appOrigin);
    const blocked = await inactiveContext.newPage();
    await openPortal(blocked);
    await expect(blocked.getByRole("main").getByText("Acesso aos treinos pausado", { exact: true })).toBeVisible();
    await tab(blocked, "Treino").click();
    await expect(tab(blocked, "Início")).toHaveAttribute("aria-current", "page");
    await expect(blocked.getByRole("button", { name: "Iniciar Treino", exact: true })).toHaveCount(0);
    await blocked.goto(`/aluno/treino/${studentId}`);
    await expect(blocked).toHaveURL(/\/aluno$/);
    expect(inactive.state.starts).toEqual([]);
    expect(inactive.state.unexpectedRequests).toEqual([]);
  } finally {
    await inactiveContext.close();
  }
});
