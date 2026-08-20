import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

const screenshotPath = resolve(process.cwd(), "docs/qa/benito-v2/mobile-390x844.png");

test("Benito v2 remains legible in a 390x844 assistant layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/qa/benito-mobile-fixture.html");

  const cards = page.locator(".state");
  await expect(cards).toHaveCount(9);
  await expect(page.locator(".assistant")).toBeInViewport();
  await expect(page.locator(".fab")).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.locator("[data-benito-frame]")).toHaveCount(11);

  for (const sprite of await page.locator("[data-benito-state]").all()) {
    const box = await sprite.boundingBox();
    expect(box?.width).toBe(42);
    expect(box?.height).toBeGreaterThan(45);
  }

  await page.screenshot({ path: screenshotPath, fullPage: false });
});
