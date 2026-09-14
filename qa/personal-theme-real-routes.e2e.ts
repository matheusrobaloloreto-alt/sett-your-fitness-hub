import { expect, type Page, test } from "@playwright/test";
import { SUPABASE_AUTH_STORAGE_KEY } from "../src/lib/supabaseAuthStorage";

const AUTH_STORAGE_KEY = SUPABASE_AUTH_STORAGE_KEY;
const COMPANY_ID = "company-theme-real-route";

type MockRole = "admin" | "student";

function mockedJwt(userId: string, role: MockRole) {
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return [
    encode({ alg: "none", typ: "JWT" }),
    encode({
      aud: "authenticated",
      exp: 4_102_444_800,
      sub: userId,
      email: `${role}@theme.local`,
      role: "authenticated",
    }),
    "fixture",
  ].join(".");
}

async function seedLocalSession(page: Page, userId: string, role: MockRole) {
  await page.addInitScript(({ storageKey, id, userRole }) => {
    const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    const token = [
      encode({ alg: "none", typ: "JWT" }),
      encode({
        aud: "authenticated",
        exp: 4_102_444_800,
        sub: id,
        email: `${userRole}@theme.local`,
        role: "authenticated",
      }),
      "fixture",
    ].join(".");
    localStorage.setItem(storageKey, JSON.stringify({
      access_token: token,
      refresh_token: `refresh-${id}`,
      expires_at: 4_102_444_800,
      expires_in: 3_600,
      token_type: "bearer",
      user: {
        id,
        aud: "authenticated",
        role: "authenticated",
        email: `${userRole}@theme.local`,
      },
    }));
  }, { storageKey: AUTH_STORAGE_KEY, id: userId, userRole: role });
}

async function mockSupabase(page: Page, role: MockRole, userId: string) {
  const user = {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email: `${role}@theme.local`,
  };
  const accessToken = mockedJwt(userId, role);
  const platformSettings = {
    id: "platform-theme-real-route",
    primary_color: "#1D2D5C",
    background_color: "#FAFAF7",
    card_color: "#F2F0EA",
    text_color: "#0A0A0A",
    platform_title: "SETT Theme Mock",
    logo_url: null,
    layout_style: "classico",
    company_id: COMPANY_ID,
  };
  const student = {
    id: "student-theme-real-route",
    user_id: userId,
    full_name: "Aluno Tema Mock",
    company_id: COMPANY_ID,
    weekly_workout_goal: 3,
    gender: "male",
  };
  const member = {
    company_id: COMPANY_ID,
    companies: { tier: "advanced" },
  };

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.hostname.endsWith("supabase.co")) {
      await route.continue();
      return;
    }

    const acceptsObject = request.headers().accept?.includes("vnd.pgrst.object+json") ?? false;
    const path = url.pathname;
    const json = async (value: unknown, status = 200) => {
      await route.fulfill({ status, json: value });
    };

    if (path.includes("/auth/v1/token")) {
      await json({
        access_token: accessToken,
        refresh_token: `refresh-${userId}`,
        expires_at: 4_102_444_800,
        expires_in: 3_600,
        token_type: "bearer",
        user,
      });
      return;
    }

    if (path.includes("/auth/v1/user")) {
      await json(user);
      return;
    }

    if (path.endsWith("/rest/v1/rpc/get_user_role")) {
      await json(role);
      return;
    }

    if (
      path.endsWith("/rest/v1/rpc/get_active_platform_ads") ||
      path.endsWith("/rest/v1/rpc/mark_training_cycle_viewed") ||
      path.endsWith("/rest/v1/rpc/record_app_performance_sample")
    ) {
      await json(path.endsWith("/rest/v1/rpc/get_active_platform_ads") ? [] : null);
      return;
    }

    if (path.endsWith("/rest/v1/rpc/get_company_ai_identity")) {
      await json(null);
      return;
    }

    if (path.endsWith("/rest/v1/staff_sessions")) {
      if (request.method() === "POST") {
        await json([{ id: "staff-session-theme-real-route" }], 201);
        return;
      }
      await json(null, 204);
      return;
    }

    if (path.endsWith("/rest/v1/company_members")) {
      await json(acceptsObject ? member : [member]);
      return;
    }

    if (path.endsWith("/rest/v1/students")) {
      await json(acceptsObject ? student : [student]);
      return;
    }

    if (path.endsWith("/rest/v1/platform_settings")) {
      await json(acceptsObject ? platformSettings : [platformSettings]);
      return;
    }

    if (path.endsWith("/rest/v1/student_anamneses")) {
      await json(null);
      return;
    }

    if (
      path.endsWith("/rest/v1/announcements") ||
      path.endsWith("/rest/v1/announcement_reads") ||
      path.endsWith("/rest/v1/student_goals") ||
      path.endsWith("/rest/v1/nutrition_plans") ||
      path.endsWith("/rest/v1/running_plans") ||
      path.endsWith("/rest/v1/enrollments") ||
      path.endsWith("/rest/v1/exercise_library") ||
      path.endsWith("/rest/v1/workout_logs") ||
      path.endsWith("/rest/v1/workout_sessions") ||
      path.endsWith("/rest/v1/workout_feedback") ||
      path.endsWith("/rest/v1/role_permissions") ||
      path.endsWith("/rest/v1/user_roles") ||
      path.endsWith("/rest/v1/company_ai_config")
    ) {
      await json(acceptsObject ? null : []);
      return;
    }

    await json([]);
  });
}

test("student portal uses the authenticated user's personal theme key on the real /aluno route", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 390, height: 844 });
  await seedLocalSession(page, "student-real-theme-user", "student");
  await mockSupabase(page, "student", "student-real-theme-user");
  await page.goto("/aluno");

  await expect(page.getByRole("heading", { name: "MEU TREINO" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Avisos$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Alternar para tema claro" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme-mode", "dark");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: test.info().outputPath("student-dark.png"), fullPage: true });

  await page.getByRole("button", { name: "Alternar para tema claro" }).click();

  await expect(page.locator("html")).toHaveAttribute("data-theme-mode", "light");
  expect(await page.evaluate(() => localStorage.getItem("sett-personal-theme-mode:user:student-real-theme-user"))).toBe("light");
  expect(await page.evaluate(() => localStorage.getItem("sett-personal-theme-mode"))).toBeNull();
  await page.screenshot({ path: test.info().outputPath("student-light.png"), fullPage: true });
  expect(consoleErrors).toEqual([]);
});

test("appearance settings exposes the personal theme control on the real admin route", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.emulateMedia({ colorScheme: "light" });
  await seedLocalSession(page, "admin-real-theme-user", "admin");
  await mockSupabase(page, "admin", "admin-real-theme-user");
  await page.goto("/admin/appearance");

  await expect(page.getByRole("heading", { name: "APARÊNCIA" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tema pessoal" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("appearance-light.png"), fullPage: true });
  await page.getByRole("button", { name: "Escuro" }).click();

  await expect(page.locator("html")).toHaveAttribute("data-theme-mode", "dark");
  await expect(page.getByRole("button", { name: "Escuro" })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: test.info().outputPath("appearance-dark.png"), fullPage: true });
  expect(await page.evaluate(() => localStorage.getItem("sett-personal-theme-mode:user:admin-real-theme-user"))).toBe("dark");
  expect(await page.evaluate(() => localStorage.getItem("sett-personal-theme-mode"))).toBeNull();
  expect(consoleErrors).toEqual([]);
});
