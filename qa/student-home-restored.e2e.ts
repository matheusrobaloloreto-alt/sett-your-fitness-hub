import { expect, test } from "@playwright/test";

test("student home shows one tracking list below the workout and goal", async ({ page }) => {
  const destinations = [
    { label: /^Calendário/, view: "calendario" },
    { label: /^Estatísticas/, view: "stats" },
    { label: /^Integrações/, view: "integracoes" },
  ];

  for (const viewport of [{ width: 320, height: 700 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/qa/student-home-restored-fixture.html");

    const workout = page.getByRole("button", { name: "Abrir treino", exact: true });
    const cycle = page.getByRole("heading", { name: "Ciclo 3 · Semana 2" });
    const goal = page.getByRole("heading", { name: "Meta semanal" });
    const tracking = page.getByRole("navigation", { name: "Acompanhamento" });
    const ranking = page.getByRole("region", { name: "Ranking do mês" });
    const buttons = tracking.getByRole("button");
    const route = page.locator("[data-destination]");

    await expect(cycle).toBeVisible();
    await expect(page.getByText("1 de 4 semanas")).toBeVisible();
    await expect(page.getByText("2 de 3 treinos")).toBeVisible();
    await expect(page.getByText("Plano teste")).toBeVisible();
    await expect(buttons).toHaveCount(3);
    await expect(page.getByText("Explorar")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);

    let previousY = -1;
    for (const element of [workout, cycle, goal, tracking, ranking]) {
      const box = await element.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.y).toBeGreaterThan(previousY);
      previousY = box!.y;
    }

    await workout.click();
    await expect(route).toHaveAttribute("data-destination", "treino");
    await expect(route).toHaveAttribute("data-workout-id", "workout-a");

    await page.getByRole("button", { name: "Editar meta" }).click();
    await expect(route).toHaveAttribute("data-destination", "editar-meta");

    for (const [index, { label, view }] of destinations.entries()) {
      await expect(buttons.nth(index)).toHaveAccessibleName(label);
      await buttons.nth(index).click();
      await expect(route).toHaveAttribute("data-destination", view);
    }
  }
});
