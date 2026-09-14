import { expect, test } from "@playwright/test";

test("workout save gate allows non-critical warnings and surfaces critical fixes", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/qa/workout-save-gate-fixture.html");
  await page.getByRole("button", { name: "Aviso de volume" }).click();
  await page.getByRole("button", { name: "Salvar Tudo" }).click();
  await expect(page.getByRole("status")).toHaveText("Treino salvo com aviso não crítico.");
  await expect(page.getByTestId("workout-save-gate-panel")).toHaveCount(0);

  await page.getByRole("button", { name: "Erro crítico" }).click();
  await page.getByRole("button", { name: "Salvar Tudo" }).click();
  await expect(page.getByTestId("workout-save-gate-panel")).toBeVisible();
  await expect(page.getByText("está sem ID de exercício da biblioteca")).toBeVisible();
  await page.getByRole("button", { name: "Corrigir" }).click();
  await expect(page.getByRole("dialog", { name: "Biblioteca de exercícios" })).toBeVisible();
  await expect(page.getByLabel("Buscar exercício")).toHaveValue("Exercício importado sem vínculo");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("workout-save-gate-mobile.png"), fullPage: true });
  expect(errors).toEqual([]);
});
