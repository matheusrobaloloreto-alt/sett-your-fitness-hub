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

async function closeFixtureToast(page: import("@playwright/test").Page, text: string) {
  const toast = page.getByRole("status").filter({ hasText: text }).first();
  if (await toast.isVisible()) await toast.getByRole("button").click();
  await expect(toast).not.toBeVisible();
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

async function observeTemplateSaveBoundaries(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    const modulePath = "/src/integrations/supabase/client.ts";
    const { supabase } = await import(modulePath);
    const observation = {
      writes: [] as Array<{ table: string; method: string }>,
      rpcs: [] as Array<{ name: string; params: any }>,
      templates: [] as Array<{ before: any; source: any }>,
    };
    (window as any).__workoutTemplateAddObservation = observation;
    const from = supabase.from.bind(supabase);
    Object.defineProperty(supabase, "from", {
      configurable: true,
      value: (table: string) => {
        const query = from(table);
        for (const method of ["insert", "update", "upsert", "delete"]) {
          const original = query[method].bind(query);
          query[method] = (...args: any[]) => {
            observation.writes.push({ table, method });
            return original(...args);
          };
        }
        if (table === "workout_templates") {
          const then = query.then.bind(query);
          query.then = (fulfilled: any, rejected: any) => then((response: any) => {
            for (const source of response.data || []) {
              observation.templates.push({ before: structuredClone(source), source });
            }
            return fulfilled ? fulfilled(response) : response;
          }, rejected);
        }
        return query;
      },
    });
    const rpc = supabase.rpc.bind(supabase);
    Object.defineProperty(supabase, "rpc", {
      configurable: true,
      value: (name: string, params: any) => {
        observation.rpcs.push({ name, params: structuredClone(params) });
        return rpc(name, params);
      },
    });
  });
}

async function templateSaveObservation(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const observation = (window as any).__workoutTemplateAddObservation;
    return {
      writes: observation.writes as Array<{ table: string; method: string }>,
      rpcs: observation.rpcs as Array<{ name: string; params: any }>,
      templates: observation.templates.map(({ before, source }: any) => ({ before, source })),
    };
  });
}

async function expectTemplatePickerLayout(
  page: import("@playwright/test").Page,
  dialog: import("@playwright/test").Locator,
  width: number,
) {
  const add = dialog.getByRole("button", { name: "Adicionar", exact: true });
  await expect(add).toBeVisible();
  await expect(add).toBeEnabled();
  await expect(add).toBeInViewport({ ratio: 1 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await expect.poll(async () => {
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize()!;
    return Boolean(box && box.x >= 0 && box.y >= 0
      && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height);
  }).toBe(true);
  await expect.poll(() => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 844 }]) {
  test(`direct template Add retains sessions and saves the combined immutable draft at ${viewport.width}px`, async ({ page }, testInfo) => {
    const guard = await openFixture(page, viewport);
    const reloads: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) reloads.push(frame.url());
    });
    const currentRows = await page.evaluate<Array<{ id: string; updated_at: string }>>(
      () => (window as any).__workoutSaveFixture.getCurrentRows(),
    );
    const persistedBefore = await page.evaluate<any[]>(() => (window as any).__workoutSaveFixture.getCurrentWorkouts());
    await observeTemplateSaveBoundaries(page);

    await page.locator("[role='tablist']").locator("xpath=..").getByRole("button").click();
    await titleInput(page).fill("Treino B - Local mantido");
    await descriptionInput(page).fill("Segunda sessão já no rascunho");
    await activeWorkoutPanel(page).getByRole("button", { name: "Adicionar", exact: true }).click();
    const exerciseDialog = page.getByRole("dialog", { name: "Biblioteca de exercícios" });
    await exerciseDialog.getByTitle("Supino reto").click();
    await exerciseDialog.getByRole("button", { name: "Ver treino completo" }).click();
    await closeFixtureToast(page, "Adicionado ao treino");

    await page.getByRole("button", { name: /^(Usar treino da biblioteca|Biblioteca de treinos)$/ }).click();
    const dialog = page.getByRole("dialog", { name: "Usar treino da biblioteca" });
    await expect(dialog.getByRole("heading", { name: "Template substitui rascunho" })).toBeVisible();
    const beforeAdd = await templateSaveObservation(page);
    expect(beforeAdd.templates).toHaveLength(1);
    const template = beforeAdd.templates[0].before;
    expect(template.workouts).toHaveLength(1);
    expect(beforeAdd.writes).toEqual([]);
    expect(beforeAdd.rpcs).toEqual([]);
    try {
      await expectTemplatePickerLayout(page, dialog, viewport.width);
    } finally {
      await testInfo.attach("template-add-layout", {
        body: JSON.stringify({
          reloads,
          dialog: await dialog.boundingBox(),
          add: await dialog.getByRole("button", { name: "Adicionar", exact: true }).boundingBox(),
          scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth),
          viewport,
        }),
        contentType: "application/json",
      });
    }
    expect(reloads).toEqual([]);
    await expect.poll(() => dialog.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
    const pickerScreenshot = testInfo.outputPath(`template-add-picker-${viewport.width}.png`);
    await page.screenshot({ path: pickerScreenshot, fullPage: true });
    await testInfo.attach("template-add-picker", { path: pickerScreenshot, contentType: "image/png" });

    await dialog.getByRole("button", { name: "Adicionar", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Substituir treino atual" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Treino A - Superior" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Treino B - Local mantido" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Template C - Full Body" })).toBeVisible();
    await expect(titleInput(page)).toHaveValue(template.workouts[0].title);
    await descriptionInput(page).fill("Personalização somente da cópia");

    await page.getByRole("tab", { name: "Treino A - Superior" }).click();
    await expect(descriptionInput(page)).toHaveValue(persistedBefore[0].description);
    await page.getByRole("tab", { name: "Treino B - Local mantido" }).click();
    await expect(descriptionInput(page)).toHaveValue("Segunda sessão já no rascunho");

    const draftOnly = await templateSaveObservation(page);
    expect(draftOnly.writes).toEqual([]);
    expect(draftOnly.rpcs).toEqual([]);
    expect(draftOnly.templates[0].source).toEqual(template);
    expect(await page.evaluate(() => (window as any).__workoutSaveFixture.getSaveCalls())).toEqual([]);
    expect(await page.evaluate(() => (window as any).__workoutSaveFixture.getCurrentRows())).toEqual(currentRows);
    expect(await page.evaluate(() => (window as any).__workoutSaveFixture.getCurrentWorkouts())).toEqual(persistedBefore);

    await saveAll(page);
    await expect(toastTitle(page, "Todos os treinos salvos!")).toBeVisible();
    const afterSave = await templateSaveObservation(page);
    const atomicSaves = afterSave.rpcs.filter(({ name }) => name === "replace_cycle_workout_revision");
    expect(atomicSaves).toHaveLength(1);
    expect(atomicSaves[0].params.p_expected_rows).toEqual(currentRows);
    const payload = atomicSaves[0].params.p_workouts;
    expect(payload.map((workout: any) => workout.title)).toEqual([
      "Treino A - Superior", "Treino B - Local mantido", ...template.workouts.map((workout: any) => workout.title),
    ]);
    expect(payload[0].description).toBe(persistedBefore[0].description);
    expect(payload[0].exercises).toEqual(
      persistedBefore[0].exercises.map((exercise: any) => {
        const prescription = { ...exercise };
        delete prescription.exercise_id;
        return expect.objectContaining(prescription);
      }),
    );
    expect(payload[1]).toMatchObject({ description: "Segunda sessão já no rascunho", exercises: [expect.objectContaining({ exercise_name: "Supino reto" })] });
    expect(payload[2]).toMatchObject({
      description: "Personalização somente da cópia",
      exercises: [expect.objectContaining({ exercise_name: "Supino reto", sets: "4", reps: "8", rest: "75s", notes: "Template" })],
    });
    expect(afterSave.templates[0].source).toEqual(template);
    const saved = await page.evaluate<any[]>(() => (window as any).__workoutSaveFixture.getCurrentWorkouts());
    expect(saved.map((workout) => workout.title)).toEqual(payload.map((workout: any) => workout.title));
    expect(saved.map((workout) => workout.exercises)).toEqual(payload.map((workout: any) => workout.exercises));
    await expect(page.getByRole("heading", { name: "Escolha qual versão deve permanecer" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await closeFixtureToast(page, "Todos os treinos salvos!");
    const screenshot = testInfo.outputPath(`template-add-saved-${viewport.width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach("template-add-saved", { path: screenshot, contentType: "image/png" });
    await expectNoFixtureLeak(guard);
  });
}

test("desktop save keeps returned ids/timestamps current for a second save in the same editor", async ({ page }) => {
  const guard = await openFixture(page, { width: 1440, height: 900 });
  const originalWorkouts = await page.evaluate<any[]>(() => (window as any).__workoutSaveFixture.getCurrentWorkouts());
  const originalLegacy = originalWorkouts[0].exercises[1];

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
  const currentWorkouts = await page.evaluate<any[]>(() => (window as any).__workoutSaveFixture.getCurrentWorkouts());
  const recoveryCalls = await page.evaluate<any[]>(() => (window as any).__workoutSaveFixture.getRecoveryCalls());
  expect(recoveryCalls).toHaveLength(1);
  expect(recoveryCalls[0].params).toEqual({
    p_company_id: "20000000-0000-4000-8000-000000000001",
    p_exercises: [{ name: originalLegacy.exercise_name, muscle_group: originalLegacy.muscle_group }],
  });
  expect(recoveryCalls[0].response).toMatchObject({ error: null, data: {
    ok: true, created_count: 1, actor_id: "10000000-0000-4000-8000-000000000001",
    company_id: "20000000-0000-4000-8000-000000000001",
  } });
  const canonicalId = recoveryCalls[0].response.data.mappings[0].exercise_id;
  expect(canonicalId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  expect(canonicalId).not.toBe(originalLegacy.exercise_id);
  expect(currentWorkouts[0].exercises[1]).toMatchObject({ ...originalLegacy, exercise_id: canonicalId });
  const catalog = await page.evaluate<any[]>(() => (window as any).__workoutSaveFixture.getLibraryExercises());
  expect(catalog.filter((exercise) => exercise.name === originalLegacy.exercise_name)).toEqual([
    expect.objectContaining({ id: canonicalId, is_global: false, description: null,
      company_id: "20000000-0000-4000-8000-000000000001" }),
  ]);

  await expectNoFixtureLeak(guard);
});

test("desktop save persists added and removed workouts with exact row count", async ({ page }) => {
  const guard = await openFixture(page, { width: 1366, height: 900 });

  await page.locator("[role='tablist']").locator("xpath=..").getByRole("button").click();
  await expect(page.getByRole("tab", { name: "Treino B" })).toBeVisible();
  await page.getByRole("tab", { name: "Treino B" }).click();
  await titleInput(page).fill("Treino B - Inferior");
  await descriptionInput(page).fill("Treino adicionado");

  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  const libraryDialog = page.getByRole("dialog", { name: "Biblioteca de exercícios" });
  await libraryDialog.getByTitle("Supino reto").click();
  await libraryDialog.getByRole("button", { name: "Ver treino completo" }).click();
  await expect(activeWorkoutPanel(page).getByText("Supino reto", { exact: true })).toBeVisible();

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
