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
    scenario?: "normal" | "empty" | "error" | "loading" | "first";
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
  await page.goto(`${fixturePath}?role=${role}&scenario=${scenario}&theme=${theme}`, { waitUntil: "domcontentloaded" });
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
  const sections = ["Interessados", "Aguardando avaliação", "Cadência de contatos", "Próximas prescrições",
    "Renovações", "Aniversariantes", "Feedbacks de treino"];
  for (const section of sections) await expect(page.getByText(section, { exact: true })).toBeVisible();
  return sections;

}

test("human contact cadence uses the operational queues and trainer projection", async ({ page }) => {
  const adminGuard = await openFixture(page, { role: "admin", viewport: { width: 1440, height: 1000 } });
  const filters = page.getByRole("group", { name: "Filtrar cadência de contatos" });
  for (const label of ["Sem resposta há 24h", "Sem mensagem há 7 dias"]) {
    const filter = filters.getByRole("button", { name: label, exact: true });
    await filter.click();
    await expect(filter).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("link", { name: "Abrir conversa" }).first()).toHaveAttribute("href", "/admin/whatsapp-chat");
  }
  await expectNoFixtureLeak(adminGuard);

  const trainerGuard = await openFixture(page, { role: "trainer", viewport: { width: 390, height: 844 } });
  await expect(page.getByText("Mais operações", { exact: true })).toHaveCount(0);
  const cadence = page.getByRole("heading", { name: "Cadência de contatos" }).locator("../..");
  await cadence.getByRole("button", { name: "Sem resposta há 24h", exact: true }).click();
  await expect(cadence.getByText("Bruno Ativo", { exact: true })).toBeVisible();
  await expect(cadence.getByRole("link", { name: "Abrir conversa" })).toHaveCount(0);
  await expectNoFixtureLeak(trainerGuard);
});

test("trainer sees the full company dashboard sections that admin sees without write actions", async ({ page }) => {
  const adminGuard = await openFixture(page, { role: "admin", viewport: { width: 1440, height: 1000 } });
  await expect(page.getByRole("heading", { name: "DASHBOARD", exact: true })).toHaveCount(0);
  const adminSections = await visibleSectionTexts(page);
  await expect(page.getByRole("button", { name: "Ver avaliação" })).toBeVisible();
  await expect(page.getByText(/Anamnese registrada/)).toBeVisible();
  await expect(page.getByRole("group", { name: "Filtrar cadência de contatos" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver mais" })).toHaveAttribute("href", "/admin/registration");
  await expect(page.getByText("Análises e acompanhamento", { exact: true })).toHaveCount(0);
  await expectNoFixtureLeak(adminGuard);

  const trainerGuard = await openFixture(page, { role: "trainer", viewport: { width: 1440, height: 1000 } });
  await expect(page.getByRole("heading", { name: "PAINEL DA EMPRESA" })).toBeVisible();
  await expect(page.getByText("Visualização completa da empresa")).toBeVisible();
  await expect(page.getByText("Mais operações", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Ana Ativa").first()).toBeVisible();
  await expect(page.getByText("Bruno Ativo").first()).toBeVisible();
  await expect(page.getByText("Outro Tenant")).toHaveCount(0);
  expect(await visibleSectionTexts(page)).toEqual(adminSections);

  await expect(page.getByText("Análises e acompanhamento", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Renovar agora/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Prescrever" })).toHaveCount(0);
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
    "functional_assessments", "whatsapp_chats", "workout_feedback",
  ].includes(table)))).toEqual([]);
  await expectNoFixtureLeak(trainerGuard);
});

test("master company view keeps the same dashboard inventory for the selected tenant", async ({ page }) => {
  const guard = await openFixture(page, { role: "master", viewport: { width: 1440, height: 1000 } });
  await expect(page.getByRole("heading", { name: "DASHBOARD", exact: true })).toHaveCount(0);
  await expect(page.getByText("Visualizando: BN QA")).toBeVisible();
  await expect(page.getByText("Mais operações", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Alunos Ativos").first()).toBeVisible();
  await expect(page.getByText("Treinadores").first()).toBeVisible();
  await expect(page.getByText("Renovações", { exact: true })).toBeVisible();
  await expect(page.getByText("Próximas prescrições", { exact: true })).toBeVisible();
  await expect(page.getByText("Outro Tenant")).toHaveCount(0);
  await expectNoFixtureLeak(guard);
});

test("coordinator keeps renewal, cycle and birthday visibility for the same company", async ({ page }) => {
  const guard = await openFixture(page, { role: "coordinator", viewport: { width: 1366, height: 900 } });
  await expect(page.getByText("Mais operações", { exact: true })).toHaveCount(0);
  await page.getByText("Fila de matrículas", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "MATRÍCULAS" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Novo Aluno" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aguardando avaliação" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ver avaliação" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ver mais" })).toHaveAttribute("href", "/coordinator/registration");
  await expect(page.getByRole("link", { name: "Prescrever" }).and(page.locator('[href*="student-active-b"]')))
    .toHaveAttribute("href", "/coordinator/students/student-active-b?tab=prescricao&cycle=cycle-next-b");
  await expect(page.getByText("Renovações", { exact: true })).toBeVisible();
  await expect(page.getByText("Próximas prescrições", { exact: true })).toBeVisible();
  await expect(page.getByText("Aniversariantes", { exact: true })).toBeVisible();
  await expect(page.getByText("Bruno Ativo").first()).toBeVisible();
  await expect(page.getByText("Outro Tenant")).toHaveCount(0);
  await expectNoFixtureLeak(guard);
});

test("trainer dashboard handles empty and error states", async ({ page }) => {
  const emptyGuard = await openFixture(page, { role: "trainer", scenario: "empty", viewport: { width: 1280, height: 900 } });
  await expect(page.getByRole("heading", { name: "PAINEL DA EMPRESA" })).toBeVisible();
  await expect(page.getByText("Nenhuma renovação pendente").first()).toBeVisible();
  await expect(page.getByText("Nenhuma próxima prescrição no período configurado.")).toBeVisible();
  await expect(page.getByText("Análises e acompanhamento", { exact: true })).toHaveCount(0);
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
  await expect(page.getByRole("status").first()).toBeVisible();
  expect(await page.evaluate(() => (window as any).__trainerDashboardFixture.getReads().filter((table: string) => [
    "students", "enrollments", "training_cycles", "workouts", "admin_alerts", "prescription_bundles",
    "cycle_feedback", "payments", "workout_sessions", "student_body_limitations", "functional_assessments",
  ].includes(table)))).toEqual([]);
  await expect(page.getByText("Renovações", { exact: true })).toBeVisible();
  await expectNoFixtureLeak(guard);
});

test("trainer dashboard smoke passes on mobile dark mode", async ({ page }) => {
  const guard = await openFixture(page, { role: "trainer", theme: "dark", viewport: { width: 390, height: 844 } });
  await expect(page.getByRole("heading", { name: "PAINEL DA EMPRESA" })).toBeVisible();
  await expect(page.getByText("Interessados", { exact: true })).toBeVisible();
  await expect(page.getByText("Renovações", { exact: true })).toBeVisible();
  await expect(page.getByText("Aniversariantes", { exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/sett-dashboard-playwright/trainer-dashboard-mobile-dark.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expectNoFixtureLeak(guard);
});

test("Meus alunos excludes company onboarding and links only the authenticated trainer's first training and feedback", async ({ page }) => {
  const guard = await openFixture(page, { role: "trainer", scenario: "first", viewport: { width: 390, height: 844 } });
  await page.getByRole("button", { name: "Meus alunos" }).click();
  await expect(page.getByText("Aguardando avaliação", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Primeiros treinos", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir treino" })).toHaveAttribute("href", "/trainer/students/student-pending?tab=prescricao");
  await expect(page.getByRole("link", { name: "Ver feedback" })).toHaveAttribute("href", "/trainer/students/student-active-a?tab=analytics");
  await expect(page.getByText("Força B", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Análises e acompanhamento", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Plano Elite · 1", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Outro Tenant", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.evaluate(() => (window as any).__trainerDashboardFixture.getWrites())).toEqual([]);
  await expectNoFixtureLeak(guard);
});
