import { expect, test } from "@playwright/test";
import { SUPABASE_AUTH_STORAGE_KEY } from "../src/lib/supabaseAuthStorage";

test("personal theme starts from the device scheme and toggles without mobile overflow", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/qa/personal-theme-fixture.html");

  await expect(page.locator("html")).toHaveAttribute("data-theme-mode", "dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("button", { name: "Alternar para tema claro" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Escuro" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.getByRole("button", { name: "Alternar para tema claro" }).click();

  await expect(page.locator("html")).toHaveAttribute("data-theme-mode", "light");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(page.getByRole("button", { name: "Alternar para tema escuro" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Claro" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("meta[name='theme-color']")).toHaveAttribute("content", "#1D2D5C");
  expect(await page.evaluate(() => localStorage.getItem("sett-personal-theme-mode:user:student-theme-fixture"))).toBe("light");
  expect(await page.evaluate(() => localStorage.getItem("sett-personal-theme-mode"))).toBeNull();
  expect(consoleErrors).toEqual([]);
});

test("saved personal theme wins on desktop and keeps themed surfaces readable", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((authStorageKey) => {
    localStorage.setItem("sett-personal-theme-mode:anonymous", "light");
    localStorage.setItem("sett-personal-theme-mode:user:old-project-user", "light");
    localStorage.setItem("sett-personal-theme-mode:user:student-theme-fixture", "dark");
    localStorage.setItem("sb-oldproject-auth-token", JSON.stringify({
      user: { id: "old-project-user" },
    }));
    localStorage.setItem(authStorageKey, JSON.stringify({
      access_token: "redacted-fixture",
      refresh_token: "redacted-fixture",
      user: { id: "student-theme-fixture" },
    }));
  }, SUPABASE_AUTH_STORAGE_KEY);
  await page.goto("/qa/personal-theme-fixture.html");

  await expect(page.locator("html")).toHaveAttribute("data-theme-mode", "dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("heading", { name: "Treino A" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tema pessoal" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  expect(await page.locator("body").evaluate((body) => getComputedStyle(body).backgroundColor)).not.toBe("rgb(250, 250, 247)");
  expect(consoleErrors).toEqual([]);
});
