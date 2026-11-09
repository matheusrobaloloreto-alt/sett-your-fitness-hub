import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });
test.setTimeout(120_000);

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`renewal policies, replacement and explicit clear at ${viewport.width}px`, async ({ page, baseURL }, testInfo) => {
    if (!baseURL) throw new Error("A local Playwright baseURL is required");
    const appOrigin = new URL(baseURL).origin;
    expect(["127.0.0.1", "localhost"]).toContain(new URL(baseURL).hostname);
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date("2026-09-09T15:00:00Z"));
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const user = { id: "user-renewal-qa", aud: "authenticated", app_metadata: {}, user_metadata: {} };
    await page.addInitScript((user) => {
      sessionStorage.setItem("sett-renewal-qa-session", JSON.stringify({
        access_token: "local-test-token", refresh_token: "local-test-refresh",
        expires_at: 1893456000, token_type: "bearer", user,
      }));
    }, user);
    let policy = "keep_until_replaced";
    let state: "waiting" | "published" | "cleared" = "waiting";
    const oldCycle = {
      id: "cycle-old", enrollment_id: "enrollment-old", student_id: "student-renewal-qa",
      company_id: "company-qa", cycle_number: 7, start_date: "2026-07-13", end_date: "2026-08-23",
      status: "completed", duration_weeks: 6, delivery_status: "viewed", prescription_cleared_at: null,
    };
    const newCycle = () => ({
      ...oldCycle, id: "cycle-new", enrollment_id: "enrollment-new", cycle_number: 1,
      start_date: "2026-09-09", end_date: "2026-10-20", status: "active",
      delivery_status: state === "waiting" ? "pending" : "sent",
      prescription_cleared_at: state === "cleared" ? "2026-09-09T14:00:00Z" : null,
    });
    const workout = (cycleId: string, title: string) => ({
      id: `workout-${cycleId}`, company_id: "company-qa", cycle_id: cycleId, title, name: title, description: null, sort_order: 0,
      exercises: [{ exercise_id: "exercise-qa", exercise_name: "Agachamento de teste", muscle_group: "pernas", sets: "3", reps: "10", rest: "60s" }],
    });
    const blockedRequests: string[] = [];
    const workoutReads: string[] = [];
    const policyReads: string[] = [];
    // Allow the local frontend and fulfill all supported backend traffic in the browser.
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const isRest = url.pathname.startsWith("/rest/v1/");
      if (url.origin === appOrigin && !isRest && !url.pathname.startsWith("/auth/v1/")) return route.continue();
      const block = () => {
        blockedRequests.push(`${request.method()} ${url.origin}${url.pathname}`);
        return route.abort();
      };
      if (!isRest || !["127.0.0.1", "localhost", "sett-qa-fixture.supabase.co"].includes(url.hostname)) return block();
      const headers = {
        "Access-Control-Allow-Origin": appOrigin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": request.headers()["access-control-request-headers"] || "authorization, apikey, content-type, prefer, x-client-info",
        "Access-Control-Expose-Headers": "Content-Range",
      };
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (request.headers().authorization !== "Bearer local-test-token") return block();

      const table = url.pathname.slice("/rest/v1/".length);
      let data: unknown;
      if (table === "rpc/get_user_role") data = "student";
      if (table === "company_members") data = [{ company_id: "company-qa" }];
      if (table === "rpc/get_company_workout_expiry_policy") {
        if (request.postDataJSON()?._company_id !== "company-qa") return block();
        policyReads.push(policy);
        data = { company_id: "company-qa", version: 1, expired_workout_behavior: policy };
      }
      if (table === "rpc/record_app_performance_sample") data = null;
      if (table === "exercise_library") data = [];
      if (table === "students") data = { id: "student-renewal-qa", user_id: user.id, full_name: "Aluno de teste", company_id: "company-qa", status: "active" };
      if (table === "enrollments") data = [{
        id: "enrollment-new", student_id: "student-renewal-qa", company_id: "company-qa",
        start_date: "2026-09-09", end_date: "2027-02-23", training_start_date: "2026-09-09",
        status: "active", plan_id: "plan-qa",
        plans: { name: "Plano 24 semanas", duration_days: 168, duration_weeks: 24, cycle_duration_days: 42 },
        carried_over_cycle_id: "cycle-old",
      }];
      if (table === "training_cycles") {
        if (url.searchParams.get("id") === "eq.cycle-old") data = [oldCycle];
        else data = [newCycle(), {
          ...newCycle(), id: "cycle-next", cycle_number: 2,
          start_date: "2026-10-21", end_date: "2026-12-01", status: "pending",
          delivery_status: "pending", prescription_cleared_at: null,
        }];
      }
      if (table === "workouts") {
        const cycleFilter = url.searchParams.get("cycle_id") || "";
        workoutReads.push(cycleFilter);
        // Keep the published row available in the mock after clear, so the app
        // must exclude the cleared cycle rather than rely on missing data.
        data = [workout("cycle-old", "Treino anterior publicado"), ...(state !== "waiting" ? [workout("cycle-new", "Treino novo publicado")] : [])]
          .filter((row) => cycleFilter.startsWith("in.(") && cycleFilter.slice(4, -1).split(",").includes(row.cycle_id));
      }
      if (data === undefined) return block();
      await route.fulfill({
        status: 200, contentType: "application/json", body: JSON.stringify(data),
        headers: {
          ...headers,
          ...(Array.isArray(data) && request.headers().prefer?.includes("count=exact")
            ? { "Content-Range": data.length ? `0-${data.length - 1}/${data.length}` : "*/0" } : {}),
        },
      });
    });
    const previousWorkout = page.getByRole("heading", { name: "Treino anterior publicado" });
    const replacementWorkout = page.getByRole("heading", { name: "Treino novo publicado" });
    const awaitingPrescription = page.getByText("Aguardando nova prescrição.");
    const retained = page.getByText("Mantido até substituição. O período original permanece encerrado.");

    await test.step("keep policy carries the old prescription into the renewed plan", async () => {
      await page.goto("/qa/renewal-continuity-fixture.html");
      await expect(previousWorkout).toBeVisible();
      await expect(retained).toBeVisible();
      await expect(page.getByText("Agachamento de teste")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await page.screenshot({ path: testInfo.outputPath("renewed-before-publication.png"), fullPage: true });
    });

    await test.step("hide policy blocks automatic carry-over and leaves explicit history", async () => {
      policy = "hide_on_expiry";
      await page.reload();
      await expect(awaitingPrescription).toBeVisible();
      await expect(previousWorkout).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath("hide-on-expiry.png"), fullPage: true });
      await page.getByRole("button", { name: "Consultar histórico" }).click();
      await expect(previousWorkout).toBeVisible();
      await expect(page.getByText(/Histórico — somente consulta/)).toBeVisible();
      await page.getByRole("button", { name: "Voltar à prescrição atual" }).click();
      await expect(awaitingPrescription).toBeVisible();
      await expect(previousWorkout).toHaveCount(0);
    });

    await test.step("publication replaces the old prescription and keep retains the new one", async () => {
      state = "published";
      await page.reload();
      await expect(replacementWorkout).toBeVisible();
      await expect(previousWorkout).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath("renewed-after-publication.png"), fullPage: true });

      policy = "keep_until_replaced";
      await page.clock.setFixedTime(new Date("2026-11-05T15:00:00Z"));
      await page.reload();
      await expect(replacementWorkout).toBeVisible();
      await expect(retained).toBeVisible();
      await expect(previousWorkout).toHaveCount(0);
    });

    await test.step("explicit clear blocks fallback even with keep and both workouts stored", async () => {
      state = "cleared";
      const readsBeforeClear = workoutReads.length;
      await page.clock.setFixedTime(new Date("2026-09-09T15:00:00Z"));
      await page.reload();
      await expect(page.getByText("Treino ainda não prescrito para este ciclo.")).toBeVisible();
      await expect(previousWorkout).toHaveCount(0);
      await expect(replacementWorkout).toHaveCount(0);
      const clearReads = workoutReads.slice(readsBeforeClear);
      expect(clearReads.length).toBeGreaterThan(0);
      expect(clearReads.every((filter) => !filter.includes("cycle-new"))).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("explicit-clear.png"), fullPage: true });
    });
    expect(policyReads).toEqual(expect.arrayContaining(["keep_until_replaced", "hide_on_expiry"]));
    expect(blockedRequests).toEqual([]);
    expect(errors).toEqual([]);
    await testInfo.attach("synthetic-backend", {
      body: JSON.stringify({ policyReads, workoutReads, blockedRequests }, null, 2),
      contentType: "application/json",
    });
  });
}
