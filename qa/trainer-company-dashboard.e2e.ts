import { expect, test, type Page } from "@playwright/test";

const fixturePath = "/qa/trainer-company-dashboard-fixture.html";

async function installNetworkGuard(page: Page) {
  const blocked: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["127.0.0.1", "localhost"].includes(url.hostname)) {
      await route.continue();
      return;
    }
    blocked.push(route.request().url());
    await route.abort("blockedbyclient");
  });
  return blocked;
}

async function openFixture(
  page: Page,
  {
    role,
    scenario = "normal",
    theme = "light",
    viewport,
  }: {
    role: "admin" | "coordinator" | "trainer" | "master";
    scenario?: "normal" | "empty" | "error" | "loading";
    theme?: "light" | "dark";
    viewport: { width: number; height: number };
  },
) {
  await page.setViewportSize(viewport);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  const blockedExternalRequests = await installNetworkGuard(page);
  await page.goto(`${fixturePath}?role=${role}&scenario=${scenario}&theme=${theme}`);
  return { consoleErrors, blockedExternalRequests };
}

async function expectNoFixtureLeak({
  consoleErrors,
  blockedExternalRequests,
}: {
  consoleErrors: string[];
  blockedExternalRequests: string[];
}) {
  expect(blockedExternalRequests).toEqual([]);
  expect(consoleErrors.filter((message) => !message.includes("Download the React DevTools"))).toEqual([]);
}

async function visibleSectionTexts(page: Page) {
  await expect(page.getByText("Alunos Ativos").first()).toBeVisible();
  return {
    active: await page.getByText("Alunos Ativos").first().isVisible(),
    interested: await page.getByText("Interessados").first().isVisible(),
    pending: await page.getByText("Alunos Pendentes").first().isVisible(),
    renewalStatus: await page.getByText("Aguardando Renovação").first().isVisible(),
    inactive: await page.getByText("Alunos Inativos").first().isVisible(),
    trainers: await page.getByText("Treinadores").first().isVisible(),
    alerts: await page.getByText("AÇÕES PENDENTES").first().isVisible(),
    birthdays: await page.getByText("ANIVERSÁRIOS DO MÊS").first().isVisible(),
    renewal: await page.getByText("RENOVAÇÃO").first().isVisible(),
    cycles: await page.getByText("TROCA DE TREINO").first().isVisible(),
    cadence: await page.getByText("Cadência de Contatos").first().isVisible(),
    analytics: await page.getByText("ANÁLISES E ACOMPANHAMENTO").first().isVisible(),
  };
}

test("trainer sees the full company dashboard sections that admin sees without write actions", async ({ page }) => {
  const adminGuard = await openFixture(page, { role: "admin", viewport: { width: 1440, height: 1000 } });
  await expect(page.getByRole("heading", { name: "DASHBOARD" })).toBeVisible();
  const adminSections = await visibleSectionTexts(page);
  await page.getByRole("button", { name: /ANÁLISES E ACOMPANHAMENTO/i }).click();
  await expect(page.getByText("PLANOS MAIS VENDIDOS")).toBeVisible();
  await expect(page.getByText("Prescrições do mês")).toBeVisible();
  await expect(page.getByText("Feedback de ciclo pendente")).toBeVisible();
  await expect(page.getByText("Coorte — satisfação")).toBeVisible();
  await expectNoFixtureLeak(adminGuard);

  const trainerGuard = await openFixture(page, { role: "trainer", viewport: { width: 1440, height: 1000 } });
  await expect(page.getByRole("heading", { name: "PAINEL DA EMPRESA" })).toBeVisible();
  await expect(page.getByText("Visualização completa da empresa")).toBeVisible();
  await expect(page.getByText("Ana Ativa").first()).toBeVisible();
  await expect(page.getByText("Bruno Ativo").first()).toBeVisible();
  await expect(page.getByText("Outro Tenant")).toHaveCount(0);
  expect(await visibleSectionTexts(page)).toEqual(adminSections);

  await page.getByRole("button", { name: /ANÁLISES E ACOMPANHAMENTO/i }).click();
  await expect(page.getByText("PLANOS MAIS VENDIDOS")).toBeVisible();
  await expect(page.getByText("Prescrições do mês")).toBeVisible();
  await expect(page.getByText("Feedback de ciclo pendente")).toBeVisible();
  await expect(page.getByText("Coorte — satisfação")).toBeVisible();
  await expect(page.getByRole("button", { name: /Renovar agora/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Prescrever/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Mensagem/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Revisado/i })).toHaveCount(0);
  const dashboardPath = new URL(page.url()).pathname;
  await page.getByText("Ana Ativa").first().click();
  await page.getByText("Bruno Ativo").first().click();
  expect(new URL(page.url()).pathname).toBe(dashboardPath);
  await page.screenshot({ path: "/tmp/sett-dashboard-playwright/trainer-dashboard-desktop-light.png", fullPage: true });
  expect(await page.evaluate(() => (window as any).__trainerDashboardFixture.getWrites())).toEqual([]);
  expect(await page.evaluate(() => (window as any).__trainerDashboardFixture.getReads().filter((table: string) => [
    "students", "enrollments", "training_cycles", "workouts", "admin_alerts", "prescription_bundles",
    "prescription_bundle_items", "cycle_feedback", "payments", "workout_sessions", "student_body_limitations",
    "functional_assessments", "whatsapp_chats",
  ].includes(table)))).toEqual([]);
  await expectNoFixtureLeak(trainerGuard);
});

test("master company view keeps the same dashboard inventory for the selected tenant", async ({ page }) => {
  const guard = await openFixture(page, { role: "master", viewport: { width: 1440, height: 1000 } });
  await expect(page.getByRole("heading", { name: "DASHBOARD" })).toBeVisible();
  await expect(page.getByText("Visualizando: BN QA")).toBeVisible();
  await expect(page.getByText("Alunos Ativos").first()).toBeVisible();
  await expect(page.getByText("Treinadores").first()).toBeVisible();
  await expect(page.getByText("RENOVAÇÃO").first()).toBeVisible();
  await expect(page.getByText("TROCA DE TREINO").first()).toBeVisible();
  await expect(page.getByText("Outro Tenant")).toHaveCount(0);
  await expectNoFixtureLeak(guard);
});

test("coordinator keeps renewal, cycle and birthday visibility for the same company", async ({ page }) => {
  const guard = await openFixture(page, { role: "coordinator", viewport: { width: 1366, height: 900 } });
  await expect(page.getByRole("heading", { name: "MATRÍCULAS" })).toBeVisible();
  await expect(page.getByText("RENOVAÇÃO").first()).toBeVisible();
  await expect(page.getByText("TROCA DE TREINO").first()).toBeVisible();
  await expect(page.getByText("ANIVERSÁRIOS DO MÊS").first()).toBeVisible();
  await expect(page.getByText("Bruno Ativo").first()).toBeVisible();
  await expect(page.getByText("Outro Tenant")).toHaveCount(0);
  await expectNoFixtureLeak(guard);
});

test("trainer dashboard handles empty and error states", async ({ page }) => {
  const emptyGuard = await openFixture(page, { role: "trainer", scenario: "empty", viewport: { width: 1280, height: 900 } });
  await expect(page.getByRole("heading", { name: "PAINEL DA EMPRESA" })).toBeVisible();
  await expect(page.getByText("Nenhuma renovação pendente").first()).toBeVisible();
  await expect(page.getByText("Nenhuma troca prevista para os próximos 7 dias")).toBeVisible();
  await page.getByRole("button", { name: /ANÁLISES E ACOMPANHAMENTO/i }).click();
  await expect(page.getByText("Ninguém precisando de atenção agora")).toBeVisible();
  await expectNoFixtureLeak(emptyGuard);

  const errorGuard = await openFixture(page, { role: "trainer", scenario: "error", viewport: { width: 1280, height: 900 } });
  await expect(page.getByRole("heading", { name: "PAINEL DA EMPRESA" })).toBeVisible();
  await expect(page.getByText("Não foi possível carregar os indicadores do painel.")).toBeVisible();
  await expect(page.getByText("fixture dashboard error")).toBeVisible();
  await expectNoFixtureLeak(errorGuard);
});

test("trainer dashboard keeps a snapshot-only loading state without table fallbacks", async ({ page }) => {
  const guard = await openFixture(page, { role: "trainer", scenario: "loading", viewport: { width: 1280, height: 900 } });
  await expect(page.getByRole("heading", { name: "PAINEL DA EMPRESA" })).toBeVisible();
  await expect(page.getByText("—").first()).toBeVisible();
  expect(await page.evaluate(() => (window as any).__trainerDashboardFixture.getReads().filter((table: string) => [
    "students", "enrollments", "training_cycles", "workouts", "admin_alerts", "prescription_bundles",
    "cycle_feedback", "payments", "workout_sessions", "student_body_limitations", "functional_assessments",
  ].includes(table)))).toEqual([]);
  await expect(page.getByText("Ana Ativa").first()).toBeVisible({ timeout: 4_000 });
  await expectNoFixtureLeak(guard);
});

test("trainer dashboard smoke passes on mobile dark mode", async ({ page }) => {
  const guard = await openFixture(page, { role: "trainer", theme: "dark", viewport: { width: 390, height: 844 } });
  await expect(page.getByRole("heading", { name: "PAINEL DA EMPRESA" })).toBeVisible();
  await expect(page.getByText("Alunos Ativos").first()).toBeVisible();
  await expect(page.getByText("RENOVAÇÃO").first()).toBeVisible();
  await expect(page.getByText("ANIVERSÁRIOS DO MÊS").first()).toBeVisible();
  await page.screenshot({ path: "/tmp/sett-dashboard-playwright/trainer-dashboard-mobile-dark.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expectNoFixtureLeak(guard);
});
