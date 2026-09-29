import { expect, test, type Page } from "@playwright/test";

const artifactDir = "output/playwright/plan-version-library";
const companyId = "20000000-0000-4000-8000-000000000001";
const foreignId = "40000000-0000-4000-8000-000000000002";

async function openFixture(page: Page, width: number, variant = "mixed") {
  const externalRequests: string[] = [];
  const pageErrors: string[] = [];
  await page.setViewportSize({ width, height: width < 1000 ? 844 : 1000 });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (["localhost", "127.0.0.1"].includes(url.hostname)) return route.continue();
    externalRequests.push(`${url.origin}${url.pathname}`);
    return route.abort("blockedbyclient");
  });
  await page.goto(`/qa/plan-version-library-fixture.html?variant=${variant}`);
  await page.getByRole("button", { name: "Versões do plano" }).click();
  return { externalRequests, pageErrors };
}

async function viewer(page: Page) {
  await page.getByRole("button", { name: "Abrir versão", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Versão do plano", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function bounds(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')];
    return document.documentElement.scrollWidth <= innerWidth && dialogs.every((dialog) => {
      const box = dialog.getBoundingClientRect();
      const close = [...dialog.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Close");
      const closeBox = close?.getBoundingClientRect();
      return box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight
        && getComputedStyle(dialog).opacity === "1"
        && (!closeBox || (closeBox.left >= 0 && closeBox.top >= 0 && closeBox.right <= innerWidth && closeBox.bottom <= innerHeight));
    });
  })).toBe(true);
}

async function sourceUnchanged(page: Page) {
  expect(await page.evaluate(() => window.__planLibraryQA.source() === window.__planLibraryQA.originalSource)).toBe(true);
  expect((await page.evaluate(() => window.__planLibraryQA.log())).errors).toEqual([]);
  expect(await page.evaluate(() => window.__planLibraryQA.hiddenUnchanged())).toBe(true);
}

for (const width of [320, 390, 1440]) {
  test(`somente leitura preserva semanas e legado ${width}`, async ({ page }) => {
    const guard = await openFixture(page, width);
    const dialog = await viewer(page);
    await expect(dialog.getByText("Agachamento QA", { exact: true })).toBeVisible();
    await expect(dialog.getByText("0s", { exact: true })).toHaveCount(2);
    await dialog.getByRole("combobox", { name: "Semana da versão" }).click();
    await page.getByRole("option", { name: "Semana 7", exact: true }).click();
    await expect(dialog.getByText("Instrucao semana sete QA", { exact: true })).toHaveCount(2);
    await bounds(page);
    await page.screenshot({ path: `${artifactDir}/readonly-${width}.png`, fullPage: true });
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect((await page.evaluate(() => window.__planLibraryQA.log())).writes).toEqual([]);
    expect((await page.evaluate(() => window.__planLibraryQA.log())).rpcs).toEqual([]);
    await sourceUnchanged(page);
    expect(guard.externalRequests).toEqual([]); expect(guard.pageErrors).toEqual([]);
  });

  test(`salva plano e somente A sem alterar legado weekly ou origem ${width}`, async ({ page }) => {
    const guard = await openFixture(page, width);
    const dialog = await viewer(page);
    const before = await page.evaluate(() => JSON.parse(window.__planLibraryQA.originalSource));
    await dialog.getByRole("button", { name: "Salvar plano na biblioteca", exact: true }).click();
    const save = page.getByRole("dialog", { name: "Salvar na biblioteca", exact: true });
    await save.getByRole("textbox", { name: "Nome na biblioteca" }).fill("Plano completo QA");
    await bounds(page);
    await page.screenshot({ path: `${artifactDir}/save-all-${width}.png`, fullPage: true });
    await save.getByRole("button", { name: "Close", exact: true }).click();
    await expect(save).not.toBeVisible();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Salvar plano na biblioteca", exact: true }).click();
    await save.getByRole("textbox", { name: "Nome na biblioteca" }).fill("Plano completo QA");
    await save.getByRole("button", { name: "Salvar na biblioteca", exact: true }).click();
    await expect(save).not.toBeVisible();
    await expect(dialog).toBeVisible();
    const expected = before.workouts.map((workout: Record<string, unknown>) => {
      const copy = structuredClone(workout); delete copy.id; delete copy.updated_at; return copy;
    });
    let templates = await page.evaluate(() => window.__planLibraryQA.templates());
    expect(templates).toHaveLength(1);
    expect(templates[0]).toMatchObject({ company_id: companyId, name: "Plano completo QA", workouts: expected });
    expect(templates[0]).not.toHaveProperty("student_id"); expect(templates[0]).not.toHaveProperty("revision_id");
    await dialog.getByRole("button", { name: "Salvar somente Treino A QA na biblioteca", exact: true }).click();
    await expect(save.getByRole("radio", { name: "Treino específico" })).toBeChecked();
    await expect(save.getByRole("combobox", { name: "Treino", exact: true })).toHaveValue("0");
    await save.getByRole("textbox", { name: "Nome na biblioteca" }).fill("Somente A QA");
    await bounds(page);
    await page.screenshot({ path: `${artifactDir}/save-a-${width}.png`, fullPage: true });
    await save.getByRole("button", { name: "Salvar na biblioteca", exact: true }).click();
    await expect(save).not.toBeVisible();
    templates = await page.evaluate(() => window.__planLibraryQA.templates());
    expect(templates).toHaveLength(2);
    expect(templates[1]).toMatchObject({ company_id: companyId, name: "Somente A QA", workouts: [expected[0]] });
    expect((await page.evaluate(() => window.__planLibraryQA.log())).writes.map((write) => write.table)).toEqual(["workout_templates", "workout_templates"]);
    await sourceUnchanged(page);
    expect(guard.externalRequests).toEqual([]); expect(guard.pageErrors).toEqual([]);
  });

  test(`AI antigo mostra aliases e produz template reutilizavel sem migrar ${width}`, async ({ page }) => {
    const guard = await openFixture(page, width, "raw-ai");
    const dialog = await viewer(page);
    await expect(dialog.getByText("Observacao de sessao antiga QA", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Agachamento QA", { exact: true })).toBeVisible();
    await expect(dialog.getByText(/Cue AI antigo QA/)).toBeVisible();
    await dialog.getByRole("button", { name: "Salvar plano na biblioteca", exact: true }).click();
    const save = page.getByRole("dialog", { name: "Salvar na biblioteca", exact: true });
    await save.getByRole("button", { name: "Salvar na biblioteca", exact: true }).click();
    await expect(save).not.toBeVisible();
    const templates = await page.evaluate(() => window.__planLibraryQA.templates());
    expect(templates).toHaveLength(1);
    expect(templates[0].workouts).toMatchObject([{ title: "Sessao AI antiga QA", description: "Observacao de sessao antiga QA", exercises: [{
      exercise_id: "exercise-legacy", exercise_name: "Agachamento QA", rest: "0s", tempo: "3020", rir: "2",
    }] }]);
    const workouts = templates[0].workouts as Array<{ exercises: Array<Record<string, unknown>> }>;
    expect(workouts[0].exercises[0]).not.toHaveProperty("weekly_ui_version");
    await sourceUnchanged(page);
    expect(guard.externalRequests).toEqual([]); expect(guard.pageErrors).toEqual([]);
  });
}

test("snapshot malformado falha fechado sem erro de render ou escrita", async ({ page }) => {
  const guard = await openFixture(page, 390, "malformed");
  const dialog = await viewer(page);
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Salvar plano na biblioteca", exact: true })).toBeDisabled();
  await sourceUnchanged(page);
  expect((await page.evaluate(() => window.__planLibraryQA.log())).writes).toEqual([]);
  expect(guard.externalRequests).toEqual([]); expect(guard.pageErrors).toEqual([]);
});

test("texto historico objeto usa fallback seguro sem mutar o snapshot", async ({ page }) => {
  const guard = await openFixture(page, 320, "malformed-text");
  const dialog = await viewer(page);
  await expect(dialog.getByRole("heading", { name: "Treino 1", exact: true })).toBeVisible();
  await expect(dialog.getByText("Exercício 1", { exact: true })).toBeVisible();
  await bounds(page);
  await dialog.getByRole("button", { name: "Salvar somente Treino 1 na biblioteca", exact: true }).click();
  const save = page.getByRole("dialog", { name: "Salvar na biblioteca", exact: true });
  await expect(save.getByRole("combobox", { name: "Treino", exact: true })).toHaveValue("0");
  await expect(save.getByRole("option", { name: "Treino 1", exact: true })).toHaveCount(1);
  await bounds(page);
  await save.getByRole("button", { name: "Salvar na biblioteca", exact: true }).click();
  await expect(save.getByRole("alert")).toBeVisible();
  await sourceUnchanged(page);
  expect((await page.evaluate(() => window.__planLibraryQA.log())).writes).toEqual([]);
  expect(guard.externalRequests).toEqual([]); expect(guard.pageErrors).toEqual([]);
});

test("A ignora B ausente e plano completo cadastra snapshot privado sem consultar linha oculta", async ({ page }) => {
  const guard = await openFixture(page, 390, "invalid-b");
  const dialog = await viewer(page);
  await dialog.getByRole("button", { name: "Salvar somente Treino A QA na biblioteca", exact: true }).click();
  const save = page.getByRole("dialog", { name: "Salvar na biblioteca", exact: true });
  await save.getByRole("button", { name: "Salvar na biblioteca", exact: true }).click();
  await expect(save).not.toBeVisible();
  expect((await page.evaluate(() => window.__planLibraryQA.log())).rpcs).toEqual([]);
  expect((await page.evaluate(() => window.__planLibraryQA.templates()))[0].workouts).toMatchObject([{ title: "Treino A QA" }]);
  await dialog.getByRole("button", { name: "Salvar plano na biblioteca", exact: true }).click();
  await save.getByRole("button", { name: "Salvar na biblioteca", exact: true }).click();
  await expect(save).not.toBeVisible();
  const rows = await page.evaluate(() => window.__planLibraryQA.library());
  const registered = rows.filter((row) => row.name === "Snapshot fornecido QA");
  expect(registered).toHaveLength(1);
  expect(registered[0]).toMatchObject({ company_id: companyId, is_global: false, muscle_group: "Dorsal", equipment: "Halteres snapshot QA" });
  expect(registered[0].id).not.toBe(foreignId);
  expect(registered[0]).not.toHaveProperty("video_path");
  const source = await page.evaluate(() => JSON.parse(window.__planLibraryQA.originalSource));
  const expected = source.workouts.map((workout: Record<string, unknown>) => {
    const copy = structuredClone(workout); delete copy.id; delete copy.updated_at; return copy;
  });
  expected[1].exercises[0].exercise_id = registered[0].id;
  expect((await page.evaluate(() => window.__planLibraryQA.templates()))[1].workouts).toEqual(expected);
  const log = await page.evaluate(() => window.__planLibraryQA.log());
  expect(log.rpcs).toEqual([{ name: "ensure_workout_library_references", args: { p_company_id: companyId,
    p_exercises: [{ name: "Snapshot fornecido QA", muscle_group: "Dorsal", equipment: "Halteres snapshot QA", category: "pesos_livre", categories: ["pesos_livre"] }] } }]);
  expect(log.reads.filter((read) => read.table === "exercise_library").every((read) => read.catalogCompany === companyId && JSON.stringify(read.filters) === "[]")).toBe(true);
  expect(log.writes.map((write) => write.table)).toEqual(["workout_templates", "exercise_library", "workout_templates"]);
  await sourceUnchanged(page);
  expect(guard.externalRequests).toEqual([]); expect(guard.pageErrors).toEqual([]);
});

test("cadastro confirmado com ACK perdido permite retry sem duplicar exercicio", async ({ page }) => {
  const guard = await openFixture(page, 390, "missing");
  const dialog = await viewer(page);
  await page.evaluate(() => window.__planLibraryQA.setRecoveryMode("lost-ack-once"));
  await dialog.getByRole("button", { name: "Salvar plano na biblioteca", exact: true }).click();
  const save = page.getByRole("dialog", { name: "Salvar na biblioteca", exact: true });
  await save.getByRole("button", { name: "Salvar na biblioteca", exact: true }).click();
  await expect(save.getByRole("alert")).toBeVisible();
  expect(await page.evaluate(() => window.__planLibraryQA.templates())).toEqual([]);
  expect((await page.evaluate(() => window.__planLibraryQA.library())).filter((row) => row.name === "Exercicio ausente QA")).toHaveLength(1);
  await save.getByRole("button", { name: "Salvar na biblioteca", exact: true }).click();
  await expect(save).not.toBeVisible();
  const log = await page.evaluate(() => window.__planLibraryQA.log());
  expect(log.rpcs).toHaveLength(1);
  expect(log.writes.map((write) => write.table)).toEqual(["exercise_library", "workout_templates"]);
  expect((await page.evaluate(() => window.__planLibraryQA.templates()))[0].workouts).toMatchObject([{ exercises: [{
    video_url: "https://example.test/draft-qa.mp4", video_path: `${companyId}/draft-qa.mp4`, weekly_ui_version: "individual-weeks-v1",
  }] }]);
  await sourceUnchanged(page);
  expect(guard.externalRequests).toEqual([]); expect(guard.pageErrors).toEqual([]);
});

test("falha de recuperacao nao grava plano e retry cadastra somente uma vez", async ({ page }) => {
  const guard = await openFixture(page, 320, "missing");
  const dialog = await viewer(page);
  await page.evaluate(() => window.__planLibraryQA.setRecoveryMode("reject-once"));
  await dialog.getByRole("button", { name: "Salvar plano na biblioteca", exact: true }).click();
  const save = page.getByRole("dialog", { name: "Salvar na biblioteca", exact: true });
  await save.getByRole("button", { name: "Salvar na biblioteca", exact: true }).click();
  await expect(save.getByRole("alert")).toBeVisible();
  expect((await page.evaluate(() => window.__planLibraryQA.log())).writes).toEqual([]);
  await bounds(page);
  await save.getByRole("button", { name: "Salvar na biblioteca", exact: true }).click();
  await expect(save).not.toBeVisible();
  const log = await page.evaluate(() => window.__planLibraryQA.log());
  expect(log.rpcs).toHaveLength(2);
  expect(log.writes.map((write) => write.table)).toEqual(["exercise_library", "workout_templates"]);
  await sourceUnchanged(page);
  expect(guard.externalRequests).toEqual([]); expect(guard.pageErrors).toEqual([]);
});

test("ACK de outra empresa nunca confirma nem grava template", async ({ page }) => {
  const guard = await openFixture(page, 390, "missing");
  const dialog = await viewer(page);
  await page.evaluate(() => window.__planLibraryQA.setRecoveryMode("wrong-company-once"));
  await dialog.getByRole("button", { name: "Salvar plano na biblioteca", exact: true }).click();
  const save = page.getByRole("dialog", { name: "Salvar na biblioteca", exact: true });
  await save.getByRole("button", { name: "Salvar na biblioteca", exact: true }).click();
  await expect(save.getByRole("alert")).toBeVisible();
  expect(await page.evaluate(() => window.__planLibraryQA.templates())).toEqual([]);
  expect((await page.evaluate(() => window.__planLibraryQA.log())).rpcs).toHaveLength(1);
  await sourceUnchanged(page);
  expect(guard.externalRequests).toEqual([]); expect(guard.pageErrors).toEqual([]);
});

test("dois helpers concorrentes compartilham cadastro sem mudar origem ou publicar global", async ({ page }) => {
  const guard = await openFixture(page, 1440, "missing");
  const ids = await page.evaluate(() => window.__planLibraryQA.recoverCopies(2));
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  const log = await page.evaluate(() => window.__planLibraryQA.log());
  expect(log.rpcs).toHaveLength(2);
  expect(log.writes).toHaveLength(1);
  expect(log.writes[0]).toMatchObject({ table: "exercise_library", payload: { id: ids[0], company_id: companyId, is_global: false } });
  expect(log.writes[0].payload).not.toHaveProperty("video_path");
  expect(log.writes[0].payload).not.toHaveProperty("weekly_prescription");
  expect(await page.evaluate(() => window.__planLibraryQA.templates())).toEqual([]);
  await sourceUnchanged(page);
  expect(guard.externalRequests).toEqual([]); expect(guard.pageErrors).toEqual([]);
});

test("paginacao abre versao 21 sem gravar", async ({ page }) => {
  const guard = await openFixture(page, 1440, "pagination");
  await expect(page.getByRole("button", { name: "Abrir versão", exact: true })).toHaveCount(20);
  await page.getByRole("button", { name: "Carregar mais versões", exact: true }).click();
  await expect(page.getByRole("button", { name: "Abrir versão", exact: true })).toHaveCount(21);
  await page.getByRole("button", { name: "Abrir versão", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Versao 21 QA", exact: true })).toBeVisible();
  expect((await page.evaluate(() => window.__planLibraryQA.log())).writes).toEqual([]);
  expect(guard.externalRequests).toEqual([]); expect(guard.pageErrors).toEqual([]);
});
