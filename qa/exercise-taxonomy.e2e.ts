import { expect, test, type Page } from "@playwright/test";

const fixturePath = "/qa/exercise-taxonomy-fixture.html";

type Guard = { consoleErrors: string[]; blockedExternalRequests: string[] };

async function installNetworkGuard(page: Page): Promise<Guard> {
  const consoleErrors: string[] = [];
  const blockedExternalRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["127.0.0.1", "localhost"].includes(url.hostname)) {
      await route.continue();
      return;
    }
    blockedExternalRequests.push(route.request().url());
    await route.abort("blockedbyclient");
  });
  return { consoleErrors, blockedExternalRequests };
}

async function expectNoFixtureLeak(guard: Guard) {
  expect(guard.blockedExternalRequests).toEqual([]);
  expect(guard.consoleErrors.filter((message) => !message.includes("Download the React DevTools"))).toEqual([]);
}

async function openTaxonomyFixture(page: Page, route: "library" | "workout", viewport: { width: number; height: number }, theme: "light" | "dark" = "light") {
  await page.setViewportSize(viewport);
  const guard = await installNetworkGuard(page);
  await page.goto(`${fixturePath}?route=${route}&theme=${theme}`);
  return guard;
}

async function chooseRadixOption(page: Page, optionName: string) {
  await page.getByRole("option", { name: optionName }).click();
}

test("desktop ExerciseLibrary supports canonical category filters, anatomical options, target badges and category-only rows", async ({ page }) => {
  const guard = await openTaxonomyFixture(page, "library", { width: 1440, height: 940 });

  await expect(page.getByRole("heading", { name: "BIBLIOTECA DE EXERCÍCIOS" })).toBeVisible();
  await expect(page.getByText(/Exibindo 80 de 1010 exercício/)).toBeVisible();

  await page.getByRole("button", { name: "Core" }).click();
  await page.getByRole("button", { name: "Peso Corporal" }).click();
  await expect(page.getByText("Prancha category-only")).toBeVisible();
  await expect(page.getByText(/Exibindo 1 de 1 exercício/)).toBeVisible();
  const categoryOnlyCard = page.locator(".rounded-lg", { hasText: "Prancha category-only" }).first();
  await expect(categoryOnlyCard.getByText("Core")).toBeVisible();
  await expect(categoryOnlyCard.getByText("Peso Corporal")).toBeVisible();
  await expect(categoryOnlyCard.getByText("Abdômen")).toHaveCount(0);

  await page.getByRole("button", { name: "Todas categorias" }).click();
  await page.getByRole("button", { name: "Base" }).click();
  await page.getByPlaceholder("Buscar exercícios...").fill("Supino legado");
  await expect(page.getByText("Supino legado 1%")).toBeVisible();
  const legacyCard = page.locator(".rounded-lg", { hasText: "Supino legado 1%" }).first();
  await expect(legacyCard.getByText("P · Peitoral · 100%", { exact: true })).toBeVisible();
  await expect(legacyCard.getByText("S · Biceps · 50%", { exact: true })).toBeVisible();
  await expect(legacyCard.getByText(/· 1%/)).toHaveCount(0);

  await page.getByRole("button", { name: /Novo Exercício/i }).click();
  const dialog = page.getByRole("dialog", { name: "NOVO EXERCÍCIO" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox").first().click();
  for (const muscle of ["Abdômen", "Quadríceps", "Posterior de coxa", "Glúteos", "Adutores", "Panturrilha", "Deltoide Lateral", "Deltoide Posterior", "Deltoide Anterior", "Antebraço", "Biceps", "Triceps", "Dorsal", "Trapezio", "Peitoral"]) {
    await expect(page.getByRole("option", { name: muscle })).toBeVisible();
  }
  await expect(page.getByRole("option", { name: "Core" })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "Mobilidades" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);

  await page.screenshot({ path: "/tmp/sett-taxonomy-playwright/exercise-library-desktop.png", fullPage: true });
  await expectNoFixtureLeak(guard);
});

test("desktop ExerciseLibrary saves new exercise with multi-category and fixed primary/secondary targets", async ({ page }) => {
  const guard = await openTaxonomyFixture(page, "library", { width: 1366, height: 920 });

  await page.getByRole("button", { name: /Novo Exercício/i }).click();
  const dialog = page.getByRole("dialog", { name: "NOVO EXERCÍCIO" });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("Ex: Agachamento Livre").fill("Exercício QA multi categoria");
  await dialog.getByText("Core", { exact: true }).click();
  await dialog.getByText("Peso Corporal", { exact: true }).click();

  const primarySection = dialog.getByText("Primários (100%)").locator("xpath=ancestor::div[contains(@class,'space-y-2')][1]");
  await primarySection.getByRole("button", { name: /Adicionar/i }).click();
  await dialog.getByRole("combobox").last().click();
  await chooseRadixOption(page, "Peitoral");

  const secondarySection = dialog.getByText("Secundários (50%)").locator("xpath=ancestor::div[contains(@class,'space-y-2')][1]");
  await secondarySection.getByRole("button", { name: /Adicionar/i }).click();
  await dialog.getByRole("combobox").last().click();
  await chooseRadixOption(page, "Biceps");

  await dialog.getByRole("button", { name: /Criar Exercício/i }).click();
  await expect(page.getByText("Exercício criado!", { exact: true }).first()).toBeVisible();

  const inserted = await page.evaluate(() => (window as any).__exerciseTaxonomyFixture.getInsertedExercises());
  const replaced = await page.evaluate(() => (window as any).__exerciseTaxonomyFixture.getReplacedTargets());
  expect(inserted.at(-1)).toMatchObject({
    name: "Exercício QA multi categoria",
    muscle_group: "Peitoral",
    category: "core",
    categories: ["core", "peso_corporal"],
  });
  expect(replaced.at(-1).targets).toEqual([
    { muscle_group_id: "mg-peitoral", role: "primary", is_primary: true, volume_percentage: 100 },
    { muscle_group_id: "mg-biceps", role: "secondary", is_primary: false, volume_percentage: 50 },
  ]);

  await page.screenshot({ path: "/tmp/sett-taxonomy-playwright/exercise-library-created.png", fullPage: true });
  await expectNoFixtureLeak(guard);
});

test("mobile ExerciseLibrary edits existing exercise, allows category-only save and never creates a false muscle target", async ({ page }) => {
  const guard = await openTaxonomyFixture(page, "library", { width: 390, height: 844 }, "dark");

  await page.getByPlaceholder("Buscar exercícios...").fill("Editar alvo existente");
  await expect(page.getByText("Editar alvo existente")).toBeVisible();
  await page.locator(".rounded-lg", { hasText: "Editar alvo existente" }).first().getByRole("button").first().click();
  const dialog = page.getByRole("dialog", { name: "EDITAR EXERCÍCIO" });
  await expect(dialog).toBeVisible();
  await dialog.getByText("Mobilidades", { exact: true }).click();
  await dialog.getByRole("combobox").first().click();
  await chooseRadixOption(page, "Sem grupo principal");
  const primarySection = dialog.getByText("Primários (100%)").locator("xpath=ancestor::div[contains(@class,'space-y-2')][1]");
  await primarySection.getByRole("combobox").first().click();
  await chooseRadixOption(page, "Remover");
  await dialog.getByRole("button", { name: /Salvar/i }).click();
  await expect(page.getByText("Exercício atualizado!", { exact: true }).first()).toBeVisible();

  const updates = await page.evaluate(() => (window as any).__exerciseTaxonomyFixture.getUpdatedExercises());
  const replaced = await page.evaluate(() => (window as any).__exerciseTaxonomyFixture.getReplacedTargets());
  expect(updates.at(-1)).toMatchObject({ id: "exercise-edit", patch: { muscle_group: null, category: "pesos_livre", categories: ["pesos_livre", "mobilidades"] } });
  expect(replaced.at(-1)).toEqual({ exerciseId: "exercise-edit", targets: [] });
  await expect(page.getByRole("heading", { name: "Sem grupo principal" })).toBeVisible();

  await page.screenshot({ path: "/tmp/sett-taxonomy-playwright/exercise-library-mobile-edit-dark.png", fullPage: true });
  expect(await page.locator("html").getAttribute("data-theme-mode")).toBe("dark");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expectNoFixtureLeak(guard);
});

test("WorkoutBuilder real route filters by canonical categories and uses paged library/target data", async ({ page }) => {
  const guard = await openTaxonomyFixture(page, "workout", { width: 1440, height: 940 });

  await expect(page.getByRole("heading", { name: /PRESCRIÇÃO DE TREINO/i })).toBeVisible();
  await page.getByRole("button", { name: /^Adicionar$/ }).click();

  const libraryDialog = page.getByRole("dialog", { name: "Biblioteca de exercícios" });
  await expect(libraryDialog.getByPlaceholder("Buscar exercício...")).toBeVisible();
  await libraryDialog.getByRole("button", { name: "Core" }).click();
  await libraryDialog.getByRole("button", { name: "Peso Corporal" }).click();
  await expect(libraryDialog.getByText("Prancha category-only")).toBeVisible();
  await expect(libraryDialog.getByText("Mobilidade category-only")).toHaveCount(0);
  await libraryDialog.getByText("Prancha category-only").click();
  await libraryDialog.getByRole("button", { name: "Close" }).click();

  const workoutPanel = page.getByLabel("Treino A - Taxonomia");
  await expect(workoutPanel.getByText("Prancha category-only")).toBeVisible();
  await expect(page.getByText("Treino A - Taxonomia")).toBeVisible();
  const volumeCard = page.locator(".rounded-lg", { hasText: "VOLUME SEMANAL" }).first();
  await expect(volumeCard.getByText("Peitoral")).toBeVisible();
  await expect(volumeCard.getByText("4", { exact: true })).toBeVisible();
  await expect(volumeCard.getByText("Biceps")).toBeVisible();
  await expect(volumeCard.getByText("2", { exact: true })).toBeVisible();

  const rows = await page.evaluate(() => (window as any).__exerciseTaxonomyFixture.getExerciseRows().length);
  expect(rows).toBe(1010);
  expect(await page.locator("html").getAttribute("data-theme-mode")).toBe("light");
  await page.screenshot({ path: "/tmp/sett-taxonomy-playwright/workout-builder-desktop.png", fullPage: true });
  await expectNoFixtureLeak(guard);
});
