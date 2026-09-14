import { expect, test } from "@playwright/test";

const fixturePath = "/qa/workout-save-fixture.html";

type SaveCall = {
  expectedRows: Array<{ id: string; updated_at: string }>;
  workoutTitles: string[];
  workoutsLength: number;
};

async function installNetworkGuard(page: import("@playwright/test").Page) {
  const blocked: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["127.0.0.1", "localhost"].includes(url.hostname)) {
      await route.continue();
      return;
    }
    blocked.push(route.request().url());
    await route.abort("blockedbyclient");
  });
  return blocked;
}

async function openFixture(page: import("@playwright/test").Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(error.message);
  });
  const blockedExternalRequests = await installNetworkGuard(page);
  await page.goto(fixturePath);
  await expect(page.getByRole("heading", { name: /PRESCRIÇÃO DE TREINO/i })).toBeVisible();
  await expect(titleInput(page)).toHaveValue("Treino A - Superior");
  return { consoleErrors, blockedExternalRequests };
}

function activeWorkoutPanel(page: import("@playwright/test").Page) {
  return page.locator("[role='tabpanel'][data-state='active']");
}

function titleInput(page: import("@playwright/test").Page) {
  return activeWorkoutPanel(page).locator("input").nth(0);
}

function descriptionInput(page: import("@playwright/test").Page) {
  return activeWorkoutPanel(page).locator("input").nth(1);
}

function toastTitle(page: import("@playwright/test").Page, text: string) {
  return page.getByText(text, { exact: true }).first();
}

async function saveAll(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /Salvar Tudo/i }).click();
}

async function expectNoFixtureLeak({
  consoleErrors,
  blockedExternalRequests,
}: {
  consoleErrors: string[];
  blockedExternalRequests: string[];
}) {
  expect(blockedExternalRequests).toEqual([]);
  expect(consoleErrors.filter((message) => !message.includes("Download the React DevTools"))).toEqual([]);
}

test("desktop save keeps returned ids/timestamps current for a second save in the same editor", async ({ page }) => {
  const guard = await openFixture(page, { width: 1440, height: 900 });

  await descriptionInput(page).fill("Primeira gravação via QA");
  await saveAll(page);
  await expect(toastTitle(page, "Todos os treinos salvos!")).toBeVisible();
  await expect(descriptionInput(page)).toHaveValue("Primeira gravação via QA");

  await descriptionInput(page).fill("Segunda gravação sem conflito");
  await saveAll(page);
  await expect(toastTitle(page, "Todos os treinos salvos!")).toBeVisible();
  await expect(descriptionInput(page)).toHaveValue("Segunda gravação sem conflito");

  const saveCalls = await page.evaluate<SaveCall[]>(() => (window as any).__workoutSaveFixture.getSaveCalls());
  expect(saveCalls).toHaveLength(2);
  expect(saveCalls[0].workoutTitles).toEqual(["Treino A - Superior"]);
  expect(saveCalls[1].expectedRows[0].id).not.toBe(saveCalls[0].expectedRows[0].id);
  expect(saveCalls[1].expectedRows[0].updated_at).not.toBe(saveCalls[0].expectedRows[0].updated_at);

  await expectNoFixtureLeak(guard);
});

test("desktop save persists added and removed workouts with exact row count", async ({ page }) => {
  const guard = await openFixture(page, { width: 1366, height: 900 });

  await page.locator("[role='tablist']").locator("xpath=..").getByRole("button").click();
  await expect(page.getByRole("tab", { name: "Treino B" })).toBeVisible();
  await page.getByRole("tab", { name: "Treino B" }).click();
  await titleInput(page).fill("Treino B - Inferior");
  await descriptionInput(page).fill("Treino adicionado");

  await saveAll(page);
  await expect(toastTitle(page, "Todos os treinos salvos!")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Treino B - Inferior" })).toBeVisible();

  await page.getByRole("tab", { name: "Treino B - Inferior" }).click();
  await page.getByRole("button", { name: /Remover este treino/i }).click();
  await expect(page.getByRole("tab", { name: "Treino B - Inferior" })).toHaveCount(0);

  await saveAll(page);
  await expect(toastTitle(page, "Todos os treinos salvos!")).toBeVisible();

  const saveCalls = await page.evaluate<SaveCall[]>(() => (window as any).__workoutSaveFixture.getSaveCalls());
  expect(saveCalls.at(-2)?.workoutsLength).toBe(2);
  expect(saveCalls.at(-1)?.workoutsLength).toBe(1);
  const currentWorkouts = await page.evaluate<any[]>(() => (window as any).__workoutSaveFixture.getCurrentWorkouts());
  expect(currentWorkouts).toHaveLength(1);
  expect(currentWorkouts[0].title).toBe("Treino A - Superior");

  await expectNoFixtureLeak(guard);
});

test("desktop save accepts template replacement without treating removed draft ids as a conflict", async ({ page }) => {
  const guard = await openFixture(page, { width: 1366, height: 900 });
  const currentRowsBeforeTemplate = await page.evaluate<Array<{ id: string; updated_at: string }>>(
    () => (window as any).__workoutSaveFixture.getCurrentRows(),
  );

  await page.getByRole("button", { name: "Usar treino da biblioteca" }).click();
  await expect(page.getByRole("heading", { name: "Usar treino da biblioteca" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Template substitui rascunho" })).toBeVisible();
  await page.getByRole("button", { name: "Usar este treino" }).click();
  await page.getByRole("button", { name: "Substituir treino atual" }).click();
  await expect(page.getByRole("tab", { name: "Template C - Full Body" })).toBeVisible();

  await saveAll(page);
  await expect(toastTitle(page, "Todos os treinos salvos!")).toBeVisible();

  const saveCalls = await page.evaluate<SaveCall[]>(() => (window as any).__workoutSaveFixture.getSaveCalls());
  expect(saveCalls).toHaveLength(1);
  expect(saveCalls[0].expectedRows).toEqual(currentRowsBeforeTemplate);
  expect(saveCalls[0].workoutTitles).toEqual(["Template C - Full Body"]);
  await expect(page.getByRole("heading", { name: "Escolha qual versão deve permanecer" })).toHaveCount(0);

  await expectNoFixtureLeak(guard);
});

test("desktop conflict dialog loads latest version without saving stale draft", async ({ page }) => {
  const guard = await openFixture(page, { width: 1440, height: 900 });

  await titleInput(page).fill("Meu rascunho local");
  await page.evaluate(() => (window as any).__workoutSaveFixture.externalSave("Versão externa salva"));

  await saveAll(page);
  await expect(page.getByRole("heading", { name: "Escolha qual versão deve permanecer" })).toBeVisible();
  await expect(page.getByText("Versão salva", { exact: true })).toBeVisible();
  await expect(page.locator("li").filter({ hasText: "Versão externa salva" })).toBeVisible();
  await expect(page.getByText("Seu rascunho", { exact: true })).toBeVisible();
  await expect(page.locator("li").filter({ hasText: "Meu rascunho local" })).toBeVisible();

  const beforeResolve = await page.evaluate<SaveCall[]>(() => (window as any).__workoutSaveFixture.getSaveCalls());
  await page.getByRole("button", { name: "Carregar versão salva" }).click();
  await expect(page.getByRole("heading", { name: "Escolha qual versão deve permanecer" })).toHaveCount(0);
  await expect(titleInput(page)).toHaveValue("Versão externa salva");

  const afterResolve = await page.evaluate<SaveCall[]>(() => (window as any).__workoutSaveFixture.getSaveCalls());
  expect(afterResolve).toHaveLength(beforeResolve.length);

  await expectNoFixtureLeak(guard);
});

test("desktop conflict dialog saves draft over the latest expected rows", async ({ page }) => {
  const guard = await openFixture(page, { width: 1440, height: 900 });

  await titleInput(page).fill("Rascunho que deve vencer");
  await page.evaluate(() => (window as any).__workoutSaveFixture.externalSave("Outra versão externa"));
  const latestRowsBeforeResolution = await page.evaluate<Array<{ id: string; updated_at: string }>>(
    () => (window as any).__workoutSaveFixture.getCurrentRows(),
  );

  await saveAll(page);
  await expect(page.getByRole("heading", { name: "Escolha qual versão deve permanecer" })).toBeVisible();
  await page.getByRole("button", { name: "Salvar meu rascunho" }).click();

  await expect(toastTitle(page, "Seu rascunho foi salvo como nova versão")).toBeVisible();
  await expect(titleInput(page)).toHaveValue("Rascunho que deve vencer");

  const saveCalls = await page.evaluate<SaveCall[]>(() => (window as any).__workoutSaveFixture.getSaveCalls());
  const resolutionCall = saveCalls.at(-1);
  expect(resolutionCall?.expectedRows).toEqual(latestRowsBeforeResolution);
  expect(resolutionCall?.workoutTitles).toEqual(["Rascunho que deve vencer"]);

  await expectNoFixtureLeak(guard);
});

test("mobile smoke blocks duplicate submit while save is pending", async ({ page }) => {
  const guard = await openFixture(page, { width: 390, height: 844 });

  await page.evaluate(() => (window as any).__workoutSaveFixture.delayNextSave(350));
  const saveButton = page.getByRole("button", { name: /Salvar Tudo/i });
  await saveButton.click();
  await expect(page.getByRole("button", { name: /Salvando/i })).toBeDisabled();
  await page.getByRole("button", { name: /Salvando/i }).click({ force: true });
  await expect(toastTitle(page, "Todos os treinos salvos!")).toBeVisible();

  const saveCalls = await page.evaluate<SaveCall[]>(() => (window as any).__workoutSaveFixture.getSaveCalls());
  expect(saveCalls).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await expectNoFixtureLeak(guard);
});
