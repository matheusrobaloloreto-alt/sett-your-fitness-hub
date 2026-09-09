import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`renewal preserves the published workout until replacement at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date("2026-09-09T15:00:00Z"));
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let state: "waiting" | "published" | "cleared" = "waiting";
    const oldCycle = {
      id: "cycle-old", enrollment_id: "enrollment-old", student_id: "student-renewal-qa",
      company_id: "company-qa", cycle_number: 7, start_date: "2026-07-13", end_date: "2026-08-23",
      status: "completed", duration_weeks: 6, delivery_status: "viewed", prescription_cleared_at: null,
    };
    const newCycle = () => ({
      ...oldCycle, id: "cycle-new", enrollment_id: "enrollment-new", cycle_number: 1,
      start_date: "2026-09-09", end_date: "2026-10-20", status: "active",
      delivery_status: state === "published" ? "sent" : "pending",
      prescription_cleared_at: state === "cleared" ? "2026-09-09T14:00:00Z" : null,
    });
    const workout = (cycleId: string, title: string) => ({
      id: `workout-${cycleId}`, cycle_id: cycleId, title, name: title, description: null, sort_order: 0,
      exercises: [{ exercise_id: "exercise-qa", exercise_name: "Agachamento de teste", muscle_group: "pernas", sets: "3", reps: "10", rest: "60s" }],
    });
    // Only synthetic data is served; no request reaches the live backend.
    await page.route("https://*.supabase.co/**", async (route) => {
      const url = new URL(route.request().url());
      const table = url.pathname.split("/").pop();
      let data: unknown = [];
      if (table === "students") data = { full_name: "Aluno de teste", company_id: "company-qa" };
      if (table === "enrollments") data = [{
        id: "enrollment-new", student_id: "student-renewal-qa", company_id: "company-qa",
        start_date: "2026-09-09", end_date: "2027-02-23", training_start_date: "2026-09-09",
        status: "active", plan_id: "plan-qa",
        plans: { name: "Plano 24 semanas", duration_days: 168, duration_weeks: 24, cycle_duration_days: 42 },
        carried_over_cycle_id: "cycle-old",
      }];
      if (table === "training_cycles") {
        if (url.searchParams.get("id") === "eq.cycle-old") data = oldCycle;
        else if (url.searchParams.has("or") || url.searchParams.get("id")?.startsWith("in.")) data = [newCycle(), oldCycle];
        else data = [newCycle(), {
          ...newCycle(), id: "cycle-next", cycle_number: 2,
          start_date: "2026-10-21", end_date: "2026-12-01", status: "pending",
          delivery_status: "pending", prescription_cleared_at: null,
        }];
      }
      if (table === "workouts") {
        const cycleFilter = url.searchParams.get("cycle_id") || "";
        data = [workout("cycle-old", "Treino anterior publicado"), ...(state === "published" ? [workout("cycle-new", "Treino novo publicado")] : [])]
          .filter((row) => cycleFilter.includes(row.cycle_id));
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
    });
    await page.goto("/qa/renewal-continuity-fixture.html");
    await expect(page.getByRole("heading", { name: "Treino anterior publicado" })).toBeVisible();
    await expect(page.getByText("Agachamento de teste")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: testInfo.outputPath("renewed-before-publication.png"), fullPage: true });

    state = "published";
    await page.reload();
    await expect(page.getByRole("heading", { name: "Treino novo publicado" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Treino anterior publicado" })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("renewed-after-publication.png"), fullPage: true });

    await page.clock.setFixedTime(new Date("2026-11-05T15:00:00Z"));
    await page.reload();
    await expect(page.getByRole("heading", { name: "Treino novo publicado" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Treino anterior publicado" })).toHaveCount(0);

    state = "cleared";
    await page.clock.setFixedTime(new Date("2026-09-09T15:00:00Z"));
    await page.reload();
    await expect(page.getByText("Treino ainda não prescrito para este ciclo.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Treino anterior publicado" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Treino novo publicado" })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
