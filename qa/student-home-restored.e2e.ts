import { expect, test } from "@playwright/test";

test("student home shows ranking and a compact two-column icon index", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/qa/student-home-restored-fixture.html");

  await expect(page.getByRole("region", { name: "Ranking do mês" })).toBeVisible();
  const destinations = page.getByRole("list", { name: "Destinos do portal do aluno" });
  const buttons = destinations.getByRole("button");
  expect(await buttons.count()).toBeGreaterThanOrEqual(8);

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
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.getByRole("button", { name: /^Estatísticas:/i }).click();
  await expect(page.locator("[data-destination]")).toHaveAttribute("data-destination", "stats");
});
