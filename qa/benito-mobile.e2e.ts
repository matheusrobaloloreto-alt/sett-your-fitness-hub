import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

const screenshotPath = resolve(process.cwd(), "docs/qa/benito-v2/mobile-390x844.png");
const desktopScreenshotPath = resolve(process.cwd(), "docs/qa/benito-v2/desktop-1440x900.png");

test.use({ deviceScaleFactor: 2 });

test("Benito v2 remains legible in a 390x844 assistant layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/qa/benito-mobile-fixture.html");

  const cards = page.locator(".state");
  await expect(cards).toHaveCount(9);
  await expect(page.locator(".assistant")).toBeInViewport();
  const professorFab = page.locator('[data-role="professor"]');
  const studentFab = page.locator('[data-role="student"]');
  for (const fab of [professorFab, studentFab]) {
    await expect(fab).toBeInViewport();
    await expect(fab).toHaveCSS("width", "76px");
    await expect(fab).toHaveCSS("height", "76px");
    await expect(fab).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(fab).toHaveCSS("box-shadow", "none");
    await expect(fab).toHaveCSS("border-top-width", "0px");
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.locator("[data-benito-frame]")).toHaveCount(12);
  await expect(page.locator('[data-benito-atlas="full"]')).toHaveCount(12);

  const spriteResources = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => name.includes("/pets/benito-v2/spritesheet")),
  );
  expect(spriteResources.some((name) => name.endsWith("spritesheet-compact.webp"))).toBe(true);
  expect(spriteResources.some((name) => name.endsWith("/spritesheet.webp"))).toBe(true);

  for (const sprite of await page.locator("[data-benito-state]").all()) {
    const box = await sprite.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(52);
    expect(box?.height).toBeGreaterThan(56);
  }

  await page.screenshot({ path: screenshotPath, fullPage: false });

  await page.goto("/qa/benito-mobile-fixture.html?animation=run");
  const animatedSprite = page.locator('.assistant [data-benito-state="processing"]');
  await expect(animatedSprite.locator("[data-benito-frame]")).toHaveAttribute(
    "data-benito-frame",
    "0",
  );
  await expect
    .poll(
      () => animatedSprite.locator("[data-benito-frame]").getAttribute("data-benito-frame"),
      { timeout: 1_500 },
    )
    .not.toBe("0");
});

test("Benito v2 stays chromeless and Retina-sharp on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/qa/benito-mobile-fixture.html");

  for (const fab of [page.locator('[data-role="professor"]'), page.locator('[data-role="student"]')]) {
    await expect(fab).toHaveCSS("width", "76px");
    await expect(fab).toHaveCSS("height", "76px");
    await expect(fab).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(fab).toHaveCSS("border-top-width", "0px");
    await expect(fab.locator('[data-benito-atlas="full"]')).toHaveCount(1);
  }

  const resources = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((entry) => entry.name.includes("/pets/benito-v2/spritesheet"))
      .map((entry) => ({ name: entry.name, startTime: entry.startTime })),
  );
  const compact = resources.find((entry) => entry.name.endsWith("spritesheet-compact.webp"));
  const full = resources.find((entry) => entry.name.endsWith("/spritesheet.webp"));
  expect(compact).toBeTruthy();
  expect(full).toBeTruthy();
  expect(full!.startTime).toBeGreaterThanOrEqual(compact!.startTime);

  await page.screenshot({ path: desktopScreenshotPath, fullPage: false });
});
