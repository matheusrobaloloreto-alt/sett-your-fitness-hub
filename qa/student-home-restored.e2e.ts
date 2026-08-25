import { expect, test } from "@playwright/test";

test("student home shows the exact compact index at phone and desktop widths", async ({ page }) => {
  const expectedLabels = [
    "Treino",
    "Corrida",
    "Ciclismo",
    "Natação",
    "Dicas nutricionais",
    "Estatísticas",
    "Calendário",
    "Integrações",
  ];

  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/qa/student-home-restored-fixture.html");

    await expect(page.getByRole("region", { name: "Ranking do mês" })).toBeVisible();
    const destinations = page.getByRole("list", { name: "Destinos do portal do aluno" });
    const buttons = destinations.getByRole("button");
    await expect(buttons).toHaveCount(8);
    for (const [index, label] of expectedLabels.entries()) {
      await expect(buttons.nth(index)).toHaveAccessibleName(new RegExp(`^${label}:`));
    }
    await expect(destinations.getByRole("button", { name: /^Histórico:/i })).toHaveCount(0);

    const first = await buttons.nth(0).boundingBox();
    const second = await buttons.nth(1).boundingBox();
    const third = await buttons.nth(2).boundingBox();
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(third).toBeTruthy();
    expect(Math.abs(first!.y - second!.y)).toBeLessThan(2);
    expect(third!.y).toBeGreaterThan(first!.y + first!.height - 2);

    for (let index = 0; index < await buttons.count(); index += 1) {
      await expect(buttons.nth(index).locator("svg").first()).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);

    await page.getByRole("button", { name: /^Estatísticas:/i }).click();
    await expect(page.locator("[data-destination]")).toHaveAttribute("data-destination", "stats");
  }
});
