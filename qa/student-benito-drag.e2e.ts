import { expect, test } from "@playwright/test";

test("student Benito keeps dragging outside the button and animates in the movement direction", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/qa/student-benito-drag-fixture.html");

  const button = page.getByRole("button", { name: "Abrir Benito" });
  const box = await button.boundingBox();
  expect(box).toBeTruthy();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 110, startY - 12, { steps: 4 });

  await expect(button).toHaveAttribute("data-drag-direction", "running-left");
  await expect(button.locator('[data-benito-state="running-left"]')).toHaveCount(1);
  const movedBox = await button.boundingBox();
  expect(movedBox!.x).toBeLessThan(box!.x - 80);

  await page.mouse.up();
  await expect(button).toHaveAttribute("data-drag-direction", "idle");
  await expect(page.locator("[data-open-count]" )).toHaveAttribute("data-open-count", "0");

  await button.click();
  await expect(page.locator("[data-open-count]" )).toHaveAttribute("data-open-count", "1");
});
