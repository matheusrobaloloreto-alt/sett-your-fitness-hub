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

  await expect(button).toHaveAttribute("data-dragging", "true");
  await expect(button).toHaveAttribute("data-drag-direction", "running-left");
  await expect(button.locator('[data-benito-state="running-left"]')).toHaveCount(1);
  const movedBox = await button.boundingBox();
  expect(movedBox!.x).toBeLessThan(box!.x - 80);

  await page.mouse.up();
  await expect(button).toHaveAttribute("data-dragging", "false");
  await expect(button).toHaveAttribute("data-drag-direction", "idle");
  await expect(page.locator("[data-open-count]" )).toHaveAttribute("data-open-count", "0");

  await button.click();
  await expect(page.locator("[data-open-count]" )).toHaveAttribute("data-open-count", "1");
});

test("student Benito persists and reclamps after viewport resize without opening chat", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/qa/student-benito-drag-fixture.html");
  const button = page.getByRole("button", { name: "Abrir Benito" });
  const box = await button.boundingBox();
  expect(box).toBeTruthy();

  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await button.dispatchEvent("pointerdown", { pointerId: 41, pointerType: "touch", isPrimary: true, button: 0, clientX: startX, clientY: startY });
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 41, pointerType: "touch", isPrimary: true, buttons: 1, clientX: x - 220, clientY: y - 300, bubbles: true, cancelable: true }));
  }, { x: startX, y: startY });
  await expect(button).toHaveAttribute("data-drag-direction", "running-left");
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 41, pointerType: "touch", isPrimary: true, clientX: x - 220, clientY: y - 300, bubbles: true }));
  }, { x: startX, y: startY });
  await expect(button).toHaveAttribute("data-dragging", "false");
  await expect(page.locator("[data-open-count]")).toHaveAttribute("data-open-count", "0");

  const beforeReload = {
    x: await button.getAttribute("data-drag-x"),
    y: await button.getAttribute("data-drag-y"),
  };
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("student-benito-position-v2") || "null"));
  expect(stored).toMatchObject({ version: 2 });
  await page.reload();
  await expect(button).toHaveAttribute("data-drag-x", beforeReload.x!);
  await expect(button).toHaveAttribute("data-drag-y", beforeReload.y!);

  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(50);
  const resized = await button.boundingBox();
  expect(resized).toBeTruthy();
  expect(resized!.x).toBeGreaterThanOrEqual(7);
  expect(resized!.y).toBeGreaterThanOrEqual(7);
  expect(resized!.x + resized!.width).toBeLessThanOrEqual(313);
  expect(resized!.y + resized!.height).toBeLessThanOrEqual(561);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const afterScroll = await button.boundingBox();
  expect(afterScroll!.y).toBeGreaterThanOrEqual(7);
  expect(afterScroll!.y + afterScroll!.height).toBeLessThanOrEqual(561);
});
