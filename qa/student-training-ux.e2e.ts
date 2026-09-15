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

for (const width of [320, 360, 390]) {
  test(`student exercise load grid stays inside the ${width}px viewport`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/qa/student-training-ux-fixture.html");
    await expect(page.getByText("Agachamento com carga")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(errors.filter((message) => !message.includes("Download the React DevTools"))).toEqual([]);
  });
}

test("warmup video returns to the checked movement on mobile and desktop", async ({ page }) => {
  await page.route("https://example.test/**", route => route.fulfill({ status: 200, contentType: "video/mp4", body: "" }));
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/qa/student-training-ux-fixture.html");
    await page.getByRole("button", { name: "Prepare-se" }).click();
    const movement = page.getByRole("button", { name: "Agachamento livre — 2×10", exact: true });
    await movement.click();
    await expect(movement).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Assistir demonstração de Agachamento livre (air squat)" }).click();
    await expect(page.locator("video")).toHaveAttribute("src", "https://example.test/air-squat.mp4");
    await page.getByRole("button", { name: "Voltar ao aquecimento" }).click();
    await expect(movement).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Assistir demonstração de Agachamento livre (air squat)" }).click();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(movement).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("dialog", { name: "Prepare-se para o treino" })).toBeVisible();
    await page.screenshot({ path: `output/playwright/student-warmup-${viewport.width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  }
});
