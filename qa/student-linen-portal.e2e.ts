import { expect, type Page, test } from "@playwright/test";
import {
  companyId, createLinenPortalFixture, cycleId, enrollmentId, fixtureLogin, fixtureTime, historyCycleId,
  historyDate, historyExerciseName, historyWorkoutId, historyWorkoutTitle, priorEnrollmentId, priorSessionDate,
  sessionId, studentId, userId, workoutId,
} from "./student-linen-portal-fixture";

const mobile = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  reducedMotion: "no-preference",
  serviceWorkers: "block",
  timezoneId: "America/Sao_Paulo",
  proxy: { server: "http://127.0.0.1:1", bypass: "127.0.0.1" },
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

test("Nutri outage preserves an executable workout and retries only its own section", async ({ page, baseURL }) => {
  const fixture = createLinenPortalFixture("published", { nutritionOutage: true });
  await fixture.install(page.context(), new URL(baseURL!).origin);
  await openPortal(page);
  await expect.poll(() => fixture.state.nutritionReads).toBeGreaterThan(0);
  await tab(page, "Treino").click();
  await expect(page.getByRole("heading", { name: "Treino A · Linho", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Iniciar Treino", exact: true }).click();
  const finish = page.getByRole("button", { name: "Finalizar Treino", exact: true });
  await expect(finish).toBeVisible();
  await tab(page, "Nutri").click();
  const retry = page.getByRole("alert").getByRole("button", { name: "Tentar novamente", exact: true });
  await expect(retry).toBeVisible();
  await expect(dock(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nenhuma dica nutricional publicada" })).toHaveCount(0);
  const enrollmentReads = fixture.state.enrollmentReads;
  const nutritionReads = fixture.state.nutritionReads;
  fixture.state.nutritionOutage = false;
  await retry.click();
  await expect(page.getByRole("heading", { name: "Plano alimentar", exact: true })).toBeVisible();
  await page.locator("summary").filter({ hasText: "Café da manhã" }).click();
  await expect(page.getByText("Iogurte com banana", { exact: true })).toBeVisible();
  expect(fixture.state.nutritionReads).toBeGreaterThan(nutritionReads);
  expect(fixture.state.enrollmentReads).toBe(enrollmentReads);
  await tab(page, "Treino").click();
  await expect(finish).toBeVisible();
  expect(fixture.state.session).toMatchObject({ id: sessionId, status: "in_progress", workout_id: workoutId });
  expect(fixture.state.starts).toHaveLength(1);
  expect(fixture.state.unexpectedRequests).toEqual([]);
});

test("an isolated browser recovers active A on focus and prevents starting B", async ({ page, browser, baseURL }) => {
  const fixture = createLinenPortalFixture("published", { twoWorkouts: true });
  let releaseLogs!: () => void;
  fixture.state.sessionLogBarrier = new Promise<void>(resolve => { releaseLogs = resolve; });
  const origin = new URL(baseURL!).origin;
  await fixture.install(page.context(), origin, "first");
  const second = await browser.newContext(mobile);
  try {
    await fixture.install(second, origin, "second");
    const other = await second.newPage();
    const start = (target: Page) => target.getByRole("button", { name: "Iniciar Treino", exact: true });
    const finish = (target: Page) => target.getByRole("button", { name: "Finalizar Treino", exact: true });
    const a = (target: Page) => target.getByRole("button", { name: "Treino A", exact: true });
    const b = (target: Page) => target.getByRole("button", { name: "Treino B", exact: true });
    const headingA = (target: Page) => target.getByRole("heading", { name: "Treino A · Linho", exact: true });

    await openPortal(page);
    await openPortal(other);
    await tab(other, "Treino").click();
    await b(other).click();
    await expect(other.getByRole("heading", { name: "Treino B · Linho", exact: true })).toBeVisible();
    await expect(start(other)).toBeEnabled();
    await tab(other, "Início").click();
    const resume = other.getByRole("button", { name: "Retomar de onde parei", exact: true });
    await expect(resume).toHaveCount(0);

    await tab(page, "Treino").click();
    await a(page).click();
    await start(page).click();
    await expect(finish(page)).toBeVisible();
    expect(fixture.state.starts).toHaveLength(1);
    expect(fixture.state.session).toMatchObject({ id: sessionId, workout_id: workoutId, status: "in_progress" });
    fixture.seedSet(fixtureTime.slice(0, 10), 24);

    // Browser focus events are dispatched explicitly for headless WebKit and Chromium.
    await other.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => fixture.state.activeSessionReads.some(read =>
      read.context === "second" && read.id === sessionId && read.scoped)).toBe(true);
    await expect(resume).toBeVisible();
    await resume.click();
    await expect.poll(() => fixture.state.sessionLogReads).toContainEqual({
      context: "second", student: `eq.${studentId}`, workout: `eq.${workoutId}`, date: "eq.2026-11-09",
    });
    await expect(finish(other)).toHaveCount(0);
    await expect(other.getByRole("spinbutton")).toHaveCount(0);
    releaseLogs();
    await expect(headingA(other)).toBeVisible();
    await expect(a(other)).toHaveAttribute("aria-pressed", "true");
    await expect(finish(other)).toBeVisible();
    await expect(start(other)).toHaveCount(0);
    await other.getByText("Agachamento de teste", { exact: true }).click();
    await expect(other.getByRole("spinbutton").first()).toHaveValue("24");
    expect(fixture.state.starts).toHaveLength(1);

    for (const target of [page, other]) {
      await expect(b(target)).toBeDisabled();
      await expect(a(target)).toHaveAttribute("aria-pressed", "true");
      await expect(b(target)).toHaveAttribute("aria-pressed", "false");
      await expect(headingA(target)).toBeVisible();
      await expect(finish(target)).toBeVisible();
      await expect(start(target)).toHaveCount(0);
    }
    expect(fixture.state.starts).toHaveLength(1);
    expect(fixture.state.unexpectedRequests).toEqual([]);
  } finally {
    releaseLogs();
    await second.close();
  }
});

test("a fresh browser resumes the prior-day session with its own persisted sets", async ({ page, baseURL }) => {
  const fixture = createLinenPortalFixture("published", { twoWorkouts: true, priorDayActive: true });
  let releaseLogs!: () => void;
  fixture.state.sessionLogBarrier = new Promise<void>(resolve => { releaseLogs = resolve; });
  try {
    await fixture.install(page.context(), new URL(baseURL!).origin);
    await openPortal(page);
    await page.getByRole("button", { name: "Retomar de onde parei", exact: true }).click();
    await expect.poll(() => fixture.state.sessionLogReads).toContainEqual({
      context: "primary", student: `eq.${studentId}`, workout: `eq.${workoutId}`, date: `eq.${priorSessionDate}`,
    });
    const finish = page.getByRole("button", { name: "Finalizar Treino", exact: true });
    await expect(finish).toHaveCount(0);
    await expect(page.getByRole("spinbutton")).toHaveCount(0);
    releaseLogs();
    await expect(finish).toBeVisible();
    await expect(page.getByRole("button", { name: "Treino B", exact: true })).toBeDisabled();
    await page.getByText("Agachamento de teste", { exact: true }).click();
    await expect(page.getByRole("spinbutton").first()).toHaveValue("24");
    expect(fixture.state.starts).toEqual([]);
    expect(fixture.state.session).toMatchObject({ id: sessionId, workout_id: workoutId, session_date: priorSessionDate });
    expect(fixture.state.unexpectedRequests).toEqual([]);
  } finally {
    releaseLogs();
  }
});

for (const history of ["current", "renewal"] as const) {
  test(`calendar opens the exact previous cycle read-only and leaves current A executable (${history})`, async ({ page, baseURL }) => {
    const fixture = createLinenPortalFixture("published", { history });
    await fixture.install(page.context(), new URL(baseURL!).origin);
    await openPortal(page);
    await page.getByRole("navigation", { name: "Acompanhamento" }).getByRole("button", { name: /Calendário/ }).click();
    await page.getByRole("button", { name: `${historyDate}: treino registrado`, exact: true }).click();
    await expect(page.getByText(history === "renewal" ? "Treino anterior" : historyWorkoutTitle, { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Treino de outro tenant", { exact: true })).toHaveCount(0);
    const beforeClick = fixture.state.prescriptionReads.length;
    if (history === "renewal") {
      await expect(page.getByText(historyWorkoutTitle, { exact: true })).toHaveCount(0);
      expect(fixture.state.prescriptionReads).toContainEqual({ table: "training_cycles", query: expect.objectContaining({
        enrollment_id: `eq.${enrollmentId}`, student_id: `eq.${studentId}`, company_id: `eq.${companyId}`,
      }) });
      const operationalWorkouts = fixture.state.prescriptionReads.filter(read => read.table === "workouts");
      expect(operationalWorkouts).toEqual([{ table: "workouts", query: expect.objectContaining({ cycle_id: `in.(${cycleId})` }) }]);
    }
    await page.getByRole("button", { name: "Ver ficha do treino", exact: true }).click();
    const previous = page.getByRole("dialog", { name: historyWorkoutTitle, exact: true });
    await expect(previous).toBeVisible();
    await expect(previous.getByText("Ciclo 1 · 06/11/2026 · Somente consulta", { exact: true })).toBeVisible();
    await expect(previous.getByText(historyExerciseName, { exact: true })).toBeVisible();
    if (history === "renewal") {
      const owner = { student_id: `eq.${studentId}`, company_id: `eq.${companyId}` };
      const workoutScope = { id: `eq.${historyWorkoutId}`, company_id: `eq.${companyId}`,
        superseded_at: "is.null", superseded_by_revision_id: "is.null", student_profile_archive_event_id: "is.null" };
      expect(fixture.state.prescriptionReads.slice(beforeClick)).toEqual([
        { table: "students", query: expect.objectContaining({ id: `eq.${studentId}`, company_id: owner.company_id, user_id: `eq.${userId}` }) },
        { table: "workouts", query: expect.objectContaining({ ...workoutScope, select: "id,cycle_id" }) },
        { table: "training_cycles", query: expect.objectContaining({ ...owner, id: `eq.${historyCycleId}`,
          start_date: "lte.2026-11-09", status: "in.(active,completed)", prescription_cleared_at: "is.null", superseded_at: "is.null" }) },
        { table: "enrollments", query: expect.objectContaining({ ...owner, id: `in.(${priorEnrollmentId})` }) },
        { table: "workouts", query: expect.objectContaining({ ...workoutScope, cycle_id: `in.(${historyCycleId})`,
          select: expect.stringContaining("exercises") }) },
      ]);
    }
    await expect(previous.getByRole("button", { name: /Iniciar|Finalizar|Salvar|Adicionar série/ })).toHaveCount(0);
    await expect(previous.getByRole("spinbutton")).toHaveCount(0);
    expect(fixture.state.starts).toEqual([]);
    expect(fixture.state.logs.size).toBe(0);
    expect(fixture.state.completions).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(previous).toHaveCount(0);
    await expect(page.getByRole("button", { name: `${historyDate}: treino registrado`, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Ver ficha do treino", exact: true })).toBeVisible();
    await tab(page, "Treino").click();
    await expect(page.getByRole("heading", { name: "Treino A · Linho", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Iniciar Treino", exact: true }).click();
    await expect(page.getByRole("button", { name: "Finalizar Treino", exact: true })).toBeVisible();
    expect(fixture.state.starts).toEqual([expect.objectContaining({ _workout_id: workoutId })]);
    expect(fixture.state.unexpectedRequests).toEqual([]);
  });
}
