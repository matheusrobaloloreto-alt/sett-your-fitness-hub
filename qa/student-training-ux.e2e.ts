import { expect, test } from "@playwright/test";

test("student mobile training shell keeps compact actions, accordion state and lazy warmup previews", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/qa/student-training-ux-fixture.html");

  const header = page.locator('header[data-mobile-layout="compact"]');
  const headerBox = await header.boundingBox();
  expect(headerBox).toBeTruthy();
  expect(headerBox!.height).toBeLessThanOrEqual(96);
  await expect(page.getByText("Matheus Loreto Teste de Nome Completo")).toBeVisible();
  for (const actionName of ["Avisos", "Sair"]) {
    const box = await page.getByRole("button", { name: actionName }).boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  const firstGroup = page.getByRole("button", { name: /Bloco 1.*Bi-set/ });
  const secondGroup = page.getByRole("button", { name: /Bloco 2.*Circuito/ });
  await expect(firstGroup).toHaveAttribute("aria-expanded", "true");
  await expect(secondGroup).toHaveAttribute("aria-expanded", "false");
  const firstCheck = page.getByRole("checkbox", { name: "Concluir primeira série" });
  await firstCheck.check();
  await firstGroup.click();
  await expect(firstGroup).toHaveAttribute("aria-expanded", "false");
  await firstGroup.press("Enter");
  await expect(firstCheck).toBeChecked();
  await expect(page.getByText("Levantamento terra romeno")).toBeVisible();

  await page.getByRole("button", { name: "Prepare-se" }).click();
  const warmupDialog = page.getByRole("dialog", { name: "Prepare-se para o treino" });
  await expect(page.getByRole("heading", { name: "Demonstrações do aquecimento" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Assistir demonstração de Agachamento livre (air squat)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Assistir demonstração de Flexão de braço" })).toBeVisible();
  await expect(warmupDialog.getByRole("button", { name: /Agachamento goblet|Supino com halteres/i })).toHaveCount(0);
  await expect(page.getByText("Vídeo indisponível para este item").first()).toBeVisible();
  await expect(page.locator("video, iframe")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
