import { expect, test } from "@playwright/test";
import { backendOrigin, createLinenPortalFixture, fixtureTime, userId } from "./student-linen-portal-fixture";

const legacyKey = "sb-sett-current-auth-token";
const currentKey = "sb-sett-qa-fixture-auth-token";

test.use({ colorScheme: "light", serviceWorkers: "block" });
test.skip(process.env.SETT_COMPILED_AUTH_FIXTURE !== "1", "Requires the isolated Vite build with the synthetic Supabase origin");

for (const variant of ["legacy", "canonical", "expired", "foreign"] as const) {
  test(`compiled portal reads ${variant} storage and paints the first theme correctly`, async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    expect(["127.0.0.1", "localhost"]).toContain(new URL(origin).hostname);
    const fixture = createLinenPortalFixture("published");
    await fixture.install(page.context(), origin);
    await page.clock.setFixedTime(Date.parse(fixtureTime));
    const seed = variant === "canonical" ? currentKey : legacyKey;
    const auth = { ...fixture.auth };
    if (variant === "expired" || variant === "foreign") {
      const [head, payload, signature] = auth.access_token.split(".");
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
      if (variant === "expired") auth.expires_at = claims.exp = Math.floor(Date.parse(fixtureTime) / 1000) - 1;
      if (variant === "foreign") claims.iss = backendOrigin.replace("sett-qa-fixture", "another-fixture") + "/auth/v1";
      auth.access_token = `${head}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${signature}`;
    }
    await page.addInitScript(({ expectedOrigin, seed, raw, userId }) => {
      if (location.origin !== expectedOrigin) return;
      if (sessionStorage.getItem("sett-fixture-seeded") !== "1") {
        sessionStorage.setItem("sett-fixture-seeded", "1");
        localStorage.setItem(seed, raw);
        localStorage.setItem(`sett-personal-theme-mode:user:${userId}`, "dark");
        localStorage.setItem("sett-personal-theme-mode:anonymous", "light");
      }
      new MutationObserver((_, observer) => {
        const theme = document.documentElement?.dataset.themeMode;
        if (theme) {
          document.documentElement.setAttribute("data-fixture-first-theme", theme);
          observer.disconnect();
        }
      }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-theme-mode"] });
    }, { expectedOrigin: origin, seed, raw: JSON.stringify(auth), userId });

    await page.goto("/aluno");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-fixture-first-theme", variant === "foreign" ? "light" : "dark");
    if (variant === "foreign") {
      await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
      expect(await page.evaluate((key) => localStorage.getItem(key), currentKey)).toBeNull();
    } else {
      const dock = page.getByRole("navigation", { name: "Navegação do aluno" });
      await expect(dock).toBeVisible();
      expect(fixture.state.authRefreshes).toBe(variant === "expired" ? 1 : 0);
      await expect(html).toHaveAttribute("data-theme-mode", "dark");
      expect(await page.evaluate((key) => Boolean(localStorage.getItem(key)), currentKey)).toBe(true);
      expect(await page.evaluate((key) => localStorage.getItem(key), legacyKey)).toBeNull();
      await page.reload();
      await expect(dock).toBeVisible();
      await expect(html).toHaveAttribute("data-fixture-first-theme", "dark");
    }
    expect(fixture.state.unexpectedRequests).toEqual([]);
  });
}
