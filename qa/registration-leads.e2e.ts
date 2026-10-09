import { expect, test, type Locator, type Page } from "@playwright/test";

const fixturePath = "/qa/registration-leads-fixture.html";
type Row = Record<string, unknown>;
type Call = { kind: string; name: string; args?: Row; ids?: unknown[]; ok: boolean };
type Fixture = {
  snapshot: () => Record<string, Row[]>;
  getCalls: () => Call[];
  getBlockedNetwork: () => string[];
};

async function snapshot(page: Page) {
  return page.evaluate(() => (window as unknown as { __registrationLeadsFixture: Fixture }).__registrationLeadsFixture.snapshot());
}

async function calls(page: Page) {
  return page.evaluate(() => (window as unknown as { __registrationLeadsFixture: Fixture }).__registrationLeadsFixture.getCalls());
}

async function openFixture(page: Page, scenario = "normal", width = 1440) {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
  const externalRequests: string[] = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const origin = new URL(test.info().project.use.baseURL as string).origin;
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin || request.method() !== "GET" || /^\/(rest|auth|functions|storage)\/v1\//.test(url.pathname)) {
      externalRequests.push(`${request.method()} ${url.origin}${url.pathname}`);
      await route.abort("blockedbyclient");
    } else {
      await route.continue();
    }
  });
  await page.routeWebSocket("**/*", (socket) => {
    if (new URL(socket.url()).origin.replace(/^ws/, "http") === origin) {
      socket.connectToServer();
    } else {
      externalRequests.push("External WebSocket");
      socket.close();
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto(`${fixturePath}?scenario=${scenario}`);
  await expect(page.getByRole("heading", { name: "Novos cadastros", exact: true, level: 1 })).toBeVisible();
  await expect(page.getByText("Carregando esteira", { exact: true })).toHaveCount(0);
  return async () => {
    expect(externalRequests, "No real backend or external request may be attempted").toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { __registrationLeadsFixture: Fixture })
      .__registrationLeadsFixture.getBlockedNetwork())).toEqual([]);
    expect((await calls(page)).filter((call) => call.kind === "function"), "No message, billing or conversion function may run").toEqual([]);
  };
}

function card(page: Page, name: string) {
  return page.locator("[draggable]:visible").filter({ has: page.getByText(name, { exact: true }) });
}

async function selectStage(page: Page, shortLabel: string, mobile = false) {
  if (mobile) {
    await page.getByText("Etapa exibida", { exact: true }).locator("..").getByRole("combobox").click();
    const labels: Record<string, string> = { Novos: "Novos cadastros", Contato: "Contato feito", Fiscal: "Cadastro + plano", Leads: "Leads" };
    await page.getByRole("option", { name: new RegExp(`^${labels[shortLabel].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(`) }).click();
  } else {
    await page.getByRole("button", { name: new RegExp(`^${shortLabel} \\(\\d+\\)$`) }).click();
  }
}

function unchangedFields(row: Row) {
  const copy = { ...row };
  delete copy.sales_stage;
  delete copy.stage;
  delete copy.updated_at;
  return copy;
}

async function expectControlsFit(container: Locator, width: number) {
  const failures = await container.evaluate((root, viewportWidth) => {
    const elements = [root, ...root.querySelectorAll("button, input, [role='combobox']")];
    return elements.flatMap((element) => {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height || getComputedStyle(element).visibility === "hidden") return [];
      const textRange = document.createRange();
      textRange.selectNodeContents(element);
      const textBoxes = [...textRange.getClientRects()];
      const clipped = textBoxes.some((text) => text.width > 0 && (text.left < box.left - 2 || text.right > box.right + 2));
      return box.left < -1 || box.right > viewportWidth + 1 || clipped
        ? [{ text: element.textContent?.trim().slice(0, 100), left: box.left, right: box.right, clipped }]
        : [];
    });
  }, width);
  expect(failures).toEqual([]);
}

test("renamed action and Leads stage render pending and dormant student/lead records", async ({ page }) => {
  const verifyIsolation = await openFixture(page);
  await selectStage(page, "Contato");
  await expect(card(page, "QA Pending Contact").getByRole("button", { name: "Transformar em lead", exact: true })).toBeVisible();
  await selectStage(page, "Fiscal");
  await expect(card(page, "QA Pending Fiscal").getByRole("button", { name: "Transformar em lead", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Marcar como perdido|Perdidos|Descartar/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Leads (2)", exact: true })).toBeVisible();
  await selectStage(page, "Leads");
  await expect(card(page, "QA Lost Student")).toBeVisible();
  await expect(card(page, "QA Lost Lead")).toBeVisible();
  await expect(card(page, "QA Lost Student").getByRole("button", { name: "Retomar contato", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Transformar em lead", exact: true })).toHaveCount(0);
  await expect(card(page, "QA Pending Contact")).toHaveCount(0);
  expect((await calls(page)).filter((call) => call.kind !== "read")).toEqual([]);
  await verifyIsolation();
});

for (const entry of [
  { stage: "Contato", expectedStage: "contacted", id: "student-contact", name: "QA Pending Contact" },
  { stage: "Fiscal", expectedStage: "fiscal_registration_pending", id: "student-fiscal", name: "QA Pending Fiscal" },
]) {
  test(`${entry.name} moves into Leads, persists after reload and resumes contact without duplication`, async ({ page }) => {
    const verifyIsolation = await openFixture(page);
    const before = await snapshot(page);
    await selectStage(page, entry.stage);
    await card(page, entry.name).getByRole("button", { name: "Transformar em lead", exact: true }).click();
    await expect(card(page, entry.name).getByRole("button", { name: "Retomar contato", exact: true })).toBeVisible();
    const after = await snapshot(page);
    const pending = after.students.find((row) => row.id === entry.id)!;
    expect(pending.sales_stage).toBe("lost");
    expect(pending.status).toBe("pending");
    expect(unchangedFields(pending)).toEqual(unchangedFields(before.students.find((row) => row.id === pending.id)!));
    expect(after.leads).toEqual(before.leads);
    expect(after.student_anamneses).toEqual(before.student_anamneses);
    expect(after.students).toHaveLength(before.students.length);
    expect((await calls(page)).filter((call) => call.kind === "rpc")).toEqual([
      expect.objectContaining({ name: "set_registration_lead_stage", ok: true, args: expect.objectContaining({
        _entity_type: "student", _record_id: entry.id, _expected_stage: entry.expectedStage, _target_stage: "lost",
      }) }),
    ]);
    await verifyIsolation();
    await page.reload();
    await selectStage(page, "Leads");
    await expect(card(page, entry.name)).toBeVisible();
    await expect(page.getByRole("button", { name: "Leads (3)", exact: true })).toBeVisible();
    await card(page, entry.name).getByRole("button", { name: "Retomar contato", exact: true }).click();
    await expect(card(page, entry.name).getByRole("button", { name: "Transformar em lead", exact: true })).toBeVisible();
    expect((await snapshot(page)).students.find((row) => row.id === entry.id)?.sales_stage).toBe("contacted");
    await verifyIsolation();
    await page.reload();
    await selectStage(page, "Contato");
    await expect(card(page, entry.name)).toBeVisible();
    await verifyIsolation();
  });
}

test("unconverted lead keeps pre-registration when moved into Leads and resumed", async ({ page }) => {
  const verifyIsolation = await openFixture(page);
  const before = await snapshot(page);
  const initialLead = before.leads.find((row) => row.id === "lead-interested")!;
  await selectStage(page, "Novos");
  await card(page, "QA Interested Lead").getByRole("button", { name: "Transformar em lead", exact: true }).click();
  await expect(card(page, "QA Interested Lead").getByRole("button", { name: "Retomar contato", exact: true })).toBeVisible();
  await verifyIsolation();
  await page.reload();
  await selectStage(page, "Leads");
  await card(page, "QA Interested Lead").getByRole("button", { name: "Ver pré-cadastro", exact: true }).click();
  await expect(page.getByRole("dialog").getByText("QA synthetic goal", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  const dormant = (await snapshot(page)).leads.find((row) => row.id === initialLead.id)!;
  expect(dormant.stage).toBe("lost");
  expect(unchangedFields(dormant)).toEqual(unchangedFields(initialLead));
  await card(page, "QA Interested Lead").getByRole("button", { name: "Retomar contato", exact: true }).click();
  await expect(card(page, "QA Interested Lead").getByRole("button", { name: "Transformar em lead", exact: true })).toBeVisible();
  const after = await snapshot(page);
  expect(after.leads.find((row) => row.id === initialLead.id)?.stage).toBe("contacted");
  expect(after.students).toEqual(before.students);
  expect(after.leads).toHaveLength(before.leads.length);
  await verifyIsolation();
  await page.reload();
  await selectStage(page, "Contato");
  await expect(card(page, "QA Interested Lead")).toBeVisible();
  await verifyIsolation();
});

for (const name of ["QA Lost Student", "QA Lost Lead"]) {
  test(`existing ${name} can resume contact`, async ({ page }) => {
    const verifyIsolation = await openFixture(page);
    await selectStage(page, "Leads");
    await card(page, name).getByRole("button", { name: "Retomar contato", exact: true }).click();
    await expect(card(page, name).getByRole("button", { name: "Transformar em lead", exact: true })).toBeVisible();
    await verifyIsolation();
    await page.reload();
    await selectStage(page, "Contato");
    await expect(card(page, name)).toBeVisible();
    await verifyIsolation();
  });
}

for (const scenario of ["error", "ack-missing"]) {
  for (const entry of [
    { stage: "Contato", name: "QA Pending Contact" },
    { stage: "Novos", name: "QA Interested Lead" },
    { stage: "Leads", name: "QA Lost Lead" },
    { stage: "Leads", name: "QA Lost Student" },
  ]) {
    test(`${scenario} keeps ${entry.name} unchanged`, async ({ page }) => {
      const verifyIsolation = await openFixture(page, scenario);
      const before = await snapshot(page);
      await selectStage(page, entry.stage);
      const action = entry.stage === "Leads" ? "Retomar contato" : "Transformar em lead";
      await card(page, entry.name).getByRole("button", { name: action, exact: true }).click();
      await expect(page.getByText(scenario === "error" ? "Synthetic registration fixture error" : "A mudança de etapa não foi confirmada. Atualize a esteira.", { exact: true })).toBeVisible();
      await expect(card(page, entry.name).getByRole("button", { name: action, exact: true })).toBeVisible();
      expect(await snapshot(page)).toEqual(before);
      expect((await calls(page)).filter((call) => call.kind === "update")).toEqual([]);
      await verifyIsolation();
    });
  }
}

test("read failure stays local and presents the error without cards", async ({ page }) => {
  const verifyIsolation = await openFixture(page, "read-error");
  await expect(page.getByText("Synthetic registration fixture error", { exact: true })).toBeVisible();
  await expect(page.locator("[draggable]:visible")).toHaveCount(0);
  await verifyIsolation();
});

for (const width of [390, 1440]) {
  test(`stage controls and cards fit ${width}px`, async ({ page }) => {
    const verifyIsolation = await openFixture(page, "normal", width);
    const mobile = width < 768;
    for (const stage of ["Novos", "Contato", "Fiscal", "Leads"]) {
      await selectStage(page, stage, mobile);
      const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Esteira de fechamento", exact: true }) });
      await expectControlsFit(section, width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    if (mobile) {
      await selectStage(page, "Contato", true);
      await card(page, "QA Pending Contact").getByRole("button", { name: "Transformar em lead", exact: true }).click();
      await expect(card(page, "QA Pending Contact").getByRole("button", { name: "Retomar contato", exact: true })).toBeVisible();
      await verifyIsolation();
      await page.reload();
      await selectStage(page, "Leads", true);
      await expect(card(page, "QA Pending Contact")).toBeVisible();
    }
    await page.screenshot({ path: test.info().outputPath(`registration-leads-${width}.png`), fullPage: true });
    await verifyIsolation();
  });
}
